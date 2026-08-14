import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { AppSelect } from "./app-select"
import { Button } from "./button"
import { Checkbox } from "./checkbox"
import { Input } from "./input"
import { disabledControl, focusRing } from "./focus-ring"

const renderControls = () =>
  render(
    <>
      <Button>Save</Button>
      <Input aria-label="Name" />
      <Checkbox aria-label="Repeat" />
      <AppSelect
        aria-label="Role"
        value="dentist"
        onValueChange={() => {}}
        options={[{ value: "dentist", label: "Dentist" }]}
      />
    </>
  )

const controls = () => [
  screen.getByRole("button", { name: "Save" }),
  screen.getByLabelText("Name"),
  screen.getByLabelText("Repeat"),
  screen.getByLabelText("Role")
]

describe("the shared control contract", () => {
  it("gives everything that sits in a form row one height at every pointer", () => {
    renderControls()

    for (const control of [
      screen.getByRole("button", { name: "Save" }),
      screen.getByLabelText("Name"),
      screen.getByLabelText("Role")
    ]) {
      expect(control).toHaveClass("h-11")
      expect(control).toHaveClass("sm:h-10")
      expect(control).toHaveClass("[@media(pointer:coarse)]:h-11")
    }
  })

  it("draws one focus ring, so tabbing between controls does not change its geometry", () => {
    renderControls()
    for (const control of controls()) {
      for (const token of focusRing.split(" ")) expect(control).toHaveClass(token)
    }
  })

  it("says disabled the same way everywhere", () => {
    renderControls()
    for (const control of controls()) {
      for (const token of disabledControl.split(" ")) expect(control).toHaveClass(token)
    }
  })

  it("never blocks pointer events on a disabled control, so its title can still explain why", () => {
    render(
      <Button disabled title="You are offline">
        Save shift
      </Button>
    )

    const button = screen.getByRole("button", { name: "Save shift" })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("title", "You are offline")
    expect(button.className).not.toContain("pointer-events-none")
  })
})
