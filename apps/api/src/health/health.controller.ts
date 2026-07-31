import { Controller, Get } from "@nestjs/common"
import type { HealthResponse } from "@dentalops/contracts"

const startedAt = Date.now()

@Controller("health")
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return {
      status: "ok",
      version: process.env.APP_VERSION ?? "0.0.0",
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000)
    }
  }
}
