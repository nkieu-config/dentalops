import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import { PrismaClient } from "@prisma/client"
import { poolingAdvice, withPoolLimit } from "./database-url"
import { PRIVATE_COLUMNS } from "./private-columns"
import { tenantExtension } from "./tenant.extension"

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name)

  constructor() {
    const url = process.env.DATABASE_URL
    super({
      ...(url ? { datasourceUrl: withPoolLimit(url) } : {}),
      omit: PRIVATE_COLUMNS
    })
  }

  readonly scoped = this.$extends(tenantExtension)

  async onModuleInit() {
    const advice = poolingAdvice(process.env.DATABASE_URL, process.env.DIRECT_URL)
    if (advice) this.logger.warn(advice)
    await this.$connect()
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
