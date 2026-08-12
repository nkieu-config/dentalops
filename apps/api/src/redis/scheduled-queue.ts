import { Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import { JobSchedulerTemplateOptions, Queue } from "bullmq"
import type Redis from "ioredis"

export interface ScheduledJob {
  queueName: string
  jobName: string
  schedulerId: string
  cron: string
  description: string
}

const SCHEDULED_JOB_OPTIONS: JobSchedulerTemplateOptions = {
  attempts: 1,
  removeOnComplete: 10,
  removeOnFail: 10
}

export abstract class ScheduledQueue implements OnModuleInit, OnModuleDestroy {
  readonly queue: Queue
  private readonly logger: Logger

  protected constructor(
    connection: Redis,
    private readonly job: ScheduledJob
  ) {
    this.logger = new Logger(`${job.queueName} queue`)
    this.queue = new Queue(job.queueName, { connection })
    this.queue.on("error", (error) =>
      this.logger.error(`${job.queueName} queue error: ${error.message}`)
    )
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        this.job.schedulerId,
        { pattern: this.job.cron, tz: "UTC" },
        { name: this.job.jobName, opts: SCHEDULED_JOB_OPTIONS }
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(`could not schedule ${this.job.description}: ${message}`)
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close()
  }
}
