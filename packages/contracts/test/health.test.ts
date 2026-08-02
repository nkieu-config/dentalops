import { describe, expect, it } from "vitest"
import { healthResponseSchema } from "../src/health"

describe("healthResponseSchema", () => {
  it("accepts a valid payload", () => {
    const parsed = healthResponseSchema.safeParse({
      status: "ok",
      version: "0.0.0",
      uptimeSeconds: 12,
      auditLog: "connected"
    })
    expect(parsed.success).toBe(true)
  })

  it("requires the audit log state, so a silent no-op cannot pass unnoticed", () => {
    const missing = healthResponseSchema.safeParse({
      status: "ok",
      version: "0.0.0",
      uptimeSeconds: 12
    })
    expect(missing.success).toBe(false)

    const unknown = healthResponseSchema.safeParse({
      status: "ok",
      version: "0.0.0",
      uptimeSeconds: 12,
      auditLog: "maybe"
    })
    expect(unknown.success).toBe(false)
  })

  it("rejects an unknown status", () => {
    const parsed = healthResponseSchema.safeParse({
      status: "down",
      version: "0.0.0",
      uptimeSeconds: 12,
      auditLog: "connected"
    })
    expect(parsed.success).toBe(false)
  })

  it("rejects negative uptime", () => {
    const parsed = healthResponseSchema.safeParse({
      status: "ok",
      version: "0.0.0",
      uptimeSeconds: -1,
      auditLog: "connected"
    })
    expect(parsed.success).toBe(false)
  })
})
