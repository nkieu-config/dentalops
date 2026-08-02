import { INestApplication } from "@nestjs/common"
import request from "supertest"
import type { Server } from "node:http"
import type Redis from "ioredis"
import { availabilityResponseSchema } from "@dentalops/contracts"
import { AvailabilityCache, availabilityEntryPrefix } from "../src/availability/availability.cache"
import { PrismaService } from "../src/prisma/prisma.service"
import { REDIS } from "../src/redis/redis.module"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

describe("availability cache", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let redis: Redis
  let cache: AvailabilityCache
  let ownerToken: string
  let tenantId: string
  let branchId: string
  let serviceId: string
  let patientId: string
  let dentistId: string
  const slug = `cache-test-${Date.now()}`

  const at = (day: number, h: number, m = 0) =>
    new Date(Date.UTC(2027, 6, day, h, m)).toISOString()

  const getSlots = async (from: string, to: string) => {
    const res = await request(server)
      .get("/availability")
      .set("Authorization", `Bearer ${ownerToken}`)
      .query({ serviceId, branchId, from, to, dentistId })
    expectStatus(res, 200)
    return availabilityResponseSchema.parse(res.body).slots.map((s) => s.startsAt)
  }

  const seedDay = async (day: number) => {
    await prisma.shift.create({
      data: {
        tenantId,
        staffId: dentistId,
        branchId,
        startsAt: new Date(at(day, 2)),
        endsAt: new Date(at(day, 10))
      }
    })
  }

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)
    redis = app.get<Redis>(REDIS)
    cache = app.get(AvailabilityCache)

    const signup = await request(server).post("/auth/signup").send({
      clinicName: "Cache Test Clinic",
      slug,
      email: "owner@cachetest.local",
      password: "s3cure-pass",
      name: "Owner"
    })
    expectStatus(signup, 200)
    ownerToken = signup.body.accessToken

    const tenant = await prisma.tenant.findUnique({ where: { slug } })
    tenantId = tenant!.id
    branchId = (await prisma.branch.findFirst({ where: { tenantId } }))!.id

    const service = await prisma.service.create({
      data: { tenantId, name: "Cache Probe", durationMin: 60, bufferMin: 10 }
    })
    serviceId = service.id

    const patient = await prisma.patient.create({
      data: { tenantId, name: "Cache Patient", phone: "0877777777", email: "p@cachetest.local" }
    })
    patientId = patient.id

    const dentist = await prisma.user.create({
      data: {
        tenantId,
        email: "dentist@cachetest.local",
        passwordHash: "x",
        name: "Dr. Cache",
        role: "dentist"
      }
    })
    dentistId = dentist.id

    for (const day of [1, 2, 3, 4, 5, 6]) await seedDay(day)
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } })
    await app.close()
  })

  it("serves a repeat request from cache, proven by a write the cache cannot see", async () => {
    const before = await getSlots(at(1, 0), at(1, 12))
    expect(before).toContain(at(1, 3))

    await prisma.appointment.create({
      data: {
        tenantId,
        branchId,
        serviceId,
        dentistId,
        patientId,
        startsAt: new Date(at(1, 3)),
        endsAt: new Date(at(1, 4))
      }
    })

    expect(await getSlots(at(1, 0), at(1, 12))).toEqual(before)

    await cache.invalidate(tenantId, ["2027-07-01"])
    expect(await getSlots(at(1, 0), at(1, 12))).not.toContain(at(1, 3))
  })

  it("reflects a booking made through the api on the very next request", async () => {
    expect(await getSlots(at(2, 0), at(2, 12))).toContain(at(2, 3))

    const booked = await request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ serviceId, dentistId, patientId, branchId, startsAt: at(2, 3) })
    expectStatus(booked, 201)

    expect(await getSlots(at(2, 0), at(2, 12))).not.toContain(at(2, 3))
  })

  it("reflects a cancellation, a shift change and a time block without a stale read", async () => {
    const booked = await request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ serviceId, dentistId, patientId, branchId, startsAt: at(3, 3) })
    expectStatus(booked, 201)
    expect(await getSlots(at(3, 0), at(3, 12))).not.toContain(at(3, 3))

    const cancelled = await request(server)
      .patch(`/appointments/${booked.body.id}/status`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ status: "cancelled" })
    expectStatus(cancelled, 200)
    expect(await getSlots(at(3, 0), at(3, 12))).toContain(at(3, 3))

    const block = await request(server)
      .post("/time-blocks")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ staffId: dentistId, reason: "leave", startsAt: at(3, 3), endsAt: at(3, 4) })
    expectStatus(block, 201)
    expect(await getSlots(at(3, 0), at(3, 12))).not.toContain(at(3, 3))

    const removed = await request(server)
      .delete(`/time-blocks/${block.body.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
    expect(removed.status).toBe(204)
    expect(await getSlots(at(3, 0), at(3, 12))).toContain(at(3, 3))
  })

  it("invalidates every day a multi-day window spans, not just the first", async () => {
    const window = await getSlots(at(4, 0), at(6, 12))
    expect(window).toContain(at(5, 3))

    const booked = await request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ serviceId, dentistId, patientId, branchId, startsAt: at(5, 3) })
    expectStatus(booked, 201)

    expect(await getSlots(at(4, 0), at(6, 12))).not.toContain(at(5, 3))
  })

  it("keeps a live hold out of a cached answer, and honours exceptHoldId", async () => {
    const publicSlots = async (query: Record<string, string>) => {
      const res = await request(server)
        .get(`/public/${slug}/availability`)
        .query({ serviceId, branchId, dentistId, date: "2027-07-04", ...query })
      expectStatus(res, 200)
      return availabilityResponseSchema.parse(res.body).slots.map((s) => s.startsAt)
    }

    expect(await publicSlots({})).toContain(at(4, 4))

    const hold = await request(server)
      .post(`/public/${slug}/holds`)
      .send({ serviceId, branchId, dentistId, startsAt: at(4, 4) })
    expectStatus(hold, 201)

    expect(await publicSlots({})).not.toContain(at(4, 4))
    expect(await publicSlots({ exceptHoldId: hold.body.holdId })).toContain(at(4, 4))

    await request(server)
      .delete(`/public/${slug}/holds/${hold.body.holdId}`)
      .expect(204)
  })

  it("never lets one tenant's entry answer another tenant's identical query", async () => {
    const shared = { branchId, serviceId, dentistId, from: Date.now(), to: Date.now() + 3_600_000 }
    const mine = availabilityEntryPrefix({ tenantId, ...shared })
    const theirs = availabilityEntryPrefix({ tenantId: `${tenantId}-other`, ...shared })

    expect(mine).not.toBe(theirs)
    expect(mine).toContain(tenantId)

    const otherSlug = `cache-other-${Date.now()}`
    const other = await request(server).post("/auth/signup").send({
      clinicName: "Other Cache Clinic",
      slug: otherSlug,
      email: "owner@cacheother.local",
      password: "s3cure-pass",
      name: "Owner"
    })
    expectStatus(other, 200)

    const leaked = await request(server)
      .get("/availability")
      .set("Authorization", `Bearer ${other.body.accessToken}`)
      .query({ serviceId, branchId, from: at(1, 0), to: at(1, 12) })
    expect(leaked.status).toBe(404)

    await prisma.tenant.deleteMany({ where: { slug: otherSlug } })
  })

  it("still answers correctly when redis is unreachable", async () => {
    const truth = await getSlots(at(6, 0), at(6, 12))

    const evalSpy = jest.spyOn(redis, "eval").mockRejectedValue(new Error("redis is down"))
    const setSpy = jest.spyOn(redis, "set").mockRejectedValue(new Error("redis is down"))
    try {
      expect(await getSlots(at(6, 0), at(6, 12))).toEqual(truth)
      expect(await getSlots(at(6, 0), at(6, 12))).toEqual(truth)
    } finally {
      evalSpy.mockRestore()
      setSpy.mockRestore()
    }

    expect(await getSlots(at(6, 0), at(6, 12))).toEqual(truth)
  })
})
