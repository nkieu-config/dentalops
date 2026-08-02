import { PrismaClient } from "@prisma/client"
import { seedDemoTenant } from "../src/demo/demo-seed"

const prisma = new PrismaClient()

seedDemoTenant(prisma)
  .catch((e: unknown) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
