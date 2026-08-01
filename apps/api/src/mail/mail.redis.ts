import Redis from "ioredis"

export const MAIL_REDIS = "MAIL_REDIS_CLIENT"

export const createMailRedis = (): Redis =>
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null
  })
