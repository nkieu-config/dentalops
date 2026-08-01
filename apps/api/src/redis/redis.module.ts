import { Global, Inject, Module, OnApplicationShutdown } from "@nestjs/common"
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
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  onApplicationShutdown() {
    return this.redis.quit()
  }
}
