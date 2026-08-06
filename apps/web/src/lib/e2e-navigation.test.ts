import { describe, expect, it } from "vitest"
import { nextMonday, recentWeekday } from "../../e2e/helpers"

describe("E2E date navigation", () => {
  it("derives the next Bangkok Monday from an injected clock", () => {
    expect(nextMonday(Date.parse("2026-08-03T00:00:00+07:00"))).toBe("2026-08-10")
  })

  it("derives a historic Bangkok Monday from an injected clock", () => {
    expect(recentWeekday(2, Date.parse("2026-08-17T00:00:00+07:00"))).toBe("2026-08-03")
  })
})
