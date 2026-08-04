import { Logger } from "@nestjs/common"
import type { ThrottlerStorage } from "@nestjs/throttler"
import type { ThrottlerStorageRecord } from "@nestjs/throttler/dist/throttler-storage-record.interface"

interface LocalWindow {
  hits: number
  expiresAt: number
}

export class ResilientThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(ResilientThrottlerStorage.name)
  private readonly local = new Map<string, LocalWindow>()
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
        this.local.clear()
        this.logger.log("shared rate limiting is enforced again")
      }
      return record
    } catch (error) {
      if (!this.degraded) {
        this.degraded = true
        this.logger.warn(
          `rate limiting fell back to this instance's memory: ${(error as Error).message}`
        )
      }
      return this.countLocally(key, ttl, limit)
    }
  }

  private countLocally(key: string, ttl: number, limit: number): ThrottlerStorageRecord {
    const now = Date.now()
    const window = this.local.get(key)
    if (!window || window.expiresAt <= now) {
      this.local.set(key, { hits: 1, expiresAt: now + ttl })
      return { totalHits: 1, timeToExpire: ttl / 1000, isBlocked: false, timeToBlockExpire: 0 }
    }
    window.hits += 1
    const timeToExpire = Math.ceil((window.expiresAt - now) / 1000)
    const isBlocked = window.hits > limit
    return {
      totalHits: window.hits,
      timeToExpire,
      isBlocked,
      timeToBlockExpire: isBlocked ? timeToExpire : 0
    }
  }
}
