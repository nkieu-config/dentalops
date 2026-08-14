import type { LucideIcon } from "lucide-react"
import { NavLink } from "react-router"
import { cn } from "../../lib/cn"
import { Tooltip } from "../ui/tooltip"

export interface WorkspaceNavItem {
  to: string
  label: string
  icon: LucideIcon
  group?: "admin"
}

const splitItems = (items: WorkspaceNavItem[]) => ({
  operational: items.filter((item) => item.group !== "admin"),
  administrative: items.filter((item) => item.group === "admin")
})

const activeClass = "bg-primary-surface text-primary-on-surface"

const desktopLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex min-h-11 items-center gap-3 rounded-full px-3 type-ui transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    isActive
      ? `${activeClass} font-semibold`
      : "font-medium text-muted-foreground hover:bg-surface-subtle hover:text-foreground"
  )

const DesktopLinks = ({ items }: { items: WorkspaceNavItem[] }) =>
  items.map(({ to, label, icon: Icon }) => (
    <NavLink key={to} to={to} className={desktopLinkClass}>
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </NavLink>
  ))

const RailLinks = ({ items }: { items: WorkspaceNavItem[] }) =>
  items.map(({ to, label, icon: Icon }) => (
    <Tooltip key={to} content={label}>
      <NavLink
        to={to}
        aria-label={label}
        className={({ isActive }) =>
          cn(
            "flex min-h-11 items-center justify-center rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            isActive
              ? activeClass
              : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground"
          )
        }
      >
        <Icon className="size-5" aria-hidden="true" />
      </NavLink>
    </Tooltip>
  ))

export const WorkspaceNavigation = ({ items }: { items: WorkspaceNavItem[] }) => {
  const { operational, administrative } = splitItems(items)

  return (
    <>
      <aside
        data-testid="desktop-navigation-dock"
        className="hidden w-sidebar shrink-0 flex-col overflow-hidden rounded-hero border border-border bg-card shadow-xs lg:flex"
      >
        <nav aria-label="Primary navigation" className="flex min-h-0 flex-1 flex-col p-2">
          <div className="flex flex-col gap-1"><DesktopLinks items={operational} /></div>
          <div data-testid="desktop-navigation-admin" className="mt-auto flex flex-col gap-1 border-t border-border pt-2">
            <DesktopLinks items={administrative} />
          </div>
        </nav>
      </aside>
      <aside
        data-testid="tablet-navigation-rail"
        className="hidden w-navrail shrink-0 flex-col overflow-hidden rounded-hero border border-border bg-card shadow-xs md:flex lg:hidden"
      >
        <nav aria-label="Primary navigation on tablet" className="flex min-h-0 flex-1 flex-col p-2">
          <div className="flex flex-col gap-1"><RailLinks items={operational} /></div>
          <div data-testid="tablet-navigation-admin" className="mt-auto flex flex-col gap-1 border-t border-border pt-2">
            <RailLinks items={administrative} />
          </div>
        </nav>
      </aside>
      <nav
        data-testid="bottom-nav"
        aria-label="Primary navigation on mobile"
        className="fixed inset-x-0 bottom-0 z-30 flex h-[calc(var(--spacing-bottomnav)+env(safe-area-inset-bottom))] border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 type-meta transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                isActive ? "font-semibold text-primary-on-surface" : "font-medium text-muted-foreground"
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  data-testid="mobile-active-indicator"
                  className={cn(
                    "flex h-7 min-w-12 items-center justify-center rounded-full px-3 transition-colors duration-150",
                    isActive ? activeClass : "bg-transparent"
                  )}
                >
                  <Icon className="size-5 shrink-0" aria-hidden="true" />
                </span>
                <span data-testid="mobile-nav-label" className="max-w-full truncate">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
