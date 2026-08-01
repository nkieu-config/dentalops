import { INestApplication, ValidationPipe } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import cookieParser from "cookie-parser"
import { apiErrorSchema } from "@dentalops/contracts"
import { AppModule } from "../src/app.module"
import { PrismaService } from "../src/prisma/prisma.service"

describe("idempotency keys", () => {
  let app: INestApplication
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
    request(app.getHttpServer())
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Idempotency-Key", key)
      .send({ serviceId, dentistId, patientId, branchId, startsAt })

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    app.use(cookieParser())
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    prisma = app.get(PrismaService)
    await app.init()

    const signup = await request(app.getHttpServer()).post("/auth/signup").send({
      clinicName: "Idempotency Test Clinic",
      slug,
      email: "owner@idempotency.local",
      password: "s3cure-pass",
      name: "Owner"
    })
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

  it("key is scoped per route", async () => {
    const res = await request(app.getHttpServer())
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
