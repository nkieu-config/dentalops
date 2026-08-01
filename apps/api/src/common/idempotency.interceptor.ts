import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from "@nestjs/common"
import type { Request, Response } from "express"
import Redis from "ioredis"
import { Observable, of } from "rxjs"
import { tap } from "rxjs/operators"
import { currentTenant } from "../tenant/tenant-context"
import { REDIS } from "../redis/redis.module"
import { AppException } from "./app.exception"

const TTL_SECONDS = 24 * 60 * 60

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<Request>()
    const res = context.switchToHttp().getResponse<Response>()
    const key = req.headers["idempotency-key"]
    if (!key || typeof key !== "string") return next.handle()

    const tenantId = currentTenant()?.tenantId ?? "anon"
    const storeKey = `idem:${tenantId}:${req.method}:${req.path}:${key}`

    const cached = await this.redis.get(storeKey)
    if (cached) {
      const { status, body } = JSON.parse(cached) as { status: number; body: unknown }
      res.setHeader("x-idempotent-replay", "true")
      res.status(status)
      return of(body)
    }

    const lock = await this.redis.set(`${storeKey}:lock`, "1", "EX", 30, "NX")
    if (!lock) {
      throw new AppException(409, "IDEMPOTENCY_IN_FLIGHT", "The same request is still being processed")
    }

    return next.handle().pipe(
      tap({
        next: (body) => {
          void this.redis
            .set(storeKey, JSON.stringify({ status: res.statusCode, body }), "EX", TTL_SECONDS)
            .then(() => this.redis.del(`${storeKey}:lock`))
        },
        error: () => {
          void this.redis.del(`${storeKey}:lock`)
        }
      })
    )
  }
}
