import { INestApplication } from "@nestjs/common"
import request from "supertest"
import type { Server } from "node:http"
import { availabilityResponseSchema } from "@dentalops/contracts"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

describe("availability", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let ownerToken: string
  let tenantId: string
  let branchId: string
  let serviceId: string
  let patientId: string
  const dentistIds: string[] = []
  const slug = `avail-test-${Date.now()}`

  const day1 = (h: number, m = 0) => new Date(Date.UTC(2027, 2, 1, h, m)).toISOString()
  const day2 = (h: number, m = 0) => new Date(Date.UTC(2027, 2, 2, h, m)).toISOString()

  const getSlots = async (from: string, to: string, dentistId?: string) => {
    const res = await request(server)
      .get("/availability")
      .set("Authorization", `Bearer ${ownerToken}`)
      .query({ serviceId, branchId, from, to, ...(dentistId ? { dentistId } : {}) })
    expectStatus(res, 200)
    return availabilityResponseSchema.parse(res.body).slots
  }

  const book = (dentistId: string, startsAt: string) =>
    request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ serviceId, dentistId, patientId, branchId, startsAt })

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)

    const signup = await request(server).post("/auth/signup").send({
      clinicName: "Availability Test Clinic",
      slug,
      email: "owner@availtest.local",
      password: "s3cure-pass",
      name: "Owner"
    })
    expectStatus(signup, 200)
    ownerToken = signup.body.accessToken

    const tenant = await prisma.tenant.findUnique({ where: { slug } })
    tenantId = tenant!.id
    const branch = await prisma.branch.findFirst({ where: { tenantId } })
    branchId = branch!.id

    const service = await prisma.service.create({
      data: { tenantId, name: "Avail Probe", durationMin: 60, bufferMin: 10 }
    })
    serviceId = service.id

    const patient = await prisma.patient.create({
      data: { tenantId, name: "Avail Patient", phone: "0899999999", email: "p@availtest.local" }
    })
    patientId = patient.id

    for (const n of [1, 2, 3, 4]) {
      const dentist = await prisma.user.create({
        data: {
          tenantId,
          email: `dentist${n}@availtest.local`,
          passwordHash: "x",
          name: `Dr. Avail ${n}`,
          role: "dentist"
        }
      })
      dentistIds.push(dentist.id)
      await prisma.shift.create({
        data: {
          tenantId,
          staffId: dentist.id,
          branchId,
          startsAt: new Date(day2(2)),
          endsAt: new Date(day2(10))
        }
      })
    }
    await prisma.shift.create({
      data: {
        tenantId,
        staffId: dentistIds[0]!,
        branchId,
        startsAt: new Date(day1(2)),
        endsAt: new Date(day1(10))
      }
    })
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } })
    await app.close()
  })

  it("an empty day yields the full 15-minute grid inside the shift", async () => {
    const slots = await getSlots(day1(0), day1(12), dentistIds[0])
    expect(slots).toHaveLength(29)
    expect(slots[0]!.startsAt).toBe(day1(2))
    expect(slots[slots.length - 1]!.startsAt).toBe(day1(9))
  })

  it("a booked appointment removes exactly the overlapping starts", async () => {
    const booked = await book(dentistIds[0]!, day1(3))
    expectStatus(booked, 201)
    const slots = await getSlots(day1(0), day1(12), dentistIds[0])
    const starts = slots.map((s) => s.startsAt)
    expect(slots).toHaveLength(22)
    expect(starts).toContain(day1(2))
    expect(starts).not.toContain(day1(2, 15))
    expect(starts).not.toContain(day1(3))
    expect(starts).not.toContain(day1(3, 45))
    expect(starts).toContain(day1(4))
  })

  it("three occupied chairs block a fourth dentist who is himself free", async () => {
    for (const d of dentistIds.slice(0, 3)) {
      expectStatus(await book(d, day2(5)), 201)
    }
    const slots = await getSlots(day2(0), day2(12), dentistIds[3])
    const starts = slots.map((s) => s.startsAt)
    expect(starts).toContain(day2(3, 45))
    expect(starts).not.toContain(day2(4))
    expect(starts).not.toContain(day2(5))
    expect(starts).not.toContain(day2(6))
    expect(starts).toContain(day2(6, 15))
  })

  it("a personal time block is subtracted", async () => {
    const block = await request(server)
      .post("/time-blocks")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        staffId: dentistIds[3],
        reason: "leave",
        startsAt: day2(8),
        endsAt: day2(9)
      })
    expectStatus(block, 201)
    const slots = await getSlots(day2(0), day2(12), dentistIds[3])
    const starts = slots.map((s) => s.startsAt)
    expect(starts).toContain(day2(7))
    expect(starts).not.toContain(day2(7, 15))
    expect(starts).not.toContain(day2(8, 45))
    expect(starts).toContain(day2(9))
  })

  it("a branch-wide block with no staffId hits every dentist", async () => {
    const block = await request(server)
      .post("/time-blocks")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        branchId,
        reason: "closed",
        startsAt: day2(9),
        endsAt: day2(10)
      })
    expectStatus(block, 201)
    const slots = await getSlots(day2(0), day2(12))
    const blockStart = Date.parse(day2(9))
    const blockEnd = Date.parse(day2(10))
    expect(slots.length).toBeGreaterThan(0)
    expect(
      slots.every((s) => Date.parse(s.endsAt) <= blockStart || Date.parse(s.startsAt) >= blockEnd)
    ).toBe(true)
  })

  it("rejects an inverted range and a range over 31 days", async () => {
    const inverted = await request(server)
      .get("/availability")
      .set("Authorization", `Bearer ${ownerToken}`)
      .query({ serviceId, branchId, from: day1(12), to: day1(0) })
    expect(inverted.status).toBe(400)
    expect(inverted.body.errorCode).toBe("INVALID_RANGE")
    const huge = await request(server)
      .get("/availability")
      .set("Authorization", `Bearer ${ownerToken}`)
      .query({
        serviceId,
        branchId,
        from: day1(0),
        to: new Date(Date.UTC(2027, 3, 2)).toISOString()
      })
    expect(huge.status).toBe(400)
    expect(huge.body.errorCode).toBe("RANGE_TOO_LARGE")
  })

  it("an unknown service returns 404", async () => {
    const res = await request(server)
      .get("/availability")
      .set("Authorization", `Bearer ${ownerToken}`)
      .query({
        serviceId: "00000000-0000-4000-8000-000000000000",
        branchId,
        from: day1(0),
        to: day1(12)
      })
    expect(res.status).toBe(404)
  })

  describe("round-trip against the demo seed", () => {
    let demoToken: string
    let demoBranchId: string
    let demoServiceId: string
    let demoPatientId: string

    const resolveDemo = async () => {
      const demo = await request(server).post("/auth/demo-login").send({ role: "owner" })
      expectStatus(demo, 200)
      demoToken = demo.body.accessToken
      const tenant = await prisma.tenant.findUnique({ where: { slug: "demo-clinic" } })
      const branch = await prisma.branch.findFirst({ where: { tenantId: tenant!.id } })
      demoBranchId = branch!.id
      const withEquipment = await prisma.service.findFirst({
        where: { tenantId: tenant!.id, requirements: { some: {} } }
      })
      const anyService =
        withEquipment ?? (await prisma.service.findFirst({ where: { tenantId: tenant!.id } }))
      demoServiceId = anyService!.id
      const patient = await prisma.patient.findFirst({ where: { tenantId: tenant!.id } })
      demoPatientId = patient!.id
    }

    it("every sampled reported slot is actually bookable", async () => {
      await resolveDemo()
      const from = new Date(Date.now() + 24 * 3600_000).toISOString()
      const to = new Date(Date.now() + 72 * 3600_000).toISOString()
      const res = await request(server)
        .get("/availability")
        .set("Authorization", `Bearer ${demoToken}`)
        .query({ serviceId: demoServiceId, branchId: demoBranchId, from, to })
      expectStatus(res, 200)
      const slots = availabilityResponseSchema.parse(res.body).slots
      expect(slots.length).toBeGreaterThan(0)
      const GAP_MS = 90 * 60_000
      const samples: typeof slots = []
      let clearAfter = 0
      for (const slot of [...slots].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
        if (Date.parse(slot.startsAt) < clearAfter) continue
        samples.push(slot)
        clearAfter = Date.parse(slot.endsAt) + GAP_MS
        if (samples.length === 3) break
      }
      expect(samples.length).toBeGreaterThanOrEqual(2)

      for (const slot of samples) {
        const booked = await request(server)
          .post("/appointments")
          .set("Authorization", `Bearer ${demoToken}`)
          .send({
            serviceId: demoServiceId,
            dentistId: slot.dentistId,
            patientId: demoPatientId,
            branchId: demoBranchId,
            startsAt: slot.startsAt
          })
        expectStatus(booked, 201)
      }
      const after = await request(server)
        .get("/availability")
        .set("Authorization", `Bearer ${demoToken}`)
        .query({ serviceId: demoServiceId, branchId: demoBranchId, from, to })
      expectStatus(after, 200)
      const remaining = availabilityResponseSchema.parse(after.body).slots
      for (const slot of samples) {
        expect(
          remaining.some((r) => r.dentistId === slot.dentistId && r.startsAt === slot.startsAt)
        ).toBe(false)
      }
    })
  })
})
