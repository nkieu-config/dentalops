import { PrismaClient } from "@prisma/client"
import { seedDemoTenantWithActivity } from "../src/demo/seed-runner"

const prisma = new PrismaClient()

seedDemoTenantWithActivity(prisma)
  .catch((e: unknown) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
