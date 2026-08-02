import { INestApplication } from "@nestjs/common"
import request from "supertest"
import type { Server } from "node:http"
import { apiErrorSchema } from "@dentalops/contracts"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

describe("shifts endpoints", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let ownerToken: string
  let dentistToken: string
  let staffId: string
  let branchId: string
  const slug = `shifts-test-${Date.now()}`

  const at = (day: number, h: number) => new Date(Date.UTC(2026, 8, day, h, 0, 0)).toISOString()

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)

    const signup = await request(server).post("/auth/signup").send({
      clinicName: "Shifts Test Clinic",
      slug,
      email: "owner@shiftstest.local",
      password: "s3cure-pass",
      name: "Owner"
    })
    expectStatus(signup, 200)
    ownerToken = signup.body.accessToken

    const tenant = await prisma.tenant.findUnique({ where: { slug } })
    const branch = await prisma.branch.findFirst({ where: { tenantId: tenant!.id } })
    branchId = branch!.id

    const dentist = await prisma.user.create({
      data: {
        tenantId: tenant!.id,
        email: "dentist@shiftstest.local",
        passwordHash: "x",
        name: "Dr. Test",
        role: "dentist"
      }
    })
    staffId = dentist.id

    const argon2 = await import("argon2")
    await prisma.user.update({
      where: { id: dentist.id },
      data: { passwordHash: await argon2.hash("s3cure-pass") }
    })
    const dentistLogin = await request(server).post("/auth/login").send({
      clinicSlug: slug,
      email: "dentist@shiftstest.local",
      password: "s3cure-pass"
    })
    expectStatus(dentistLogin, 200)
    dentistToken = dentistLogin.body.accessToken
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } })
    await app.close()
  })

  it("owner creates a shift", async () => {
    await request(server)
      .post("/shifts")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ staffId, branchId, startsAt: at(7, 2), endsAt: at(7, 10) })
      .expect(201)
  })

  it("overlapping shift for the same staff returns SLOT_CONFLICT with the constraint name", async () => {
    const res = await request(server)
      .post("/shifts")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ staffId, branchId, startsAt: at(7, 9), endsAt: at(7, 12) })
      .expect(409)
    const parsed = apiErrorSchema.parse(res.body)
    expect(parsed.errorCode).toBe("SLOT_CONFLICT")
    expect(parsed.details).toEqual({ constraint: "no_staff_double_shift" })
  })

  it("back-to-back shift at the boundary is allowed", async () => {
    await request(server)
      .post("/shifts")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ staffId, branchId, startsAt: at(7, 10), endsAt: at(7, 13) })
      .expect(201)
  })

  it("dentist role cannot create shifts", async () => {
    const res = await request(server)
      .post("/shifts")
      .set("Authorization", `Bearer ${dentistToken}`)
      .send({ staffId, branchId, startsAt: at(8, 2), endsAt: at(8, 10) })
      .expect(403)
    expect(apiErrorSchema.parse(res.body).errorCode).toBe("FORBIDDEN")
  })

  it("lists shifts within a window", async () => {
    const res = await request(server)
      .get("/shifts")
      .set("Authorization", `Bearer ${ownerToken}`)
      .query({ from: at(7, 0), to: at(8, 0), staffId })
      .expect(200)
    expect(res.body.length).toBe(2)
  })

  it("unauthenticated requests are rejected", async () => {
    await request(server).get("/shifts").expect(401)
  })

  it("edits a shift in place instead of losing it to a delete-then-create", async () => {
    const created = await request(server)
      .post("/shifts")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ staffId, branchId, startsAt: at(9, 2), endsAt: at(9, 10) })
    expectStatus(created, 201)

    const patched = await request(server)
      .patch(`/shifts/${created.body.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ endsAt: at(9, 8) })
    expectStatus(patched, 200)
    expect(patched.body.id).toBe(created.body.id)
    expect(patched.body.startsAt).toBe(at(9, 2))
    expect(patched.body.endsAt).toBe(at(9, 8))
  })

  it("rejects an edit that inverts the shift and leaves the row untouched", async () => {
    const created = await request(server)
      .post("/shifts")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ staffId, branchId, startsAt: at(10, 2), endsAt: at(10, 10) })
    expectStatus(created, 201)

    const res = await request(server)
      .patch(`/shifts/${created.body.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ endsAt: at(10, 1) })
    expect(res.status).toBe(400)

    const after = await prisma.shift.findUnique({ where: { id: created.body.id } })
    expect(after!.endsAt.toISOString()).toBe(at(10, 10))
  })

  it("deleting a shift frees the slot", async () => {
    const list = await request(server)
      .get("/shifts")
      .set("Authorization", `Bearer ${ownerToken}`)
      .query({ staffId })
    const first = list.body[0]
    await request(server)
      .delete(`/shifts/${first.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(204)
    await request(server)
      .post("/shifts")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ staffId, branchId, startsAt: first.startsAt, endsAt: first.endsAt })
      .expect(201)
  })
})
