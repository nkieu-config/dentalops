import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common"
import type { Request } from "express"
import { Observable, tap } from "rxjs"
import { currentTenant } from "../tenant/tenant-context"
import { auditActor, AuditService } from "./audit.service"

const MUTATIONS = new Set(["POST", "PATCH", "PUT", "DELETE"])
const SILENT = [/^\/auth\//, /^\/internal\//]

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { id?: string }>()
    const path = req.route?.path ?? req.path
    if (!MUTATIONS.has(req.method) || SILENT.some((silent) => silent.test(req.path))) {
      return next.handle()
    }

    return next.handle().pipe(
      tap((body: unknown) => {
        const tenant = currentTenant()
        if (!tenant) return
        const entityId =
          (body as { id?: string } | null)?.id ?? (req.params.id as string | undefined) ?? ""
        this.audit.record({
          tenantId: tenant.tenantId,
          actor: auditActor(),
          action: `${req.method} ${path}`,
          entity: { type: path.split("/")[1] ?? "unknown", id: entityId },
          after: body ?? undefined,
          requestId: req.id ?? ""
        })
      })
    )
  }
}
