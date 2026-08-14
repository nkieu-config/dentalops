import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { WorkspaceHeaderSurface } from "./workspace-header-surface"

describe("WorkspaceHeaderSurface", () => {
  it("renders one opaque rounded surface without creating another landmark", () => {
    render(<WorkspaceHeaderSurface data-testid="workspace-surface">Controls</WorkspaceHeaderSurface>)

    const surface = screen.getByTestId("workspace-surface")
    expect(surface).toHaveClass("rounded-hero")
    expect(surface).toHaveClass("border-border")
    expect(surface).toHaveClass("bg-card")
    expect(surface).toHaveClass("shadow-[var(--shadow-workspace-header)]")
    expect(surface).not.toHaveAttribute("role")
  })
})
