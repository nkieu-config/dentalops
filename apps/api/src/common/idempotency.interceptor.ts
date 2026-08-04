import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor
} from "@nestjs/common"
import type { Request, Response } from "express"
import Redis from "ioredis"
import { Observable, of } from "rxjs"
import { tap } from "rxjs/operators"
import { currentTenant } from "../tenant/tenant-context"
import { REDIS } from "../redis/redis.module"
import { AppException } from "./app.exception"
import { DegradationLog } from "./degradation-log"

const TTL_SECONDS = 24 * 60 * 60

type Lock = "acquired" | "busy" | "unavailable"

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly outage = new DegradationLog(
    new Logger(IdempotencyInterceptor.name),
    "idempotency keys are unavailable, running requests without deduplication",
    "idempotency keys are honoured again"
  )

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<Request>()
    const res = context.switchToHttp().getResponse<Response>()
    const key = req.headers["idempotency-key"]
    if (!key || typeof key !== "string") return next.handle()

    const tenantId = currentTenant()?.tenantId ?? "anon"
    const storeKey = `idem:${tenantId}:${req.method}:${req.path}:${key}`

    const cached = await this.replay(storeKey)
    if (cached) {
      res.setHeader("x-idempotent-replay", "true")
      return of(cached.body)
    }

    const lock = await this.lock(storeKey)
    if (lock === "busy") {
      throw new AppException(409, "IDEMPOTENCY_IN_FLIGHT", "The same request is still being processed")
    }
    if (lock === "unavailable") return next.handle()

    return next.handle().pipe(
      tap({
        next: (body) => void this.store(storeKey, body),
        error: () => void this.unlock(storeKey)
      })
    )
  }

  private async replay(storeKey: string): Promise<{ body: unknown } | null> {
    try {
      const raw = await this.redis.get(storeKey)
      this.outage.clear()
      return raw ? (JSON.parse(raw) as { body: unknown }) : null
    } catch (error) {
      this.outage.report(error)
      return null
    }
  }

  private async lock(storeKey: string): Promise<Lock> {
    try {
      const acquired = await this.redis.set(`${storeKey}:lock`, "1", "EX", 30, "NX")
      this.outage.clear()
      return acquired ? "acquired" : "busy"
    } catch (error) {
      this.outage.report(error)
      return "unavailable"
    }
  }

  private async store(storeKey: string, body: unknown): Promise<void> {
    try {
      await this.redis.set(storeKey, JSON.stringify({ body }), "EX", TTL_SECONDS)
      await this.redis.del(`${storeKey}:lock`)
      this.outage.clear()
    } catch (error) {
      this.outage.report(error)
    }
  }

  private async unlock(storeKey: string): Promise<void> {
    try {
      await this.redis.del(`${storeKey}:lock`)
      this.outage.clear()
    } catch (error) {
      this.outage.report(error)
    }
  }
}
