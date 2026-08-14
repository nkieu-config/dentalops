import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { AppSelect } from "./app-select"

describe("AppSelect", () => {
  it("renders the field trigger as a premium inset surface", () => {
    render(
      <AppSelect
        aria-label="Branch"
        value="a"
        onValueChange={vi.fn()}
        options={[{ value: "a", label: "Ladprao" }]}
      />
    )

    const trigger = screen.getByRole("combobox", { name: "Branch" })
    expect(trigger).toHaveClass("bg-card", "shadow-[var(--shadow-select)]", "sm:h-10")
    expect(trigger).toHaveClass("data-[state=open]:border-primary")
    expect(trigger).toHaveClass("aria-invalid:border-destructive")
    expect(screen.getByTestId("select-indicator-well")).toHaveClass("bg-surface-subtle")
    expect(screen.getByTestId("select-chevron")).toHaveClass(
      "group-data-[state=open]:rotate-180"
    )
  })

  it("offers a pill-shaped toolbar trigger without changing select behavior", () => {
    render(
      <AppSelect
        variant="toolbar"
        aria-label="Branch"
        value="a"
        onValueChange={vi.fn()}
        options={[{ value: "a", label: "Ladprao" }]}
        prefix="Branch"
      />
    )

    expect(screen.getByRole("combobox", { name: "Branch" })).toHaveClass(
      "rounded-full",
      "[@media(pointer:coarse)]:h-11",
    )
    expect(screen.getByTestId("app-select-prefix")).toHaveTextContent("Branch")
    expect(screen.getByRole("combobox", { name: "Branch" })).toHaveTextContent("Branch·Ladprao")
  })

  it("keeps every option at a 44px mobile touch target", async () => {
    const user = userEvent.setup()
    render(
      <AppSelect
        aria-label="Branch"
        value="a"
        onValueChange={vi.fn()}
        options={[{ value: "a", label: "Ladprao" }]}
      />
    )

    await user.click(screen.getByRole("combobox", { name: "Branch" }))
    expect(screen.getByRole("option", { name: "Ladprao" }).className).toContain("min-h-11")
  })
})
