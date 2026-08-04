import Redis from "ioredis"
import { createRedisClient, queueOptions } from "../redis/redis-client"

export const HORIZON_REDIS = "HORIZON_REDIS_CLIENT"

export const createHorizonRedis = (): Redis =>
  createRedisClient("horizon", queueOptions)
