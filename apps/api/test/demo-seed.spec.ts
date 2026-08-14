import { INestApplication } from "@nestjs/common"
import { AuditService } from "../src/audit/audit.service"
import { DemoResetService } from "../src/demo/demo-reset.service"
import { DEMO_SLUG, PATIENT_COUNT } from "../src/demo/demo-seed"
import { PrismaService } from "../src/prisma/prisma.service"
import { RosterService } from "../src/roster/roster.service"
import { tenantContext } from "../src/tenant/tenant-context"
import { createTestApp } from "./utils/test-app"

const DAY_MS = 24 * 60 * 60 * 1000

const nextUtcWeekday = (weekday: number): Date => {
  const now = new Date()
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const offset = (weekday - new Date(midnight).getUTCDay() + 7) % 7 || 7
  return new Date(midnight + offset * DAY_MS)
}

describe("demo seed", () => {
  let app: INestApplication
  let prisma: PrismaService
  let audit: AuditService
  let roster: RosterService
  let tenantId: string

  beforeAll(async () => {
    ;({ app } = await createTestApp())
    prisma = app.get(PrismaService)
    audit = app.get(AuditService)
    roster = app.get(RosterService)

    await app.get(DemoResetService).reset(DEMO_SLUG)
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: DEMO_SLUG } })
    tenantId = tenant.id
  }, 60_000)

  afterAll(async () => {
    await app.close()
  })

  it("seeds a realistic, non-periodic patient roster", async () => {
    const patients = await prisma.patient.findMany({ where: { tenantId } })
    const emails = patients.map((p) => p.email).filter((email) => email !== "")
    expect(patients).toHaveLength(PATIENT_COUNT)
    expect(new Set(patients.map((p) => p.name)).size).toBe(PATIENT_COUNT)
    expect(new Set(patients.map((p) => p.phone)).size).toBe(PATIENT_COUNT)
    expect(new Set(emails).size).toBe(emails.length)
    expect(emails.length).toBeLessThan(PATIENT_COUNT)
    expect(patients.some((p) => p.notes)).toBe(true)
    expect(patients.every((p) => p.notes === null || p.notes.length > 0)).toBe(true)
  })

  it("gives the two branches different capacity instead of a mirrored pair", async () => {
    const branches = await prisma.branch.findMany({ where: { tenantId }, orderBy: { name: "asc" } })
    expect(branches).toHaveLength(2)
    const chairCounts = await Promise.all(
      branches.map((b) =>
        prisma.resource.count({ where: { tenantId, branchId: b.id, type: "chair", isActive: true } })
      )
    )
    expect(new Set(chairCounts).size).toBeGreaterThan(1)
    expect(branches.find((b) => b.name === "Sukhumvit")?.openingHours).not.toEqual(
      branches.find((b) => b.name === "Ladprao")?.openingHours
    )
  })

  it("makes Ladprao the dense default demo workspace", async () => {
    const ladprao = await prisma.branch.findFirstOrThrow({ where: { tenantId, name: "Ladprao" } })
    const start = nextUtcWeekday(2)
    const end = new Date(start.getTime() + DAY_MS)
    const [chairs, shifts, appointments] = await Promise.all([
      prisma.resource.count({
        where: { tenantId, branchId: ladprao.id, type: "chair", isActive: true }
      }),
      prisma.shift.findMany({
        where: { tenantId, branchId: ladprao.id, startsAt: { gte: start, lt: end } }
      }),
      prisma.appointment.findMany({
        where: { tenantId, branchId: ladprao.id, startsAt: { gte: start, lt: end } }
      })
    ])

    const minutes = (rows: { startsAt: Date; endsAt: Date }[]) =>
      rows.reduce((total, row) => total + (row.endsAt.getTime() - row.startsAt.getTime()) / 60_000, 0)

    expect(chairs).toBe(4)
    expect(new Set(shifts.map((shift) => shift.staffId)).size).toBe(4)
    expect(minutes(appointments) / minutes(shifts)).toBeGreaterThan(0.45)
    expect(appointments.every((appointment) => appointment.status === "confirmed")).toBe(true)
  })

  it("includes an inactive dentist and an inactive resource, not just active ones", async () => {
    const inactiveDentist = await prisma.user.findFirst({
      where: { tenantId, role: "dentist", isActive: false }
    })
    expect(inactiveDentist).not.toBeNull()

    const inactiveResource = await prisma.resource.findFirst({ where: { tenantId, isActive: false } })
    expect(inactiveResource).not.toBeNull()
  })

  it("seeds more than one recurring appointment series, with one occurrence detached", async () => {
    const series = await prisma.appointmentSeries.findMany({ where: { tenantId } })
    expect(series.length).toBeGreaterThanOrEqual(2)

    const detachedAppointment = await prisma.appointment.findFirst({
      where: { tenantId, detached: true, seriesId: { not: null } }
    })
    expect(detachedAppointment).not.toBeNull()

    const detachedShift = await prisma.shift.findFirst({
      where: { tenantId, detached: true, seriesId: { not: null } }
    })
    expect(detachedShift).not.toBeNull()
  })

  it("seeds at least one time block", async () => {
    const blocks = await prisma.timeBlock.count({ where: { tenantId } })
    expect(blocks).toBeGreaterThan(0)
  })

  it("plants a real roster violation near today instead of a permanently clean roster", async () => {
    const sukhumvit = await prisma.branch.findFirstOrThrow({ where: { tenantId, name: "Sukhumvit" } })
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const to = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

    const { violations } = await tenantContext.run(
      { tenantId, userId: "test-user", role: "owner", name: "Test User" },
      () =>
        roster.validate({
          branchId: sukhumvit.id,
          from: from.toISOString(),
          to: to.toISOString(),
          draftShifts: []
        })
    )

    expect(violations.some((v) => v.rule === "appointment_outside_shift")).toBe(true)
    expect(violations.some((v) => v.rule === "insufficient_rest")).toBe(true)
  })

  it("backfills a real audit trail so the activity log isn't permanently empty", async () => {
    const { entries } = await tenantContext.run(
      { tenantId, userId: "test-user", role: "owner", name: "Test User" },
      () => audit.list({ limit: 5000 })
    )
    expect(entries.length).toBeGreaterThan(1000)

    for (let i = 1; i < entries.length; i++) {
      expect(entries[i - 1]!.at.getTime()).toBeGreaterThanOrEqual(entries[i]!.at.getTime())
    }

    const actionTypes = new Set(entries.map((e) => e.action))
    expect(actionTypes.has("POST /patients")).toBe(true)
    expect(actionTypes.has("POST /appointments")).toBe(true)
    expect(actionTypes.has("appointment.status")).toBe(true)

    const actorTypes = new Set(entries.map((e) => e.actor.type))
    expect(actorTypes.has("staff")).toBe(true)

    const linkable = entries.find(
      (e) => e.action === "POST /appointments" && (e.after as { startsAt?: string })?.startsAt
    )
    expect(linkable).toBeDefined()

    const first100 = await tenantContext.run(
      { tenantId, userId: "test-user", role: "owner", name: "Test User" },
      () => audit.list({ limit: 100 })
    )
    expect(first100.entries.length).toBe(100)
    expect(first100.entries[0]!.at.getTime()).toBe(entries[0]!.at.getTime())
  })

  it("spreads backfilled activity across time instead of piling it onto one instant", async () => {
    const { entries } = await tenantContext.run(
      { tenantId, userId: "test-user", role: "owner", name: "Test User" },
      () => audit.list({ limit: 5000 })
    )

    const countByTimestamp = new Map<number, number>()
    for (const entry of entries) {
      const at = entry.at.getTime()
      countByTimestamp.set(at, (countByTimestamp.get(at) ?? 0) + 1)
    }
    const largestCluster = Math.max(...countByTimestamp.values())

    expect(largestCluster).toBeLessThan(entries.length * 0.01)
  })
})
