import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Badge } from "./badge"
import { Label } from "./label"

describe("typography primitives", () => {
  it("uses UI text for field labels and metadata text for badges", () => {
    render(
      <>
        <Label htmlFor="name">Patient name</Label>
        <input id="name" />
        <Badge>Confirmed</Badge>
      </>
    )

    expect(screen.getByText("Patient name")).toHaveClass("type-ui")
    expect(screen.getByText("Patient name")).not.toHaveClass("uppercase", "tracking-wide")
    expect(screen.getByText("Confirmed")).toHaveClass("type-meta")
  })
})
