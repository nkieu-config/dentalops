import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AlertDialog } from "./alert-dialog"

describe("AlertDialog", () => {
  it("places the safe action before the destructive confirmation", () => {
    render(
      <AlertDialog
        open
        onOpenChange={vi.fn()}
        title="Cancel appointment?"
        description="Booking history will be retained."
        cancelLabel="Keep appointment"
        confirmLabel="Cancel appointment"
        onConfirm={vi.fn()}
      />
    )

    const buttons = screen.getAllByRole("button").map((button) => button.textContent)
    expect(buttons.indexOf("Keep appointment")).toBeLessThan(buttons.indexOf("Cancel appointment"))
  })
})
