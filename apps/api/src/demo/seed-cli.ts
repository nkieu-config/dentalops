import { PrismaClient } from "@prisma/client"
import { DEMO_SLUG, seedDemoTenant } from "./demo-seed"

const prisma = new PrismaClient()

async function main() {
  const existing = await prisma.tenant.findUnique({ where: { slug: DEMO_SLUG } })
  if (existing) {
    console.log(`Demo tenant ${DEMO_SLUG} already exists, skipping seed`)
    return
  }
  await seedDemoTenant(prisma)
}

main()
  .catch((e: unknown) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => void prisma.$disconnect())
