import { INestApplication } from "@nestjs/common"
import request from "supertest"
import type { Server } from "node:http"
import { randomUUID } from "node:crypto"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

interface RouteLatency {
  route: string
  count: number
  p50: number
  p95: number
  p99: number
  max: number
}

describe("latency recording", () => {
  let app: INestApplication
  let server: Server
  let ownerToken: string
  let dentistToken: string

  const summary = async (): Promise<RouteLatency[]> => {
    const res = await request(server)
      .get("/internal/latency")
      .set("Authorization", `Bearer ${ownerToken}`)
    expectStatus(res, 200)
    return res.body.routes as RouteLatency[]
  }

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    const owner = await request(server).post("/auth/demo-login").send({ role: "owner" })
    expectStatus(owner, 200)
    ownerToken = owner.body.accessToken
    const dentist = await request(server).post("/auth/demo-login").send({ role: "dentist" })
    expectStatus(dentist, 200)
    dentistToken = dentist.body.accessToken
  })

  afterAll(async () => {
    await app.close()
  })

  it("records per-route percentiles observable by the owner", async () => {
    for (let i = 0; i < 5; i++) {
      await request(server).get("/health").expect(200)
    }
    const health = (await summary()).find((r) => r.route === "GET /health")
    expect(health).toBeDefined()
    expect(health!.count).toBeGreaterThanOrEqual(5)
    expect(health!.p50).toBeGreaterThanOrEqual(0)
    expect(health!.p95).toBeGreaterThanOrEqual(health!.p50)
    expect(health!.p99).toBeGreaterThanOrEqual(health!.p95)
    expect(health!.max).toBeGreaterThanOrEqual(health!.p99)
  })

  it("labels parameterised routes by pattern so ids never become keys", async () => {
    const ids = [randomUUID(), randomUUID(), randomUUID()]
    for (const id of ids) {
      await request(server)
        .get(`/patients/${id}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .expect(404)
    }
    const routes = await summary()
    const patients = routes.find((r) => r.route === "GET /patients/:id")
    expect(patients).toBeDefined()
    expect(patients!.count).toBeGreaterThanOrEqual(3)
    expect(routes.map((r) => r.route).filter((route) => ids.some((id) => route.includes(id)))).toEqual([])
  })

  it("is owner-only", async () => {
    await request(server)
      .get("/internal/latency")
      .set("Authorization", `Bearer ${dentistToken}`)
      .expect(403)
    await request(server).get("/internal/latency").expect(401)
  })
})
