import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const at = (h: number) => new Date(Date.UTC(2026, 7, 3, h, 0, 0))

describe("shift exclusion constraint", () => {
  let tenantId: string
  let staffId: string
  let branchId: string

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `excl-${Date.now()}`, name: "Exclusion Test Clinic" }
    })
    tenantId = tenant.id

    const branch = await prisma.branch.create({
      data: { tenantId, name: "Main", openingHours: {} }
    })
    branchId = branch.id

    const user = await prisma.user.create({
      data: {
        tenantId,
        email: "dentist@example.com",
        passwordHash: "x",
        name: "Dr. Anong",
        role: "dentist"
      }
    })
    staffId = user.id
  })

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } })
    await prisma.$disconnect()
  })

  it("rejects a second overlapping shift for the same staff member", async () => {
    await prisma.shift.create({
      data: { tenantId, staffId, branchId, startsAt: at(9), endsAt: at(17) }
    })

    await expect(
      prisma.shift.create({
        data: { tenantId, staffId, branchId, startsAt: at(16), endsAt: at(20) }
      })
    ).rejects.toThrow()
  })

  it("allows a back-to-back shift that only touches at the boundary", async () => {
    const shift = await prisma.shift.create({
      data: { tenantId, staffId, branchId, startsAt: at(17), endsAt: at(20) }
    })
    expect(shift.id).toBeDefined()
  })

  it("computes the generated range column from starts_at and ends_at", async () => {
    const rows = await prisma.$queryRaw<{ during: string }[]>`
      SELECT "during"::text FROM "shifts" WHERE "staff_id" = ${staffId}::uuid ORDER BY "starts_at" LIMIT 1
    `
    expect(rows[0]?.during).toContain("2026-08-03")
  })
})
