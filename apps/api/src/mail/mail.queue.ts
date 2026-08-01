import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common"
import { JobsOptions, Queue } from "bullmq"
import Redis from "ioredis"
import { MAIL_REDIS } from "./mail.redis"

export const MAIL_QUEUE_NAME = "mail"
export const CONFIRMATION_JOB = "confirmation"

export const MAIL_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 1000 },
  removeOnComplete: 50
}

export interface ConfirmationJobData {
  appointmentId: string
  tenantId: string
  manageToken: string
}

@Injectable()
export class MailQueue implements OnModuleDestroy {
  readonly queue: Queue<ConfirmationJobData>
  private readonly logger = new Logger(MailQueue.name)

  constructor(@Inject(MAIL_REDIS) connection: Redis) {
    this.queue = new Queue<ConfirmationJobData>(MAIL_QUEUE_NAME, { connection })
    this.queue.on("error", (error) => this.logger.error(`mail queue error: ${error.message}`))
  }

  async enqueueConfirmation(data: ConfirmationJobData): Promise<void> {
    try {
      await this.queue.add(CONFIRMATION_JOB, data, MAIL_JOB_OPTIONS)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(`could not enqueue confirmation email: ${message}`)
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close()
  }
}
