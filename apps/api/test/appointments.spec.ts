import { INestApplication } from "@nestjs/common"
import request from "supertest"
import type { Server } from "node:http"
import { apiErrorSchema } from "@dentalops/contracts"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

describe("appointments endpoints", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let ownerToken: string
  let dentistToken: string
  let branchId: string
  let dentistId: string
  let dentist2Id: string
  let dentist3Id: string
  let patientId: string
  let equipmentId: string
  let bufferedServiceId: string
  let plainServiceId: string
  let firstApptId: string
  const slug = `appt-api-${Date.now()}`

  const at = (day: number, h: number) => new Date(Date.UTC(2026, 9, day, h, 0, 0)).toISOString()

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)

    const signup = await request(server).post("/auth/signup").send({
      clinicName: "Appointments Test Clinic",
      slug,
      email: "owner@apptapi.local",
      password: "s3cure-pass",
      name: "Owner"
    })
    expectStatus(signup, 200)
    ownerToken = signup.body.accessToken

    const tenant = await prisma.tenant.findUnique({ where: { slug } })
    const tenantId = tenant!.id
    const branch = await prisma.branch.findFirst({ where: { tenantId } })
    branchId = branch!.id

    const argon2 = await import("argon2")
    const passwordHash = await argon2.hash("s3cure-pass")
    const dentists = await Promise.all(
      [1, 2, 3].map((n) =>
        prisma.user.create({
          data: {
            tenantId,
            email: `dentist${n}@apptapi.local`,
            passwordHash,
            name: `Dr. Number ${n}`,
            role: "dentist"
          }
        })
      )
    )
    dentistId = dentists[0]!.id
    dentist2Id = dentists[1]!.id
    dentist3Id = dentists[2]!.id

    const dentistLogin = await request(server).post("/auth/login").send({
      clinicSlug: slug,
      email: "dentist1@apptapi.local",
      password: "s3cure-pass"
    })
    expectStatus(dentistLogin, 200)
    dentistToken = dentistLogin.body.accessToken

    const patient = await prisma.patient.create({
      data: {
        tenantId,
        name: "Somchai Jaidee",
        phone: "0812345678",
        email: "patient@apptapi.local"
      }
    })
    patientId = patient.id

    const equipmentType = await prisma.equipmentType.create({
      data: { tenantId, name: "Panoramic X-Ray" }
    })
    const equipment = await prisma.resource.create({
      data: {
        tenantId,
        branchId,
        equipmentTypeId: equipmentType.id,
        type: "equipment",
        name: "X-Ray Unit 1"
      }
    })
    equipmentId = equipment.id

    const bufferedService = await prisma.service.create({
      data: {
        tenantId,
        name: "Root Canal",
        durationMin: 60,
        bufferMin: 15,
        requirements: { create: { tenantId, equipmentTypeId: equipmentType.id } }
      }
    })
    bufferedServiceId = bufferedService.id

    const plainService = await prisma.service.create({
      data: { tenantId, name: "Consultation", durationMin: 30, bufferMin: 0 }
    })
    plainServiceId = plainService.id
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } })
    await app.close()
  })

  it("books an appointment and claims a chair with buffer", async () => {
    const res = await request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ serviceId: bufferedServiceId, dentistId, patientId, branchId, startsAt: at(10, 9) })
      .expect(201)
    firstApptId = res.body.id
    expect(res.body.claims.length).toBe(2)
    const chairClaim = res.body.claims.find((c: { resourceId: string }) => c.resourceId !== equipmentId)
    expect(new Date(chairClaim.endsAt).getTime() - new Date(res.body.endsAt).getTime()).toBe(15 * 60_000)
    const equipClaim = res.body.claims.find((c: { resourceId: string }) => c.resourceId === equipmentId)
    expect(equipClaim.endsAt).toBe(res.body.endsAt)
  })

  it("rejects a dentist double-booking with SLOT_CONFLICT", async () => {
    const res = await request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ serviceId: plainServiceId, dentistId, patientId, branchId, startsAt: at(10, 9) })
      .expect(409)
    const error = apiErrorSchema.parse(res.body)
    expect(error.errorCode).toBe("SLOT_CONFLICT")
    expect((error.details as { conflictingAppointmentId?: string }).conflictingAppointmentId).toBe(
      firstApptId
    )
  })

  it("books a second dentist at the same time on another chair", async () => {
    const res = await request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ serviceId: plainServiceId, dentistId: dentist2Id, patientId, branchId, startsAt: at(10, 9) })
      .expect(201)
    expect(res.body.dentistId).toBe(dentist2Id)
  })

  it("returns RESOURCE_UNAVAILABLE when the only equipment unit is taken", async () => {
    const res = await request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ serviceId: bufferedServiceId, dentistId: dentist2Id, patientId, branchId, startsAt: at(11, 9) })
    expect(res.status).toBe(201)
    const clash = await request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ serviceId: bufferedServiceId, dentistId: dentist3Id, patientId, branchId, startsAt: at(11, 9) })
      .expect(409)
    expect(apiErrorSchema.parse(clash.body).errorCode).toBe("RESOURCE_UNAVAILABLE")
  })

  it("buffer blocks the chair but not the dentist", async () => {
    await request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ serviceId: bufferedServiceId, dentistId, patientId, branchId, startsAt: at(12, 9) })
      .expect(201)
    await request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ serviceId: plainServiceId, dentistId, patientId, branchId, startsAt: at(12, 10) })
      .expect(201)
  })

  it("lists appointments for a window including claims", async () => {
    const res = await request(server)
      .get("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .query({ branchId, from: at(10, 0), to: at(13, 0) })
      .expect(200)
    expect(res.body.length).toBeGreaterThanOrEqual(4)
    expect(res.body[0].claims).toBeDefined()
    expect(res.body[0].patient.name).toBeDefined()
  })

  it("dentist role cannot create appointments", async () => {
    await request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${dentistToken}`)
      .send({ serviceId: plainServiceId, dentistId, patientId, branchId, startsAt: at(14, 9) })
      .expect(403)
  })
})
