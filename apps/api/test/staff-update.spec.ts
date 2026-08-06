import { INestApplication } from "@nestjs/common"
import type { Server } from "node:http"
import request from "supertest"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

describe("PATCH /staff/:id", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let ownerAToken: string
  let ownerBToken: string
  let receptionistToken: string
  let ownerAId: string
  let dentistId: string
  let outsiderId: string

  const stamp = Date.now()
  const slugA = `staff-update-a-${stamp}`
  const slugB = `staff-update-b-${stamp}`
  const password = "s3cure-pass"

  const signup = async (slug: string) => {
    const response = await request(server).post("/auth/signup").send({
      clinicName: "Staff Update Clinic",
      slug,
      email: `owner@${slug}.local`,
      password,
      name: "Owner"
    })
    expectStatus(response, 200)
    return response.body as { accessToken: string; user: { id: string } }
  }

  const createStaff = (token: string, body: Record<string, unknown>) =>
    request(server).post("/staff").set("Authorization", `Bearer ${token}`).send(body)

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)
    const ownerA = await signup(slugA)
    const ownerB = await signup(slugB)
    ownerAToken = ownerA.accessToken
    ownerBToken = ownerB.accessToken
    ownerAId = ownerA.user.id

    const dentist = await createStaff(ownerAToken, {
      name: "Dr Ready",
      email: `dentist@${slugA}.local`,
      password,
      role: "dentist"
    })
    expectStatus(dentist, 201)
    dentistId = (dentist.body as { id: string }).id

    const receptionist = await createStaff(ownerAToken, {
      name: "Reception",
      email: `reception@${slugA}.local`,
      password,
      role: "receptionist"
    })
    expectStatus(receptionist, 201)

    const receptionistLogin = await request(server).post("/auth/login").send({
      clinicSlug: slugA,
      email: `reception@${slugA}.local`,
      password
    })
    expectStatus(receptionistLogin, 200)
    receptionistToken = (receptionistLogin.body as { accessToken: string }).accessToken

    const outsider = await createStaff(ownerBToken, {
      name: "Dr Outside",
      email: `dentist@${slugB}.local`,
      password,
      role: "dentist"
    })
    expectStatus(outsider, 201)
    outsiderId = (outsider.body as { id: string }).id
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { in: [slugA, slugB] } } })
    await app.close()
  })

  it("lets an owner change a colleague's name and role", async () => {
    const response = await request(server)
      .patch(`/staff/${dentistId}`)
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({ name: "Dr Prepared", role: "receptionist" })
    expectStatus(response, 200)
    expect(response.body).toMatchObject({ id: dentistId, name: "Dr Prepared", role: "receptionist", isActive: true })
  })

  it("lets an owner deactivate a colleague", async () => {
    const response = await request(server)
      .patch(`/staff/${dentistId}`)
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({ isActive: false })
    expectStatus(response, 200)
    expect(response.body).toMatchObject({ id: dentistId, isActive: false })
  })

  it("does not let an owner demote or deactivate themselves", async () => {
    const role = await request(server)
      .patch(`/staff/${ownerAId}`)
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({ role: "dentist" })
    expectStatus(role, 409)
    expect(role.body).toMatchObject({ errorCode: "SELF_MANAGEMENT_FORBIDDEN" })

    const active = await request(server)
      .patch(`/staff/${ownerAId}`)
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({ isActive: false })
    expectStatus(active, 409)
    expect(active.body).toMatchObject({ errorCode: "SELF_MANAGEMENT_FORBIDDEN" })
  })

  it("rejects a receptionist and hides a different tenant's staff member", async () => {
    const receptionist = await request(server)
      .patch(`/staff/${dentistId}`)
      .set("Authorization", `Bearer ${receptionistToken}`)
      .send({ name: "Nope" })
    expectStatus(receptionist, 403)

    const outsider = await request(server)
      .patch(`/staff/${outsiderId}`)
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({ name: "Nope" })
    expectStatus(outsider, 404)
  })
})
