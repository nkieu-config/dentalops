import { Inject, Module, OnModuleDestroy } from "@nestjs/common"
import Redis from "ioredis"
import { HorizonProcessor } from "../roster/horizon.processor"
import { HorizonQueue } from "../roster/horizon.queue"
import { createHorizonRedis, HORIZON_REDIS } from "../roster/horizon.redis"
import { ShiftSeriesController } from "./shift-series.controller"
import { ShiftSeriesService } from "./shift-series.service"
import { ShiftsController } from "./shifts.controller"
import { ShiftsService } from "./shifts.service"

@Module({
  controllers: [ShiftsController, ShiftSeriesController],
  providers: [
    ShiftsService,
    ShiftSeriesService,
    { provide: HORIZON_REDIS, useFactory: createHorizonRedis },
    HorizonQueue,
    HorizonProcessor
  ],
  exports: [ShiftsService, ShiftSeriesService]
})
export class ShiftsModule implements OnModuleDestroy {
  constructor(@Inject(HORIZON_REDIS) private readonly redis: Redis) {}

  async onModuleDestroy() {
    await this.redis.quit()
  }
}
