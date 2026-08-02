import { INestApplication } from "@nestjs/common"
import request from "supertest"
import type { Server } from "node:http"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

describe("directory", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let ownerToken: string
  const slug = `dir-test-${Date.now()}`

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)
    const signup = await request(server).post("/auth/signup").send({
      clinicName: "Directory Test Clinic",
      slug,
      email: "owner@dirtest.local",
      password: "s3cure-pass",
      name: "Owner"
    })
    expectStatus(signup, 200)
    ownerToken = signup.body.accessToken
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } })
    await app.close()
  })

  it("lists the tenant's branches", async () => {
    const res = await request(server).get("/branches").set("Authorization", `Bearer ${ownerToken}`)
    expectStatus(res, 200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].name).toBe("Main Branch")
    expect(res.body[0].openingHours).toBeDefined()
  })

  it("lists staff without ever exposing credentials", async () => {
    const res = await request(server).get("/staff").set("Authorization", `Bearer ${ownerToken}`)
    expectStatus(res, 200)
    expect(res.body.length).toBeGreaterThanOrEqual(1)
    for (const member of res.body) {
      expect(member).toHaveProperty("id")
      expect(member).toHaveProperty("name")
      expect(member).toHaveProperty("role")
      expect(member).toHaveProperty("isActive")
      expect(member).not.toHaveProperty("passwordHash")
      expect(member).not.toHaveProperty("email")
    }
  })

  it("filters staff by role", async () => {
    const res = await request(server)
      .get("/staff")
      .query({ role: "dentist" })
      .set("Authorization", `Bearer ${ownerToken}`)
    expectStatus(res, 200)
    expect(res.body.every((m: { role: string }) => m.role === "dentist")).toBe(true)
  })

  it("rejects an unknown staff role", async () => {
    const res = await request(server)
      .get("/staff")
      .query({ role: "hygienist" })
      .set("Authorization", `Bearer ${ownerToken}`)
    expectStatus(res, 400)
  })

  it("lists services with their stored colorIndex", async () => {
    const res = await request(server).get("/services").set("Authorization", `Bearer ${ownerToken}`)
    expectStatus(res, 200)
    expect(res.body).toHaveLength(6)
    const indexes = res.body.map((s: { colorIndex: number }) => s.colorIndex).sort()
    expect(indexes).toEqual([0, 1, 2, 3, 4, 5])
  })

  it("lists the chairs a branch can seat an appointment in", async () => {
    const branches = await request(server)
      .get("/branches")
      .set("Authorization", `Bearer ${ownerToken}`)
    expectStatus(branches, 200)
    const branchId = branches.body[0].id

    const res = await request(server)
      .get("/resources")
      .query({ branchId })
      .set("Authorization", `Bearer ${ownerToken}`)
    expectStatus(res, 200)
    expect(res.body.map((r: { name: string }) => r.name)).toEqual(["Chair 1", "Chair 2", "Chair 3"])
    for (const resource of res.body) {
      expect(resource.type).toBe("chair")
      expect(resource.branchId).toBe(branchId)
    }
  })

  it("hides a deactivated resource", async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug } })
    const chair = await prisma.resource.findFirstOrThrow({
      where: { tenantId: tenant.id, name: "Chair 3" }
    })
    await prisma.resource.update({ where: { id: chair.id }, data: { isActive: false } })

    const res = await request(server).get("/resources").set("Authorization", `Bearer ${ownerToken}`)
    expectStatus(res, 200)
    expect(res.body.map((r: { name: string }) => r.name)).toEqual(["Chair 1", "Chair 2"])

    await prisma.resource.update({ where: { id: chair.id }, data: { isActive: true } })
  })

  it("rejects an unknown resource type", async () => {
    const res = await request(server)
      .get("/resources")
      .query({ type: "sofa" })
      .set("Authorization", `Bearer ${ownerToken}`)
    expectStatus(res, 400)
  })
})
