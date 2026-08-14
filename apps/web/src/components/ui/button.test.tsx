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

  it("gives every size a 44px touch target below the sm breakpoint", () => {
    const { rerender } = render(<Button size="default">A</Button>)
    expect(screen.getByRole("button").className).toContain("h-11")

    rerender(<Button size="icon">B</Button>)
    expect(screen.getByRole("button").className).toContain("h-11")
    expect(screen.getByRole("button").className).toContain("w-11")
  })

  it("presses inward rather than shifting layout", () => {
    render(<Button>Press</Button>)
    const className = screen.getByRole("button").className
    expect(className).toContain("active:scale-[0.97]")
    expect(className).toContain("transform")
  })

  it("draws its focus ring against the themed background, not Tailwind's white default", () => {
    render(<Button>Focus</Button>)
    expect(screen.getByRole("button").className).toContain("focus-visible:ring-offset-background")
    expect(screen.getByRole("button").className).toContain("rounded-control")
  })

  it("uses touch manipulation to make mobile taps immediate", () => {
    render(<Button>Tap</Button>)
    expect(screen.getByRole("button", { name: "Tap" }).className).toContain("touch-manipulation")
  })

  it("keeps default and small controls on the readable UI text role", () => {
    const { rerender } = render(<Button>Default</Button>)
    expect(screen.getByRole("button")).toHaveClass("type-ui")

    rerender(<Button size="sm">Small</Button>)
    expect(screen.getByRole("button")).toHaveClass("type-ui")
    expect(screen.getByRole("button")).not.toHaveClass("text-xs")
  })
})
