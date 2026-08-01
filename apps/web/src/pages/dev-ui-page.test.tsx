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

  it("gives the dragged preview the only shadow and dims the card it came from", () => {
    render(<DevUiPage />)
    const states = within(screen.getByTestId("card-states"))

    const preview = states.getByTestId("drag-preview")
    expect(preview.className).toContain("shadow-lg")
    expect(preview.className).toContain("pointer-events-none")
    expect(states.getByTestId("appt-f0000000-0000-4000-8000-000000000200").className).toContain(
      "opacity-40"
    )
    expect(states.queryAllByTestId(/^appt-/).filter((el) => el.className.includes("shadow"))).toEqual(
      []
    )
  })

  it("marks the conflict card with a destructive ring and a warning icon", () => {
    render(<DevUiPage />)
    const states = within(screen.getByTestId("card-states"))

    const conflict = states.getByTestId("appt-f0000000-0000-4000-8000-000000000201")
    expect(conflict.className).toContain("ring-2")
    expect(conflict.className).toContain("ring-destructive")
    expect(within(conflict).getByLabelText("Conflict")).toBeInTheDocument()
  })

  it("renders the SlotPicker loading, populated and empty states without a server", () => {
    render(<DevUiPage />)

    expect(within(screen.getByTestId("slots-loading")).getAllByTestId("slot-skeleton")).toHaveLength(
      8
    )

    const available = within(screen.getByTestId("slots-available"))
    expect(available.getAllByTestId("slot")).toHaveLength(4)
    expect(within(available.getByTestId("group-morning")).getAllByRole("button")).toHaveLength(2)
    expect(within(available.getByTestId("group-afternoon")).getAllByRole("button")).toHaveLength(2)
    expect(available.getByRole("button", { name: "13:00" })).toBeInTheDocument()

    const none = within(screen.getByTestId("slots-none"))
    expect(none.getByText("No free slots this day")).toBeInTheDocument()
    expect(none.queryAllByTestId("slot")).toHaveLength(0)
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
      screen.getByText("CountdownBanner — W6 · ViolationList · ShiftBlock — W7")
    ).toBeInTheDocument()
  })
})
