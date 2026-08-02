import { INestApplication } from "@nestjs/common"
import request from "supertest"
import type { Server } from "node:http"
import { healthResponseSchema } from "@dentalops/contracts"
import { AuditService } from "../src/audit/audit.service"
import { HealthController } from "../src/health/health.controller"
import { createTestApp } from "./utils/test-app"

const withAudit = (enabled: boolean) =>
  new HealthController({ enabled } as AuditService).getHealth()

describe("GET /health", () => {
  let app: INestApplication
  let server: Server

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
  })

  afterAll(async () => {
    await app.close()
  })

  it("returns a payload matching the shared contract", async () => {
    const res = await request(server).get("/health").expect(200)
    expect(healthResponseSchema.safeParse(res.body).success).toBe(true)
  })

  it("reports the audit log as connected when mongo answered at boot", async () => {
    expect(app.get(AuditService).enabled).toBe(true)
    const res = await request(server).get("/health").expect(200)
    expect(healthResponseSchema.parse(res.body).auditLog).toBe("connected")
  })

  it("reports the audit log as disabled instead of degrading invisibly", () => {
    expect(withAudit(false).auditLog).toBe("disabled")
    expect(withAudit(true).auditLog).toBe("connected")
  })
})
