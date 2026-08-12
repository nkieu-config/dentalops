import { Logger } from "@nestjs/common"
import Redis, { RedisOptions } from "ioredis"

const DEFAULT_URL = "redis://localhost:6379"

export const CONNECT_TIMEOUT_MS = 5_000
export const COMMAND_TIMEOUT_MS = 2_000

export const requestPathOptions: RedisOptions = {
  connectTimeout: CONNECT_TIMEOUT_MS,
  commandTimeout: COMMAND_TIMEOUT_MS,
  maxRetriesPerRequest: 2,
  enableOfflineQueue: false
}

export const queueOptions: RedisOptions = {
  connectTimeout: CONNECT_TIMEOUT_MS,
  maxRetriesPerRequest: null
}

export const createRedisClient = (name: string, options: RedisOptions = {}): Redis => {
  const logger = new Logger(`Redis:${name}`)
  const client = new Redis(process.env.REDIS_URL ?? DEFAULT_URL, options)
  client.on("error", (error: Error) => logger.warn(`${name} redis error: ${error.message}`))
  return client
}

export const closeRedis = async (client: Redis): Promise<void> => {
  await client.quit().catch(() => client.disconnect())
}
