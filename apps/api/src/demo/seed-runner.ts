import { PrismaClient } from "@prisma/client"
import { AuditService } from "../audit/audit.service"
import { connectMongo } from "../audit/mongo.provider"
import { DemoSeedCounts, seedDemoTenant } from "./demo-seed"

export const seedDemoTenantWithActivity = async (
  prisma: PrismaClient
): Promise<DemoSeedCounts> => {
  const audit = new AuditService(await connectMongo())
  if (!audit.enabled) {
    console.warn(
      "MONGODB_URL is unset or unreachable, so the demo tenant will have an empty Activity page"
    )
  }
  await audit.onModuleInit()
  try {
    return await seedDemoTenant(prisma, audit)
  } finally {
    await audit.onModuleDestroy()
  }
}
