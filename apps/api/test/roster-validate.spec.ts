import { INestApplication } from "@nestjs/common"
import request from "supertest"
import type { Server } from "node:http"
import { availabilityResponseSchema } from "@dentalops/contracts"
import type { Violation } from "@dentalops/availability"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

interface DraftShift {
  id?: string
  staffId: string
  startsAt: string
  endsAt: string
}

describe("roster validation and time blocks", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let ownerToken: string
  let dentistToken: string
  let tenantId: string
  let branchId: string
  let serviceId: string
  let patientId: string
  let anongId: string
  let anongShiftId: string
  let somchaiId: string
  let ployId: string
  let earlyId: string
  const late: string[] = []
  const slug = `roster-test-${Date.now()}`
  const otherSlug = `roster-other-${Date.now()}`

  const utc = (day: number, h: number, m = 0) =>
    new Date(Date.UTC(2027, 4, day, h, m)).toISOString()

  const validate = (draftShifts: DraftShift[], token = ownerToken, day = 10) =>
    request(server)
      .post("/roster/validate")
      .set("Authorization", `Bearer ${token}`)
      .send({ branchId, from: utc(day, 0), to: utc(day + 1, 0), draftShifts })

  const violationsOf = async (draftShifts: DraftShift[]): Promise<Violation[]> => {
    const res = await validate(draftShifts)
    expectStatus(res, 200)
    return res.body.violations as Violation[]
  }

  const counts = async () => ({
    shifts: await prisma.shift.count({ where: { tenantId } }),
    appointments: await prisma.appointment.count({ where: { tenantId } }),
    timeBlocks: await prisma.timeBlock.count({ where: { tenantId } })
  })

  const makeDentist = async (email: string, name: string) => {
    const dentist = await prisma.user.create({
      data: { tenantId, email, passwordHash: "x", name, role: "dentist" }
    })
    return dentist.id
  }

  const makeShift = async (staffId: string, startsAt: string, endsAt: string) => {
    const shift = await prisma.shift.create({
      data: {
        tenantId,
        staffId,
        branchId,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt)
      }
    })
    return shift.id
  }

  const makeAppointment = async (dentistId: string, startsAt: string, endsAt: string) => {
    const appointment = await prisma.appointment.create({
      data: {
        tenantId,
        branchId,
        serviceId,
        patientId,
        dentistId,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt)
      }
    })
    return appointment.id
  }

  const getSlots = async (day: number, dentistId: string) => {
    const res = await request(server)
      .get("/availability")
      .set("Authorization", `Bearer ${ownerToken}`)
      .query({ serviceId, branchId, dentistId, from: utc(day, 0), to: utc(day + 1, 0) })
    expectStatus(res, 200)
    return availabilityResponseSchema.parse(res.body).slots.map((s) => s.startsAt)
  }

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)

    const signup = await request(server).post("/auth/signup").send({
      clinicName: "Roster Test Clinic",
      slug,
      email: "owner@rostertest.local",
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
      data: { tenantId, name: "Roster Probe", durationMin: 60, bufferMin: 0 }
    })
    serviceId = service.id
    const patient = await prisma.patient.create({
      data: { tenantId, name: "Roster Patient", phone: "0899000000", email: "p@rostertest.local" }
    })
    patientId = patient.id

    anongId = await makeDentist("anong@rostertest.local", "Dr. Anong")
    anongShiftId = await makeShift(anongId, utc(10, 2), utc(10, 10))
    earlyId = await makeAppointment(anongId, utc(10, 2), utc(10, 3))
    late.push(await makeAppointment(anongId, utc(10, 7, 30), utc(10, 8, 30)))
    late.push(await makeAppointment(anongId, utc(10, 8, 30), utc(10, 9, 30)))

    const argon2 = await import("argon2")
    await prisma.user.update({
      where: { id: anongId },
      data: { passwordHash: await argon2.hash("s3cure-pass") }
    })
    const dentistLogin = await request(server).post("/auth/login").send({
      clinicSlug: slug,
      email: "anong@rostertest.local",
      password: "s3cure-pass"
    })
    expectStatus(dentistLogin, 200)
    dentistToken = dentistLogin.body.accessToken
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { in: [slug, otherSlug] } } })
    await app.close()
  })

  it("shrinking a 09:00-17:00 shift to 09:00-15:00 names exactly the two appointments left outside", async () => {
    const violations = await violationsOf([
      { id: anongShiftId, staffId: anongId, startsAt: utc(10, 2), endsAt: utc(10, 8) }
    ])

    expect(violations).toHaveLength(1)
    expect(violations[0]!.rule).toBe("appointment_outside_shift")
    expect(violations[0]!.severity).toBe("block")
    expect(violations[0]!.staffId).toBe(anongId)
    expect([...(violations[0]!.appointmentIds ?? [])].sort()).toEqual([...late].sort())
    expect(violations[0]!.appointmentIds).not.toContain(earlyId)
  })

  it("a draft that restores the original hours reports nothing", async () => {
    const violations = await violationsOf([
      { id: anongShiftId, staffId: anongId, startsAt: utc(10, 2), endsAt: utc(10, 10) }
    ])
    expect(violations).toEqual([])
  })

  it("the persisted roster on its own is already clean", async () => {
    expect(await violationsOf([])).toEqual([])
  })

  it("is a dry run — no row is written, updated or deleted", async () => {
    const before = await counts()
    const persisted = await prisma.shift.findUniqueOrThrow({ where: { id: anongShiftId } })

    const violations = await violationsOf([
      { id: anongShiftId, staffId: anongId, startsAt: utc(10, 2), endsAt: utc(10, 8) },
      { staffId: anongId, startsAt: utc(10, 12), endsAt: utc(10, 14) }
    ])
    expect(violations.length).toBeGreaterThan(0)

    expect(await counts()).toEqual(before)
    const after = await prisma.shift.findUniqueOrThrow({ where: { id: anongShiftId } })
    expect(after.startsAt.toISOString()).toBe(persisted.startsAt.toISOString())
    expect(after.endsAt.toISOString()).toBe(persisted.endsAt.toISOString())
  })

  it("staff the draft does not mention keep their persisted shifts", async () => {
    somchaiId = await makeDentist("somchai@rostertest.local", "Dr. Somchai")
    await makeShift(somchaiId, utc(10, 2), utc(10, 8))
    const strandedId = await makeAppointment(somchaiId, utc(10, 8, 30), utc(10, 9, 30))

    const violations = await violationsOf([
      { id: anongShiftId, staffId: anongId, startsAt: utc(10, 2), endsAt: utc(10, 10) }
    ])

    expect(violations).toHaveLength(1)
    expect(violations[0]!.staffId).toBe(somchaiId)
    expect(violations[0]!.appointmentIds).toEqual([strandedId])

    const bothDrafted = await violationsOf([
      { id: anongShiftId, staffId: anongId, startsAt: utc(10, 2), endsAt: utc(10, 10) },
      { staffId: somchaiId, startsAt: utc(10, 2), endsAt: utc(10, 10) }
    ])
    expect(bothDrafted).toEqual([])
  })

  it("never reports another tenant's staff, even when that tenant is violating", async () => {
    const otherSignup = await request(server).post("/auth/signup").send({
      clinicName: "Other Roster Clinic",
      slug: otherSlug,
      email: "owner@rosterother.local",
      password: "s3cure-pass",
      name: "Other Owner"
    })
    expectStatus(otherSignup, 200)
    const otherTenant = await prisma.tenant.findUnique({ where: { slug: otherSlug } })
    const otherBranch = await prisma.branch.findFirst({ where: { tenantId: otherTenant!.id } })
    const otherService = await prisma.service.create({
      data: { tenantId: otherTenant!.id, name: "Other Probe", durationMin: 60, bufferMin: 0 }
    })
    const otherPatient = await prisma.patient.create({
      data: {
        tenantId: otherTenant!.id,
        name: "Other Patient",
        phone: "0899000001",
        email: "p@rosterother.local"
      }
    })
    const otherDentist = await prisma.user.create({
      data: {
        tenantId: otherTenant!.id,
        email: "dentist@rosterother.local",
        passwordHash: "x",
        name: "Dr. Other",
        role: "dentist"
      }
    })
    await prisma.shift.create({
      data: {
        tenantId: otherTenant!.id,
        staffId: otherDentist.id,
        branchId: otherBranch!.id,
        startsAt: new Date(utc(10, 2)),
        endsAt: new Date(utc(10, 8))
      }
    })
    await prisma.appointment.create({
      data: {
        tenantId: otherTenant!.id,
        branchId: otherBranch!.id,
        serviceId: otherService.id,
        patientId: otherPatient.id,
        dentistId: otherDentist.id,
        startsAt: new Date(utc(10, 8, 30)),
        endsAt: new Date(utc(10, 9, 30))
      }
    })

    const ownView = await request(server)
      .post("/roster/validate")
      .set("Authorization", `Bearer ${otherSignup.body.accessToken}`)
      .send({
        branchId: otherBranch!.id,
        from: utc(10, 0),
        to: utc(11, 0),
        draftShifts: []
      })
    expectStatus(ownView, 200)
    const ownViolations = ownView.body.violations as Violation[]
    expect(ownViolations.map((v) => v.staffId)).toEqual([otherDentist.id])

    const neighbourView = await violationsOf([])
    expect(neighbourView).toHaveLength(1)
    expect(neighbourView[0]!.staffId).toBe(somchaiId)
  })

  it("rejects an inverted window", async () => {
    const res = await request(server)
      .post("/roster/validate")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ branchId, from: utc(11, 0), to: utc(10, 0), draftShifts: [] })
    expect(res.status).toBe(400)
    expect(res.body.errorCode).toBe("INVALID_RANGE")
  })

  it("a dentist may neither validate the roster nor create a time block", async () => {
    const validated = await validate([], dentistToken)
    expect(validated.status).toBe(403)
    expect(validated.body.errorCode).toBe("FORBIDDEN")

    const blocked = await request(server)
      .post("/time-blocks")
      .set("Authorization", `Bearer ${dentistToken}`)
      .send({ staffId: anongId, reason: "leave", startsAt: utc(10, 2), endsAt: utc(10, 3) })
    expect(blocked.status).toBe(403)
  })

  describe("time blocks feed straight back into availability", () => {
    beforeAll(async () => {
      ployId = await makeDentist("ploy@rostertest.local", "Dr. Ploy")
      await makeShift(ployId, utc(11, 2), utc(11, 10))
    })

    it("a personal block removes exactly the overlapping starts and returns them when deleted", async () => {
      const before = await getSlots(11, ployId)
      expect(before).toHaveLength(29)
      expect(before).toContain(utc(11, 6))

      const created = await request(server)
        .post("/time-blocks")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ staffId: ployId, reason: "Lunch", startsAt: utc(11, 6), endsAt: utc(11, 7) })
      expectStatus(created, 201)

      const during = await getSlots(11, ployId)
      expect(during).toHaveLength(22)
      expect(during).toContain(utc(11, 5))
      expect(during).not.toContain(utc(11, 5, 15))
      expect(during).not.toContain(utc(11, 6))
      expect(during).not.toContain(utc(11, 6, 45))
      expect(during).toContain(utc(11, 7))

      const listed = await request(server)
        .get("/time-blocks")
        .set("Authorization", `Bearer ${ownerToken}`)
        .query({ staffId: ployId, from: utc(11, 0), to: utc(12, 0) })
      expectStatus(listed, 200)
      expect(listed.body.map((b: { id: string }) => b.id)).toEqual([created.body.id])

      await request(server)
        .delete(`/time-blocks/${created.body.id}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .expect(204)

      expect(await getSlots(11, ployId)).toEqual(before)
    })

    it("a branch-wide closure with no staffId closes the branch for that dentist too", async () => {
      const created = await request(server)
        .post("/time-blocks")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ branchId, reason: "Deep clean", startsAt: utc(11, 8), endsAt: utc(11, 9) })
      expectStatus(created, 201)
      expect(created.body.staffId).toBeNull()

      const after = await getSlots(11, ployId)
      expect(after).toContain(utc(11, 7))
      expect(after).not.toContain(utc(11, 7, 15))
      expect(after).not.toContain(utc(11, 8, 45))
      expect(after).toContain(utc(11, 9))
    })

    it("refuses a block with no staff and no branch, and an inverted one", async () => {
      const unscoped = await request(server)
        .post("/time-blocks")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ reason: "Nowhere", startsAt: utc(11, 2), endsAt: utc(11, 3) })
      expect(unscoped.status).toBe(400)
      expect(unscoped.body.errorCode).toBe("INVALID_SCOPE")

      const inverted = await request(server)
        .post("/time-blocks")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ staffId: ployId, reason: "Backwards", startsAt: utc(11, 3), endsAt: utc(11, 2) })
      expect(inverted.status).toBe(400)
      expect(inverted.body.errorCode).toBe("INVALID_RANGE")
    })
  })
})
