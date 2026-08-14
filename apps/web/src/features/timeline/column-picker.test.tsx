import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ColumnPicker } from "./column-picker"

describe("ColumnPicker", () => {
  it("shows how many schedule columns are visible before the picker is opened", () => {
    render(
      <ColumnPicker
        columns={[
          { id: "dentist-a", name: "Dr. Anong" },
          { id: "dentist-b", name: "Dr. Boon" }
        ]}
        hidden={new Set(["dentist-b"])}
        onToggle={() => {}}
        onSetHidden={() => {}}
      />
    )

    expect(screen.getByRole("button", { name: "Columns · 1 of 2" })).toBeVisible()
  })

  it("offers reversible quick actions without hiding every column", async () => {
    const user = userEvent.setup()
    const onSetHidden = vi.fn()
    render(
      <ColumnPicker
        columns={[
          { id: "dentist-a", name: "Dr. Anong" },
          { id: "dentist-b", name: "Dr. Boon" },
          { id: "dentist-c", name: "Dr. Chai" }
        ]}
        hidden={new Set(["dentist-b"])}
        onToggle={() => {}}
        onSetHidden={onSetHidden}
      />
    )

    await user.click(screen.getByRole("button", { name: "Columns · 2 of 3" }))
    await user.click(screen.getByRole("button", { name: "Show all" }))
    expect(onSetHidden).toHaveBeenLastCalledWith(new Set())

    await user.click(screen.getByRole("button", { name: "Show first only" }))
    expect(onSetHidden).toHaveBeenLastCalledWith(new Set(["dentist-b", "dentist-c"]))
  })

  it("does not let the final visible column be hidden", async () => {
    const user = userEvent.setup()
    render(
      <ColumnPicker
        columns={[{ id: "dentist-a", name: "Dr. Anong" }]}
        hidden={new Set()}
        onToggle={() => {}}
        onSetHidden={() => {}}
      />
    )

    await user.click(screen.getByRole("button", { name: "Columns · 1 of 1" }))
    expect(screen.getByRole("checkbox", { name: "Dr. Anong" })).toBeDisabled()
  })
})
