import { INestApplication } from "@nestjs/common"
import type { Server } from "node:http"
import request from "supertest"
import { secretFor, TOKEN_PURPOSES } from "../src/auth/token-secrets"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

const utc = (hour: number) => new Date(Date.UTC(2027, 9, 12, hour)).toISOString()

describe("a token only works for the job it was issued for", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let ownerToken: string
  let manageToken: string
  let holdId: string
  let branchId: string
  let serviceId: string
  let dentistId: string
  let appointmentId: string
  const slug = `token-scope-${Date.now()}`

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)

    const signup = await request(server).post("/auth/signup").send({
      clinicName: "Token Scope Clinic",
      slug,
      email: `owner@${slug}.local`,
      password: "s3cure-pass",
      name: "Owner"
    })
    expectStatus(signup, 200)
    ownerToken = signup.body.accessToken as string
    const tenantId = signup.body.user.tenantId as string

    const branch = await prisma.branch.findFirstOrThrow({ where: { tenantId } })
    const service = await prisma.service.create({
      data: { tenantId, name: "Scope Probe", durationMin: 45, bufferMin: 0 }
    })
    const dentist = await prisma.user.create({
      data: {
        tenantId,
        email: `dentist@${slug}.local`,
        passwordHash: "x",
        name: "Dr. Scope",
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
    branchId = branch.id
    serviceId = service.id
    dentistId = dentist.id

    const hold = await request(server)
      .post(`/public/${slug}/holds`)
      .send({ serviceId, branchId, dentistId, startsAt: utc(3) })
    expectStatus(hold, 201)
    holdId = hold.body.holdId as string

    const confirm = await request(server).post(`/public/${slug}/appointments`).send({
      holdId,
      name: "Scope Patient",
      phone: "0877654321",
      email: "scope@example.com"
    })
    expectStatus(confirm, 201)
    manageToken = confirm.body.manageToken as string
    appointmentId = confirm.body.appointment.id as string
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } })
    await app.close()
  })

  it("gives every purpose a distinct key, so a token cannot be replayed as another kind", () => {
    const secrets = TOKEN_PURPOSES.map((purpose) => secretFor(purpose))
    expect(new Set(secrets).size).toBe(TOKEN_PURPOSES.length)
    expect(secrets).not.toContain(process.env.JWT_SECRET)
    expect(secrets).not.toContain(process.env.JWT_REFRESH_SECRET)
  })

  it("refuses a patient's manage link as a staff bearer token", async () => {
    const auth = `Bearer ${manageToken}`
    const window = "from=2027-10-12T00:00:00.000Z&to=2027-10-13T00:00:00.000Z"

    expectStatus(
      await request(server).get(`/appointments?branchId=${branchId}&${window}`).set("Authorization", auth),
      401
    )
    expectStatus(await request(server).get("/patients").set("Authorization", auth), 401)
    expectStatus(await request(server).get("/auth/me").set("Authorization", auth), 401)
  })

  it("refuses a manage link as a way to change an appointment's status", async () => {
    const res = await request(server)
      .patch(`/appointments/${appointmentId}/status`)
      .set("Authorization", `Bearer ${manageToken}`)
      .send({ status: "cancelled" })
    expectStatus(res, 401)

    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } })
    expect(row.status).toBe("confirmed")
  })

  it("refuses a hold token as a staff bearer token", async () => {
    const res = await request(server).get("/patients").set("Authorization", `Bearer ${holdId}`)
    expect(res.status).toBe(401)
  })

  it("refuses a staff access token as a manage link", async () => {
    expectStatus(await request(server).get(`/public/manage/${ownerToken}`), 401)
  })

  it("still lets the patient use their own manage link", async () => {
    const view = await request(server).get(`/public/manage/${manageToken}`)
    expectStatus(view, 200)
    expect(view.body.patient.name).toBe("Scope Patient")
  })

  it("still lets a real staff token do staff work", async () => {
    const res = await request(server)
      .get(`/appointments?branchId=${branchId}&from=2027-10-12T00:00:00.000Z&to=2027-10-13T00:00:00.000Z`)
      .set("Authorization", `Bearer ${ownerToken}`)
    expectStatus(res, 200)
    expect(res.body).toHaveLength(1)
  })

  it("limits how many times a password can be guessed", async () => {
    const attempt = () =>
      request(server)
        .post("/auth/login")
        .send({ clinicSlug: slug, email: `owner@${slug}.local`, password: "wrong-password" })

    const codes: number[] = []
    for (let i = 0; i < 14; i++) codes.push((await attempt()).status)

    expect(codes.filter((c) => c === 401).length).toBeGreaterThan(0)
    expect(codes).toContain(429)
  })
})
