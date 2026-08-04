import { INestApplication, Logger } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import { Test } from "@nestjs/testing"
import { availabilityResponseSchema, publicHoldSchema } from "@dentalops/contracts"
import Redis from "ioredis"
import { randomUUID } from "node:crypto"
import type { Server } from "node:http"
import request from "supertest"
import { AppModule } from "../src/app.module"
import { MAX_HOLD_ID_LENGTH } from "../src/holds/hold-id"
import { HOLD_PURPOSE, HOLD_TTL_SECONDS } from "../src/holds/holds.service"
import { PrismaService } from "../src/prisma/prisma.service"
import { REDIS } from "../src/redis/redis.module"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

const UNREACHABLE = "redis://127.0.0.1:6399"
const BKK_DATE = "2027-09-14"
const DURATION_MIN = 45

const utc = (hour: number, minute = 0) =>
  new Date(Date.UTC(2027, 8, 14, hour, minute)).toISOString()

interface Clinic {
  slug: string
  tenantId: string
  branchId: string
  serviceId: string
  dentistId: string
  ownerToken: string
}

interface SignedHoldClaims {
  sub: string
  purpose: string
  tenantId: string
  dentistId: string
  serviceId: string
  branchId: string
  startsAt: string
  endsAt: string
  iat: number
  exp: number
}

interface ConfirmResponse {
  appointment: { id: string; status: string; startsAt: string }
  manageToken: string
}

const unreachableRedis = (): Redis => {
  const client = new Redis(UNREACHABLE, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null
  })
  client.on("error", () => undefined)
  return client
}

describe("public booking while redis is unavailable", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let jwt: JwtService
  let redis: Redis
  let warn: jest.SpyInstance
  let alpha: Clinic
  let beta: Clinic
  const stamp = Date.now()
  const alphaSlug = `outage-alpha-${stamp}`
  const betaSlug = `outage-beta-${stamp}`

  const warningsMatching = (needle: string) =>
    warn.mock.calls.filter((call) => String(call[0]).includes(needle))

  const provision = async (slug: string, email: string): Promise<Clinic> => {
    const signup = await request(server).post("/auth/signup").send({
      clinicName: `Outage ${slug}`,
      slug,
      email,
      password: "s3cure-pass",
      name: "Outage Owner"
    })
    expectStatus(signup, 200)
    const tenantId = signup.body.user.tenantId as string

    const branch = await prisma.branch.findFirstOrThrow({ where: { tenantId } })
    const service = await prisma.service.create({
      data: { tenantId, name: "Outage Probe", durationMin: DURATION_MIN, bufferMin: 0 }
    })
    const dentist = await prisma.user.create({
      data: {
        tenantId,
        email: `dentist@${slug}.local`,
        passwordHash: "x",
        name: "Dr. Outage",
        role: "dentist"
      }
    })
    await prisma.shift.create({
      data: {
        tenantId,
        staffId: dentist.id,
        branchId: branch.id,
        startsAt: new Date(utc(2)),
        endsAt: new Date(utc(13))
      }
    })
    return {
      slug,
      tenantId,
      branchId: branch.id,
      serviceId: service.id,
      dentistId: dentist.id,
      ownerToken: signup.body.accessToken as string
    }
  }

  const startsOf = async (clinic: Clinic) => {
    const res = await request(server).get(`/public/${clinic.slug}/availability`).query({
      serviceId: clinic.serviceId,
      branchId: clinic.branchId,
      dentistId: clinic.dentistId,
      date: BKK_DATE
    })
    expectStatus(res, 200)
    return availabilityResponseSchema.parse(res.body).slots.map((slot) => slot.startsAt)
  }

  const holdResponse = (clinic: Clinic, startsAt: string) =>
    request(server).post(`/public/${clinic.slug}/holds`).send({
      serviceId: clinic.serviceId,
      branchId: clinic.branchId,
      dentistId: clinic.dentistId,
      startsAt
    })

  const acquire = async (clinic: Clinic, startsAt: string): Promise<string> => {
    const res = await holdResponse(clinic, startsAt)
    expectStatus(res, 201)
    return publicHoldSchema.parse(res.body).holdId
  }

  const confirm = (
    clinic: Clinic,
    holdId: string,
    patient: { name: string; phone: string; email?: string }
  ) => request(server).post(`/public/${clinic.slug}/appointments`).send({ holdId, ...patient })

  beforeAll(async () => {
    warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined)
    redis = unreachableRedis()
    ;({ app, server } = await createTestApp(
      Test.createTestingModule({ imports: [AppModule] }).overrideProvider(REDIS).useValue(redis)
    ))
    prisma = app.get(PrismaService)
    jwt = app.get(JwtService)
    alpha = await provision(alphaSlug, "owner@outage-alpha.local")
    beta = await provision(betaSlug, "owner@outage-beta.local")
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { in: [alphaSlug, betaSlug] } } })
    await app.close().catch(() => undefined)
    redis.disconnect()
    warn.mockRestore()
  })

  it("proves every hold command really fails", async () => {
    await expect(redis.get("anything")).rejects.toThrow()
  })

  it("still lists free slots when held slots cannot be read", async () => {
    const starts = await startsOf(alpha)
    expect(starts.length).toBeGreaterThan(0)
    expect(starts).toContain(utc(2))
  })

  it("hands back a signed hold that carries the booking, with no sign of the outage", async () => {
    const res = await holdResponse(alpha, utc(2))
    expectStatus(res, 201)
    expect(Object.keys(res.body).sort()).toEqual(["expiresAt", "holdId"])

    const { holdId, expiresAt } = publicHoldSchema.parse(res.body)
    expect(holdId.split(".")).toHaveLength(3)
    expect(holdId.length).toBeLessThan(MAX_HOLD_ID_LENGTH)
    expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now())

    const claims = jwt.decode(holdId) as SignedHoldClaims
    expect(claims.purpose).toBe(HOLD_PURPOSE)
    expect(claims.tenantId).toBe(alpha.tenantId)
    expect(claims.dentistId).toBe(alpha.dentistId)
    expect(claims.serviceId).toBe(alpha.serviceId)
    expect(claims.branchId).toBe(alpha.branchId)
    expect(claims.startsAt).toBe(utc(2))
    expect(claims.endsAt).toBe(utc(2, 45))
    expect(claims.exp - claims.iat).toBe(HOLD_TTL_SECONDS)
  })

  it("carries one patient from slot list to confirmed booking and manage link", async () => {
    const startsAt = utc(3)
    expect(await startsOf(alpha)).toContain(startsAt)

    const holdId = await acquire(alpha, startsAt)
    const res = await confirm(alpha, holdId, {
      name: "Outage Patient",
      phone: "0820000001",
      email: "outage@example.com"
    })
    expectStatus(res, 201)
    const body = res.body as ConfirmResponse

    expect(body.appointment.status).toBe("confirmed")
    expect(body.appointment.startsAt).toBe(startsAt)

    const stored = await prisma.appointment.findUniqueOrThrow({
      where: { id: body.appointment.id }
    })
    expect(stored.tenantId).toBe(alpha.tenantId)
    expect(stored.status).toBe("confirmed")

    const managed = await request(server).get(`/public/manage/${body.manageToken}`)
    expectStatus(managed, 200)
    expect(managed.body.id).toBe(body.appointment.id)

    expect(await startsOf(alpha)).not.toContain(startsAt)
  })

  it("lets two patients hold the same slot and leaves the constraint to pick the winner", async () => {
    const startsAt = utc(4)
    const [first, second] = await Promise.all([
      acquire(alpha, startsAt),
      acquire(alpha, startsAt)
    ])
    expect(first).not.toBe(second)

    const results = await Promise.all([
      confirm(alpha, first!, { name: "Racer One", phone: "0820000002" }),
      confirm(alpha, second!, { name: "Racer Two", phone: "0820000003" })
    ])

    expect(results.map((res) => res.status).sort((a, b) => a - b)).toEqual([201, 409])
    expect(results.find((res) => res.status === 409)!.body.errorCode).toBe("SLOT_CONFLICT")

    const booked = await prisma.appointment.findMany({
      where: {
        tenantId: alpha.tenantId,
        dentistId: alpha.dentistId,
        startsAt: new Date(startsAt),
        status: "confirmed"
      }
    })
    expect(booked).toHaveLength(1)
  })

  it("treats releasing a signed hold as a no-op the patient never notices", async () => {
    const startsAt = utc(5)
    const holdId = await acquire(alpha, startsAt)

    const released = await request(server).delete(`/public/${alpha.slug}/holds/${holdId}`)
    expectStatus(released, 204)

    const res = await confirm(alpha, holdId, { name: "Released Hold", phone: "0820000004" })
    expectStatus(res, 201)
  })

  it("reschedules through a manage link on a signed hold", async () => {
    const booked = await confirm(alpha, await acquire(alpha, utc(12)), {
      name: "Moved Patient",
      phone: "0820000012"
    })
    expectStatus(booked, 201)
    const { appointment, manageToken } = booked.body as ConfirmResponse

    const moved = await request(server)
      .post(`/public/manage/${manageToken}/reschedule`)
      .send({ holdId: await acquire(alpha, utc(12, 45)) })
    expectStatus(moved, 200)
    expect(moved.body.startsAt).toBe(utc(12, 45))

    const stored = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } })
    expect(stored.startsAt.toISOString()).toBe(utc(12, 45))
  })

  it("answers HOLD_EXPIRED, never a 500, for a redis hold id issued before the outage", async () => {
    const res = await confirm(alpha, randomUUID(), { name: "Stale Hold", phone: "0820000005" })
    expectStatus(res, 409)
    expect(res.body.errorCode).toBe("HOLD_EXPIRED")
  })

  it("refuses a signed hold minted for another clinic", async () => {
    const holdId = await acquire(beta, utc(6))
    const res = await confirm(alpha, holdId, { name: "Wrong Clinic", phone: "0820000006" })
    expectStatus(res, 409)
    expect(res.body.errorCode).toBe("HOLD_EXPIRED")
  })

  it("refuses an expired signed hold", async () => {
    const expired = await jwt.signAsync(
      {
        sub: randomUUID(),
        purpose: HOLD_PURPOSE,
        tenantId: alpha.tenantId,
        dentistId: alpha.dentistId,
        serviceId: alpha.serviceId,
        branchId: alpha.branchId,
        startsAt: utc(7),
        endsAt: utc(7, 45)
      },
      { secret: process.env.JWT_SECRET, expiresIn: -HOLD_TTL_SECONDS }
    )

    const res = await confirm(alpha, expired, { name: "Expired Hold", phone: "0820000007" })
    expectStatus(res, 409)
    expect(res.body.errorCode).toBe("HOLD_EXPIRED")
    expect(await startsOf(alpha)).toContain(utc(7))
  })

  it("refuses any token whose purpose is not hold", async () => {
    const booked = await confirm(alpha, await acquire(alpha, utc(8)), {
      name: "Purpose Guard",
      phone: "0820000008"
    })
    expectStatus(booked, 201)
    const { manageToken } = booked.body as ConfirmResponse

    const login = await request(server)
      .post("/auth/login")
      .send({ clinicSlug: alpha.slug, email: "owner@outage-alpha.local", password: "s3cure-pass" })
    expectStatus(login, 200)

    const forged = await jwt.signAsync(
      {
        sub: randomUUID(),
        purpose: "manage",
        tenantId: alpha.tenantId,
        dentistId: alpha.dentistId,
        serviceId: alpha.serviceId,
        branchId: alpha.branchId,
        startsAt: utc(9),
        endsAt: utc(9, 45)
      },
      { secret: process.env.JWT_SECRET, expiresIn: HOLD_TTL_SECONDS }
    )

    for (const token of [manageToken, login.body.accessToken as string, forged]) {
      const res = await confirm(alpha, token, { name: "Purpose Guard", phone: "0820000009" })
      expectStatus(res, 409)
      expect(res.body.errorCode).toBe("HOLD_EXPIRED")
    }

    expect(await startsOf(alpha)).toContain(utc(9))
  })

  it("refuses a hold token that is missing a claim rather than booking a hole", async () => {
    const incomplete = await jwt.signAsync(
      {
        sub: randomUUID(),
        purpose: HOLD_PURPOSE,
        tenantId: alpha.tenantId,
        serviceId: alpha.serviceId,
        branchId: alpha.branchId,
        startsAt: utc(9, 45),
        endsAt: utc(10, 30)
      },
      { secret: process.env.JWT_SECRET, expiresIn: HOLD_TTL_SECONDS }
    )

    const res = await confirm(alpha, incomplete, { name: "No Dentist", phone: "0820000011" })
    expectStatus(res, 409)
    expect(res.body.errorCode).toBe("HOLD_EXPIRED")
  })

  it("refuses a signed hold presented as a manage token", async () => {
    const holdId = await acquire(alpha, utc(10))
    const res = await request(server).get(`/public/manage/${holdId}`)
    expectStatus(res, 401)
    expect(res.body.errorCode).toBe("INVALID_MANAGE_TOKEN")
  })

  it("runs an idempotent request instead of reporting it in flight", async () => {
    const patient = await prisma.patient.create({
      data: {
        tenantId: alpha.tenantId,
        name: "Idem Outage",
        phone: "0820000010",
        email: "idem@example.com"
      }
    })
    const key = `outage-${stamp}`
    const book = () =>
      request(server)
        .post("/appointments")
        .set("Authorization", `Bearer ${alpha.ownerToken}`)
        .set("Idempotency-Key", key)
        .send({
          serviceId: alpha.serviceId,
          branchId: alpha.branchId,
          dentistId: alpha.dentistId,
          patientId: patient.id,
          startsAt: utc(11)
        })

    const first = await book()
    expectStatus(first, 201)
    expect(first.headers["x-idempotent-replay"]).toBeUndefined()

    const second = await book()
    expectStatus(second, 409)
    expect(second.body.errorCode).toBe("SLOT_CONFLICT")
    expect(second.headers["x-idempotent-replay"]).toBeUndefined()
  })

  it("warns once about each degradation, not once per request", () => {
    expect(warningsMatching("slot holds are unavailable")).toHaveLength(1)
    expect(warningsMatching("idempotency keys are unavailable")).toHaveLength(1)
  })
})
