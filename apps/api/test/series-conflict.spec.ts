import { INestApplication } from "@nestjs/common"
import request from "supertest"
import type { Server } from "node:http"
import { apiErrorSchema } from "@dentalops/contracts"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

const DAY = 86_400_000
const WEEK = 7 * DAY
const BANGKOK_OFFSET_MS = 420 * 60_000

const utcAt = (hour: number) => Date.UTC(2027, 2, 1, hour, 0, 0)
const bangkokWeekday = (ms: number) => new Date(ms + BANGKOK_OFFSET_MS).getUTCDay()
const iso = (ms: number) => new Date(ms).toISOString()

interface ConflictReport {
  conflicts: Array<{ startsAt: string; reason: string }>
}

describe("appointment series conflict reporting", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let ownerToken: string
  let intruderToken: string
  let tenantId: string
  let branchId: string
  let patientId: string
  let serviceId: string
  const dentists: string[] = []
  const slug = `series-${Date.now()}`
  const intruderSlug = `series-intruder-${Date.now()}`

  const postSeries = (body: object) =>
    request(server)
      .post("/appointments/series")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(body)

  const bookOne = (dentistId: string, startsAt: number) =>
    request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ serviceId, dentistId, patientId, branchId, startsAt: iso(startsAt) })

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)

    const signup = await request(server).post("/auth/signup").send({
      clinicName: "Series Test Clinic",
      slug,
      email: "owner@series.local",
      password: "s3cure-pass",
      name: "Owner"
    })
    expectStatus(signup, 200)
    ownerToken = signup.body.accessToken

    const intruder = await request(server).post("/auth/signup").send({
      clinicName: "Series Intruder Clinic",
      slug: intruderSlug,
      email: "owner@series-intruder.local",
      password: "s3cure-pass",
      name: "Intruder"
    })
    expectStatus(intruder, 200)
    intruderToken = intruder.body.accessToken

    const tenant = await prisma.tenant.findUnique({ where: { slug } })
    tenantId = tenant!.id
    const branch = await prisma.branch.findFirst({ where: { tenantId } })
    branchId = branch!.id

    const argon2 = await import("argon2")
    const passwordHash = await argon2.hash("s3cure-pass")
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const dentist = await prisma.user.create({
        data: {
          tenantId,
          email: `dentist${n}@series.local`,
          passwordHash,
          name: `Dr. Series ${n}`,
          role: "dentist"
        }
      })
      dentists.push(dentist.id)
    }

    const patient = await prisma.patient.create({
      data: { tenantId, name: "Series Patient", phone: "0899999001", email: "p@series.local" }
    })
    patientId = patient.id

    const service = await prisma.service.create({
      data: { tenantId, name: "Weekly Checkup", durationMin: 60, bufferMin: 0 }
    })
    serviceId = service.id
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { in: [slug, intruderSlug] } } })
    await app.close()
  })

  it("inserts every occurrence of a clean twelve week series under one seriesId", async () => {
    const startsAt = utcAt(2)
    const res = await postSeries({
      serviceId,
      dentistId: dentists[0],
      patientId,
      branchId,
      startsAt: iso(startsAt),
      freq: "weekly",
      interval: 1,
      byWeekday: [bangkokWeekday(startsAt)],
      count: 12
    })
    expectStatus(res, 201)

    const seriesId = res.body.seriesId as string
    const created = res.body.appointments as Array<{
      seriesId: string
      startsAt: string
      claims: unknown[]
    }>
    expect(created).toHaveLength(12)
    expect(created.map((a) => a.startsAt)).toEqual(
      Array.from({ length: 12 }, (_, k) => iso(startsAt + k * WEEK))
    )
    expect(new Set(created.map((a) => a.seriesId))).toEqual(new Set([seriesId]))
    expect(created.every((a) => a.claims.length === 1)).toBe(true)

    const stored = await prisma.appointment.count({ where: { seriesId } })
    expect(stored).toBe(12)
  })

  it("reports the single conflicting occurrence of a 24 week series and inserts nothing", async () => {
    const startsAt = utcAt(4)
    const dentistId = dentists[1]!
    expectStatus(await bookOne(dentistId, startsAt + 16 * WEEK), 201)

    const seriesBefore = await prisma.appointmentSeries.count({ where: { tenantId } })

    const res = await postSeries({
      serviceId,
      dentistId,
      patientId,
      branchId,
      startsAt: iso(startsAt),
      freq: "weekly",
      interval: 1,
      byWeekday: [bangkokWeekday(startsAt)],
      count: 24
    })
    expectStatus(res, 409)

    const error = apiErrorSchema.parse(res.body)
    expect(error.errorCode).toBe("SERIES_CONFLICT")
    const details = error.details as ConflictReport
    expect(details.conflicts).toEqual([
      { startsAt: iso(startsAt + 16 * WEEK), reason: "SLOT_CONFLICT" }
    ])

    expect(await prisma.appointment.count({ where: { dentistId } })).toBe(1)
    expect(await prisma.appointment.count({ where: { dentistId, seriesId: { not: null } } })).toBe(0)
    expect(await prisma.appointmentSeries.count({ where: { tenantId } })).toBe(seriesBefore)
  })

  it("reports both conflicting occurrences, not just the first", async () => {
    const startsAt = utcAt(6)
    const dentistId = dentists[2]!
    expectStatus(await bookOne(dentistId, startsAt + 2 * WEEK), 201)
    expectStatus(await bookOne(dentistId, startsAt + 16 * WEEK), 201)

    const res = await postSeries({
      serviceId,
      dentistId,
      patientId,
      branchId,
      startsAt: iso(startsAt),
      freq: "weekly",
      interval: 1,
      byWeekday: [bangkokWeekday(startsAt)],
      count: 24
    })
    expectStatus(res, 409)

    const details = apiErrorSchema.parse(res.body).details as ConflictReport
    expect(details.conflicts).toEqual([
      { startsAt: iso(startsAt + 2 * WEEK), reason: "SLOT_CONFLICT" },
      { startsAt: iso(startsAt + 16 * WEEK), reason: "SLOT_CONFLICT" }
    ])

    expect(await prisma.appointment.count({ where: { dentistId } })).toBe(2)
    expect(await prisma.appointment.count({ where: { dentistId, seriesId: { not: null } } })).toBe(0)
  })

  it("honours count exactly and starts the rule at the anchoring appointment", async () => {
    const startsAt = utcAt(8)
    const dentistId = dentists[3]!
    const anchorWeekday = bangkokWeekday(startsAt)
    const res = await postSeries({
      serviceId,
      dentistId,
      patientId,
      branchId,
      startsAt: iso(startsAt),
      freq: "weekly",
      interval: 1,
      byWeekday: [(anchorWeekday + 5) % 7, anchorWeekday],
      count: 4
    })
    expectStatus(res, 201)

    const created = res.body.appointments as Array<{ startsAt: string }>
    expect(created.map((a) => a.startsAt)).toEqual([
      iso(startsAt),
      iso(startsAt + 5 * DAY),
      iso(startsAt + 7 * DAY),
      iso(startsAt + 12 * DAY)
    ])
    expect(await prisma.appointment.count({ where: { dentistId } })).toBe(4)
    expect(
      await prisma.appointment.count({ where: { dentistId, startsAt: new Date(startsAt - 2 * DAY) } })
    ).toBe(0)
  })

  it("reports an occurrence that runs out of chairs and leaves no half-built row", async () => {
    const startsAt = utcAt(12)
    const dentistId = dentists[4]!
    for (const blocker of [dentists[5]!, dentists[6]!, dentists[7]!]) {
      expectStatus(await bookOne(blocker, startsAt + 2 * WEEK), 201)
    }

    const res = await postSeries({
      serviceId,
      dentistId,
      patientId,
      branchId,
      startsAt: iso(startsAt),
      freq: "weekly",
      interval: 1,
      byWeekday: [bangkokWeekday(startsAt)],
      count: 5
    })
    expectStatus(res, 409)

    const details = apiErrorSchema.parse(res.body).details as ConflictReport
    expect(details.conflicts).toEqual([
      { startsAt: iso(startsAt + 2 * WEEK), reason: "RESOURCE_UNAVAILABLE" }
    ])
    expect(await prisma.appointment.count({ where: { dentistId } })).toBe(0)
  })

  it("keeps the series tenant scoped", async () => {
    const res = await request(server)
      .get("/appointments")
      .set("Authorization", `Bearer ${intruderToken}`)
      .query({ from: iso(utcAt(0)), to: iso(utcAt(0) + 30 * WEEK) })
      .expect(200)
    expect(res.body).toEqual([])

    const mine = await request(server)
      .get("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .query({ dentistId: dentists[0], from: iso(utcAt(0)), to: iso(utcAt(0) + 30 * WEEK) })
      .expect(200)
    expect(mine.body.length).toBe(12)
  })

  it("rejects a series from the dentist role", async () => {
    const login = await request(server).post("/auth/login").send({
      clinicSlug: slug,
      email: "dentist1@series.local",
      password: "s3cure-pass"
    })
    expectStatus(login, 200)
    await request(server)
      .post("/appointments/series")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .send({
        serviceId,
        dentistId: dentists[0],
        patientId,
        branchId,
        startsAt: iso(utcAt(10)),
        freq: "weekly",
        interval: 1,
        byWeekday: [bangkokWeekday(utcAt(10))],
        count: 2
      })
      .expect(403)
  })
})
