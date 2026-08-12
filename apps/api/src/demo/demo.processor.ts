import { Inject, Injectable } from "@nestjs/common"
import type Redis from "ioredis"
import { JobWorker } from "../redis/job-worker"
import { DemoResetService } from "./demo-reset.service"
import { DEMO_QUEUE_NAME, DEMO_REDIS } from "./demo.queue"

@Injectable()
export class DemoProcessor extends JobWorker {
  constructor(
    @Inject(DEMO_REDIS) connection: Redis,
    private readonly demo: DemoResetService
  ) {
    super(connection, DEMO_QUEUE_NAME, "demo reset failed")
  }

  protected handle(): Promise<unknown> {
    return this.demo.reset()
  }
}
