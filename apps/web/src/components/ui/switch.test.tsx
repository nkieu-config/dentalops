import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Switch } from "./switch"

describe("Switch", () => {
  it("reports and changes its checked state", async () => {
    const onCheckedChange = vi.fn()
    render(<Switch checked={false} onCheckedChange={onCheckedChange} aria-label="Monday open" />)
    await userEvent.click(screen.getByRole("switch", { name: "Monday open" }))
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })
})
