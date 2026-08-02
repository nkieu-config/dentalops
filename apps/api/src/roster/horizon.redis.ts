import Redis from "ioredis"

export const HORIZON_REDIS = "HORIZON_REDIS_CLIENT"

export const createHorizonRedis = (): Redis =>
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null
  })
