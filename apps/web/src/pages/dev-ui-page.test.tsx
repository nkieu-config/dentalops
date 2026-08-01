import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { DevUiPage } from "./dev-ui-page"

describe("DevUiPage", () => {
  it("renders every status treatment across the six service hues", () => {
    render(<DevUiPage />)
    const gallery = within(screen.getByTestId("card-gallery"))

    expect(gallery.getAllByTestId(/^appt-/)).toHaveLength(24)
    expect(gallery.getAllByLabelText("Completed")).toHaveLength(6)
    expect(gallery.getAllByLabelText("No-show")).toHaveLength(6)

    const cancelled = gallery.getAllByLabelText("Cancelled")
    expect(cancelled).toHaveLength(6)
    expect(cancelled[0]!.closest("button")!.querySelector("span.line-through")).toHaveTextContent(
      "Cleaning"
    )
  })

  it("shows the overlapping fixture pair side by side in the TimeGrid section", () => {
    render(<DevUiPage />)
    const grid = within(screen.getByTestId("lane-grid"))

    const first = grid.getByTestId("appt-f0000000-0000-4000-8000-000000000101")
    const second = grid.getByTestId("appt-f0000000-0000-4000-8000-000000000102")
    const other = grid.getByTestId("appt-f0000000-0000-4000-8000-000000000103")

    expect(first.style.left).toBe("calc(0% + 2px)")
    expect(first.style.width).toBe("calc(50% - 4px)")
    expect(second.style.left).toBe("calc(50% + 2px)")
    expect(other.style.width).toBe("calc(100% - 4px)")
    expect(grid.getAllByTestId(/^col-/)).toHaveLength(2)
  })

  it("mounts the perf fixture across eight columns only after the button is pressed", async () => {
    render(<DevUiPage />)
    expect(screen.queryByTestId("perf-grid")).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Render 1,000 cards" }))

    const perf = within(screen.getByTestId("perf-grid"))
    expect(perf.getAllByTestId(/^col-/)).toHaveLength(8)
    expect(perf.getAllByTestId(/^appt-/).length).toBeGreaterThan(0)
  })

  it("names the components that arrive in later weeks", () => {
    render(<DevUiPage />)
    expect(
      screen.getByText("SlotPicker · CountdownBanner — W6 · ViolationList · ShiftBlock — W7")
    ).toBeInTheDocument()
  })
})
