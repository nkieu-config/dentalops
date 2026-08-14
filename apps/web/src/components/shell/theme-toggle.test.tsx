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
  it("shows the active theme and lets people choose a specific preference", async () => {
    localStorage.setItem("dentalops-theme", "light")
    render(<ThemeToggle />)

    await userEvent.click(screen.getByRole("button", { name: "Theme: Light" }))
    expect(screen.getByRole("menuitemradio", { name: "Light" })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute("aria-checked", "false")

    await userEvent.click(screen.getByRole("menuitemradio", { name: "Dark" }))
    expect(localStorage.getItem("dentalops-theme")).toBe("dark")
  })

  it("draws a different glyph for each state rather than one static face", async () => {
    localStorage.setItem("dentalops-theme", "light")
    const { container } = render(<ThemeToggle />)
    const glyph = () => container.querySelector("svg")?.innerHTML ?? ""

    const drawn = [glyph()]
    await userEvent.click(screen.getByRole("button", { name: "Theme: Light" }))
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Dark" }))
    drawn.push(glyph())
    await userEvent.click(screen.getByRole("button", { name: "Theme: Dark" }))
    await userEvent.click(screen.getByRole("menuitemradio", { name: "System" }))
    drawn.push(glyph())

    expect(drawn.every((markup) => markup.length > 0)).toBe(true)
    expect(new Set(drawn).size).toBe(3)
  })
})
