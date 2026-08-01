import { Global, Inject, Module, OnModuleDestroy } from "@nestjs/common"
import Redis from "ioredis"

export const REDIS = "REDIS_CLIENT"

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: () =>
        new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
          maxRetriesPerRequest: 2
        })
    }
  ],
  exports: [REDIS]
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onModuleDestroy() {
    await this.redis.quit()
  }
}
