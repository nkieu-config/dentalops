import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ThemeToggle } from "./theme-toggle"

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove("dark")
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {}
  }))
})

describe("ThemeToggle", () => {
  it("says which theme is active and what pressing it will do", async () => {
    localStorage.setItem("dentalops-theme", "light")
    render(<ThemeToggle />)

    expect(screen.getByRole("button", { name: "Light theme. Switch to dark" })).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button"))
    expect(screen.getByRole("button", { name: "Dark theme. Switch to system" })).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button"))
    expect(screen.getByRole("button", { name: "System theme. Switch to light" })).toBeInTheDocument()
  })

  it("draws a different glyph for each state rather than one static face", async () => {
    localStorage.setItem("dentalops-theme", "light")
    const { container } = render(<ThemeToggle />)
    const glyph = () => container.querySelector("svg")?.innerHTML ?? ""

    const drawn = [glyph()]
    await userEvent.click(screen.getByRole("button"))
    drawn.push(glyph())
    await userEvent.click(screen.getByRole("button"))
    drawn.push(glyph())

    expect(drawn.every((markup) => markup.length > 0)).toBe(true)
    expect(new Set(drawn).size).toBe(3)
  })
})
