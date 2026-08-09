import type { UserRole } from "@dentalops/contracts"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { canManageRoster, canViewActivity, setSession } from "../../lib/session"
import { API, http, HttpResponse, server } from "../../test/msw"
import { goOffline, goOnline, setOnLine } from "../../test/network"
import { AppShell, visibleNavItems } from "./app-shell"
import { OFFLINE_MESSAGE } from "./offline-banner"

const sessionFor = (role: UserRole) => ({
  accessToken: "token",
  user: {
    id: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
    tenantId: "6f9619ff-8b86-4d01-b42d-00cf4fc964fe",
    name: "Staff Member",
    role
  }
})

const mount = (role: UserRole, opts?: { demo?: boolean }) => {
  setSession(sessionFor(role), { demo: opts?.demo ?? false })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/timeline"]}>
        <Routes>
          <Route path="/app" element={<AppShell />}>
            <Route path="timeline" element={<p>timeline</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const links = (label: string) => screen.queryAllByRole("link", { name: label })

beforeEach(() => {
  server.use(
    http.get(`${API}/tenant`, () =>
      HttpResponse.json({
        id: "6f9619ff-8b86-4d01-b42d-00cf4fc964fe",
        name: "DentalOps Clinic",
        slug: "dentalops-clinic",
        publicBookingPath: "/book/dentalops-clinic"
      })
    )
  )
})

afterEach(() => {
  setSession(null)
})

describe("AppShell navigation", () => {
  it("offers the roster to an owner, who is allowed through the guard", () => {
    mount("owner")
    expect(links("Roster").length).toBeGreaterThan(0)
  })

  for (const role of ["receptionist", "dentist"] as const) {
    it(`hides the roster from a ${role}, who the guard would bounce back to the timeline`, () => {
      mount(role)
      expect(links("Roster")).toHaveLength(0)
      expect(links("Timeline").length).toBeGreaterThan(0)
    })
  }

  it("keeps the mobile bar and the sidebar showing the same destinations", () => {
    mount("dentist")
    const bar = screen.getAllByRole("navigation").at(-1)
    expect(bar).toBeDefined()
    const inBar = Array.from(bar!.querySelectorAll("a")).map((a) => a.getAttribute("href"))
    expect(inBar).toEqual(visibleNavItems(sessionFor("dentist")).map((item) => item.to))
    expect(inBar).not.toContain("/app/roster")
  })

  it("keeps Settings exclusive to the owner role", () => {
    mount("receptionist")
    expect(links("Settings")).toHaveLength(0)
  })

  it("uses the cached clinic profile for the topbar identity", async () => {
    mount("owner")
    expect(await screen.findByText("DentalOps Clinic")).toBeInTheDocument()
  })

  it("uses the selection surface only for the active destination", () => {
    mount("owner")
    expect(links("Timeline")[0]!.className).toContain("bg-selection")
  })

  it("guards every gated destination with the predicate its route uses", () => {
    const gated = [
      { to: "/app/roster", allows: canManageRoster },
      { to: "/app/activity", allows: canViewActivity }
    ]
    for (const role of ["owner", "receptionist", "dentist"] as const) {
      const session = sessionFor(role)
      const shown = visibleNavItems(session).map((item) => item.to)
      for (const { to, allows } of gated) {
        expect(shown.includes(to)).toBe(allows(session))
      }
    }
  })

  it("keeps the mobile bar within Material's five destinations, each free to shrink", () => {
    mount("owner")
    const items = Array.from(screen.getByTestId("bottom-nav").querySelectorAll("a"))
    expect(items).toHaveLength(5)
    for (const item of items) {
      expect(item.className).toContain("flex-1")
      expect(item.className).toContain("min-w-0")
      expect(item.querySelector("span")?.className).toContain("truncate")
    }
  })

  it("keeps the sidebar labels visible in text, not screen-reader only, so tablet width still reads as navigation", () => {
    mount("owner")
    const sidebarLink = links("Timeline")[0]!
    const label = sidebarLink.querySelector("span")
    expect(label).not.toBeNull()
    expect(label!.className).not.toContain("sr-only")
  })
})

describe("AppShell system status", () => {
  it("shows demo state exactly once, as neutral information rather than a warning banner", () => {
    mount("owner", { demo: true })
    const banners = screen.getAllByTestId("demo-banner")
    expect(banners).toHaveLength(1)
    expect(banners[0]!.className).not.toContain("bg-warning")
    expect(banners[0]).toHaveTextContent("Demo resets periodically")
  })

  it("stays out of the way outside demo mode", () => {
    mount("owner")
    expect(screen.queryByTestId("demo-banner")).not.toBeInTheDocument()
  })
})

describe("AppShell offline banner", () => {
  it("stays out of the way while the browser is online", () => {
    mount("owner")
    expect(screen.queryByTestId("offline-banner")).not.toBeInTheDocument()
  })

  it("announces the loss of the network and clears itself when it returns", () => {
    mount("owner")

    goOffline()
    const banner = screen.getByTestId("offline-banner")
    expect(banner).toHaveTextContent(OFFLINE_MESSAGE)
    const region = screen.getByRole("status")
    expect(region).toHaveAttribute("aria-live", "polite")
    expect(region.contains(banner)).toBe(true)

    goOnline()
    expect(screen.queryByTestId("offline-banner")).not.toBeInTheDocument()
  })

  it("sits above the topbar, so nothing it warns about scrolls out from under it", () => {
    setOnLine(false)
    mount("owner")
    const banner = screen.getByTestId("offline-banner")
    const topbar = screen.getByRole("banner")
    expect(
      banner.compareDocumentPosition(topbar) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })
})
