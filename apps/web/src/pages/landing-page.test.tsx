import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"
import { LandingPage } from "./landing-page"

const DEMO_LABELS = ["Try as Owner", "Try as Receptionist", "Try as Dentist"]

const mount = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/"]}>
        <LandingPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe("LandingPage", () => {
  it("offers a door to an existing clinic and a door to a new one", () => {
    mount()

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login")
    expect(screen.getByRole("link", { name: "Create a clinic" })).toHaveAttribute("href", "/signup")
    expect(screen.getByText(/Already have a clinic\?/)).toBeInTheDocument()
  })

  it("keeps the three demo buttons first in the accessibility tree", () => {
    mount()

    const buttons = screen.getAllByRole("button")
    expect(buttons).toHaveLength(DEMO_LABELS.length)
    DEMO_LABELS.forEach((label, index) => expect(buttons[index]).toHaveTextContent(label))

    const last = buttons.at(-1)
    expect(last).toBeDefined()
    for (const link of screen.getAllByRole("link")) {
      expect(
        last!.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    }
  })

  it("keeps the demo buttons primary and the two doors secondary", () => {
    mount()

    const owner = screen.getByRole("button", { name: /Try as Owner/ })
    expect(owner.className).toContain("bg-primary")
    for (const label of DEMO_LABELS) {
      expect(screen.getByRole("button", { name: new RegExp(label) }).tagName).toBe("BUTTON")
    }
    for (const name of ["Sign in", "Create a clinic"]) {
      const link = screen.getByRole("link", { name })
      expect(link.className).not.toContain("bg-primary")
      expect(link.className).not.toContain("bg-secondary")
    }
  })
})
