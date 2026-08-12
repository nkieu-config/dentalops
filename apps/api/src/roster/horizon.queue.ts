import { Inject, Injectable } from "@nestjs/common"
import type Redis from "ioredis"
import { ScheduledQueue } from "../redis/scheduled-queue"

export const HORIZON_REDIS = "HORIZON_REDIS_CLIENT"
export const HORIZON_QUEUE_NAME = "horizon"
export const HORIZON_JOB = "extend-horizon"
export const HORIZON_SCHEDULER_ID = "nightly-horizon"
export const HORIZON_CRON = "0 18 * * *"

@Injectable()
export class HorizonQueue extends ScheduledQueue {
  constructor(@Inject(HORIZON_REDIS) connection: Redis) {
    super(connection, {
      queueName: HORIZON_QUEUE_NAME,
      jobName: HORIZON_JOB,
      schedulerId: HORIZON_SCHEDULER_ID,
      cron: HORIZON_CRON,
      description: "the nightly horizon job"
    })
  }
}
