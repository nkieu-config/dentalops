import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Badge } from "./badge"

describe("Badge", () => {
  it("defaults to the neutral tone", () => {
    render(<Badge>Draft</Badge>)
    expect(screen.getByText("Draft").className).toContain("bg-secondary")
  })

  it.each([
    ["success", "bg-success-surface", "text-success-on-surface"],
    ["warning", "bg-warning-surface", "text-warning-on-surface"],
    ["destructive", "bg-destructive-surface", "text-destructive-on-surface"],
    ["decorative", "bg-decorative-surface", "text-decorative-on-surface"]
  ] as const)("reads %s from its verified surface pair", (tone, surface, onSurface) => {
    render(<Badge tone={tone}>{tone}</Badge>)
    const className = screen.getByText(tone).className
    expect(className).toContain(surface)
    expect(className).toContain(onSurface)
  })

  it("never mixes a semantic surface with opacity, which no contrast check can verify", () => {
    for (const tone of ["success", "warning", "destructive", "decorative"] as const) {
      const { unmount } = render(<Badge tone={tone}>{tone}</Badge>)
      expect(screen.getByText(tone).className).not.toMatch(/bg-(success|warning|destructive|decorative)\//)
      unmount()
    }
  })
})
