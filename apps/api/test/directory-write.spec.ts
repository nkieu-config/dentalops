import { INestApplication } from "@nestjs/common"
import type { Server } from "node:http"
import request from "supertest"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

const openingHours = {
  mon: [["09:00", "18:00"]],
  tue: [["09:00", "18:00"]],
  wed: [["09:00", "18:00"]],
  thu: [["09:00", "18:00"]],
  fri: [["09:00", "18:00"]],
  sat: [],
  sun: []
}

describe("directory writes", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let ownerAToken: string
  let ownerBToken: string
  let receptionistToken: string
  let mainBranchId: string
  let secondBranchId: string
  let serviceId: string
  let chairId: string
  let equipmentId: string
  let equipmentTypeId: string

  const stamp = Date.now()
  const slugA = `directory-write-a-${stamp}`
  const slugB = `directory-write-b-${stamp}`
  const password = "s3cure-pass"

  const signup = async (slug: string, name: string) => {
    const response = await request(server).post("/auth/signup").send({
      clinicName: name,
      slug,
      email: `owner@${slug}.local`,
      password,
      name: "Owner"
    })
    expectStatus(response, 200)
    return (response.body as { accessToken: string }).accessToken
  }

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)
    ownerAToken = await signup(slugA, "Directory Write A")
    ownerBToken = await signup(slugB, "Directory Write B")

    const branches = await request(server).get("/branches").set("Authorization", `Bearer ${ownerAToken}`)
    expectStatus(branches, 200)
    mainBranchId = (branches.body as Array<{ id: string }>)[0]!.id

    const staff = await request(server).post("/staff").set("Authorization", `Bearer ${ownerAToken}`).send({
      name: "Reception",
      email: `reception@${slugA}.local`,
      password,
      role: "receptionist"
    })
    expectStatus(staff, 201)

    const session = await request(server).post("/auth/login").send({
      clinicSlug: slugA,
      email: `reception@${slugA}.local`,
      password
    })
    expectStatus(session, 200)
    receptionistToken = (session.body as { accessToken: string }).accessToken

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: slugA } })
    const type = await prisma.equipmentType.create({
      data: { tenantId: tenant.id, name: "X-ray machine" }
    })
    equipmentTypeId = type.id
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { in: [slugA, slugB] } } })
    await app.close()
  })

  it("lets an owner create and update a branch with timezone and opening hours", async () => {
    const created = await request(server)
      .post("/branches")
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({ name: "Rama 9", timezone: "Asia/Bangkok", openingHours })
    expectStatus(created, 201)
    expect(created.body).toMatchObject({ name: "Rama 9", timezone: "Asia/Bangkok", isActive: true })
    secondBranchId = (created.body as { id: string }).id

    const updated = await request(server)
      .patch(`/branches/${secondBranchId}`)
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({ name: "Rama Nine", openingHours: { ...openingHours, sat: [["10:00", "15:00"]] } })
    expectStatus(updated, 200)
    expect(updated.body).toMatchObject({ name: "Rama Nine", openingHours: { sat: [["10:00", "15:00"]] } })
  })

  it("lets an owner manage services without deleting booking history", async () => {
    const created = await request(server)
      .post("/services")
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({ name: "Whitening", durationMin: 45, bufferMin: 15, colorIndex: 2 })
    expectStatus(created, 201)
    serviceId = (created.body as { id: string }).id

    const updated = await request(server)
      .patch(`/services/${serviceId}`)
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({ durationMin: 60 })
    expectStatus(updated, 200)
    expect(updated.body).toMatchObject({ name: "Whitening", durationMin: 60, isActive: true })

    const deactivated = await request(server)
      .delete(`/services/${serviceId}`)
      .set("Authorization", `Bearer ${ownerAToken}`)
    expectStatus(deactivated, 200)
    expect(deactivated.body).toMatchObject({ id: serviceId, isActive: false })
  })

  it("lists equipment types and lets an owner create, update, and deactivate resources", async () => {
    const types = await request(server).get("/equipment-types").set("Authorization", `Bearer ${ownerAToken}`)
    expectStatus(types, 200)
    expect(types.body).toContainEqual({ id: equipmentTypeId, name: "X-ray machine" })

    const chair = await request(server)
      .post("/resources")
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({ name: "Chair 4", branchId: secondBranchId, type: "chair" })
    expectStatus(chair, 201)
    chairId = (chair.body as { id: string }).id

    const equipment = await request(server)
      .post("/resources")
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({
        name: "X-ray 1",
        branchId: secondBranchId,
        type: "equipment",
        equipmentTypeId
      })
    expectStatus(equipment, 201)
    equipmentId = (equipment.body as { id: string }).id

    const updated = await request(server)
      .patch(`/resources/${chairId}`)
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({ name: "Chair Four" })
    expectStatus(updated, 200)
    expect(updated.body).toMatchObject({ id: chairId, name: "Chair Four", isActive: true })

    const deactivated = await request(server)
      .delete(`/resources/${equipmentId}`)
      .set("Authorization", `Bearer ${ownerAToken}`)
    expectStatus(deactivated, 200)
    expect(deactivated.body).toMatchObject({ id: equipmentId, isActive: false })

    const defaultList = await request(server)
      .get("/resources")
      .query({ branchId: secondBranchId })
      .set("Authorization", `Bearer ${ownerAToken}`)
    expectStatus(defaultList, 200)
    expect(defaultList.body.map((resource: { id: string }) => resource.id)).not.toContain(equipmentId)

    const withInactive = await request(server)
      .get("/resources")
      .query({ branchId: secondBranchId, includeInactive: "true" })
      .set("Authorization", `Bearer ${ownerAToken}`)
    expectStatus(withInactive, 200)
    expect(withInactive.body).toContainEqual(expect.objectContaining({ id: equipmentId, isActive: false }))
  })

  it("never lets a receptionist or another tenant modify directory records", async () => {
    const receptionist = await request(server)
      .patch(`/services/${serviceId}`)
      .set("Authorization", `Bearer ${receptionistToken}`)
      .send({ name: "Nope" })
    expectStatus(receptionist, 403)

    const outsider = await request(server)
      .patch(`/resources/${chairId}`)
      .set("Authorization", `Bearer ${ownerBToken}`)
      .send({ name: "Nope" })
    expectStatus(outsider, 404)
  })

  it("deactivates a branch but refuses to deactivate the last active branch", async () => {
    const deactivated = await request(server)
      .delete(`/branches/${mainBranchId}`)
      .set("Authorization", `Bearer ${ownerAToken}`)
    expectStatus(deactivated, 200)
    expect(deactivated.body).toMatchObject({ id: mainBranchId, isActive: false })

    const last = await request(server)
      .delete(`/branches/${secondBranchId}`)
      .set("Authorization", `Bearer ${ownerAToken}`)
    expectStatus(last, 409)
    expect(last.body).toMatchObject({ errorCode: "LAST_ACTIVE_BRANCH" })
  })
})
