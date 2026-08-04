import { Logger } from "@nestjs/common"
import type { ThrottlerStorage } from "@nestjs/throttler"
import type { ThrottlerStorageRecord } from "@nestjs/throttler/dist/throttler-storage-record.interface"

const UNLIMITED: ThrottlerStorageRecord = {
  totalHits: 0,
  timeToExpire: 0,
  isBlocked: false,
  timeToBlockExpire: 0
}

export class ResilientThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(ResilientThrottlerStorage.name)
  private degraded = false

  constructor(private readonly inner: ThrottlerStorage) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string
  ): Promise<ThrottlerStorageRecord> {
    try {
      const record = await this.inner.increment(key, ttl, limit, blockDuration, throttlerName)
      if (this.degraded) {
        this.degraded = false
        this.logger.log("rate limiting is enforced again")
      }
      return record
    } catch (error) {
      if (!this.degraded) {
        this.degraded = true
        this.logger.warn(
          `rate limiting is unavailable, allowing requests through: ${(error as Error).message}`
        )
      }
      return UNLIMITED
    }
  }
}
