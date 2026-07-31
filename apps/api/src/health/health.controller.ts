import { Controller, Get } from "@nestjs/common"
import type { HealthResponse } from "@dentalops/contracts"
import { Public } from "../auth/public.decorator"

const startedAt = Date.now()

@Controller("health")
export class HealthController {
  @Get()
  @Public()
  getHealth(): HealthResponse {
    return {
      status: "ok",
      version: process.env.APP_VERSION ?? "0.0.0",
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000)
    }
  }
}
