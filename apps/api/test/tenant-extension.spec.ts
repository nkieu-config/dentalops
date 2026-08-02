import { PrismaService } from "../src/prisma/prisma.service"
import { tenantContext } from "../src/tenant/tenant-context"

const prisma = new PrismaService()

const asTenant = <T>(tenantId: string, fn: () => Promise<T>) =>
  tenantContext.run(
    { tenantId, userId: "test-user", role: "owner", name: "Test User" },
    async () => await fn()
  )

describe("tenant extension", () => {
  let tenantA: string
  let tenantB: string
  let serviceInB: string

  beforeAll(async () => {
    const a = await prisma.tenant.create({
      data: { slug: `ext-a-${Date.now()}`, name: "Tenant A" }
    })
    const b = await prisma.tenant.create({
      data: { slug: `ext-b-${Date.now()}`, name: "Tenant B" }
    })
    tenantA = a.id
    tenantB = b.id

    const svc = await prisma.service.create({
      data: { tenantId: tenantB, name: "B-only cleaning", durationMin: 30 }
    })
    serviceInB = svc.id
  })

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenantA } })
    await prisma.tenant.delete({ where: { id: tenantB } })
    await prisma.$disconnect()
  })

  it("injects tenantId on create", async () => {
    const created = await asTenant(tenantA, () =>
      prisma.scoped.service.create({ data: { name: "A cleaning", durationMin: 30 } as never })
    )
    expect(created.tenantId).toBe(tenantA)
  })

  it("filters findMany to the current tenant", async () => {
    const seen = await asTenant(tenantA, () => prisma.scoped.service.findMany())
    expect(seen.every((s) => s.tenantId === tenantA)).toBe(true)
    expect(seen.some((s) => s.id === serviceInB)).toBe(false)
  })

  it("makes a cross-tenant findUnique behave like a missing row", async () => {
    const found = await asTenant(tenantA, () =>
      prisma.scoped.service.findUnique({ where: { id: serviceInB } })
    )
    expect(found).toBeNull()
  })

  it("makes a cross-tenant update throw P2025", async () => {
    await expect(
      asTenant(tenantA, () =>
        prisma.scoped.service.update({
          where: { id: serviceInB },
          data: { name: "stolen" }
        })
      )
    ).rejects.toMatchObject({ code: "P2025" })
  })

  it("refuses to run scoped queries outside any tenant context", async () => {
    await expect(prisma.scoped.service.findMany()).rejects.toThrow("outside tenant context")
  })
})
