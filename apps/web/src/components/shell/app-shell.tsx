import type { AuthSession } from "@dentalops/contracts"
import { clinicProfileSchema, type ClinicProfile } from "@dentalops/contracts"
import { useQuery } from "@tanstack/react-query"
import { CalendarDays, ClipboardList, History, Settings, Users } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { NavLink, Outlet, ScrollRestoration, useNavigate } from "react-router"
import { cn } from "../../lib/cn"
import { api } from "../../lib/api"
import { canManageRoster, canViewActivity, isDemo, logout, useSession } from "../../lib/session"
import { Button } from "../ui/button"
import { OfflineBanner } from "./offline-banner"
import { ClinicIdentity } from "./clinic-identity"
import { SystemStatus } from "./system-status"
import { ThemeToggle } from "./theme-toggle"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu"

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  visible?: (session: AuthSession | null) => boolean
}

const navItems: NavItem[] = [
  { to: "/app/timeline", label: "Timeline", icon: CalendarDays },
  { to: "/app/roster", label: "Roster", icon: ClipboardList, visible: canManageRoster },
  { to: "/app/activity", label: "Activity", icon: History, visible: canViewActivity },
  { to: "/app/patients", label: "Patients", icon: Users },
  { to: "/app/settings", label: "Settings", icon: Settings, visible: (session) => session?.user.role === "owner" }
]

export const visibleNavItems = (session: AuthSession | null): NavItem[] =>
  navItems.filter((item) => item.visible?.(session) ?? true)

const NavList = ({ items }: { items: NavItem[] }) => (
  <nav className="flex flex-col gap-1 p-2">
    {items.map(({ to, label, icon: Icon }) => (
      <NavLink
        key={to}
        to={to}
        title={label}
        className={({ isActive }) =>
          cn(
            "flex items-center gap-3 rounded-full px-3 py-2 text-sm transition-colors duration-150",
            isActive
              ? "bg-selection font-semibold text-foreground"
              : "font-medium text-muted-foreground hover:bg-surface-subtle hover:text-foreground"
          )
        }
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </NavLink>
    ))}
  </nav>
)

export const AppShell = () => {
  const session = useSession()
  const navigate = useNavigate()
  const items = visibleNavItems(session)
  const profile = useQuery<ClinicProfile>({ queryKey: ["tenant"], queryFn: () => api("/tenant", clinicProfileSchema) })

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to the schedule
      </a>
      <OfflineBanner />
      <header className="flex h-topbar shrink-0 items-center gap-3 border-b border-border px-4">
        <ClinicIdentity clinic={profile.data} />
        <SystemStatus demo={isDemo()} />
        <div className="flex-1" />
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="sm">{session?.user.name ?? "Account"}</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => { logout(); void navigate("/") }}>Log out</DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-48 shrink-0 border-r border-border md:block lg:w-60">
          <NavList items={items} />
        </aside>
        <main id="main" className="min-w-0 flex-1 pb-bottomnav md:pb-0">
          <Outlet />
        </main>
      </div>
      <ScrollRestoration />
      <nav
        data-testid="bottom-nav"
        className="fixed inset-x-0 bottom-0 z-30 flex h-bottomnav border-t border-border bg-background md:hidden"
      >
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[0.65rem]",
                isActive ? "font-semibold text-foreground" : "text-muted-foreground"
              )
            }
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="max-w-full truncate">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
