import type { AuthSession } from "@dentalops/contracts"
import { clinicProfileSchema, type ClinicProfile } from "@dentalops/contracts"
import { useQuery } from "@tanstack/react-query"
import { CalendarDays, ClipboardList, History, Settings, Users } from "lucide-react"
import { useLayoutEffect, useRef } from "react"
import { Outlet, ScrollRestoration, useLocation, useNavigationType } from "react-router"
import { api } from "../../lib/api"
import { canManageRoster, canViewActivity, isDemo, useSession } from "../../lib/session"
import { OfflineBanner } from "./offline-banner"
import { ClinicIdentity } from "./clinic-identity"
import { SystemStatus } from "./system-status"
import { ThemeToggle } from "./theme-toggle"
import { WorkspaceHeaderSurface } from "./workspace-header-surface"
import { queryKeys } from "../../lib/query-keys"
import { AccountMenu } from "./account-menu"
import { WorkspaceNavigation, type WorkspaceNavItem } from "./workspace-navigation"

interface NavItem extends WorkspaceNavItem {
  visible?: (session: AuthSession | null) => boolean
}

const navItems: NavItem[] = [
  { to: "/app/timeline", label: "Timeline", icon: CalendarDays },
  { to: "/app/roster", label: "Roster", icon: ClipboardList, visible: canManageRoster },
  { to: "/app/patients", label: "Patients", icon: Users },
  { to: "/app/activity", label: "Activity", icon: History, visible: canViewActivity },
  {
    to: "/app/settings",
    label: "Settings",
    icon: Settings,
    group: "admin",
    visible: (session) => session?.user.role === "owner"
  }
]

export const visibleNavItems = (session: AuthSession | null): NavItem[] =>
  navItems.filter((item) => item.visible?.(session) ?? true)

export const AppShell = () => {
  const session = useSession()
  const location = useLocation()
  const navigationType = useNavigationType()
  const mainRef = useRef<HTMLElement>(null)
  const activeLocationKey = useRef(location.key)
  const scrollPositions = useRef(new Map<string, number>())
  const items = visibleNavItems(session)
  const profile = useQuery<ClinicProfile>({ queryKey: queryKeys.tenant(), queryFn: () => api("/tenant", clinicProfileSchema) })
  const demoMode = isDemo()

  useLayoutEffect(() => {
    const main = mainRef.current
    if (!main || activeLocationKey.current === location.key) return
    scrollPositions.current.set(activeLocationKey.current, main.scrollTop)
    const anchored = location.hash ? document.getElementById(location.hash.slice(1)) : null
    if (navigationType === "POP") main.scrollTop = scrollPositions.current.get(location.key) ?? 0
    else if (anchored) anchored.scrollIntoView({ block: "start" })
    else main.scrollTop = 0
    activeLocationKey.current = location.key
  }, [location.key, location.hash, navigationType])

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <a
        href="#main"
        className="sr-only rounded-control bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to main content
      </a>
      <OfflineBanner />
      <header className="mx-2 mb-2 mt-2 shrink-0 sm:mx-3 sm:mb-3 sm:mt-3">
        <WorkspaceHeaderSurface
          data-testid="workspace-header-surface"
          className="min-h-14 gap-2 px-2 sm:min-h-16 sm:gap-3 sm:px-3"
        >
          <ClinicIdentity clinic={profile.data} loading={profile.isPending} error={profile.isError} />
          <SystemStatus demo={demoMode} />
          <div className="min-w-0 flex-1" />
          <ThemeToggle />
          <AccountMenu session={session} clinic={profile.data} demo={demoMode} />
        </WorkspaceHeaderSurface>
      </header>
      <div className="flex min-h-0 flex-1 md:gap-3 md:px-3 md:pb-3">
        <WorkspaceNavigation items={items} />
        <main
          ref={mainRef}
          id="main"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto pb-[calc(var(--spacing-bottomnav)+env(safe-area-inset-bottom))] md:pb-0"
        >
          <Outlet />
        </main>
      </div>
      <ScrollRestoration />
    </div>
  )
}
