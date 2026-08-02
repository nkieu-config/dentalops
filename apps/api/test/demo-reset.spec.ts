import { INestApplication } from "@nestjs/common"
import type { Server } from "node:http"
import request from "supertest"
import { DemoResetService } from "../src/demo/demo-reset.service"
import { DEMO_CRON, DEMO_JOB, DEMO_SCHEDULER_ID, DemoQueue } from "../src/demo/demo.queue"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

describe("demo reset", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let demo: DemoResetService
  let queue: DemoQueue
  const otherSlug = `not-demo-${Date.now()}`

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)
    demo = app.get(DemoResetService)
    queue = app.get(DemoQueue)
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: otherSlug } })
    await app.close()
  })

  it("refuses to reset any tenant that is not the demo clinic", async () => {
    const signup = await request(server).post("/auth/signup").send({
      clinicName: "Real Customer Clinic",
      slug: otherSlug,
      email: "owner@notdemo.local",
      password: "s3cure-pass",
      name: "Owner"
    })
    expectStatus(signup, 200)

    const tenant = await prisma.tenant.findUnique({ where: { slug: otherSlug } })
    expect(tenant).not.toBeNull()
    const before = await prisma.branch.count({ where: { tenantId: tenant!.id } })

    await expect(demo.reset(otherSlug)).rejects.toMatchObject({ status: 403 })

    const stillThere = await prisma.tenant.findUnique({ where: { slug: otherSlug } })
    expect(stillThere).not.toBeNull()
    expect(await prisma.branch.count({ where: { tenantId: tenant!.id } })).toBe(before)
  })

  it("rebuilds the demo tenant to its seeded shape", async () => {
    const counts = await demo.reset()
    expect(counts.patients).toBe(120)
    expect(counts.shifts).toBeGreaterThan(300)
    expect(counts.appointments).toBeGreaterThan(1000)

    const tenant = await prisma.tenant.findUnique({ where: { slug: "demo-clinic" } })
    expect(tenant).not.toBeNull()
    expect(await prisma.patient.count({ where: { tenantId: tenant!.id } })).toBe(counts.patients)
  })

  it("leaves other tenants untouched when the demo tenant is rebuilt", async () => {
    const tenant = await prisma.tenant.findUnique({ where: { slug: otherSlug } })
    expect(tenant).not.toBeNull()
    const before = await prisma.user.count({ where: { tenantId: tenant!.id } })

    await demo.reset()

    expect(await prisma.tenant.findUnique({ where: { slug: otherSlug } })).not.toBeNull()
    expect(await prisma.user.count({ where: { tenantId: tenant!.id } })).toBe(before)
  })

  it("is scheduled every six hours in UTC", async () => {
    const schedulers = await queue.queue.getJobSchedulers()
    const scheduled = schedulers.find((s) => s.key === DEMO_SCHEDULER_ID)
    expect(scheduled).toBeDefined()
    expect(scheduled!.pattern).toBe(DEMO_CRON)
    expect(scheduled!.tz).toBe("UTC")
    expect(scheduled!.name).toBe(DEMO_JOB)
  })
})
