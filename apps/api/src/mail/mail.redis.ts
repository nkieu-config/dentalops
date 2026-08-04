import Redis from "ioredis"
import { createRedisClient, queueOptions } from "../redis/redis-client"

export const MAIL_REDIS = "MAIL_REDIS_CLIENT"

export const createMailRedis = (): Redis =>
  createRedisClient("mail", queueOptions)
