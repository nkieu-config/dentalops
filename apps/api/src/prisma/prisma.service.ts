import { Injectable, OnModuleInit } from "@nestjs/common"
import { PrismaClient } from "@prisma/client"
import { tenantExtension } from "./tenant.extension"

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  readonly scoped = this.$extends(tenantExtension)

  async onModuleInit() {
    await this.$connect()
  }
}
