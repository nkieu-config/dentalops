import type { AuthSession } from "@dentalops/contracts"
import { CalendarDays, ClipboardList, History, Moon, Settings, Users } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { NavLink, Outlet, useNavigate } from "react-router"
import { cn } from "../../lib/cn"
import { canManageRoster, canViewActivity, isDemo, logout, useSession } from "../../lib/session"
import { toggleTheme } from "../../lib/theme"
import { Button } from "../ui/button"

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
  { to: "/app/settings", label: "Settings", icon: Settings }
]

export const visibleNavItems = (session: AuthSession | null): NavItem[] =>
  navItems.filter((item) => item.visible?.(session) ?? true)

const NavList = ({ items, railOnly }: { items: NavItem[]; railOnly: boolean }) => (
  <nav className="flex flex-col gap-1 p-2">
    {items.map(({ to, label, icon: Icon }) => (
      <NavLink
        key={to}
        to={to}
        title={label}
        className={({ isActive }) =>
          cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
            railOnly && "justify-center",
            isActive ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-accent"
          )
        }
      >
        <Icon className="h-4 w-4 shrink-0" />
        {railOnly ? <span className="sr-only">{label}</span> : <span>{label}</span>}
      </NavLink>
    ))}
  </nav>
)

export const AppShell = () => {
  const session = useSession()
  const navigate = useNavigate()
  const items = visibleNavItems(session)

  return (
    <div className="flex min-h-dvh flex-col">
      {isDemo() ? (
        <div className="bg-warning px-4 py-1 text-center text-xs font-medium text-warning-foreground">
          Demo mode — the clinic data rebuilds itself every 6 hours
        </div>
      ) : null}
      <header className="flex h-topbar shrink-0 items-center gap-3 border-b border-border px-4">
        <span className="font-semibold text-primary">DentalOps</span>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={toggleTheme}>
          <Moon className="h-4 w-4" />
        </Button>
        <span className="hidden text-sm text-muted-foreground sm:inline">{session?.user.name}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            logout()
            void navigate("/")
          }}
        >
          Log out
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-14 shrink-0 border-r border-border md:block lg:w-60">
          <div className="lg:hidden">
            <NavList items={items} railOnly />
          </div>
          <div className="hidden lg:block">
            <NavList items={items} railOnly={false} />
          </div>
        </aside>
        <main className="min-w-0 flex-1 pb-bottomnav md:pb-0">
          <Outlet />
        </main>
      </div>
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
                isActive ? "text-primary" : "text-muted-foreground"
              )
            }
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="max-w-full truncate">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
