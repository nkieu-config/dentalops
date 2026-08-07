import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"
import { API, http, HttpResponse, server } from "../test/msw"
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

  it("carries no chrome that would take the first tab stop from the demo buttons", () => {
    mount()

    expect(screen.queryByRole("button", { name: /theme/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("banner")).not.toBeInTheDocument()
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

  it("keeps the owner demo hint fully legible on its primary surface", () => {
    mount()

    const hint = screen.getByText("Full control — roster, settings, reports")
    expect(hint).toHaveClass("text-primary-foreground")
    expect(hint).not.toHaveClass("opacity-80")
  })

  it("replaces unavailable demo roles with a recovery state while keeping clinic doors available", async () => {
    server.use(
      http.post(`${API}/auth/demo-login`, () =>
        HttpResponse.json(
          { statusCode: 503, errorCode: "SERVICE_UNAVAILABLE", message: "Demo is unavailable" },
          { status: 503 }
        )
      )
    )
    const user = userEvent.setup()
    mount()

    await user.click(screen.getByRole("button", { name: /Try as Owner/ }))

    expect(
      await screen.findByRole("heading", { name: "Interactive demo is temporarily unavailable" })
    ).toBeVisible()
    expect(screen.queryByRole("button", { name: /Try as Owner/ })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Try demo again" })).toBeVisible()
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login")
    expect(screen.getByRole("link", { name: "Create a clinic" })).toHaveAttribute("href", "/signup")
  })
})
