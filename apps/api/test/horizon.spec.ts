import { INestApplication } from "@nestjs/common"
import request from "supertest"
import type { Server } from "node:http"
import { PrismaService } from "../src/prisma/prisma.service"
import { HorizonProcessor } from "../src/roster/horizon.processor"
import { HORIZON_CRON, HORIZON_JOB, HORIZON_SCHEDULER_ID, HorizonQueue } from "../src/roster/horizon.queue"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000
const BANGKOK = 420 * MINUTE

const localDayStart = (ms: number) => Math.floor((ms + BANGKOK) / DAY) * DAY - BANGKOK
const localDate = (ms: number) => new Date(ms + BANGKOK).toISOString().slice(0, 10)

const waitFor = async (predicate: () => Promise<boolean>, timeoutMs = 15_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`condition not met within ${timeoutMs}ms`)
}

describe("nightly horizon job", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let processor: HorizonProcessor
  let horizon: HorizonQueue
  let ownerToken: string
  let tenantId: string
  let branchId: string
  const staff: string[] = []
  const slug = `horizon-${Date.now()}`
  const today = localDayStart(Date.now())
  const cutoff = new Date(today + 30 * DAY)

  const createSeries = async (staffId: string, byWeekday: number[]) => {
    const res = await request(server)
      .post("/shifts/series")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        staffId,
        branchId,
        freq: "weekly",
        interval: 1,
        byWeekday,
        timeStart: "09:00",
        durationMin: 480,
        startsOn: localDate(today)
      })
    expectStatus(res, 201)
    return (res.body as { seriesId: string }).seriesId
  }

  const shiftsOf = (seriesId: string) =>
    prisma.shift.findMany({ where: { seriesId }, orderBy: { startsAt: "asc" } })

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)
    processor = app.get(HorizonProcessor)
    horizon = app.get(HorizonQueue)

    const signup = await request(server).post("/auth/signup").send({
      clinicName: "Horizon Clinic",
      slug,
      email: `owner@${slug}.local`,
      password: "s3cure-pass",
      name: "Owner"
    })
    expectStatus(signup, 200)
    ownerToken = signup.body.accessToken

    const tenant = await prisma.tenant.findUnique({ where: { slug } })
    tenantId = tenant!.id
    const branch = await prisma.branch.findFirst({ where: { tenantId } })
    branchId = branch!.id

    for (const n of [1, 2, 3, 4]) {
      const dentist = await prisma.user.create({
        data: {
          tenantId,
          email: `dentist${n}@${slug}.local`,
          passwordHash: "x",
          name: `Dr. Horizon ${n}`,
          role: "dentist"
        }
      })
      staff.push(dentist.id)
    }

    await processor.run()
  })

  afterAll(async () => {
    await horizon.queue.obliterate({ force: true })
    await prisma.tenant.deleteMany({ where: { slug } })
    await app.close()
  })

  it("schedules itself nightly at 18:00 UTC", async () => {
    const schedulers = await horizon.queue.getJobSchedulers()
    const nightly = schedulers.find((s) => s.key === HORIZON_SCHEDULER_ID)
    expect(nightly).toBeDefined()
    expect(nightly?.pattern).toBe(HORIZON_CRON)
    expect(nightly?.pattern).toBe("0 18 * * *")
    expect(nightly?.tz).toBe("UTC")
    expect(nightly?.name).toBe(HORIZON_JOB)
  })

  it("tops a series back up to ninety days and creates nothing on a second run", async () => {
    const seriesId = await createSeries(staff[0]!, [1, 3, 5])
    const full = await prisma.shift.count({ where: { seriesId } })
    expect(full).toBeGreaterThan(30)

    const removed = await prisma.shift.deleteMany({ where: { seriesId, startsAt: { gte: cutoff } } })
    expect(removed.count).toBeGreaterThan(0)

    const first = await processor.run()
    expect(first.created).toBe(removed.count)
    expect(await prisma.shift.count({ where: { seriesId } })).toBe(full)

    const second = await processor.run()
    expect(second.created).toBe(0)
    expect(await prisma.shift.count({ where: { seriesId } })).toBe(full)
  })

  it("never resurrects a deleted occurrence", async () => {
    const seriesId = await createSeries(staff[1]!, [2])
    const before = await shiftsOf(seriesId)
    const gone = before[2]!
    await prisma.shift.delete({ where: { id: gone.id } })

    const result = await processor.run()
    expect(result.created).toBe(0)

    const after = await shiftsOf(seriesId)
    expect(after).toHaveLength(before.length - 1)
    expect(after.map((s) => s.id)).not.toContain(gone.id)
    expect(after.map((s) => s.startsAt.getTime())).not.toContain(gone.startsAt.getTime())
  })

  it("runs the horizon through the BullMQ worker when a job is enqueued", async () => {
    const seriesId = await createSeries(staff[2]!, [4])
    const full = await prisma.shift.count({ where: { seriesId } })
    const removed = await prisma.shift.deleteMany({ where: { seriesId, startsAt: { gte: cutoff } } })
    expect(removed.count).toBeGreaterThan(0)

    await horizon.queue.add(HORIZON_JOB, {})
    await waitFor(async () => (await prisma.shift.count({ where: { seriesId } })) === full)
  })

  it("counts a conflicting occurrence as skipped and keeps going", async () => {
    const seriesId = await createSeries(staff[3]!, [1, 3, 5])
    const before = await shiftsOf(seriesId)
    const removed = await prisma.shift.deleteMany({ where: { seriesId, startsAt: { gte: cutoff } } })
    expect(removed.count).toBeGreaterThan(1)

    const victim = before.find((s) => s.startsAt >= cutoff)!
    await prisma.shift.create({
      data: {
        tenantId,
        staffId: staff[3]!,
        branchId,
        startsAt: new Date(victim.startsAt.getTime() + 2 * HOUR),
        endsAt: new Date(victim.startsAt.getTime() + 3 * HOUR)
      }
    })

    const result = await processor.run()
    expect(result.skipped).toBeGreaterThanOrEqual(1)
    expect(result.created).toBe(removed.count - 1)

    const after = await shiftsOf(seriesId)
    expect(after).toHaveLength(before.length - 1)
    expect(after.map((s) => s.startsAt.getTime())).not.toContain(victim.startsAt.getTime())
    expect(after.some((s) => s.startsAt > victim.startsAt)).toBe(true)
  })
})
