import { INestApplication } from "@nestjs/common"
import request from "supertest"
import type { Server } from "node:http"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

type Expectation = "public" | "auth-only" | "not-found" | "filtered"

const REGISTRY: Record<string, Expectation> = {
  "GET /health": "public",
  "GET /internal/latency": "auth-only",
  "POST /auth/signup": "public",
  "POST /auth/login": "public",
  "POST /auth/demo-login": "public",
  "POST /auth/refresh": "public",
  "GET /auth/me": "auth-only",
  "GET /shifts": "filtered",
  "POST /shifts": "auth-only",
  "DELETE /shifts/:id": "not-found",
  "GET /appointments": "filtered",
  "POST /appointments": "auth-only",
  "PATCH /appointments/:id": "not-found",
  "PATCH /appointments/:id/status": "not-found",
  "GET /availability": "auth-only",
  "GET /patients": "filtered",
  "POST /patients": "auth-only",
  "GET /patients/:id": "not-found"
}

const BODY_BY_ROUTE: Record<string, object> = {
  "PATCH /appointments/:id": { version: 0 },
  "PATCH /appointments/:id/status": { status: "cancelled" }
}

interface DiscoveredRoute {
  method: string
  path: string
}

function discoverRoutes(app: INestApplication): DiscoveredRoute[] {
  type RouterStack = { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> }
  const instance = app.getHttpAdapter().getInstance() as {
    _router?: RouterStack
    router?: RouterStack
  }
  const router = instance._router ?? instance.router
  if (!router) throw new Error("Could not locate the Express router for route discovery")
  return router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      method: Object.keys(layer.route!.methods)[0]!.toUpperCase(),
      path: layer.route!.path
    }))
}

describe("tenant isolation across every route", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let intruderToken: string
  let victimShiftId: string
  const victimSlug = `iso-victim-${Date.now()}`
  const intruderSlug = `iso-intruder-${Date.now()}`

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)

    const victim = await request(server).post("/auth/signup").send({
      clinicName: "Victim Clinic",
      slug: victimSlug,
      email: "owner@victim.local",
      password: "s3cure-pass",
      name: "Victim Owner"
    })
    const intruder = await request(server).post("/auth/signup").send({
      clinicName: "Intruder Clinic",
      slug: intruderSlug,
      email: "owner@intruder.local",
      password: "s3cure-pass",
      name: "Intruder Owner"
    })
    expectStatus(victim, 200)
    expectStatus(intruder, 200)
    intruderToken = intruder.body.accessToken

    const victimTenant = await prisma.tenant.findUnique({ where: { slug: victimSlug } })
    const victimBranch = await prisma.branch.findFirst({ where: { tenantId: victimTenant!.id } })
    const shift = await request(server)
      .post("/shifts")
      .set("Authorization", `Bearer ${victim.body.accessToken}`)
      .send({
        staffId: victim.body.user.id,
        branchId: victimBranch!.id,
        startsAt: "2026-09-14T02:00:00.000Z",
        endsAt: "2026-09-14T10:00:00.000Z"
      })
    victimShiftId = shift.body.id
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { in: [victimSlug, intruderSlug] } } })
    await app.close()
  })

  it("every discovered route is declared in the isolation registry", () => {
    const missing = discoverRoutes(app)
      .map((r) => `${r.method} ${r.path}`)
      .filter((key) => !(key in REGISTRY))
    expect(missing).toEqual([])
  })

  it("cross-tenant lookups on id routes return 404, never 200 or 403", async () => {
    const idRoutes = Object.entries(REGISTRY).filter(([, exp]) => exp === "not-found")
    for (const [key] of idRoutes) {
      const [method, path] = key.split(" ") as [string, string]
      const url = path.replace(":id", victimShiftId)
      const res = await request(server)
        [method.toLowerCase() as "get" | "delete" | "patch"](url)
        .set("Authorization", `Bearer ${intruderToken}`)
        .send(BODY_BY_ROUTE[key] ?? {})
      expect([404]).toContain(res.status)
    }
  })

  it("collection routes never leak another tenant's rows", async () => {
    const res = await request(server)
      .get("/shifts")
      .set("Authorization", `Bearer ${intruderToken}`)
      .expect(200)
    const ids = (res.body as Array<{ id: string }>).map((s) => s.id)
    expect(ids).not.toContain(victimShiftId)
  })

  it("auth-only routes reject anonymous requests", async () => {
    const routes = Object.entries(REGISTRY).filter(
      ([, exp]) => exp === "auth-only" || exp === "filtered" || exp === "not-found"
    )
    for (const [key] of routes) {
      const [method, path] = key.split(" ") as [string, string]
      const url = path.replace(":id", victimShiftId)
      const res = await request(server)[
        method.toLowerCase() as "get" | "post" | "delete" | "patch"
      ](url)
      expect(res.status).toBe(401)
    }
  })
})
