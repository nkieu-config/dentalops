import { Inject, Injectable, Logger } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import { randomUUID } from "node:crypto"
import Redis from "ioredis"
import { AppException } from "../common/app.exception"
import { DegradationLog } from "../common/degradation-log"
import { REDIS } from "../redis/redis.module"
import { currentTenant, TenantContextData } from "../tenant/tenant-context"
import { isSignedHold } from "./hold-id"
import { ACQUIRE_HOLD, RELEASE_HOLD } from "./hold.lua"
import { secretFor } from "../auth/token-secrets"

export const HOLD_TTL_SECONDS = 300
export const SLOT_MS = 900_000
export const HOLD_PURPOSE = "hold"

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

interface SignedHoldClaims {
  sub: string
  purpose: string
  tenantId: string
  dentistId: string
  serviceId: string
  branchId: string
  startsAt: string
  endsAt: string
}

type Reservation = "held" | "taken" | "unavailable"

@Injectable()
export class HoldsService {
  private readonly outage = new DegradationLog(
    new Logger(HoldsService.name),
    "slot holds are unavailable, booking without a reservation",
    "slot holds are reserved again"
  )

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly jwt: JwtService
  ) {}

  async acquire(input: AcquireHoldInput): Promise<{ holdId: string; expiresAt: string }> {
    const { tenantId } = this.tenant()
    const startMs = Date.parse(input.startsAt)
    if (Number.isNaN(startMs)) {
      throw new AppException(400, "INVALID_RANGE", "startsAt must be a valid timestamp")
    }
    const endMs = startMs + input.durationMin * 60_000

    const record: HoldRecord = {
      holdId: randomUUID(),
      tenantId,
      dentistId: input.dentistId,
      serviceId: input.serviceId,
      branchId: input.branchId,
      startsAt: new Date(startMs).toISOString(),
      endsAt: new Date(endMs).toISOString(),
      slotIndexes: spannedSlotIndexes(startMs, endMs)
    }

    const reservation = await this.reserve(record)
    if (reservation === "taken") {
      throw new AppException(409, "SLOT_HELD", "Someone else is booking that time right now")
    }

    const expiresAt = new Date(Date.now() + HOLD_TTL_SECONDS * 1000).toISOString()
    if (reservation === "unavailable") return { holdId: await this.sign(record), expiresAt }
    return { holdId: record.holdId, expiresAt }
  }

  async read(holdId: string): Promise<HoldRecord | null> {
    if (isSignedHold(holdId)) return this.readSigned(holdId)
    try {
      const raw = await this.redis.get(holdKey(holdId))
      this.outage.clear()
      return raw ? (JSON.parse(raw) as HoldRecord) : null
    } catch (error) {
      this.outage.report(error)
      return null
    }
  }

  async release(holdId: string): Promise<void> {
    if (isSignedHold(holdId)) return
    const { tenantId } = this.tenant()
    const record = await this.read(holdId)
    if (!record || record.tenantId !== tenantId) return
    const keys = record.slotIndexes.map((index) => slotKey(tenantId, record.dentistId, index))
    try {
      if (keys.length > 0) await this.redis.eval(RELEASE_HOLD, keys.length, ...keys, holdId)
      await this.redis.del(holdKey(holdId))
      this.outage.clear()
    } catch (error) {
      this.outage.report(error)
    }
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

    let values: Array<string | null>
    try {
      values = await this.redis.mget(keys)
      this.outage.clear()
    } catch (error) {
      this.outage.report(error)
      return held
    }

    values.forEach((value, position) => {
      const owner = owners[position]
      if (!owner || !value || value === exceptHoldId) return
      const indexes = held.get(owner.dentistId) ?? new Set<number>()
      indexes.add(owner.index)
      held.set(owner.dentistId, indexes)
    })
    return held
  }

  private async reserve(record: HoldRecord): Promise<Reservation> {
    const keys = record.slotIndexes.map((index) => slotKey(record.tenantId, record.dentistId, index))
    try {
      const acquired = await this.redis.eval(
        ACQUIRE_HOLD,
        keys.length,
        ...keys,
        record.holdId,
        String(HOLD_TTL_SECONDS)
      )
      if (acquired === 1) {
        await this.redis.set(holdKey(record.holdId), JSON.stringify(record), "EX", HOLD_TTL_SECONDS)
      }
      this.outage.clear()
      return acquired === 1 ? "held" : "taken"
    } catch (error) {
      this.outage.report(error)
      return "unavailable"
    }
  }

  private sign(record: HoldRecord): Promise<string> {
    return this.jwt.signAsync(
      {
        sub: record.holdId,
        purpose: HOLD_PURPOSE,
        tenantId: record.tenantId,
        dentistId: record.dentistId,
        serviceId: record.serviceId,
        branchId: record.branchId,
        startsAt: record.startsAt,
        endsAt: record.endsAt
      },
      { secret: secretFor("hold"), expiresIn: HOLD_TTL_SECONDS }
    )
  }

  private async readSigned(token: string): Promise<HoldRecord | null> {
    let claims: SignedHoldClaims
    try {
      claims = await this.jwt.verifyAsync<SignedHoldClaims>(token, {
        secret: secretFor("hold")
      })
    } catch {
      return null
    }
    if (claims.purpose !== HOLD_PURPOSE) return null

    const { sub, tenantId, dentistId, serviceId, branchId, startsAt, endsAt } = claims
    const fields = [sub, tenantId, dentistId, serviceId, branchId, startsAt, endsAt]
    if (fields.some((field) => typeof field !== "string" || field.length === 0)) return null

    const startMs = Date.parse(startsAt)
    const endMs = Date.parse(endsAt)
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null

    return {
      holdId: sub,
      tenantId,
      dentistId,
      serviceId,
      branchId,
      startsAt,
      endsAt,
      slotIndexes: spannedSlotIndexes(startMs, endMs)
    }
  }

  private tenant(): TenantContextData {
    const ctx = currentTenant()
    if (!ctx) throw new AppException(404, "CLINIC_NOT_FOUND", "Clinic not found")
    return ctx
  }
}
