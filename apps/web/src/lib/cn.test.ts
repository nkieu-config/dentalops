import { describe, expect, it } from "vitest"
import { cn } from "./cn"

describe("cn", () => {
  it("resolves semantic type roles without treating them as text colors", () => {
    expect(cn("type-ui text-foreground", "type-body text-primary")).toBe(
      "type-body text-primary"
    )
  })
})
