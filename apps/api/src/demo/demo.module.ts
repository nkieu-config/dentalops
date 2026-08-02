import { Module, OnModuleDestroy, Inject } from "@nestjs/common"
import Redis from "ioredis"
import { DemoProcessor } from "./demo.processor"
import { DemoQueue } from "./demo.queue"
import { DemoResetService } from "./demo-reset.service"
import { DEMO_REDIS, createDemoRedis } from "./demo.redis"

@Module({
  providers: [
    { provide: DEMO_REDIS, useFactory: createDemoRedis },
    DemoResetService,
    DemoQueue,
    DemoProcessor
  ],
  exports: [DemoResetService]
})
export class DemoModule implements OnModuleDestroy {
  constructor(@Inject(DEMO_REDIS) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit()
  }
}
