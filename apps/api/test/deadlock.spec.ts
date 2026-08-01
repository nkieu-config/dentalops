import { INestApplication } from "@nestjs/common"
import request from "supertest"
import type { Server } from "node:http"
import { apiErrorSchema } from "@dentalops/contracts"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

describe("deadlock safety of concurrent reschedules", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let ownerToken: string
  let branchId: string
  let dentistId: string
  let dentist2Id: string
  let patientId: string
  let serviceId: string
  let apptA: { id: string }
  let apptB: { id: string }
  let versionA = 0
  let versionB = 0
  const slug = `deadlock-${Date.now()}`

  const at = (day: number, h: number) => new Date(Date.UTC(2027, 0, day, h, 0, 0)).toISOString()

  const book = (dentist: string, startsAt: string) =>
    request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ serviceId, dentistId: dentist, patientId, branchId, startsAt })

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)

    const signup = await request(server).post("/auth/signup").send({
      clinicName: "Deadlock Test Clinic",
      slug,
      email: "owner@lockorder.local",
      password: "s3cure-pass",
      name: "Owner"
    })
    expectStatus(signup, 200)
    ownerToken = signup.body.accessToken

    const tenant = await prisma.tenant.findUnique({ where: { slug } })
    const tenantId = tenant!.id
    const branch = await prisma.branch.findFirst({ where: { tenantId } })
    branchId = branch!.id

    await prisma.resource.deleteMany({ where: { branchId, type: "chair", name: "Chair 3" } })
    const chairs = await prisma.resource.count({ where: { branchId, type: "chair", isActive: true } })
    expect(chairs).toBe(2)

    const argon2 = await import("argon2")
    const passwordHash = await argon2.hash("s3cure-pass")
    const dentists = await Promise.all(
      [1, 2].map((n) =>
        prisma.user.create({
          data: {
            tenantId,
            email: `dentist${n}@lockorder.local`,
            passwordHash,
            name: `Dr. Number ${n}`,
            role: "dentist"
          }
        })
      )
    )
    dentistId = dentists[0]!.id
    dentist2Id = dentists[1]!.id

    const patient = await prisma.patient.create({
      data: {
        tenantId,
        name: "Anong Thongdee",
        phone: "0866677788",
        email: "patient@lockorder.local"
      }
    })
    patientId = patient.id

    const equipmentType = await prisma.equipmentType.create({
      data: { tenantId, name: "Intraoral Scanner" }
    })
    await prisma.resource.createMany({
      data: [1, 2].map((n) => ({
        tenantId,
        branchId,
        equipmentTypeId: equipmentType.id,
        type: "equipment" as const,
        name: `Scanner ${n}`
      }))
    })

    const service = await prisma.service.create({
      data: {
        tenantId,
        name: "Digital Impression",
        durationMin: 60,
        bufferMin: 0,
        requirements: { create: { tenantId, equipmentTypeId: equipmentType.id } }
      }
    })
    serviceId = service.id

    const createdA = await book(dentistId, at(9, 9)).expect(201)
    apptA = createdA.body
    versionA = createdA.body.version
    const createdB = await book(dentist2Id, at(9, 10)).expect(201)
    apptB = createdB.body
    versionB = createdB.body.version

    expect(createdA.body.claims.length).toBe(2)
    expect(createdB.body.claims.length).toBe(2)
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } })
    await app.close()
  })

  it("concurrent opposite reschedules never deadlock", async () => {
    for (let i = 0; i < 15; i++) {
      const [ra, rb] = await Promise.all([
        request(server)
          .patch(`/appointments/${apptA.id}`)
          .set("Authorization", `Bearer ${ownerToken}`)
          .send({ version: versionA, startsAt: at(10 + (i % 2), 9) }),
        request(server)
          .patch(`/appointments/${apptB.id}`)
          .set("Authorization", `Bearer ${ownerToken}`)
          .send({ version: versionB, startsAt: at(10 + ((i + 1) % 2), 13) })
      ])
      for (const r of [ra, rb]) {
        expect([200, 409]).toContain(r.status)
        if (r.status === 409) {
          const code = apiErrorSchema.parse(r.body).errorCode
          expect(["SLOT_CONFLICT", "RESOURCE_UNAVAILABLE", "STALE_VERSION"]).toContain(code)
        }
        expect(JSON.stringify(r.body)).not.toMatch(/deadlock|40P01/i)
      }
      versionA = ra.status === 200 ? ra.body.version : versionA
      versionB = rb.status === 200 ? rb.body.version : versionB
    }
  })

  it("a deadlock would have surfaced as 500 INTERNAL — none did across all iterations", async () => {
    const events = await prisma.appointment.findMany({ where: { id: { in: [apptA.id, apptB.id] } } })
    expect(events.every((a) => a.status === "confirmed")).toBe(true)
  })
})
