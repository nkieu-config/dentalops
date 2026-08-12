import { Inject, Module, OnModuleDestroy } from "@nestjs/common"
import type Redis from "ioredis"
import { createQueueConnection } from "../redis/queue-connection"
import { closeRedis } from "../redis/redis-client"
import { DemoProcessor } from "./demo.processor"
import { DEMO_REDIS, DemoQueue } from "./demo.queue"
import { DemoResetService } from "./demo-reset.service"

@Module({
  providers: [
    { provide: DEMO_REDIS, useFactory: createQueueConnection("demo") },
    DemoResetService,
    DemoQueue,
    DemoProcessor
  ],
  exports: [DemoResetService]
})
export class DemoModule implements OnModuleDestroy {
  constructor(@Inject(DEMO_REDIS) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await closeRedis(this.redis)
  }
}
