import type { UserRole } from "@dentalops/contracts"
import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router"
import { afterEach, describe, expect, it } from "vitest"
import { canManageRoster, canViewActivity, setSession } from "../../lib/session"
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

const mount = (role: UserRole) => {
  setSession(sessionFor(role))
  render(
    <MemoryRouter initialEntries={["/app/timeline"]}>
      <Routes>
        <Route path="/app" element={<AppShell />}>
          <Route path="timeline" element={<p>timeline</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

const links = (label: string) => screen.queryAllByRole("link", { name: label })

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
