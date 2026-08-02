import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import { JobSchedulerTemplateOptions, Queue } from "bullmq"
import Redis from "ioredis"
import { HORIZON_REDIS } from "./horizon.redis"

export const HORIZON_QUEUE_NAME = "horizon"
export const HORIZON_JOB = "extend-horizon"
export const HORIZON_SCHEDULER_ID = "nightly-horizon"
export const HORIZON_CRON = "0 18 * * *"

export const HORIZON_JOB_OPTIONS: JobSchedulerTemplateOptions = {
  attempts: 1,
  removeOnComplete: 10,
  removeOnFail: 10
}

@Injectable()
export class HorizonQueue implements OnModuleInit, OnModuleDestroy {
  readonly queue: Queue
  private readonly logger = new Logger(HorizonQueue.name)

  constructor(@Inject(HORIZON_REDIS) connection: Redis) {
    this.queue = new Queue(HORIZON_QUEUE_NAME, { connection })
    this.queue.on("error", (error) => this.logger.error(`horizon queue error: ${error.message}`))
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        HORIZON_SCHEDULER_ID,
        { pattern: HORIZON_CRON, tz: "UTC" },
        { name: HORIZON_JOB, opts: HORIZON_JOB_OPTIONS }
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(`could not schedule the nightly horizon job: ${message}`)
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close()
  }
}
