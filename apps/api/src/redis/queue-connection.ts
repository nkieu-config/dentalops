import type Redis from "ioredis"
import { createRedisClient, queueOptions } from "./redis-client"

export const createQueueConnection =
  (name: string) =>
  (): Redis =>
    createRedisClient(name, queueOptions)
