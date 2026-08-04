import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common"
import type { Request } from "express"
import { Observable, tap } from "rxjs"
import { currentTenant } from "../tenant/tenant-context"
import { auditActor, AuditService } from "./audit.service"

const MUTATIONS = new Set(["POST", "PATCH", "PUT", "DELETE"])
const SILENT = [/^\/auth\//, /^\/internal\//]
const GLOBAL_PREFIX = /^\/api\/v1(?=\/|$)/

const stripPrefix = (path: string): string => path.replace(GLOBAL_PREFIX, "")

const resolveEntityId = (body: unknown, params: Request["params"]): string => {
  const top = (body as { id?: unknown } | null)?.id
  if (typeof top === "string") return top
  const nested = (body as { appointment?: { id?: unknown } } | null)?.appointment?.id
  if (typeof nested === "string") return nested
  return typeof params.id === "string" ? params.id : ""
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { id?: string }>()
    const path = stripPrefix(req.route?.path ?? req.path)
    if (!MUTATIONS.has(req.method) || SILENT.some((silent) => silent.test(stripPrefix(req.path)))) {
      return next.handle()
    }

    return next.handle().pipe(
      tap((body: unknown) => {
        const tenant = currentTenant()
        if (!tenant) return
        this.audit.record({
          tenantId: tenant.tenantId,
          actor: auditActor(),
          action: `${req.method} ${path}`,
          entity: { type: path.split("/")[1] ?? "unknown", id: resolveEntityId(body, req.params) },
          after: body ?? undefined,
          requestId: req.id ?? ""
        })
      })
    )
  }
}
