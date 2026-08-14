import type { UserRole } from "@dentalops/contracts"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "../../test/render"
import userEvent from "@testing-library/user-event"
import { createMemoryRouter, Link, RouterProvider } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
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
  const router = createMemoryRouter(
    [
      {
        path: "/app",
        element: <AppShell />,
        children: [
          {
            path: "timeline",
            element: (
              <>
                <p>timeline</p>
                <Link to="/app/patients">Open patients</Link>
                <Link to="/app/settings#branches">Set branch hours</Link>
              </>
            )
          },
          { path: "patients", element: <p>patients</p> },
          {
            path: "settings",
            element: (
              <>
                <p>settings top</p>
                <section id="branches">branches</section>
              </>
            )
          }
        ]
      }
    ],
    { initialEntries: ["/app/timeline"] }
  )
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return { router, user: userEvent.setup() }
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
  it("lands a hashed deep link on the section it names instead of the top of the page", async () => {
    const { user } = mount("owner")
    const anchored = vi.fn()
    Element.prototype.scrollIntoView = anchored

    await user.click(screen.getByRole("link", { name: "Set branch hours" }))

    expect(await screen.findByText("branches")).toBeInTheDocument()
    expect(anchored).toHaveBeenCalled()
  })


  it("uses main-content language in the shared skip link", () => {
    mount("owner")
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#main")
  })

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
    const bar = screen.getByRole("navigation", { name: "Primary navigation on mobile" })
    expect(bar).toBeDefined()
    const inBar = Array.from(bar!.querySelectorAll("a")).map((a) => a.getAttribute("href"))
    expect(inBar).toEqual(visibleNavItems(sessionFor("dentist")).map((item) => item.to))
    expect(inBar).not.toContain("/app/roster")
  })

  it("orders destinations by operational frequency", () => {
    expect(visibleNavItems(sessionFor("owner")).map((item) => item.label)).toEqual([
      "Timeline",
      "Roster",
      "Patients",
      "Activity",
      "Settings"
    ])
  })

  it("uses a compact tablet rail between the mobile bar and desktop dock", () => {
    mount("owner")

    expect(screen.getByTestId("desktop-navigation-dock")).toHaveClass("hidden", "lg:flex")
    expect(screen.getByTestId("desktop-navigation-dock")).toHaveClass("w-sidebar")
    expect(screen.getByTestId("tablet-navigation-rail")).toHaveClass(
      "hidden",
      "md:flex",
      "lg:hidden",
      "w-navrail"
    )
    expect(screen.getByTestId("bottom-nav")).toHaveClass("md:hidden")
  })

  it("keeps administration separate at the bottom of desktop and tablet navigation", () => {
    mount("owner")

    for (const testId of ["desktop-navigation-admin", "tablet-navigation-admin"]) {
      const admin = screen.getByTestId(testId)
      expect(admin).toHaveClass("mt-auto")
      expect(within(admin).getByRole("link", { name: "Settings" })).toHaveAttribute(
        "href",
        "/app/settings"
      )
    }
  })

  it("labels each navigation landmark and protects mobile controls from the home indicator", () => {
    mount("owner")
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument()
    const mobileNavigation = screen.getByRole("navigation", { name: "Primary navigation on mobile" })
    expect(mobileNavigation.className).toContain("safe-area-inset-bottom")
    expect(screen.getByRole("main").className).toContain("pb-[calc(var(--spacing-bottomnav)+env(safe-area-inset-bottom))]")
  })

  it("gives routed workspace content the shell height through a flex main region", () => {
    mount("owner")
    expect(screen.getByRole("main")).toHaveClass("flex", "min-h-0", "flex-1", "flex-col")
  })

  it("bounds the workspace to the viewport while ordinary pages scroll inside main", () => {
    mount("owner")
    const main = screen.getByRole("main")
    const workspace = main.parentElement?.parentElement

    expect(workspace).toHaveClass("h-dvh", "overflow-hidden")
    expect(main).toHaveClass("overflow-y-auto")
  })

  it("starts pushed routes at the top and restores the prior workspace scroll position on back", async () => {
    const { router, user } = mount("owner")
    const main = screen.getByRole("main")
    main.scrollTop = 320

    await user.click(screen.getByRole("link", { name: "Open patients" }))
    expect(await screen.findByText("patients")).toBeInTheDocument()
    expect(main.scrollTop).toBe(0)

    main.scrollTop = 180
    await router.navigate(-1)

    await waitFor(() => expect(screen.getByText("timeline")).toBeInTheDocument())
    expect(main.scrollTop).toBe(320)
  })

  it("keeps a long account name inside the topbar action area", () => {
    mount("owner")
    const account = screen.getByRole("button", { name: "Account: Staff Member" })
    expect(account.className).toContain("max-w-40")
    expect(account.querySelector("[data-testid='account-name']")?.className).toContain("truncate")
  })

  it("shows account context and uses demo-specific exit language", async () => {
    mount("owner", { demo: true })
    await screen.findByText("DentalOps Clinic")

    await userEvent.click(screen.getByRole("button", { name: "Account: Staff Member" }))

    expect(screen.getByTestId("account-menu-context")).toHaveTextContent("Staff Member")
    expect(screen.getByTestId("account-menu-context")).toHaveTextContent(
      "Owner · DentalOps Clinic"
    )
    expect(screen.getByRole("menuitem", { name: "Clinic settings" })).toHaveAttribute(
      "href",
      "/app/settings"
    )
    expect(screen.getByRole("menuitem", { name: "Exit demo" })).toBeInTheDocument()
  })

  it("uses a floating surface instead of the full-width divider topbar", () => {
    mount("owner")
    const banner = screen.getByRole("banner")
    expect(banner.querySelector("[data-testid='workspace-header-surface']")).toBeInTheDocument()
    expect(banner.className).not.toContain("border-b")
  })

  it("keeps the account trigger labelled when its visible name compresses on mobile", () => {
    mount("owner")
    const account = screen.getByRole("button", { name: "Account: Staff Member" })
    expect(account.querySelector("[data-testid='account-name']")?.className).toContain("hidden")
    expect(account).toHaveClass("h-11", "[@media(pointer:coarse)]:h-11")
  })

  it("keeps compact header actions touch-safe at every breakpoint", () => {
    mount("owner", { demo: true })
    expect(screen.getByRole("button", { name: "Theme: System" })).toHaveClass("h-11", "w-11", "[@media(pointer:coarse)]:h-11")
    expect(screen.getByTestId("demo-banner")).toHaveClass("min-h-11")
  })

  it("keeps the floating header in normal flow with one responsive control row", () => {
    mount("owner")
    const header = screen.getByRole("banner")
    const surface = screen.getByTestId("workspace-header-surface")
    expect(header.className).toContain("mt-2")
    expect(surface.className).toContain("items-center")
    expect(surface.className).toContain("min-h-14")
  })

  it("reserves clinic-name space while the profile is loading", () => {
    server.use(http.get(`${API}/tenant`, () => new Promise(() => {})))
    mount("owner")
    expect(screen.getByTestId("clinic-identity-skeleton")).toBeInTheDocument()
  })

  it("keeps Settings exclusive to the owner role", () => {
    mount("receptionist")
    expect(links("Settings")).toHaveLength(0)
  })

  it("uses the cached clinic profile for the topbar identity", async () => {
    mount("owner")
    expect(await screen.findByText("DentalOps Clinic")).toBeInTheDocument()
  })

  it("uses a neutral clinic fallback when the profile cannot be loaded", async () => {
    server.use(http.get(`${API}/tenant`, () => HttpResponse.json({}, { status: 500 })))
    mount("owner")
    expect(await screen.findByText("Clinic workspace")).toBeInTheDocument()
    expect(screen.queryByText("DentalOps")).not.toBeInTheDocument()
  })

  it("marks the active destination in the same language as every other current-state in the app", () => {
    mount("owner")
    const active = links("Timeline")[0]!.className
    expect(active).toContain("bg-primary-surface")
    expect(active).toContain("text-primary-on-surface")
    expect(links("Patients")[0]!.className).not.toContain("bg-primary-surface")
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
      expect(item.querySelector("[data-testid='mobile-nav-label']")?.className).toContain(
        "truncate"
      )
    }
  })

  it("gives the active mobile destination a shaped indicator in addition to text contrast", () => {
    mount("owner")
    const mobileNavigation = screen.getByTestId("bottom-nav")
    const timeline = Array.from(mobileNavigation.querySelectorAll("a")).find(
      (link) => link.getAttribute("href") === "/app/timeline"
    )
    expect(timeline?.querySelector("[data-testid='mobile-active-indicator']")).toHaveClass(
      "bg-primary-surface",
      "text-primary-on-surface"
    )
  })
})

describe("AppShell system status", () => {
  it("shows demo state exactly once as a visible compact badge", () => {
    mount("owner", { demo: true })
    const banners = screen.getAllByTestId("demo-banner")
    expect(banners).toHaveLength(1)
    expect(banners[0]!.className).not.toContain("bg-warning")
    expect(banners[0]).toHaveTextContent("Demo")
  })

  it("explains the demo reset behavior on demand", async () => {
    mount("owner", { demo: true })
    await userEvent.click(screen.getByTestId("demo-banner"))
    expect(screen.getByRole("heading", { name: "Demo workspace" })).toBeInTheDocument()
    expect(screen.getByText("Demo data resets periodically.")).toBeInTheDocument()
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
