import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common"
import type { Request } from "express"
import { Observable } from "rxjs"
import { finalize } from "rxjs/operators"
import { LatencyRegistry } from "./latency.registry"

@Injectable()
export class LatencyInterceptor implements NestInterceptor {
  constructor(private readonly registry: LatencyRegistry) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>()
    const route = `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}`
    const startedAt = performance.now()
    return next
      .handle()
      .pipe(finalize(() => this.registry.record(route, performance.now() - startedAt)))
  }
}
