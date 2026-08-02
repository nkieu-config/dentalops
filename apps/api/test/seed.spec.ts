import { execSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const DAY_MS = 24 * 60 * 60 * 1000

const reseed = () => {
  execSync("pnpm db:seed", { cwd: `${__dirname}/..`, stdio: "pipe" })
}

const demoCounts = async () => {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "demo-clinic" } })
  const tenantId = tenant!.id
  const [branches, services, resources, users, patients, shifts, appointments, claims] =
    await Promise.all([
      prisma.branch.count({ where: { tenantId } }),
      prisma.service.count({ where: { tenantId } }),
      prisma.resource.count({ where: { tenantId } }),
      prisma.user.count({ where: { tenantId } }),
      prisma.patient.count({ where: { tenantId } }),
      prisma.shift.count({ where: { tenantId } }),
      prisma.appointment.count({ where: { tenantId } }),
      prisma.resourceClaim.count({ where: { tenantId } })
    ])
  return { branches, services, resources, users, patients, shifts, appointments, claims }
}

describe("seed script", () => {
  beforeAll(() => {
    reseed()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("creates the demo tenant with branches, services, resources, staff, patients, shifts and appointments", async () => {
    const tenant = await prisma.tenant.findUnique({ where: { slug: "demo-clinic" } })
    expect(tenant).not.toBeNull()

    const counts = await demoCounts()
    expect(counts.branches).toBe(2)
    expect(counts.services).toBe(6)
    expect(counts.resources).toBe(8)
    expect(counts.users).toBe(8)
    expect(counts.patients).toBe(120)
    expect(counts.shifts).toBeGreaterThan(350)
    expect(counts.appointments).toBeGreaterThan(1200)

    const tenantId = tenant!.id
    const [earliest, latest] = await Promise.all([
      prisma.appointment.findFirst({ where: { tenantId }, orderBy: { startsAt: "asc" } }),
      prisma.appointment.findFirst({ where: { tenantId }, orderBy: { startsAt: "desc" } })
    ])
    const spanDays = (latest!.startsAt.getTime() - earliest!.startsAt.getTime()) / DAY_MS
    expect(spanDays).toBeGreaterThan(100)
  })

  it("is idempotent and lands on identical counts when reseeded", async () => {
    const first = await demoCounts()
    reseed()
    const second = await demoCounts()

    expect(second).toEqual(first)
    const count = await prisma.tenant.count({ where: { slug: "demo-clinic" } })
    expect(count).toBe(1)
  })
})
