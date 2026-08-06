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
      "rounded-t-2xl"
    )
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument()
  })
})
