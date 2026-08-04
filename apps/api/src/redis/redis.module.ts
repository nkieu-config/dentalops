import { Global, Inject, Module, OnModuleDestroy } from "@nestjs/common"
import Redis from "ioredis"
import { createRedisClient, requestPathOptions } from "./redis-client"

export const REDIS = "REDIS_CLIENT"

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: () => createRedisClient("app", requestPathOptions)
    }
  ],
  exports: [REDIS]
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onModuleDestroy() {
    await this.redis.quit().catch(() => this.redis.disconnect())
  }
}
