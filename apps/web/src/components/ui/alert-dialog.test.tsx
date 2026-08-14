import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Toaster } from "sonner"
import { describe, expect, it, vi } from "vitest"
import { ApiError } from "../../lib/api"
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
    expect(screen.getByRole("heading", { name: "Cancel appointment?" })).toHaveClass(
      "type-dialog-title"
    )
  })

  it("uses a non-destructive treatment for a reversible confirmation", () => {
    render(
      <AlertDialog
        open
        onOpenChange={vi.fn()}
        title="Complete appointment?"
        description="Mark this visit as completed."
        confirmLabel="Complete appointment"
        confirmVariant="default"
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByRole("button", { name: "Complete appointment" })).toHaveClass("bg-primary")
    expect(screen.getByRole("button", { name: "Complete appointment" })).not.toHaveClass(
      "bg-destructive"
    )
  })

  it("keeps the dialog open and surfaces the error when the confirmed action fails", async () => {
    const onOpenChange = vi.fn()
    const onConfirm = vi.fn(async () => {
      throw new ApiError(409, "IN_USE", "This branch still has upcoming bookings")
    })
    const user = userEvent.setup()
    render(
      <>
        <AlertDialog
          open
          onOpenChange={onOpenChange}
          title="Deactivate branch?"
          description="Existing booking history stays intact."
          confirmLabel="Deactivate"
          onConfirm={onConfirm}
        />
        <Toaster />
      </>
    )

    await user.click(screen.getByRole("button", { name: "Deactivate" }))

    expect(await screen.findByText("This branch still has upcoming bookings")).toBeInTheDocument()
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(await screen.findByRole("button", { name: "Deactivate" })).toBeInTheDocument()
  })

  it("closes only after the confirmed action succeeds", async () => {
    const onOpenChange = vi.fn()
    const onConfirm = vi.fn(async () => {})
    const user = userEvent.setup()
    render(
      <AlertDialog
        open
        onOpenChange={onOpenChange}
        title="Deactivate branch?"
        description="Existing booking history stays intact."
        confirmLabel="Deactivate"
        onConfirm={onConfirm}
      />
    )

    await user.click(screen.getByRole("button", { name: "Deactivate" }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
