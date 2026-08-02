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
    expect(counts.appointmentSeries).toBeGreaterThan(0)
    expect(counts.shiftSeries).toBeGreaterThan(0)

    const tenant = await prisma.tenant.findUnique({ where: { slug: "demo-clinic" } })
    expect(tenant).not.toBeNull()
    expect(await prisma.patient.count({ where: { tenantId: tenant!.id } })).toBe(counts.patients)
  })

  it("seeds an ortho series a visitor can actually see on the timeline", async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo-clinic" } })
    const series = await prisma.appointmentSeries.findFirstOrThrow({
      where: { tenantId: tenant.id },
      include: { appointments: { orderBy: { startsAt: "asc" } } }
    })
    expect(series.freq).toBe("weekly")
    expect(series.appointments.length).toBeGreaterThanOrEqual(6)
    expect(series.count).toBe(series.appointments.length)

    const upcoming = series.appointments.filter((a) => a.startsAt > new Date())
    expect(upcoming.length).toBeGreaterThan(0)

    const spacing = series.appointments
      .slice(1)
      .map((a, i) => a.startsAt.getTime() - series.appointments[i]!.startsAt.getTime())
    expect(new Set(spacing)).toEqual(new Set([7 * 24 * 60 * 60 * 1000]))
  })

  it("attaches materialized shifts to a recurring series", async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo-clinic" } })
    const series = await prisma.shiftSeries.findFirstOrThrow({ where: { tenantId: tenant.id } })
    const attached = await prisma.shift.count({ where: { seriesId: series.id } })
    expect(attached).toBeGreaterThan(10)
  })

  it("keeps every shift at the branch its series claims", async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo-clinic" } })
    const allSeries = await prisma.shiftSeries.findMany({ where: { tenantId: tenant.id } })
    expect(allSeries.length).toBeGreaterThan(0)

    for (const series of allSeries) {
      const elsewhere = await prisma.shift.count({
        where: { seriesId: series.id, branchId: { not: series.branchId } }
      })
      expect(elsewhere).toBe(0)
    }
  })

  it("never puts two dentists on the same chair at the same branch", async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo-clinic" } })
    const overlaps = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count
      FROM resource_claims a
      JOIN resource_claims b
        ON a.resource_id = b.resource_id
       AND a.appointment_id < b.appointment_id
       AND a.starts_at < b.ends_at
       AND b.starts_at < a.ends_at
      WHERE a.tenant_id = ${tenant.id}::uuid
        AND a.status = 'active'
        AND b.status = 'active'
    `
    expect(Number(overlaps[0]?.count ?? 0)).toBe(0)
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
