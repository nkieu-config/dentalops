import { execSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

describe("seed script", () => {
  beforeAll(() => {
    execSync("pnpm db:seed", { cwd: `${__dirname}/..`, stdio: "pipe" })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("creates the demo tenant with branches, services, resources, staff and patients", async () => {
    const tenant = await prisma.tenant.findUnique({ where: { slug: "demo-clinic" } })
    expect(tenant).not.toBeNull()

    const tenantId = tenant!.id
    const [branches, services, resources, users, patients] = await Promise.all([
      prisma.branch.count({ where: { tenantId } }),
      prisma.service.count({ where: { tenantId } }),
      prisma.resource.count({ where: { tenantId } }),
      prisma.user.count({ where: { tenantId } }),
      prisma.patient.count({ where: { tenantId } })
    ])

    expect(branches).toBe(2)
    expect(services).toBe(6)
    expect(resources).toBe(8)
    expect(users).toBe(6)
    expect(patients).toBe(4)
  })

  it("is idempotent", async () => {
    execSync("pnpm db:seed", { cwd: `${__dirname}/..`, stdio: "pipe" })
    const count = await prisma.tenant.count({ where: { slug: "demo-clinic" } })
    expect(count).toBe(1)
  })
})
