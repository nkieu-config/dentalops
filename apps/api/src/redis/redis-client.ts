import { Logger } from "@nestjs/common"
import Redis, { RedisOptions } from "ioredis"

const DEFAULT_URL = "redis://localhost:6379"

export const createRedisClient = (name: string, options: RedisOptions = {}): Redis => {
  const logger = new Logger(`Redis:${name}`)
  const client = new Redis(process.env.REDIS_URL ?? DEFAULT_URL, options)
  client.on("error", (error: Error) => logger.warn(`${name} redis error: ${error.message}`))
  return client
}
