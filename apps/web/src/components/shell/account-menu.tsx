import type { AuthSession, ClinicProfile, UserRole } from "@dentalops/contracts"
import { ChevronDown, LogOut, Settings } from "lucide-react"
import { NavLink, useNavigate } from "react-router"
import { logout } from "../../lib/session"
import { Button } from "../ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../ui/dropdown-menu"

const roleLabels: Record<UserRole, string> = {
  owner: "Owner",
  receptionist: "Receptionist",
  dentist: "Dentist"
}

const initialsFor = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("")

interface AccountMenuProps {
  session: AuthSession | null
  clinic?: ClinicProfile
  demo: boolean
}

export const AccountMenu = ({ session, clinic, demo }: AccountMenuProps) => {
  const navigate = useNavigate()
  const accountName = session?.user.name ?? "Account"
  const role = session?.user.role
  const clinicName = clinic?.name ?? "Clinic workspace"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Account: ${accountName}`}
          className="sm:w-auto sm:max-w-40 sm:px-2 lg:max-w-56"
        >
          <span
            aria-hidden="true"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary type-meta font-bold text-secondary-foreground"
          >
            {initialsFor(accountName)}
          </span>
          <span className="hidden min-w-0 sm:flex sm:flex-col sm:items-start">
            <span data-testid="account-name" className="hidden max-w-28 truncate leading-tight sm:block lg:max-w-36">
              {accountName}
            </span>
            {role ? (
              <span className="hidden type-meta font-medium leading-tight text-muted-foreground lg:block">
                {roleLabels[role]}
              </span>
            ) : null}
          </span>
          <ChevronDown className="hidden size-3.5 shrink-0 text-muted-foreground lg:block" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64 p-1.5">
        <DropdownMenuLabel data-testid="account-menu-context" className="px-3 py-2.5">
          <span className="block truncate type-ui font-semibold text-foreground">{accountName}</span>
          <span className="mt-0.5 block truncate type-meta font-medium text-muted-foreground">
            {role ? `${roleLabels[role]} · ` : ""}{clinicName}
          </span>
          {demo ? (
            <span className="mt-2 inline-flex rounded-full bg-secondary px-2 py-1 type-meta font-semibold text-secondary-foreground">
              Demo workspace
            </span>
          ) : null}
        </DropdownMenuLabel>
        {role === "owner" ? (
          <>
            <DropdownMenuSeparator className="my-1 h-px bg-border" />
            <DropdownMenuItem asChild>
              <NavLink to="/app/settings" className="gap-2.5">
                <Settings className="size-4" aria-hidden="true" />
                Clinic settings
              </NavLink>
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator className="my-1 h-px bg-border" />
        <DropdownMenuItem
          className="gap-2.5 text-muted-foreground focus:text-foreground"
          onSelect={() => {
            logout()
            void navigate("/")
          }}
        >
          <LogOut className="size-4" aria-hidden="true" />
          {demo ? "Exit demo" : "Log out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
