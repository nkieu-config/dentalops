import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { SegmentedControl } from "./segmented-control"

describe("SegmentedControl", () => {
  it("exposes named mutually exclusive choices", async () => {
    const onValueChange = vi.fn()
    render(
      <SegmentedControl
        ariaLabel="Schedule view"
        value="day"
        onValueChange={onValueChange}
        options={[{ value: "day", label: "Day" }, { value: "agenda", label: "Agenda" }]}
      />
    )

    await userEvent.click(screen.getByRole("radio", { name: "Agenda" }))
    expect(onValueChange).toHaveBeenCalledWith("agenda")
  })
})
