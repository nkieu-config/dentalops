import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Sheet } from "./sheet"

describe("Sheet", () => {
  it("uses a generous bottom-sheet surface while retaining an accessible title", () => {
    render(
      <Sheet open onOpenChange={vi.fn()} title="Edit appointment" side="bottom">
        Details
      </Sheet>
    )

    expect(screen.getByRole("dialog", { name: "Edit appointment" }).className).toContain(
      "rounded-t-hero"
    )
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument()
  })

  it("lets a long title wrap without pushing the close action out of view", () => {
    render(
      <Sheet open onOpenChange={vi.fn()} title="A very long title that must remain contained in the sheet header">
        Details
      </Sheet>
    )

    expect(screen.getByRole("heading").className).toContain("min-w-0")
    expect(screen.getByRole("heading")).toHaveClass("type-dialog-title")
    expect(screen.getByRole("button", { name: "Close" }).className).toContain("shrink-0")
  })

  it("uses an adaptive mobile surface while retaining the desktop working sheet", () => {
    render(
      <Sheet open onOpenChange={vi.fn()} title="Completed appointment" mobileLayout="adaptive">
        Details
      </Sheet>
    )

    const dialog = screen.getByRole("dialog", { name: "Completed appointment" })
    expect(dialog).toHaveAttribute("data-sheet-layout", "adaptive")
    expect(dialog.className).toContain("bottom-0")
    expect(dialog.className).toContain("sm:inset-y-0")
  })

  it("contains wide form content inside the sheet instead of clipping its right edge", () => {
    render(
      <Sheet open onOpenChange={vi.fn()} title="New appointment" footer={<div>Long summary</div>}>
        <div className="min-w-max">Wide content</div>
      </Sheet>
    )

    const dialog = screen.getByRole("dialog", { name: "New appointment" })
    expect(dialog).toHaveClass("min-w-0", "overflow-hidden")
    expect(screen.getByTestId("sheet-scroller")).toHaveClass("min-w-0", "overflow-x-hidden")
    expect(screen.getByTestId("sheet-footer")).toHaveClass("min-w-0")
  })
})
