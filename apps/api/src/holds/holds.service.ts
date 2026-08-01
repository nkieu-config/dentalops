import { Inject, Injectable } from "@nestjs/common"
import { randomUUID } from "node:crypto"
import Redis from "ioredis"
import { AppException } from "../common/app.exception"
import { REDIS } from "../redis/redis.module"
import { currentTenant, TenantContextData } from "../tenant/tenant-context"
import { ACQUIRE_HOLD, RELEASE_HOLD } from "./hold.lua"

export const HOLD_TTL_SECONDS = 300
export const SLOT_MS = 900_000

export const slotKey = (tenantId: string, dentistId: string, slotIndex: number) =>
  `hold:${tenantId}:${dentistId}:${slotIndex}`

export const holdKey = (holdId: string) => `hold:${holdId}`

export const spannedSlotIndexes = (startMs: number, endMs: number): number[] => {
  const first = Math.floor(startMs / SLOT_MS)
  const last = Math.ceil(endMs / SLOT_MS) - 1
  const indexes: number[] = []
  for (let index = first; index <= last; index++) indexes.push(index)
  return indexes
}

export interface AcquireHoldInput {
  dentistId: string
  serviceId: string
  branchId: string
  startsAt: string
  durationMin: number
}

export interface HoldRecord {
  holdId: string
  tenantId: string
  dentistId: string
  serviceId: string
  branchId: string
  startsAt: string
  endsAt: string
  slotIndexes: number[]
}

@Injectable()
export class HoldsService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async acquire(input: AcquireHoldInput): Promise<{ holdId: string; expiresAt: string }> {
    const { tenantId } = this.tenant()
    const startMs = Date.parse(input.startsAt)
    if (Number.isNaN(startMs)) {
      throw new AppException(400, "INVALID_RANGE", "startsAt must be a valid timestamp")
    }
    const endMs = startMs + input.durationMin * 60_000
    const slotIndexes = spannedSlotIndexes(startMs, endMs)
    const keys = slotIndexes.map((index) => slotKey(tenantId, input.dentistId, index))
    const holdId = randomUUID()

    const acquired = await this.redis.eval(
      ACQUIRE_HOLD,
      keys.length,
      ...keys,
      holdId,
      String(HOLD_TTL_SECONDS)
    )
    if (acquired !== 1) {
      throw new AppException(409, "SLOT_HELD", "Someone else is booking that time right now")
    }

    const record: HoldRecord = {
      holdId,
      tenantId,
      dentistId: input.dentistId,
      serviceId: input.serviceId,
      branchId: input.branchId,
      startsAt: new Date(startMs).toISOString(),
      endsAt: new Date(endMs).toISOString(),
      slotIndexes
    }
    await this.redis.set(holdKey(holdId), JSON.stringify(record), "EX", HOLD_TTL_SECONDS)

    return { holdId, expiresAt: new Date(Date.now() + HOLD_TTL_SECONDS * 1000).toISOString() }
  }

  async read(holdId: string): Promise<HoldRecord | null> {
    const raw = await this.redis.get(holdKey(holdId))
    if (!raw) return null
    return JSON.parse(raw) as HoldRecord
  }

  async release(holdId: string): Promise<void> {
    const { tenantId } = this.tenant()
    const record = await this.read(holdId)
    if (!record || record.tenantId !== tenantId) return
    const keys = record.slotIndexes.map((index) => slotKey(tenantId, record.dentistId, index))
    if (keys.length > 0) await this.redis.eval(RELEASE_HOLD, keys.length, ...keys, holdId)
    await this.redis.del(holdKey(holdId))
  }

  async heldSlotIndexes(
    dentistIds: string[],
    fromMs: number,
    toMs: number,
    exceptHoldId?: string
  ): Promise<Map<string, Set<number>>> {
    const held = new Map<string, Set<number>>()
    const first = Math.floor(fromMs / SLOT_MS)
    const last = Math.ceil(toMs / SLOT_MS) - 1
    if (dentistIds.length === 0 || last < first) return held

    const { tenantId } = this.tenant()
    const keys: string[] = []
    const owners: Array<{ dentistId: string; index: number }> = []
    for (const dentistId of dentistIds) {
      for (let index = first; index <= last; index++) {
        keys.push(slotKey(tenantId, dentistId, index))
        owners.push({ dentistId, index })
      }
    }

    const values = await this.redis.mget(keys)
    values.forEach((value, position) => {
      const owner = owners[position]
      if (!owner || !value || value === exceptHoldId) return
      const indexes = held.get(owner.dentistId) ?? new Set<number>()
      indexes.add(owner.index)
      held.set(owner.dentistId, indexes)
    })
    return held
  }

  private tenant(): TenantContextData {
    const ctx = currentTenant()
    if (!ctx) throw new AppException(404, "CLINIC_NOT_FOUND", "Clinic not found")
    return ctx
  }
}
