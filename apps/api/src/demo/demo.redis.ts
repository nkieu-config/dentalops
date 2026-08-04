import Redis from "ioredis"
import { createRedisClient } from "../redis/redis-client"

export const DEMO_REDIS = "DEMO_REDIS_CLIENT"

export const createDemoRedis = (): Redis =>
  createRedisClient("demo", { maxRetriesPerRequest: null })
