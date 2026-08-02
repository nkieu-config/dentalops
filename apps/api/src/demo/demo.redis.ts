import Redis from "ioredis"

export const DEMO_REDIS = "DEMO_REDIS_CLIENT"

export const createDemoRedis = (): Redis =>
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null
  })
