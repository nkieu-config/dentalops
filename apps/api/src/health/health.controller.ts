import { Controller, Get } from "@nestjs/common"
import type { HealthResponse } from "@dentalops/contracts"
import { SkipThrottle } from "@nestjs/throttler"
import { AuditService } from "../audit/audit.service"
import { Public } from "../auth/public.decorator"

const startedAt = Date.now()

@SkipThrottle()
@Controller("health")
export class HealthController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Public()
  getHealth(): HealthResponse {
    return {
      status: "ok",
      version: process.env.APP_VERSION ?? "0.0.0",
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      auditLog: this.audit.enabled ? "connected" : "disabled"
    }
  }
}
