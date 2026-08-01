import { Controller, Get, INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import type Redis from "ioredis"
import type { Server } from "node:http"
import request from "supertest"
import { AppModule } from "../src/app.module"
import { Public } from "../src/auth/public.decorator"
import { PrismaService } from "../src/prisma/prisma.service"
import { REDIS } from "../src/redis/redis.module"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

interface ClinicResponse {
  id: string
  name: string
  slug: string
  branches: Array<{ id: string; name: string }>
  services: Array<{ id: string; name: string; durationMin: number; colorIndex: number }>
}

@Public()
@Controller("public/:clinicSlug")
class NestedProbeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("probe/deep")
  deep() {
    return this.prisma.scoped.branch.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" }
    })
  }
}

const THROTTLER_KEY_PATTERN = "*:default}:*"

describe("public clinic endpoint", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let redis: Redis
  let otherToken: string
  let otherTenantId: string
  const otherSlug = `pub-other-${Date.now()}`

  const clearThrottleState = async () => {
    const keys = await redis.keys(THROTTLER_KEY_PATTERN)
    if (keys.length > 0) await redis.del(...keys)
  }

  beforeAll(async () => {
    ;({ app, server } = await createTestApp(
      Test.createTestingModule({ imports: [AppModule], controllers: [NestedProbeController] })
    ))
    prisma = app.get(PrismaService)
    redis = app.get<Redis>(REDIS)
    await clearThrottleState()

    const other = await request(server).post("/auth/signup").send({
      clinicName: "Other Clinic",
      slug: otherSlug,
      email: "owner@other-public.local",
      password: "s3cure-pass",
      name: "Other Owner"
    })
    expectStatus(other, 200)
    otherToken = other.body.accessToken
    otherTenantId = other.body.user.tenantId

    await prisma.service.create({
      data: {
        tenantId: otherTenantId,
        name: "Retired Whitening",
        durationMin: 30,
        isActive: false
      }
    })
  })

  afterAll(async () => {
    await clearThrottleState()
    await prisma.tenant.deleteMany({ where: { slug: otherSlug } })
    await app.close()
  })

  it("returns the demo clinic with its branches and active services, anonymously", async () => {
    const res = await request(server).get("/public/demo-clinic")
    expectStatus(res, 200)
    const body = res.body as ClinicResponse
    expect(body.slug).toBe("demo-clinic")
    expect(body.name).toBeTruthy()
    expect(body.branches.map((b) => b.name).sort()).toEqual(["Ladprao", "Sukhumvit"])
    expect(body.services.length).toBeGreaterThan(0)
    for (const service of body.services) {
      expect(typeof service.durationMin).toBe("number")
      expect(typeof service.colorIndex).toBe("number")
    }
    expect(res.request.getHeader("authorization")).toBeUndefined()
  })

  it("omits inactive services", async () => {
    const res = await request(server).get(`/public/${otherSlug}`)
    expectStatus(res, 200)
    const body = res.body as ClinicResponse
    expect(body.services.map((s) => s.name)).not.toContain("Retired Whitening")
    expect(body.services.length).toBeGreaterThan(0)
  })

  it("404s CLINIC_NOT_FOUND for an unknown slug", async () => {
    const res = await request(server).get("/public/no-such-clinic-anywhere")
    expectStatus(res, 404)
    expect(res.body.errorCode).toBe("CLINIC_NOT_FOUND")
  })

  it("establishes tenant context on nested public routes, not just the parent", async () => {
    const res = await request(server).get("/public/demo-clinic/probe/deep")
    expectStatus(res, 200)
    expect((res.body as Array<{ name: string }>).map((b) => b.name)).toEqual([
      "Ladprao",
      "Sukhumvit"
    ])

    const other = await request(server).get(`/public/${otherSlug}/probe/deep`)
    expectStatus(other, 200)
    expect((other.body as Array<{ name: string }>).map((b) => b.name)).toEqual(["Main Branch"])
  })

  it("rejects an unknown slug on a nested public route before routing", async () => {
    const res = await request(server).get("/public/no-such-clinic-anywhere/probe/deep")
    expectStatus(res, 404)
    expect(res.body.errorCode).toBe("CLINIC_NOT_FOUND")
  })

  it("never returns another tenant's branches for a different slug", async () => {
    const res = await request(server).get(`/public/${otherSlug}`)
    expectStatus(res, 200)
    const body = res.body as ClinicResponse
    expect(body.slug).toBe(otherSlug)
    expect(body.branches.map((b) => b.name)).toEqual(["Main Branch"])
    expect(body.branches.map((b) => b.name)).not.toContain("Ladprao")
    expect(body.branches.map((b) => b.name)).not.toContain("Sukhumvit")
  })

  it("resolves an authenticated caller to their own tenant, never the slug's", async () => {
    const res = await request(server)
      .get("/public/demo-clinic")
      .set("Authorization", `Bearer ${otherToken}`)
    expectStatus(res, 200)
    const body = res.body as ClinicResponse
    expect(body.id).toBe(otherTenantId)
    expect(body.slug).toBe(otherSlug)
    expect(body.branches.map((b) => b.name)).toEqual(["Main Branch"])
  })

  it("does not throttle the authenticated api", async () => {
    await clearThrottleState()
    for (let i = 0; i < 70; i++) {
      const health = await request(server).get("/health")
      expect(health.status).toBe(200)
      const me = await request(server)
        .get("/auth/me")
        .set("Authorization", `Bearer ${otherToken}`)
      expect(me.status).toBe(200)
    }
  })

  it("throttles public routes at 60 requests per minute per ip", async () => {
    await clearThrottleState()
    const statuses: number[] = []
    for (let i = 0; i < 61; i++) {
      const res = await request(server).get("/public/demo-clinic")
      statuses.push(res.status)
      if (res.status === 429) expect(res.body.errorCode).toBe("RATE_LIMITED")
    }
    expect(statuses.slice(0, 60)).toEqual(Array<number>(60).fill(200))
    expect(statuses[60]).toBe(429)
  })
})
