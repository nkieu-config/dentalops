import { INestApplication } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import { availabilityResponseSchema } from "@dentalops/contracts"
import type Redis from "ioredis"
import { randomUUID } from "node:crypto"
import type { Server } from "node:http"
import request from "supertest"
import { holdKey, slotKey, spannedSlotIndexes } from "../src/holds/holds.service"
import { PrismaService } from "../src/prisma/prisma.service"
import { REDIS } from "../src/redis/redis.module"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

const THROTTLER_KEY_PATTERN = "*:default}:*"
const BKK_DATE = "2027-07-05"
const DURATION_MIN = 45

const utc = (hour: number, minute = 0) => new Date(Date.UTC(2027, 6, 5, hour, minute)).toISOString()

interface Clinic {
  slug: string
  tenantId: string
  branchId: string
  serviceId: string
  dentistId: string
  ownerToken: string
}

interface PublicAppointment {
  id: string
  status: string
  startsAt: string
  endsAt: string
  clinic: { id: string; name: string; slug: string }
  branch: { id: string; name: string }
  service: { id: string; name: string; durationMin: number }
  dentist: { id: string; name: string }
  patient: { id: string; name: string }
}

interface ConfirmResponse {
  appointment: PublicAppointment
  manageToken: string
}

describe("patient self-service reschedule", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let redis: Redis
  let jwt: JwtService
  let alpha: Clinic
  let beta: Clinic
  let phoneCounter = 0
  const alphaSlug = `resched-alpha-${Date.now()}`
  const betaSlug = `resched-beta-${Date.now()}`

  const clearThrottleState = async () => {
    const keys = await redis.keys(THROTTLER_KEY_PATTERN)
    if (keys.length > 0) await redis.del(...keys)
  }

  const provision = async (slug: string, email: string): Promise<Clinic> => {
    const signup = await request(server).post("/auth/signup").send({
      clinicName: `Reschedule ${slug}`,
      slug,
      email,
      password: "s3cure-pass",
      name: "Reschedule Owner"
    })
    expectStatus(signup, 200)
    const tenantId = signup.body.user.tenantId as string

    const branch = await prisma.branch.findFirstOrThrow({ where: { tenantId } })
    const service = await prisma.service.create({
      data: { tenantId, name: "Reschedule Probe", durationMin: DURATION_MIN, bufferMin: 0 }
    })
    const dentist = await prisma.user.create({
      data: {
        tenantId,
        email: `dentist@${slug}.local`,
        passwordHash: "x",
        name: "Dr. Reschedule",
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

  const acquire = async (clinic: Clinic, startsAt: string): Promise<string> => {
    const res = await request(server).post(`/public/${clinic.slug}/holds`).send({
      serviceId: clinic.serviceId,
      branchId: clinic.branchId,
      dentistId: clinic.dentistId,
      startsAt
    })
    expectStatus(res, 201)
    return (res.body as { holdId: string }).holdId
  }

  const book = async (clinic: Clinic, startsAt: string): Promise<ConfirmResponse> => {
    phoneCounter += 1
    const holdId = await acquire(clinic, startsAt)
    const res = await request(server)
      .post(`/public/${clinic.slug}/appointments`)
      .send({
        holdId,
        name: "Move Me",
        phone: `0812${String(phoneCounter).padStart(6, "0")}`,
        email: `move${phoneCounter}@example.com`
      })
    expectStatus(res, 201)
    return res.body as ConfirmResponse
  }

  const reschedule = (token: string, holdId: string) =>
    request(server).post(`/public/manage/${token}/reschedule`).send({ holdId })

  const signManageToken = (payload: Record<string, unknown>) =>
    jwt.signAsync(payload, { secret: process.env.JWT_SECRET, expiresIn: "30d" })

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)
    redis = app.get<Redis>(REDIS)
    jwt = app.get(JwtService)
    await clearThrottleState()
    alpha = await provision(alphaSlug, "owner@resched-alpha.local")
    beta = await provision(betaSlug, "owner@resched-beta.local")
  })

  afterAll(async () => {
    await clearThrottleState()
    await prisma.tenant.deleteMany({ where: { slug: { in: [alphaSlug, betaSlug] } } })
    await app.close()
  })

  beforeEach(async () => {
    await clearThrottleState()
  })

  it("moves the booking onto a freshly held time and frees the old one", async () => {
    const original = utc(2)
    const wanted = utc(6)
    const { appointment, manageToken } = await book(alpha, original)

    const holdId = await acquire(alpha, wanted)
    const res = await reschedule(manageToken, holdId)
    expectStatus(res, 200)

    const moved = res.body as PublicAppointment
    expect(moved.id).toBe(appointment.id)
    expect(moved.startsAt).toBe(wanted)
    expect(moved.endsAt).toBe(utc(6, 45))
    expect(moved.status).toBe("confirmed")

    const stored = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } })
    expect(stored.startsAt.toISOString()).toBe(wanted)
    expect(stored.version).toBe(1)

    const free = await startsOf(alpha)
    expect(free).toContain(original)
    expect(free).not.toContain(wanted)
  })

  it("releases the hold once the move has landed", async () => {
    const { manageToken } = await book(alpha, utc(3))
    const holdId = await acquire(alpha, utc(7))
    expectStatus(await reschedule(manageToken, holdId), 200)

    expect(await redis.get(holdKey(holdId))).toBeNull()
    const spanned = spannedSlotIndexes(Date.parse(utc(7)), Date.parse(utc(7, 45)))
    for (const index of spanned) {
      expect(await redis.get(slotKey(alpha.tenantId, alpha.dentistId, index))).toBeNull()
    }
  })

  it("rejects an unknown or expired hold with HOLD_EXPIRED and leaves the booking alone", async () => {
    const { appointment, manageToken } = await book(alpha, utc(4))

    const res = await reschedule(manageToken, randomUUID())
    expectStatus(res, 409)
    expect(res.body.errorCode).toBe("HOLD_EXPIRED")

    const stored = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } })
    expect(stored.startsAt.toISOString()).toBe(utc(4))
    expect(stored.version).toBe(0)
  })

  it("rejects a hold belonging to another clinic with HOLD_EXPIRED and keeps that hold intact", async () => {
    const { appointment, manageToken } = await book(alpha, utc(5))
    const foreignHold = await acquire(beta, utc(9))

    const res = await reschedule(manageToken, foreignHold)
    expectStatus(res, 409)
    expect(res.body.errorCode).toBe("HOLD_EXPIRED")
    expect(JSON.stringify(res.body)).not.toContain(beta.dentistId)
    expect(JSON.stringify(res.body)).not.toContain(beta.tenantId)

    expect(await redis.get(holdKey(foreignHold))).not.toBeNull()
    const stored = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } })
    expect(stored.startsAt.toISOString()).toBe(utc(5))

    await request(server).delete(`/public/${beta.slug}/holds/${foreignHold}`)
  })

  it("keeps the hold when the move itself fails, so the patient does not lose the slot", async () => {
    const { manageToken } = await book(alpha, utc(10))
    const blocker = await book(alpha, utc(11))
    const holdId = await acquire(alpha, utc(11))

    const res = await reschedule(manageToken, holdId)
    expectStatus(res, 409)
    expect(res.body.errorCode).toBe("SLOT_CONFLICT")
    expect(res.body.details.conflictingAppointmentId).toBe(blocker.appointment.id)

    expect(await redis.get(holdKey(holdId))).not.toBeNull()
    await request(server).delete(`/public/${alpha.slug}/holds/${holdId}`)
  })

  it("refuses to move a cancelled booking", async () => {
    const { appointment, manageToken } = await book(alpha, utc(8))
    expectStatus(await request(server).post(`/public/manage/${manageToken}/cancel`), 204)

    const holdId = await acquire(alpha, utc(12))
    const res = await reschedule(manageToken, holdId)
    expectStatus(res, 409)
    expect(res.body.errorCode).toBe("INVALID_TRANSITION")

    const stored = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } })
    expect(stored.status).toBe("cancelled")
    expect(stored.startsAt.toISOString()).toBe(utc(8))

    await request(server).delete(`/public/${alpha.slug}/holds/${holdId}`)
  })

  it("never moves another tenant's appointment through a forged manage token", async () => {
    const target = await book(beta, utc(6))
    const forged = await signManageToken({
      sub: target.appointment.id,
      tenantId: alpha.tenantId,
      purpose: "manage"
    })
    const holdId = await acquire(alpha, utc(9, 45))

    const res = await reschedule(forged, holdId)
    expectStatus(res, 404)
    expect(res.body.errorCode).toBe("NOT_FOUND")

    const stored = await prisma.appointment.findUniqueOrThrow({
      where: { id: target.appointment.id }
    })
    expect(stored.startsAt.toISOString()).toBe(utc(6))

    await request(server).delete(`/public/${alpha.slug}/holds/${holdId}`)
  })

  it("rejects a holdId that is not a uuid before touching anything", async () => {
    const { manageToken } = await book(alpha, utc(9))
    const res = await reschedule(manageToken, "not-a-uuid")
    expectStatus(res, 400)
  })
})
