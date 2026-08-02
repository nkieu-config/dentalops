import type { UserRole } from "@dentalops/contracts"
import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router"
import { afterEach, describe, expect, it } from "vitest"
import { canManageRoster, setSession } from "../../lib/session"
import { AppShell, visibleNavItems } from "./app-shell"

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
    const gated = ["/app/roster", "/app/activity"]
    for (const role of ["owner", "receptionist", "dentist"] as const) {
      const session = sessionFor(role)
      const shown = visibleNavItems(session).map((item) => item.to)
      for (const destination of gated) {
        expect(shown.includes(destination)).toBe(canManageRoster(session))
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
