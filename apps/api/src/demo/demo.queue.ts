import { Inject, Injectable } from "@nestjs/common"
import type Redis from "ioredis"
import { ScheduledQueue } from "../redis/scheduled-queue"

export const DEMO_REDIS = "DEMO_REDIS_CLIENT"
export const DEMO_QUEUE_NAME = "demo"
export const DEMO_JOB = "reset-demo"
export const DEMO_SCHEDULER_ID = "six-hourly-demo-reset"
export const DEMO_CRON = "0 */6 * * *"

@Injectable()
export class DemoQueue extends ScheduledQueue {
  constructor(@Inject(DEMO_REDIS) connection: Redis) {
    super(connection, {
      queueName: DEMO_QUEUE_NAME,
      jobName: DEMO_JOB,
      schedulerId: DEMO_SCHEDULER_ID,
      cron: DEMO_CRON,
      description: "the demo reset"
    })
  }
}
