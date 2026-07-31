import { describe, expect, it } from "vitest"
import { healthResponseSchema } from "../src/health"

describe("healthResponseSchema", () => {
  it("accepts a valid payload", () => {
    const parsed = healthResponseSchema.safeParse({
      status: "ok",
      version: "0.0.0",
      uptimeSeconds: 12
    })
    expect(parsed.success).toBe(true)
  })

  it("rejects an unknown status", () => {
    const parsed = healthResponseSchema.safeParse({
      status: "down",
      version: "0.0.0",
      uptimeSeconds: 12
    })
    expect(parsed.success).toBe(false)
  })

  it("rejects negative uptime", () => {
    const parsed = healthResponseSchema.safeParse({
      status: "ok",
      version: "0.0.0",
      uptimeSeconds: -1
    })
    expect(parsed.success).toBe(false)
  })
})
