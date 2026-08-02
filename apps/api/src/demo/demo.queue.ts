import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import { JobSchedulerTemplateOptions, Queue } from "bullmq"
import Redis from "ioredis"
import { DEMO_REDIS } from "./demo.redis"

export const DEMO_QUEUE_NAME = "demo"
export const DEMO_JOB = "reset-demo"
export const DEMO_SCHEDULER_ID = "six-hourly-demo-reset"
export const DEMO_CRON = "0 */6 * * *"

export const DEMO_JOB_OPTIONS: JobSchedulerTemplateOptions = {
  attempts: 1,
  removeOnComplete: 10,
  removeOnFail: 10
}

@Injectable()
export class DemoQueue implements OnModuleInit, OnModuleDestroy {
  readonly queue: Queue
  private readonly logger = new Logger(DemoQueue.name)

  constructor(@Inject(DEMO_REDIS) connection: Redis) {
    this.queue = new Queue(DEMO_QUEUE_NAME, { connection })
    this.queue.on("error", (error) => this.logger.error(`demo queue error: ${error.message}`))
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        DEMO_SCHEDULER_ID,
        { pattern: DEMO_CRON, tz: "UTC" },
        { name: DEMO_JOB, opts: DEMO_JOB_OPTIONS }
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(`could not schedule the demo reset: ${message}`)
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close()
  }
}
