import { describe, expect, it } from "vitest"
import { holdIdSchema } from "../src/public"

describe("holdIdSchema", () => {
  it("accepts a redis hold id", () => {
    expect(holdIdSchema.safeParse("3f9619ff-8b86-4d01-b42d-00cf4fc964ff").success).toBe(true)
  })

  it("accepts a signed hold, which is what a redis outage hands back", () => {
    expect(
      holdIdSchema.safeParse("eyJhbGciOiJIUzI1NiJ9.eyJwdXJwb3NlIjoiaG9sZCJ9.qA-3_uZ0hSd").success
    ).toBe(true)
  })

  it("stays narrow enough that a public route is not an open string field", () => {
    for (const value of [
      "",
      "not-a-hold",
      "two.parts",
      "four.parts.are.wrong",
      "has spaces.in.it",
      "../../etc/passwd",
      `${"a".repeat(1025)}.b.c`
    ]) {
      expect(holdIdSchema.safeParse(value).success).toBe(false)
    }
  })
})
