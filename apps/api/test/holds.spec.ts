import { INestApplication } from "@nestjs/common"
import { availabilityResponseSchema } from "@dentalops/contracts"
import type Redis from "ioredis"
import type { Server } from "node:http"
import request from "supertest"
import {
  HOLD_TTL_SECONDS,
  SLOT_MS,
  holdKey,
  slotKey,
  spannedSlotIndexes
} from "../src/holds/holds.service"
import { PrismaService } from "../src/prisma/prisma.service"
import { REDIS } from "../src/redis/redis.module"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

const THROTTLER_KEY_PATTERN = "*:default}:*"
const BKK_DATE = "2027-05-03"
const DURATION_MIN = 45

const utc = (hour: number, minute = 0) =>
  new Date(Date.UTC(2027, 4, 3, hour, minute)).toISOString()

interface HoldResponse {
  holdId: string
  expiresAt: string
}

interface Clinic {
  slug: string
  tenantId: string
  branchId: string
  serviceId: string
  dentistId: string
}

describe("redis slot holds", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let redis: Redis
  let alpha: Clinic
  let beta: Clinic
  const alphaSlug = `holds-alpha-${Date.now()}`
  const betaSlug = `holds-beta-${Date.now()}`

  const clearThrottleState = async () => {
    const keys = await redis.keys(THROTTLER_KEY_PATTERN)
    if (keys.length > 0) await redis.del(...keys)
  }

  const provision = async (slug: string, email: string): Promise<Clinic> => {
    const signup = await request(server).post("/auth/signup").send({
      clinicName: `Holds ${slug}`,
      slug,
      email,
      password: "s3cure-pass",
      name: "Holds Owner"
    })
    expectStatus(signup, 200)
    const tenantId = signup.body.user.tenantId as string

    const branch = await prisma.branch.findFirstOrThrow({ where: { tenantId } })
    const service = await prisma.service.create({
      data: { tenantId, name: "Hold Probe", durationMin: DURATION_MIN, bufferMin: 0 }
    })
    const dentist = await prisma.user.create({
      data: {
        tenantId,
        email: `dentist@${slug}.local`,
        passwordHash: "x",
        name: "Dr. Hold",
        role: "dentist"
      }
    })
    await prisma.shift.create({
      data: {
        tenantId,
        staffId: dentist.id,
        branchId: branch.id,
        startsAt: new Date(utc(2)),
        endsAt: new Date(utc(10))
      }
    })
    return {
      slug,
      tenantId,
      branchId: branch.id,
      serviceId: service.id,
      dentistId: dentist.id
    }
  }

  const startsOf = async (clinic: Clinic, extra: Record<string, string> = {}) => {
    const res = await request(server)
      .get(`/public/${clinic.slug}/availability`)
      .query({
        serviceId: clinic.serviceId,
        branchId: clinic.branchId,
        dentistId: clinic.dentistId,
        date: BKK_DATE,
        ...extra
      })
    expectStatus(res, 200)
    return availabilityResponseSchema.parse(res.body).slots.map((slot) => slot.startsAt)
  }

  const hold = (clinic: Clinic, startsAt: string) =>
    request(server).post(`/public/${clinic.slug}/holds`).send({
      serviceId: clinic.serviceId,
      branchId: clinic.branchId,
      dentistId: clinic.dentistId,
      startsAt
    })

  const acquire = async (clinic: Clinic, startsAt: string): Promise<HoldResponse> => {
    const res = await hold(clinic, startsAt)
    expectStatus(res, 201)
    return res.body as HoldResponse
  }

  const release = async (clinic: Clinic, holdId: string) => {
    const res = await request(server).delete(`/public/${clinic.slug}/holds/${holdId}`)
    expectStatus(res, 204)
  }

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)
    redis = app.get<Redis>(REDIS)
    await clearThrottleState()
    alpha = await provision(alphaSlug, "owner@holds-alpha.local")
    beta = await provision(betaSlug, "owner@holds-beta.local")
  })

  afterAll(async () => {
    await clearThrottleState()
    await prisma.tenant.deleteMany({ where: { slug: { in: [alphaSlug, betaSlug] } } })
    await app.close()
  })

  beforeEach(async () => {
    await clearThrottleState()
  })

  it("spans exactly the 15-minute indexes a 45-minute window covers", () => {
    const start = Date.parse(utc(2))
    const indexes = spannedSlotIndexes(start, start + DURATION_MIN * 60_000)
    expect(indexes).toEqual([
      Date.parse(utc(2)) / SLOT_MS,
      Date.parse(utc(2, 15)) / SLOT_MS,
      Date.parse(utc(2, 30)) / SLOT_MS
    ])
    expect(indexes).not.toContain(Date.parse(utc(2, 45)) / SLOT_MS)
  })

  it("removes exactly the overlapping starts, and exceptHoldId puts them back", async () => {
    const before = await startsOf(alpha)
    expect(before).toContain(utc(2))
    expect(before).toContain(utc(2, 15))
    expect(before).toContain(utc(2, 30))
    expect(before).toContain(utc(2, 45))

    const { holdId } = await acquire(alpha, utc(2))

    const after = await startsOf(alpha)
    expect(after).not.toContain(utc(2))
    expect(after).not.toContain(utc(2, 15))
    expect(after).not.toContain(utc(2, 30))
    expect(after).toContain(utc(2, 45))
    expect(after).toHaveLength(before.length - 3)

    const withException = await startsOf(alpha, { exceptHoldId: holdId })
    expect(withException).toEqual(before)

    await release(alpha, holdId)
    expect(await startsOf(alpha)).toEqual(before)
  })

  it("lets exactly one of several concurrent acquisitions of the same window win", async () => {
    await Promise.all([1, 2, 3, 4].map(() => startsOf(alpha)))

    const attempts = await Promise.all([1, 2, 3, 4].map(() => hold(alpha, utc(4))))
    const winners = attempts.filter((res) => res.status === 201)
    const losers = attempts.filter((res) => res.status === 409)
    expect(attempts.map((res) => res.status).sort((a, b) => a - b)).toEqual([201, 409, 409, 409])
    expect(winners).toHaveLength(1)
    for (const loser of losers) expect(loser.body.errorCode).toBe("SLOT_HELD")

    await release(alpha, (winners[0]!.body as HoldResponse).holdId)
  })

  it("allows an adjacent, non-overlapping window", async () => {
    const first = await acquire(alpha, utc(5))
    const second = await acquire(alpha, utc(5, 45))

    const starts = await startsOf(alpha)
    expect(starts).not.toContain(utc(5))
    expect(starts).not.toContain(utc(5, 45))
    expect(starts).toContain(utc(6, 30))

    await release(alpha, first.holdId)
    await release(alpha, second.holdId)
  })

  it("frees the slots immediately on release", async () => {
    const before = await startsOf(alpha)
    const { holdId } = await acquire(alpha, utc(6))
    expect(await startsOf(alpha)).not.toContain(utc(6))
    await release(alpha, holdId)
    expect(await startsOf(alpha)).toEqual(before)
  })

  it("sets a bounded ttl on every slot key and on the record", async () => {
    const { holdId, expiresAt } = await acquire(alpha, utc(7))
    const start = Date.parse(utc(7))
    const indexes = spannedSlotIndexes(start, start + DURATION_MIN * 60_000)

    for (const index of indexes) {
      const key = slotKey(alpha.tenantId, alpha.dentistId, index)
      expect(await redis.get(key)).toBe(holdId)
      const ttl = await redis.pttl(key)
      expect(ttl).toBeGreaterThan(0)
      expect(ttl).toBeLessThanOrEqual(HOLD_TTL_SECONDS * 1000)
    }

    const recordTtl = await redis.pttl(holdKey(holdId))
    expect(recordTtl).toBeGreaterThan(0)
    expect(recordTtl).toBeLessThanOrEqual(HOLD_TTL_SECONDS * 1000)
    expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now())

    await release(alpha, holdId)
    expect(await redis.get(holdKey(holdId))).toBeNull()
    for (const index of indexes) {
      expect(await redis.get(slotKey(alpha.tenantId, alpha.dentistId, index))).toBeNull()
    }
  })

  it("never lets a hold in one tenant affect availability in another", async () => {
    const betaBefore = await startsOf(beta)
    expect(betaBefore).toContain(utc(8))

    const { holdId } = await acquire(alpha, utc(8))
    expect(await startsOf(alpha)).not.toContain(utc(8))
    expect(await startsOf(beta)).toEqual(betaBefore)

    await release(alpha, holdId)
  })

  it("ignores a release issued through another clinic's slug", async () => {
    const { holdId } = await acquire(alpha, utc(8, 30))
    const res = await request(server).delete(`/public/${beta.slug}/holds/${holdId}`)
    expectStatus(res, 204)
    expect(await startsOf(alpha)).not.toContain(utc(8, 30))

    await release(alpha, holdId)
    expect(await startsOf(alpha)).toContain(utc(8, 30))
  })

  it("rejects a hold on a dentist that is not this clinic's", async () => {
    const res = await request(server).post(`/public/${alpha.slug}/holds`).send({
      serviceId: alpha.serviceId,
      branchId: alpha.branchId,
      dentistId: beta.dentistId,
      startsAt: utc(9)
    })
    expectStatus(res, 404)
    expect(res.body.errorCode).toBe("NOT_FOUND")
  })
})
