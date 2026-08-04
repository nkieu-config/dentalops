import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import { PrismaClient } from "@prisma/client"
import { poolingAdvice, withPoolLimit } from "./database-url"
import { tenantExtension } from "./tenant.extension"

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name)

  constructor() {
    const url = process.env.DATABASE_URL
    super({
      ...(url ? { datasourceUrl: withPoolLimit(url) } : {}),
      // Nothing may read a password hash unless it says so. Every user query
      // that reaches a client already passes an explicit select, but that is a
      // rule people have to remember on every new query; this is the same
      // guarantee without the remembering. AuthService.login opts back in.
      omit: { user: { passwordHash: true } }
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
