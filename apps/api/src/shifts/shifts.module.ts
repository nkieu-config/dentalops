import { Inject, Module, OnModuleDestroy } from "@nestjs/common"
import Redis from "ioredis"
import { AvailabilityModule } from "../availability/availability.module"
import { createQueueConnection } from "../redis/queue-connection"
import { closeRedis } from "../redis/redis-client"
import { HorizonProcessor } from "../roster/horizon.processor"
import { HORIZON_REDIS, HorizonQueue } from "../roster/horizon.queue"
import { ShiftSeriesController } from "./shift-series.controller"
import { ShiftSeriesService } from "./shift-series.service"
import { ShiftsController } from "./shifts.controller"
import { ShiftsService } from "./shifts.service"

@Module({
  imports: [AvailabilityModule],
  controllers: [ShiftsController, ShiftSeriesController],
  providers: [
    ShiftsService,
    ShiftSeriesService,
    { provide: HORIZON_REDIS, useFactory: createQueueConnection("horizon") },
    HorizonQueue,
    HorizonProcessor
  ],
  exports: [ShiftsService, ShiftSeriesService]
})
export class ShiftsModule implements OnModuleDestroy {
  constructor(@Inject(HORIZON_REDIS) private readonly redis: Redis) {}

  async onModuleDestroy() {
    await closeRedis(this.redis)
  }
}
