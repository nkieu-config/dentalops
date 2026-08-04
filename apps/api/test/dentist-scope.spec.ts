import { INestApplication } from "@nestjs/common"
import type { Server } from "node:http"
import request from "supertest"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

describe("dentist scope", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  const slug = `scope-${Date.now()}`

  let ownerToken: string
  let dentistAToken: string
  let dentistAId: string
  let dentistBId: string
  let branchId: string
  let serviceId: string
  let patientId: string
  let appointmentOfA: string
  let appointmentOfB: string

  const book = async (dentistId: string, startsAt: string) => {
    const res = await request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ branchId, serviceId, dentistId, patientId, startsAt })
    expectStatus(res, 201)
    return (res.body as { id: string }).id
  }

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)

    const signup = await request(server).post("/auth/signup").send({
      clinicName: "Scope Clinic",
      slug,
      email: `owner@${slug}.local`,
      password: "s3cure-pass",
      name: "Owner"
    })
    expectStatus(signup, 200)
    ownerToken = (signup.body as { accessToken: string }).accessToken

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug } })
    const passwordHash = (
      await prisma.user.findFirstOrThrow({
        where: { tenantId: tenant.id },
        omit: { passwordHash: false }
      })
    ).passwordHash

    const dentistA = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `a@${slug}.local`,
        passwordHash,
        name: "Dentist A",
        role: "dentist"
      }
    })
    const dentistB = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `b@${slug}.local`,
        passwordHash,
        name: "Dentist B",
        role: "dentist"
      }
    })
    dentistAId = dentistA.id
    dentistBId = dentistB.id

    const branch = await prisma.branch.findFirstOrThrow({ where: { tenantId: tenant.id } })
    const service = await prisma.service.findFirstOrThrow({ where: { tenantId: tenant.id } })
    branchId = branch.id
    serviceId = service.id

    const patient = await prisma.patient.create({
      data: {
        tenantId: tenant.id,
        name: "Somchai",
        phone: `08${Date.now() % 100000000}`,
        email: `somchai@${slug}.local`
      }
    })
    patientId = patient.id

    const login = await request(server)
      .post("/auth/login")
      .send({ clinicSlug: slug, email: `a@${slug}.local`, password: "s3cure-pass" })
    expectStatus(login, 200)
    dentistAToken = (login.body as { accessToken: string }).accessToken

    appointmentOfA = await book(dentistAId, "2027-03-01T03:00:00.000Z")
    appointmentOfB = await book(dentistBId, "2027-03-01T05:00:00.000Z")
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } })
    await app.close()
  })

  it("shows an owner every dentist's appointments", async () => {
    const res = await request(server)
      .get(
        `/appointments?branchId=${branchId}&from=2027-03-01T00:00:00.000Z&to=2027-03-02T00:00:00.000Z`
      )
      .set("Authorization", `Bearer ${ownerToken}`)
    expectStatus(res, 200)
    const ids = (res.body as Array<{ id: string }>).map((a) => a.id)
    expect(ids).toEqual(expect.arrayContaining([appointmentOfA, appointmentOfB]))
  })

  it("shows a dentist only their own appointments", async () => {
    const res = await request(server)
      .get(
        `/appointments?branchId=${branchId}&from=2027-03-01T00:00:00.000Z&to=2027-03-02T00:00:00.000Z`
      )
      .set("Authorization", `Bearer ${dentistAToken}`)
    expectStatus(res, 200)
    const ids = (res.body as Array<{ id: string }>).map((a) => a.id)
    expect(ids).toContain(appointmentOfA)
    expect(ids).not.toContain(appointmentOfB)
  })

  it("ignores a dentistId filter naming somebody else", async () => {
    const res = await request(server)
      .get(
        `/appointments?branchId=${branchId}&dentistId=${dentistBId}` +
          `&from=2027-03-01T00:00:00.000Z&to=2027-03-02T00:00:00.000Z`
      )
      .set("Authorization", `Bearer ${dentistAToken}`)
    expectStatus(res, 200)
    const ids = (res.body as Array<{ id: string }>).map((a) => a.id)
    expect(ids).not.toContain(appointmentOfB)
  })

  it("lets a dentist complete their own appointment", async () => {
    const res = await request(server)
      .patch(`/appointments/${appointmentOfA}/status`)
      .set("Authorization", `Bearer ${dentistAToken}`)
      .send({ status: "completed" })
    expectStatus(res, 200)
    expect((res.body as { status: string }).status).toBe("completed")
  })

  it("refuses to let a dentist touch another dentist's appointment", async () => {
    const res = await request(server)
      .patch(`/appointments/${appointmentOfB}/status`)
      .set("Authorization", `Bearer ${dentistAToken}`)
      .send({ status: "no_show" })
    expectStatus(res, 403)
    expect((res.body as { errorCode: string }).errorCode).toBe("NOT_YOUR_APPOINTMENT")

    const untouched = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentOfB } })
    expect(untouched.status).toBe("confirmed")
  })

  it("still lets an owner set any status", async () => {
    const res = await request(server)
      .patch(`/appointments/${appointmentOfB}/status`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ status: "no_show" })
    expectStatus(res, 200)
  })
})
