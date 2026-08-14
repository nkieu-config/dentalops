import { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import { auditPageSchema, healthResponseSchema } from "@dentalops/contracts"
import type { Server } from "node:http"
import request from "supertest"
import { AppModule } from "../src/app.module"
import { MONGO } from "../src/audit/mongo.provider"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

const DURATION_MIN = 45
const utc = (hour: number) => new Date(Date.UTC(2027, 9, 12, hour)).toISOString()

describe("booking while the audit log is unavailable", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let token: string
  let branchId: string
  let serviceId: string
  let dentistId: string
  let patientId: string
  const slug = `no-mongo-${Date.now()}`

  beforeAll(async () => {
    ;({ app, server } = await createTestApp(
      Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MONGO).useValue(null)
    ))
    prisma = app.get(PrismaService)

    const signup = await request(server).post("/auth/signup").send({
      clinicName: "Audit Outage Clinic",
      slug,
      email: `owner@${slug}.local`,
      password: "s3cure-pass",
      name: "Outage Owner"
    })
    expectStatus(signup, 200)
    token = signup.body.accessToken as string
    const tenantId = signup.body.user.tenantId as string

    branchId = (await prisma.branch.findFirstOrThrow({ where: { tenantId } })).id
    serviceId = (
      await prisma.service.create({
        data: { tenantId, name: "Outage Probe", durationMin: DURATION_MIN, bufferMin: 0 }
      })
    ).id
    dentistId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `dentist@${slug}.local`,
          passwordHash: "x",
          name: "Dr. Outage",
          role: "dentist"
        }
      })
    ).id
    patientId = (
      await prisma.patient.create({
        data: { tenantId, name: "Outage Patient", phone: "0820000020", email: `patient@${slug}.local` }
      })
    ).id
    await prisma.shift.create({
      data: { tenantId, staffId: dentistId, branchId, startsAt: new Date(utc(2)), endsAt: new Date(utc(9)) }
    })
  }, 60_000)

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } })
    await app.close().catch(() => undefined)
  })

  it("reports the audit log as disabled instead of claiming it is connected", async () => {
    const res = await request(server).get("/health")
    expectStatus(res, 200)
    expect(healthResponseSchema.parse(res.body).auditLog).toBe("disabled")
  })

  it("still books an appointment that persists", async () => {
    const res = await request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${token}`)
      .send({ serviceId, branchId, dentistId, patientId, startsAt: utc(3) })
    expectStatus(res, 201)

    const stored = await prisma.appointment.findUniqueOrThrow({ where: { id: res.body.id } })
    expect(stored.status).toBe("confirmed")
    expect(stored.startsAt.toISOString()).toBe(utc(3))
  })

  it("still refuses a second booking for the same slot", async () => {
    const res = await request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${token}`)
      .send({ serviceId, branchId, dentistId, patientId, startsAt: utc(3) })
    expectStatus(res, 409)
    expect(res.body.errorCode).toBe("SLOT_CONFLICT")
  })

  it("answers the activity feed with an empty page rather than a server error", async () => {
    const res = await request(server)
      .get("/audit-logs")
      .set("Authorization", `Bearer ${token}`)
      .query({ limit: "25" })
    expectStatus(res, 200)
    expect(auditPageSchema.parse(res.body)).toEqual({ entries: [], nextCursor: null })
  })
})
