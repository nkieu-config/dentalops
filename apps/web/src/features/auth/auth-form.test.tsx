import { render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"
import { AuthCard, PasswordStrengthHint } from "./auth-form"

describe("AuthCard", () => {
  it("gives the screen one main landmark and one first level heading", () => {
    render(
      <MemoryRouter>
        <AuthCard page="signup" title="Create a clinic" subtitle="Two minutes, no card">
          <p>form goes here</p>
        </AuthCard>
      </MemoryRouter>
    )

    expect(screen.getByRole("main")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#auth-main")
    expect(screen.getByRole("heading", { level: 1, name: "Create a clinic" })).toBeInTheDocument()
    expect(screen.getByText("Two minutes, no card")).toBeInTheDocument()
    expect(screen.getByText("form goes here")).toBeInTheDocument()
  })

  it("offers the opposite door in the public nav, so neither page is a dead end", () => {
    render(
      <MemoryRouter>
        <AuthCard page="login" title="Sign in">
          <p>form goes here</p>
        </AuthCard>
      </MemoryRouter>
    )

    const nav = screen.getByRole("navigation", { name: "Public navigation" })
    expect(within(nav).getByRole("link", { name: "Create a clinic" })).toHaveAttribute("href", "/signup")
    expect(within(nav).queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument()
  })
})

describe("PasswordStrengthHint", () => {
  it("shows password feedback without interrupting every keystroke", () => {
    render(<PasswordStrengthHint password="correct-horse" />)

    expect(screen.getByText("Password strength: Good")).not.toHaveAttribute("aria-live")
  })
})
