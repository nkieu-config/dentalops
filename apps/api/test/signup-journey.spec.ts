import { INestApplication } from "@nestjs/common"
import type { Server } from "node:http"
import request from "supertest"
import {
  appointmentSchema,
  authSessionSchema,
  availabilityResponseSchema,
  branchSchema,
  patientSchema,
  serviceSummarySchema,
  shiftSchema,
  staffMemberSchema
} from "@dentalops/contracts"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

const DAY_MS = 86_400_000
const BKK_OFFSET = "+07:00"

const bkkDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" })
const bkkWeekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", weekday: "short" })

interface OpenDay {
  date: string
  opens: string
  closes: string
}

const readOpeningHours = (raw: unknown): Record<string, [string, string][]> => {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`the branch reported no opening hours: ${JSON.stringify(raw)}`)
  }
  const hours: Record<string, [string, string][]> = {}
  for (const [day, windows] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(windows)) continue
    hours[day] = windows.filter(
      (w): w is [string, string] =>
        Array.isArray(w) && typeof w[0] === "string" && typeof w[1] === "string"
    )
  }
  return hours
}

const firstOpenDayFromTomorrow = (raw: unknown): OpenDay => {
  const hours = readOpeningHours(raw)
  for (let days = 1; days <= 7; days += 1) {
    const at = new Date(Date.now() + days * DAY_MS)
    const window = hours[bkkWeekday.format(at).toLowerCase()]?.[0]
    if (window) return { date: bkkDate.format(at), opens: window[0], closes: window[1] }
  }
  throw new Error(`the branch never opens in the next week: ${JSON.stringify(raw)}`)
}

const bkkInstant = (date: string, time: string): string =>
  new Date(`${date}T${time}:00.000${BKK_OFFSET}`).toISOString()

describe("a brand new clinic goes from signup to a booked appointment", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService

  const stamp = Date.now()
  const slug = `journey-${stamp}`
  const ownerEmail = `owner@${slug}.local`
  const dentistEmail = `dentist@${slug}.local`
  const password = "s3cure-pass"

  let ownerToken: string
  let ownerId: string
  let dentistToken: string
  let dentistId: string
  let branchId: string
  let serviceId: string
  let patientId: string
  let workday: OpenDay
  let shiftStartsAt: string
  let shiftEndsAt: string
  let bookedSlot: { dentistId: string; startsAt: string }
  let appointmentId: string

  const asOwner = (method: "get" | "post", path: string) =>
    request(server)[method](path).set("Authorization", `Bearer ${ownerToken}`)

  const rosterOn = (staffId: string) =>
    asOwner("post", "/shifts").send({
      staffId,
      branchId,
      startsAt: shiftStartsAt,
      endsAt: shiftEndsAt
    })

  const slotsOnTheWorkday = async () => {
    const res = await asOwner("get", "/availability").query({
      serviceId,
      branchId,
      from: shiftStartsAt,
      to: shiftEndsAt
    })
    expectStatus(res, 200)
    return availabilityResponseSchema.parse(res.body).slots
  }

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } })
    await app.close()
  })

  it("signs a stranger up and hands back an owner session", async () => {
    const res = await request(server).post("/auth/signup").send({
      clinicName: "Journey Dental",
      slug,
      email: ownerEmail,
      password,
      name: "Journey Owner"
    })
    expectStatus(res, 200)

    const session = authSessionSchema.parse(res.body)
    expect(session.user.role).toBe("owner")
    expect(session.user.name).toBe("Journey Owner")
    ownerToken = session.accessToken
    ownerId = session.user.id
  })

  it("leaves that clinic with a branch, services and no dentist at all", async () => {
    const branches = await asOwner("get", "/branches")
    expectStatus(branches, 200)
    const parsedBranches = branchSchema.array().parse(branches.body)
    expect(parsedBranches).toHaveLength(1)
    branchId = parsedBranches[0]!.id
    workday = firstOpenDayFromTomorrow(parsedBranches[0]!.openingHours)
    shiftStartsAt = bkkInstant(workday.date, workday.opens)
    shiftEndsAt = bkkInstant(workday.date, workday.closes)

    const services = await asOwner("get", "/services")
    expectStatus(services, 200)
    const parsedServices = serviceSummarySchema.array().parse(services.body)
    expect(parsedServices.length).toBeGreaterThan(0)
    serviceId = parsedServices[0]!.id

    const dentists = await asOwner("get", "/staff").query({ role: "dentist" })
    expectStatus(dentists, 200)
    expect(staffMemberSchema.array().parse(dentists.body)).toHaveLength(0)
  })

  it("finds nothing bookable while the clinic has no dentist", async () => {
    expect(await slotsOnTheWorkday()).toHaveLength(0)
  })

  it("lets the owner hire a dentist over HTTP", async () => {
    const res = await asOwner("post", "/staff").send({
      name: "Dr Journey",
      email: dentistEmail,
      password,
      role: "dentist"
    })
    expectStatus(res, 201)
    const dentist = staffMemberSchema.parse(res.body)
    expect(dentist.role).toBe("dentist")
    dentistId = dentist.id

    const listed = await asOwner("get", "/staff").query({ role: "dentist" })
    expectStatus(listed, 200)
    expect(staffMemberSchema.array().parse(listed.body).map((s) => s.id)).toEqual([dentistId])
  })

  it("rosters the dentist for the branch's next open day", async () => {
    const res = await rosterOn(dentistId)
    expectStatus(res, 201)
    const shift = shiftSchema.parse(res.body)
    expect(shift.staffId).toBe(dentistId)
    expect(shift.branchId).toBe(branchId)
    expect(shift.startsAt).toBe(shiftStartsAt)
    expect(shift.endsAt).toBe(shiftEndsAt)
  })

  it("offers slots once somebody is on shift, all of them that dentist's", async () => {
    const slots = await slotsOnTheWorkday()
    expect(slots.length).toBeGreaterThan(0)
    expect(new Set(slots.map((s) => s.dentistId))).toEqual(new Set([dentistId]))
    bookedSlot = { dentistId: slots[0]!.dentistId, startsAt: slots[0]!.startsAt }
  })

  it("registers a patient at the desk", async () => {
    const res = await asOwner("post", "/patients").send({
      name: "Somchai Journey",
      phone: `08${String(stamp).slice(-8)}`,
      email: `patient@${slug}.local`
    })
    expectStatus(res, 201)
    patientId = patientSchema.parse(res.body).id
  })

  it("books the first free slot", async () => {
    const res = await asOwner("post", "/appointments").send({
      branchId,
      serviceId,
      dentistId: bookedSlot.dentistId,
      patientId,
      startsAt: bookedSlot.startsAt
    })
    expectStatus(res, 201)
    const appointment = appointmentSchema.parse(res.body)
    expect(appointment.status).toBe("confirmed")
    expect(appointment.dentistId).toBe(dentistId)
    expect(appointment.startsAt).toBe(bookedSlot.startsAt)
    expect(appointment.claims.length).toBeGreaterThan(0)
    appointmentId = appointment.id
  })

  it("shows the booking on the owner's day", async () => {
    const res = await asOwner("get", "/appointments").query({
      branchId,
      from: shiftStartsAt,
      to: shiftEndsAt
    })
    expectStatus(res, 200)
    const appointments = appointmentSchema.array().parse(res.body)
    expect(appointments.map((a) => a.id)).toEqual([appointmentId])
    expect(appointments[0]!.patient.name).toBe("Somchai Journey")
  })

  it("stops offering the slot it just sold", async () => {
    const slots = await slotsOnTheWorkday()
    expect(slots.map((s) => s.startsAt)).not.toContain(bookedSlot.startsAt)
  })

  it("lets the hired dentist log in with the password the owner chose", async () => {
    const res = await request(server)
      .post("/auth/login")
      .send({ clinicSlug: slug, email: dentistEmail, password })
    expectStatus(res, 200)
    const session = authSessionSchema.parse(res.body)
    expect(session.user.id).toBe(dentistId)
    expect(session.user.role).toBe("dentist")
    dentistToken = session.accessToken
  })

  it("shows that dentist exactly the one booking that is theirs", async () => {
    const res = await request(server)
      .get("/appointments")
      .set("Authorization", `Bearer ${dentistToken}`)
    expectStatus(res, 200)
    const appointments = appointmentSchema.array().parse(res.body)
    expect(appointments).toHaveLength(1)
    expect(appointments[0]!.id).toBe(appointmentId)
    expect(appointments[0]!.dentistId).toBe(dentistId)
    expect(dentistId).not.toBe(ownerId)
  })
})
