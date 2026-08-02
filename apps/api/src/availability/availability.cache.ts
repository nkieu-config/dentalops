import { Inject, Injectable, Logger } from "@nestjs/common"
import Redis from "ioredis"
import { REDIS } from "../redis/redis.module"

const DAY_MS = 86_400_000
const BUFFER_HORIZON_MS = 60 * 60_000

export const AVAILABILITY_TTL_SECONDS = 600
export const AVAILABILITY_VERSION_TTL_SECONDS = 30 * 24 * 60 * 60

const READ_AVAILABILITY = `
local versions = {}
for i = 1, #KEYS do
  versions[i] = redis.call('GET', KEYS[i]) or '0'
end
local key = ARGV[1] .. ':v' .. table.concat(versions, '.')
local hit = redis.call('GET', key)
if hit then return { key, hit } end
return { key }
`

export interface AvailabilityKey {
  tenantId: string
  branchId: string
  serviceId: string
  dentistId?: string
  from: number
  to: number
}

export interface CachedSlot {
  dentistId: string
  startsAt: string
  endsAt: string
}

export interface CacheLookup {
  slots: CachedSlot[] | null
  entryKey: string | null
}

export interface DatedWindow {
  startsAt: Date
  endsAt: Date
}

export const spannedDates = (startMs: number, endMs: number): string[] => {
  const first = Math.floor(startMs / DAY_MS)
  const last = Math.floor((endMs + BUFFER_HORIZON_MS) / DAY_MS)
  const dates: string[] = []
  for (let day = first; day <= last; day++) {
    dates.push(new Date(day * DAY_MS).toISOString().slice(0, 10))
  }
  return dates
}

export const availabilityVersionKey = (tenantId: string, date: string): string =>
  `availver:${tenantId}:${date}`

export const availabilityEntryPrefix = (key: AvailabilityKey): string =>
  [
    "avail",
    key.tenantId,
    key.branchId,
    key.serviceId,
    key.dentistId ?? "any",
    `${new Date(key.from).toISOString()}~${new Date(key.to).toISOString()}`
  ].join(":")

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

@Injectable()
export class AvailabilityCache {
  private readonly logger = new Logger(AvailabilityCache.name)

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async read(key: AvailabilityKey): Promise<CacheLookup> {
    const versionKeys = spannedDates(key.from, key.to).map((date) =>
      availabilityVersionKey(key.tenantId, date)
    )
    try {
      const reply = (await this.redis.eval(
        READ_AVAILABILITY,
        versionKeys.length,
        ...versionKeys,
        availabilityEntryPrefix(key)
      )) as [string, string?]
      const payload = reply[1]
      return { entryKey: reply[0], slots: payload ? (JSON.parse(payload) as CachedSlot[]) : null }
    } catch (error) {
      this.logger.debug(`availability cache read failed: ${reasonOf(error)}`)
      return { entryKey: null, slots: null }
    }
  }

  async write(entryKey: string, slots: CachedSlot[]): Promise<void> {
    try {
      await this.redis.set(entryKey, JSON.stringify(slots), "EX", AVAILABILITY_TTL_SECONDS)
    } catch (error) {
      this.logger.debug(`availability cache write failed: ${reasonOf(error)}`)
    }
  }

  async invalidate(tenantId: string, dates: string[]): Promise<void> {
    const unique = [...new Set(dates)]
    if (unique.length === 0) return

    const pipeline = this.redis.pipeline()
    for (const date of unique) {
      const key = availabilityVersionKey(tenantId, date)
      pipeline.incr(key)
      pipeline.expire(key, AVAILABILITY_VERSION_TTL_SECONDS)
    }
    try {
      await pipeline.exec()
    } catch (error) {
      this.logger.warn(`availability cache invalidation failed: ${reasonOf(error)}`)
    }
  }

  invalidateWindows(tenantId: string, windows: DatedWindow[]): Promise<void> {
    const dates = new Set<string>()
    for (const window of windows) {
      for (const date of spannedDates(window.startsAt.getTime(), window.endsAt.getTime())) {
        dates.add(date)
      }
    }
    return this.invalidate(tenantId, [...dates])
  }
}
