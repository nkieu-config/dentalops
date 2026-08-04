import Redis from "ioredis"
import { createRedisClient, queueOptions } from "../redis/redis-client"

export const DEMO_REDIS = "DEMO_REDIS_CLIENT"

export const createDemoRedis = (): Redis =>
  createRedisClient("demo", queueOptions)
