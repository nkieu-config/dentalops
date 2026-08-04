import { INestApplication } from "@nestjs/common"
import type { Server } from "node:http"
import request from "supertest"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

interface DetailAppointment {
  id: string
  branchId: string
  startsAt: string
  endsAt: string
  status: string
  service: { id: string; name: string }
  dentist: { id: string; name: string }
}

interface PatientDetail {
  id: string
  name: string
  phone: string
  email: string
  appointments: DetailAppointment[]
}

describe("patient detail", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService

  const slug = `pdetail-${Date.now()}`
  const otherSlug = `pdetail-other-${Date.now()}`
  const TOTAL = 60

  let ownerToken: string
  let dentistAToken: string
  let dentistAId: string
  let dentistBId: string
  let patientId: string
  let otherPatientId: string
  let branchId: string

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)

    const signup = await request(server).post("/auth/signup").send({
      clinicName: "Detail Clinic",
      slug,
      email: `owner@${slug}.local`,
      password: "s3cure-pass",
      name: "Owner"
    })
    expectStatus(signup, 200)
    ownerToken = (signup.body as { accessToken: string }).accessToken

    const otherSignup = await request(server).post("/auth/signup").send({
      clinicName: "Other Detail Clinic",
      slug: otherSlug,
      email: `owner@${otherSlug}.local`,
      password: "s3cure-pass",
      name: "Other Owner"
    })
    expectStatus(otherSignup, 200)

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug } })
    const otherTenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: otherSlug } })
    const passwordHash = (
      await prisma.user.findFirstOrThrow({
        where: { tenantId: tenant.id },
        omit: { passwordHash: false }
      })
    ).passwordHash

    const dentistA = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `a@${slug}.local`,
        passwordHash,
        name: "Dentist Anong",
        role: "dentist"
      }
    })
    const dentistB = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `b@${slug}.local`,
        passwordHash,
        name: "Dentist Boonmee",
        role: "dentist"
      }
    })
    dentistAId = dentistA.id
    dentistBId = dentistB.id

    const branch = await prisma.branch.findFirstOrThrow({ where: { tenantId: tenant.id } })
    const service = await prisma.service.findFirstOrThrow({ where: { tenantId: tenant.id } })
    branchId = branch.id

    const patient = await prisma.patient.create({
      data: {
        tenantId: tenant.id,
        name: "Ratana Detail",
        phone: `07${String(Date.now()).slice(-8)}`,
        email: `ratana@${slug}.local`
      }
    })
    patientId = patient.id

    const otherPatient = await prisma.patient.create({
      data: {
        tenantId: otherTenant.id,
        name: "Somsak Elsewhere",
        phone: `06${String(Date.now()).slice(-8)}`,
        email: `somsak@${otherSlug}.local`
      }
    })
    otherPatientId = otherPatient.id

    const base = Date.parse("2027-04-01T02:00:00.000Z")
    await prisma.appointment.createMany({
      data: Array.from({ length: TOTAL }, (_, i) => ({
        tenantId: tenant.id,
        branchId: branch.id,
        serviceId: service.id,
        dentistId: i % 2 === 0 ? dentistA.id : dentistB.id,
        patientId: patient.id,
        startsAt: new Date(base + i * 3_600_000),
        endsAt: new Date(base + i * 3_600_000 + 1_800_000)
      }))
    })
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { in: [slug, otherSlug] } } })
    await app.close()
  })

  const detailAs = (token: string, id: string) =>
    request(server).get(`/patients/${id}`).set("Authorization", `Bearer ${token}`)

  it("returns the patient with their appointments, newest first, capped at 50", async () => {
    const res = await detailAs(ownerToken, patientId)
    expectStatus(res, 200)
    const body = res.body as PatientDetail

    expect(body.id).toBe(patientId)
    expect(body.name).toBe("Ratana Detail")
    expect(body.appointments).toHaveLength(50)

    const starts = body.appointments.map((a) => Date.parse(a.startsAt))
    expect(starts).toEqual([...starts].sort((a, b) => b - a))
    expect(starts[0]).toBe(Date.parse("2027-04-01T02:00:00.000Z") + (TOTAL - 1) * 3_600_000)
  })

  it("names the service and the dentist on every appointment", async () => {
    const res = await detailAs(ownerToken, patientId)
    expectStatus(res, 200)
    const body = res.body as PatientDetail

    for (const appointment of body.appointments) {
      expect(appointment.service.name).toEqual(expect.any(String))
      expect(appointment.service.name.length).toBeGreaterThan(0)
      expect(appointment.dentist.name).toMatch(/^Dentist (Anong|Boonmee)$/)
      expect(appointment.branchId).toBe(branchId)
      expect(appointment.status).toBe("confirmed")
    }
    const names = new Set(body.appointments.map((a) => a.dentist.name))
    expect(names).toEqual(new Set(["Dentist Anong", "Dentist Boonmee"]))
  })

  it("never leaks a password hash through the dentist relation", async () => {
    const res = await detailAs(ownerToken, patientId)
    expectStatus(res, 200)
    expect(JSON.stringify(res.body)).not.toContain("passwordHash")
  })

  it("shows a dentist only their own appointments with that patient", async () => {
    const login = await request(server)
      .post("/auth/login")
      .send({ clinicSlug: slug, email: `a@${slug}.local`, password: "s3cure-pass" })
    expectStatus(login, 200)
    dentistAToken = (login.body as { accessToken: string }).accessToken

    const res = await detailAs(dentistAToken, patientId)
    expectStatus(res, 200)
    const body = res.body as PatientDetail

    expect(body.appointments).toHaveLength(TOTAL / 2)
    expect(body.appointments.every((a) => a.dentist.id === dentistAId)).toBe(true)
    expect(body.appointments.some((a) => a.dentist.id === dentistBId)).toBe(false)
  })

  it("answers 404, not 403, for a patient in another tenant", async () => {
    const res = await detailAs(ownerToken, otherPatientId)
    expectStatus(res, 404)
    expect((res.body as { errorCode: string }).errorCode).toBe("NOT_FOUND")
  })

  it("leaves the list shape alone", async () => {
    const res = await request(server)
      .get("/patients")
      .set("Authorization", `Bearer ${ownerToken}`)
      .query({ limit: 5 })
    expectStatus(res, 200)
    const body = res.body as { items: Record<string, unknown>[]; nextCursor: string | null }

    expect(body.items.length).toBeGreaterThan(0)
    for (const item of body.items) {
      expect(item).not.toHaveProperty("appointments")
    }
  })
})
