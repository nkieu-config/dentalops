import Redis from "ioredis"
import { createRedisClient } from "../redis/redis-client"

export const MAIL_REDIS = "MAIL_REDIS_CLIENT"

export const createMailRedis = (): Redis =>
  createRedisClient("mail", { maxRetriesPerRequest: null })
