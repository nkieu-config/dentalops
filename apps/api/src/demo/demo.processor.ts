import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common"
import { Worker } from "bullmq"
import Redis from "ioredis"
import { DemoResetService } from "./demo-reset.service"
import { DEMO_QUEUE_NAME } from "./demo.queue"
import { DEMO_REDIS } from "./demo.redis"
import { idleFriendlyWorkerOptions } from "../redis/worker-options"

@Injectable()
export class DemoProcessor implements OnModuleDestroy {
  private readonly worker: Worker
  private readonly logger = new Logger(DemoProcessor.name)

  constructor(
    @Inject(DEMO_REDIS) connection: Redis,
    private readonly demo: DemoResetService
  ) {
    this.worker = new Worker(DEMO_QUEUE_NAME, () => this.demo.reset(), {
      connection,
      ...idleFriendlyWorkerOptions
    })
    this.worker.on("error", (error) => this.logger.error(`demo worker error: ${error.message}`))
    this.worker.on("failed", (_job, error) =>
      this.logger.warn(`demo reset failed: ${error.message}`)
    )
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close()
  }
}
