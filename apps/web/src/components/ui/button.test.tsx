import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Button } from "./button"

describe("Button", () => {
  it("defaults to type=button so forms are not submitted by accident", () => {
    render(<Button>Go</Button>)
    expect(screen.getByRole("button", { name: "Go" })).toHaveAttribute("type", "button")
  })

  it("applies the destructive variant class", () => {
    render(<Button variant="destructive">Delete</Button>)
    expect(screen.getByRole("button", { name: "Delete" }).className).toContain("bg-destructive")
  })
})
