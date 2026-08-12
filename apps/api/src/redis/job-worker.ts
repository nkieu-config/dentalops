import { Logger, OnModuleDestroy } from "@nestjs/common"
import { Worker, type WorkerOptions } from "bullmq"
import type Redis from "ioredis"

const MINUTE = 60

const idleFriendlyWorkerOptions: Omit<WorkerOptions, "connection"> = {
  drainDelay: 5 * MINUTE,
  stalledInterval: 5 * MINUTE * 1000
}

export abstract class JobWorker<TData = unknown> implements OnModuleDestroy {
  private readonly worker: Worker<TData>
  protected readonly logger: Logger

  protected constructor(connection: Redis, queueName: string, failureMessage: string) {
    this.logger = new Logger(`${queueName} worker`)
    this.worker = new Worker<TData>(queueName, (job) => this.handle(job.data), {
      connection,
      ...idleFriendlyWorkerOptions
    })
    this.worker.on("error", (error) =>
      this.logger.error(`${queueName} worker error: ${error.message}`)
    )
    this.worker.on("failed", (_job, error) =>
      this.logger.warn(`${failureMessage}: ${error.message}`)
    )
  }

  protected abstract handle(data: TData): Promise<unknown>

  async onModuleDestroy(): Promise<void> {
    await this.worker.close()
  }
}
