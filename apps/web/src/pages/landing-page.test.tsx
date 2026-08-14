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

    expect(screen.getAllByRole("link", { name: "Sign in" })[0]).toHaveAttribute("href", "/login")
    expect(screen.getAllByRole("link", { name: "Create a clinic" })[0]).toHaveAttribute("href", "/signup")
    expect(screen.getByText(/Already have a clinic\?/)).toBeInTheDocument()
  })

  it("keeps the conversion path clear before offering role-specific demo entry", () => {
    mount()

    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#main")
    expect(screen.getByRole("navigation", { name: "Public navigation" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Try the demo" })).toBeInTheDocument()
    DEMO_LABELS.forEach((label) => expect(screen.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument())
  })

  it("keeps public navigation keyboard-visible", () => {
    mount()

    expect(screen.getByRole("link", { name: "Explore demo" }).className).toContain("focus-visible:ring-2")
  })

  it("keeps the demo buttons primary alongside real create-a-clinic CTAs, with sign-in secondary", () => {
    mount()

    const owner = screen.getByRole("button", { name: /Try as Owner/ })
    expect(owner.className).toContain("bg-primary")
    for (const label of DEMO_LABELS) {
      expect(screen.getByRole("button", { name: new RegExp(label) }).tagName).toBe("BUTTON")
    }

    const navCreate = screen.getAllByRole("link", { name: "Create a clinic" })[0]
    expect(navCreate?.className).toContain("bg-primary")

    for (const create of screen.getAllByRole("link", { name: /Create your clinic/ })) {
      expect(create).toHaveAttribute("href", "/signup")
      expect(create.className).toContain("bg-primary")
    }

    for (const link of screen.getAllByRole("link", { name: "Sign in" })) {
      expect(link.className).not.toContain("bg-primary")
      expect(link.className).not.toContain("bg-secondary")
    }
  })

  it("keeps the owner demo hint fully legible on its primary surface", () => {
    mount()

    const hint = screen.getByText("Full control: timeline, roster, settings and activity")
    expect(hint).toHaveClass("text-primary-foreground")
    expect(hint).not.toHaveClass("opacity-80")
  })

  it("tells the clinic-day story as three moments, not just a feature list", () => {
    mount()

    expect(screen.getByRole("heading", { name: "One clinic day, three moments" })).toBeInTheDocument()
    expect(screen.getByText("A patient books online")).toBeInTheDocument()
    expect(screen.getByText("Reception keeps the day moving")).toBeInTheDocument()
    expect(screen.getByText("The whole team shares one schedule")).toBeInTheDocument()
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

    const recovery = await screen.findByRole("alert")
    expect(recovery).toHaveTextContent("Interactive demo is temporarily unavailable")
    expect(screen.queryByRole("button", { name: /Try as Owner/ })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Try demo again" })).toBeVisible()
    expect(screen.getAllByRole("link", { name: "Sign in" })).not.toHaveLength(0)
    expect(screen.getAllByRole("link", { name: "Create a clinic" })).not.toHaveLength(0)
  })
})
