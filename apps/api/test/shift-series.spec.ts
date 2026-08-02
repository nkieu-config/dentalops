import { INestApplication } from "@nestjs/common"
import request from "supertest"
import type { Server } from "node:http"
import { apiErrorSchema } from "@dentalops/contracts"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000
const BANGKOK = 420 * MINUTE
const HORIZON_DAYS = 90

const localDayStart = (ms: number) => Math.floor((ms + BANGKOK) / DAY) * DAY - BANGKOK
const localDate = (ms: number) => new Date(ms + BANGKOK).toISOString().slice(0, 10)
const bangkokWeekday = (ms: number) => new Date(ms + BANGKOK).getUTCDay()

interface MaterializeResult {
  seriesId: string
  created: number
  skipped: number
}

describe("shift series", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let ownerToken: string
  let dentistToken: string
  let tenantId: string
  let branchId: string
  const staff: string[] = []
  const slug = `shift-series-${Date.now()}`
  const today = localDayStart(Date.now())

  const expectedStarts = (weekdays: number[], hour: number, fromDay = today, days = HORIZON_DAYS) => {
    const out: number[] = []
    for (let d = 0; d < days; d++) {
      const dayStart = fromDay + d * DAY
      if (dayStart >= today + HORIZON_DAYS * DAY) break
      if (weekdays.includes(bangkokWeekday(dayStart))) out.push(dayStart + hour * HOUR)
    }
    return out
  }

  const createSeries = (body: object) =>
    request(server)
      .post("/shifts/series")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(body)

  const patchSeries = (id: string, body: object) =>
    request(server)
      .patch(`/shift-series/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(body)

  const shiftsOf = (seriesId: string) =>
    prisma.shift.findMany({ where: { seriesId }, orderBy: { startsAt: "asc" } })

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)

    const signup = await request(server).post("/auth/signup").send({
      clinicName: "Shift Series Clinic",
      slug,
      email: `owner@${slug}.local`,
      password: "s3cure-pass",
      name: "Owner"
    })
    expectStatus(signup, 200)
    ownerToken = signup.body.accessToken

    const tenant = await prisma.tenant.findUnique({ where: { slug } })
    tenantId = tenant!.id
    const branch = await prisma.branch.findFirst({ where: { tenantId } })
    branchId = branch!.id

    const argon2 = await import("argon2")
    const passwordHash = await argon2.hash("s3cure-pass")
    for (const n of [1, 2, 3, 4, 5]) {
      const dentist = await prisma.user.create({
        data: {
          tenantId,
          email: `dentist${n}@${slug}.local`,
          passwordHash,
          name: `Dr. Roster ${n}`,
          role: "dentist"
        }
      })
      staff.push(dentist.id)
    }

    const login = await request(server).post("/auth/login").send({
      clinicSlug: slug,
      email: `dentist1@${slug}.local`,
      password: "s3cure-pass"
    })
    expectStatus(login, 200)
    dentistToken = login.body.accessToken
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } })
    await app.close()
  })

  it("materialises a Mon/Wed/Fri series across the ninety day horizon", async () => {
    const res = await createSeries({
      staffId: staff[0],
      branchId,
      freq: "weekly",
      interval: 1,
      byWeekday: [1, 3, 5],
      timeStart: "09:00",
      durationMin: 480,
      startsOn: localDate(today)
    })
    expectStatus(res, 201)

    const body = res.body as MaterializeResult
    const expected = expectedStarts([1, 3, 5], 9)
    expect(body.created).toBe(expected.length)
    expect(body.skipped).toBe(0)

    const shifts = await shiftsOf(body.seriesId)
    expect(shifts.map((s) => s.startsAt.getTime())).toEqual(expected)
    expect(shifts.every((s) => s.endsAt.getTime() - s.startsAt.getTime() === 480 * MINUTE)).toBe(true)
    expect(shifts.every((s) => s.staffId === staff[0] && s.detached === false)).toBe(true)
  })

  it("scope all with no rule change reproduces the identical schedule", async () => {
    const created = await createSeries({
      staffId: staff[1],
      branchId,
      freq: "weekly",
      interval: 1,
      byWeekday: [2],
      timeStart: "10:00",
      durationMin: 60,
      startsOn: localDate(today)
    })
    expectStatus(created, 201)
    const { seriesId, created: first } = created.body as MaterializeResult
    expect(first).toBeGreaterThan(0)
    const before = (await shiftsOf(seriesId)).map((s) => s.startsAt.getTime())

    const again = await patchSeries(seriesId, { scope: "all" })
    expectStatus(again, 200)
    expect((again.body as MaterializeResult).created).toBe(first)
    expect((await shiftsOf(seriesId)).map((s) => s.startsAt.getTime())).toEqual(before)
  })

  it("scope all re-materialises non-detached rows and leaves a detached one alone", async () => {
    const created = await createSeries({
      staffId: staff[2],
      branchId,
      freq: "weekly",
      interval: 1,
      byWeekday: [4],
      timeStart: "09:00",
      durationMin: 60,
      startsOn: localDate(today)
    })
    expectStatus(created, 201)
    const { seriesId } = created.body as MaterializeResult

    const before = await shiftsOf(seriesId)
    const exception = before[2]!
    await prisma.shift.update({ where: { id: exception.id }, data: { detached: true } })

    const res = await patchSeries(seriesId, { scope: "all", timeStart: "13:00" })
    expectStatus(res, 200)
    expect((res.body as MaterializeResult).created).toBe(before.length - 1)

    const after = await shiftsOf(seriesId)
    expect(after).toHaveLength(before.length)
    const kept = after.find((s) => s.id === exception.id)
    expect(kept?.startsAt.getTime()).toBe(exception.startsAt.getTime())
    expect(kept?.detached).toBe(true)
    for (const shift of after.filter((s) => s.id !== exception.id)) {
      expect(shift.startsAt.getTime() - localDayStart(shift.startsAt.getTime())).toBe(13 * HOUR)
    }
    expect(after.filter((s) => localDate(s.startsAt.getTime()) === localDate(exception.startsAt.getTime()))).toHaveLength(1)
  })

  it("scope following closes the old series at the boundary and opens a new one", async () => {
    const created = await createSeries({
      staffId: staff[3],
      branchId,
      freq: "weekly",
      interval: 1,
      byWeekday: [6],
      timeStart: "09:00",
      durationMin: 60,
      startsOn: localDate(today)
    })
    expectStatus(created, 201)
    const oldSeriesId = (created.body as MaterializeResult).seriesId

    const before = await shiftsOf(oldSeriesId)
    expect(before.length).toBeGreaterThan(6)
    const boundaryShift = before[3]!
    const boundary = localDayStart(boundaryShift.startsAt.getTime())

    const res = await patchSeries(oldSeriesId, {
      scope: "following",
      from: boundaryShift.startsAt.toISOString(),
      timeStart: "15:00"
    })
    expectStatus(res, 200)
    const newSeriesId = (res.body as MaterializeResult).seriesId
    expect(newSeriesId).not.toBe(oldSeriesId)

    const past = await shiftsOf(oldSeriesId)
    expect(past.map((s) => s.id)).toEqual(before.slice(0, 3).map((s) => s.id))
    expect(past.map((s) => s.startsAt.getTime())).toEqual(
      before.slice(0, 3).map((s) => s.startsAt.getTime())
    )

    const oldSeries = await prisma.shiftSeries.findUniqueOrThrow({ where: { id: oldSeriesId } })
    expect(oldSeries.endsOn?.toISOString().slice(0, 10)).toBe(localDate(boundary - DAY))

    const moved = await shiftsOf(newSeriesId)
    expect(moved.length).toBe(before.length - 3)
    expect(moved[0]!.startsAt.getTime()).toBe(boundary + 15 * HOUR)
    expect(moved.every((s) => s.startsAt.getTime() - localDayStart(s.startsAt.getTime()) === 15 * HOUR)).toBe(true)
    expect(moved.every((s) => s.staffId === staff[3])).toBe(true)
  })

  it("delete following clears the future and leaves the past, delete all removes everything", async () => {
    const created = await createSeries({
      staffId: staff[4],
      branchId,
      freq: "weekly",
      interval: 1,
      byWeekday: [0],
      timeStart: "09:00",
      durationMin: 60,
      startsOn: localDate(today)
    })
    expectStatus(created, 201)
    const { seriesId } = created.body as MaterializeResult

    const history = await prisma.shift.create({
      data: {
        tenantId,
        staffId: staff[4]!,
        branchId,
        seriesId,
        startsAt: new Date(today - 14 * DAY + 9 * HOUR),
        endsAt: new Date(today - 14 * DAY + 10 * HOUR)
      }
    })

    await request(server)
      .delete(`/shift-series/${seriesId}`)
      .query({ scope: "following" })
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(204)

    const left = await shiftsOf(seriesId)
    expect(left.map((s) => s.id)).toEqual([history.id])
    const closed = await prisma.shiftSeries.findUniqueOrThrow({ where: { id: seriesId } })
    expect(closed.endsOn?.toISOString().slice(0, 10)).toBe(localDate(today - DAY))

    await request(server)
      .delete(`/shift-series/${seriesId}`)
      .query({ scope: "all" })
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(204)

    expect(await prisma.shiftSeries.findUnique({ where: { id: seriesId } })).toBeNull()
    expect(await prisma.shift.count({ where: { seriesId } })).toBe(0)
  })

  it("rejects a shift series from the dentist role", async () => {
    const res = await request(server)
      .post("/shifts/series")
      .set("Authorization", `Bearer ${dentistToken}`)
      .send({
        staffId: staff[0],
        branchId,
        freq: "weekly",
        interval: 1,
        byWeekday: [1],
        timeStart: "09:00",
        durationMin: 60,
        startsOn: localDate(today)
      })
      .expect(403)
    expect(apiErrorSchema.parse(res.body).errorCode).toBe("FORBIDDEN")
  })

  it("rejects a malformed time and an empty weekday list", async () => {
    for (const body of [
      { timeStart: "9am", byWeekday: [1] },
      { timeStart: "09:00", byWeekday: [] },
      { timeStart: "09:00", byWeekday: [1], interval: 0 }
    ]) {
      const res = await createSeries({
        staffId: staff[0],
        branchId,
        freq: "weekly",
        interval: 1,
        durationMin: 60,
        startsOn: localDate(today),
        ...body
      })
      expectStatus(res, 400)
    }
  })
})
