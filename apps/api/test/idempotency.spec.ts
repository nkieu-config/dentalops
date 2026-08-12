import { INestApplication } from "@nestjs/common"
import request from "supertest"
import type { Server } from "node:http"
import { apiErrorSchema } from "@dentalops/contracts"
import { MAX_IDEMPOTENCY_KEY_LENGTH } from "../src/common/idempotency.interceptor"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

describe("idempotency keys", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let ownerToken: string
  let branchId: string
  let dentistId: string
  let patientId: string
  let serviceId: string
  let apptId: string
  const stamp = Date.now()
  const slug = `idem-api-${stamp}`
  const keyOne = `k1-${stamp}`
  const keyTwo = `k2-${stamp}`

  const at = (day: number, h: number) => new Date(Date.UTC(2026, 11, day, h, 0, 0)).toISOString()

  const book = (startsAt: string, key: string) =>
    request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", key)
      .send({ serviceId, dentistId, patientId, branchId, startsAt })

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)

    const signup = await request(server).post("/auth/signup").send({
      clinicName: "Idempotency Test Clinic",
      slug,
      email: "owner@idempotency.local",
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
    const dentist = await prisma.user.create({
      data: {
        tenantId,
        email: "dentist@idempotency.local",
        passwordHash,
        name: "Dr. Idem",
        role: "dentist"
      }
    })
    dentistId = dentist.id

    const patient = await prisma.patient.create({
      data: {
        tenantId,
        name: "Somchai Rakdee",
        phone: "0811122233",
        email: "patient@idempotency.local"
      }
    })
    patientId = patient.id

    const service = await prisma.service.create({
      data: { tenantId, name: "Checkup", durationMin: 30, bufferMin: 0 }
    })
    serviceId = service.id
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } })
    await app.close()
  })

  it("same key replays the stored response", async () => {
    const first = await book(at(1, 9), keyOne).expect(201)
    apptId = first.body.id
    expect(first.headers["x-idempotent-replay"]).toBeUndefined()

    const replay = await book(at(1, 9), keyOne)
    expect(replay.status).toBe(first.status)
    expect(replay.body.id).toBe(apptId)
    expect(replay.headers["x-idempotent-replay"]).toBe("true")

    const count = await prisma.appointment.count({ where: { dentistId } })
    expect(count).toBe(1)
  })

  it("different key actually executes", async () => {
    const res = await book(at(1, 9), keyTwo).expect(409)
    expect(apiErrorSchema.parse(res.body).errorCode).toBe("SLOT_CONFLICT")
    expect(res.headers["x-idempotent-replay"]).toBeUndefined()

    const count = await prisma.appointment.count({ where: { dentistId } })
    expect(count).toBe(1)
  })

  it("refuses an oversized key rather than letting a client name a huge redis key", async () => {
    const res = await book(at(9, 9), "x".repeat(MAX_IDEMPOTENCY_KEY_LENGTH + 1))
    expectStatus(res, 400)
    expect(apiErrorSchema.parse(res.body).errorCode).toBe("IDEMPOTENCY_KEY_TOO_LONG")

    const count = await prisma.appointment.count({ where: { dentistId, startsAt: new Date(at(9, 9)) } })
    expect(count).toBe(0)
  })

  it("still accepts a key right at the limit", async () => {
    const res = await book(at(10, 9), "y".repeat(MAX_IDEMPOTENCY_KEY_LENGTH))
    expectStatus(res, 201)
  })

  it("key is scoped per route", async () => {
    const res = await request(server)
      .patch(`/appointments/${apptId}/status`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", keyOne)
      .send({ status: "completed" })
      .expect(200)

    expect(res.headers["x-idempotent-replay"]).toBeUndefined()
    expect(res.body.id).toBe(apptId)
    expect(res.body.status).toBe("completed")

    const stored = await prisma.appointment.findUniqueOrThrow({ where: { id: apptId } })
    expect(stored.status).toBe("completed")
  })
})
