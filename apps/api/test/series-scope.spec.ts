import { INestApplication } from "@nestjs/common"
import request from "supertest"
import type { Server } from "node:http"
import { apiErrorSchema } from "@dentalops/contracts"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

const HOUR = 3_600_000
const DAY = 86_400_000
const WEEK = 7 * DAY
const BANGKOK = 420 * 60_000

const utcAt = (hour: number) => Date.UTC(2028, 2, 6, hour, 0, 0)
const bangkokWeekday = (ms: number) => new Date(ms + BANGKOK).getUTCDay()
const iso = (ms: number) => new Date(ms).toISOString()

interface SeriesAppointment {
  id: string
  seriesId: string
  startsAt: string
  version: number
  detached: boolean
  dentistId: string
}

interface ConflictReport {
  conflicts: Array<{ startsAt: string; reason: string }>
}

describe("appointment series edit scopes", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let ownerToken: string
  let tenantId: string
  let branchId: string
  let patientId: string
  let serviceId: string
  const dentists: string[] = []
  const slug = `series-scope-${Date.now()}`

  const auth = (req: request.Test) => req.set("Authorization", `Bearer ${ownerToken}`)

  const makeSeries = async (dentistId: string, startsAt: number) => {
    const res = await auth(request(server).post("/appointments/series")).send({
      serviceId,
      dentistId,
      patientId,
      branchId,
      startsAt: iso(startsAt),
      freq: "weekly",
      interval: 1,
      byWeekday: [bangkokWeekday(startsAt)],
      count: 10
    })
    expectStatus(res, 201)
    return res.body as { seriesId: string; appointments: SeriesAppointment[] }
  }

  const editSeries = (id: string, body: object) =>
    auth(request(server).patch(`/series/${id}`)).send(body)

  const occurrences = (seriesId: string) =>
    prisma.appointment.findMany({ where: { seriesId }, orderBy: { startsAt: "asc" } })

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)

    const signup = await request(server).post("/auth/signup").send({
      clinicName: "Series Scope Clinic",
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

    for (const n of [1, 2, 3, 4]) {
      const dentist = await prisma.user.create({
        data: {
          tenantId,
          email: `dentist${n}@${slug}.local`,
          passwordHash: "x",
          name: `Dr. Scope ${n}`,
          role: "dentist"
        }
      })
      dentists.push(dentist.id)
    }

    const patient = await prisma.patient.create({
      data: { tenantId, name: "Scope Patient", phone: "0877700111", email: `p@${slug}.local` }
    })
    patientId = patient.id

    const service = await prisma.service.create({
      data: { tenantId, name: "Scope Checkup", durationMin: 60, bufferMin: 0 }
    })
    serviceId = service.id
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } })
    await app.close()
  })

  describe("this, then all", () => {
    let seriesId: string
    let created: SeriesAppointment[]
    const anchor = utcAt(2)

    beforeAll(async () => {
      const series = await makeSeries(dentists[0]!, anchor)
      seriesId = series.seriesId
      created = series.appointments
      expect(created).toHaveLength(10)
    })

    it("this moves only that occurrence and detaches it", async () => {
      const target = created[3]!
      const res = await editSeries(seriesId, {
        scope: "this",
        fromAppointmentId: target.id,
        version: target.version,
        startsAt: iso(anchor + 3 * WEEK + 2 * HOUR)
      })
      expectStatus(res, 200)

      const rows = await occurrences(seriesId)
      expect(rows).toHaveLength(10)
      const moved = rows.find((r) => r.id === target.id)!
      expect(moved.startsAt.toISOString()).toBe(iso(anchor + 3 * WEEK + 2 * HOUR))
      expect(moved.detached).toBe(true)

      for (const row of rows.filter((r) => r.id !== target.id)) {
        const original = created.find((c) => c.id === row.id)!
        expect(row.startsAt.toISOString()).toBe(original.startsAt)
        expect(row.detached).toBe(false)
      }
    })

    it("rejects a stale version on scope this", async () => {
      const res = await editSeries(seriesId, {
        scope: "this",
        fromAppointmentId: created[3]!.id,
        version: created[3]!.version,
        startsAt: iso(anchor + 3 * WEEK + 4 * HOUR)
      })
      expectStatus(res, 409)
      expect(apiErrorSchema.parse(res.body).errorCode).toBe("STALE_VERSION")
    })

    it("a later all leaves the detached occurrence where the user put it", async () => {
      const detached = created[3]!
      const res = await editSeries(seriesId, {
        scope: "all",
        fromAppointmentId: created[0]!.id,
        startsAt: iso(anchor + HOUR)
      })
      expectStatus(res, 200)

      const rows = await occurrences(seriesId)
      expect(rows).toHaveLength(10)
      expect(rows.every((r) => r.seriesId === seriesId)).toBe(true)

      const stillDetached = rows.find((r) => r.id === detached.id)!
      expect(stillDetached.startsAt.toISOString()).toBe(iso(anchor + 3 * WEEK + 2 * HOUR))
      expect(stillDetached.detached).toBe(true)

      for (const row of rows.filter((r) => r.id !== detached.id)) {
        const original = created.find((c) => c.id === row.id)!
        expect(row.startsAt.getTime()).toBe(Date.parse(original.startsAt) + HOUR)
      }

      const claims = await prisma.resourceClaim.findMany({
        where: { appointmentId: rows[0]!.id, status: "active" }
      })
      expect(claims).toHaveLength(1)
      expect(claims[0]!.startsAt.getTime()).toBe(rows[0]!.startsAt.getTime())
    })
  })

  describe("following", () => {
    it("splits the series at the boundary and leaves the past alone", async () => {
      const anchor = utcAt(5)
      const { seriesId, appointments } = await makeSeries(dentists[1]!, anchor)
      const boundary = appointments[5]!

      const res = await editSeries(seriesId, {
        scope: "following",
        fromAppointmentId: boundary.id,
        startsAt: iso(Date.parse(boundary.startsAt) + 3 * HOUR)
      })
      expectStatus(res, 200)
      const newSeriesId = (res.body as { seriesId: string }).seriesId
      expect(newSeriesId).not.toBe(seriesId)

      const past = await occurrences(seriesId)
      expect(past.map((r) => r.id)).toEqual(appointments.slice(0, 5).map((a) => a.id))
      expect(past.map((r) => r.startsAt.toISOString())).toEqual(
        appointments.slice(0, 5).map((a) => a.startsAt)
      )

      const moved = await occurrences(newSeriesId)
      expect(moved.map((r) => r.id)).toEqual(appointments.slice(5).map((a) => a.id))
      expect(moved.map((r) => r.startsAt.getTime())).toEqual(
        appointments.slice(5).map((a) => Date.parse(a.startsAt) + 3 * HOUR)
      )

      const oldSeries = await prisma.appointmentSeries.findUniqueOrThrow({ where: { id: seriesId } })
      const newSeries = await prisma.appointmentSeries.findUniqueOrThrow({
        where: { id: newSeriesId }
      })
      expect(oldSeries.count).toBe(5)
      expect(newSeries.count).toBe(5)
      expect(newSeries.byWeekday).toEqual([bangkokWeekday(Date.parse(boundary.startsAt) + 3 * HOUR)])

      for (const row of moved) {
        const claims = await prisma.resourceClaim.findMany({
          where: { appointmentId: row.id, status: "active" }
        })
        expect(claims).toHaveLength(1)
        expect(claims[0]!.startsAt.getTime()).toBe(row.startsAt.getTime())
      }
    })

    it("reassigns the dentist for the following occurrences only", async () => {
      const anchor = utcAt(8)
      const { seriesId, appointments } = await makeSeries(dentists[2]!, anchor)

      const res = await editSeries(seriesId, {
        scope: "following",
        fromAppointmentId: appointments[7]!.id,
        dentistId: dentists[3]
      })
      expectStatus(res, 200)
      const newSeriesId = (res.body as { seriesId: string }).seriesId

      const past = await occurrences(seriesId)
      expect(past.every((r) => r.dentistId === dentists[2])).toBe(true)
      const moved = await occurrences(newSeriesId)
      expect(moved).toHaveLength(3)
      expect(moved.every((r) => r.dentistId === dentists[3])).toBe(true)
      expect(moved.map((r) => r.startsAt.toISOString())).toEqual(
        appointments.slice(7).map((a) => a.startsAt)
      )
    })
  })

  describe("conflicts", () => {
    it("reports the conflicting occurrence of a following edit and moves nothing", async () => {
      const anchor = utcAt(11)
      const { seriesId, appointments } = await makeSeries(dentists[0]!, anchor)
      const blockedTarget = Date.parse(appointments[7]!.startsAt) + 4 * HOUR

      const blocker = await auth(request(server).post("/appointments")).send({
        serviceId,
        dentistId: dentists[0],
        patientId,
        branchId,
        startsAt: iso(blockedTarget)
      })
      expectStatus(blocker, 201)

      const seriesBefore = await prisma.appointmentSeries.count({ where: { tenantId } })
      const res = await editSeries(seriesId, {
        scope: "following",
        fromAppointmentId: appointments[5]!.id,
        startsAt: iso(Date.parse(appointments[5]!.startsAt) + 4 * HOUR)
      })
      expectStatus(res, 409)

      const error = apiErrorSchema.parse(res.body)
      expect(error.errorCode).toBe("SERIES_CONFLICT")
      expect((error.details as ConflictReport).conflicts).toEqual([
        { startsAt: iso(blockedTarget), reason: "SLOT_CONFLICT" }
      ])

      const rows = await occurrences(seriesId)
      expect(rows).toHaveLength(10)
      expect(rows.map((r) => r.startsAt.toISOString())).toEqual(appointments.map((a) => a.startsAt))
      expect(await prisma.appointmentSeries.count({ where: { tenantId } })).toBe(seriesBefore)
    })

    it("rejects an occurrence that does not belong to the series", async () => {
      const anchor = utcAt(14)
      const first = await makeSeries(dentists[1]!, anchor)
      const second = await makeSeries(dentists[2]!, anchor + 2 * HOUR)

      const res = await editSeries(first.seriesId, {
        scope: "all",
        fromAppointmentId: second.appointments[0]!.id,
        startsAt: iso(anchor + 6 * HOUR)
      })
      expectStatus(res, 404)
    })
  })
})
