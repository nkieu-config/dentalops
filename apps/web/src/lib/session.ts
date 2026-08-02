import { authSessionSchema, type AuthSession, type UserRole } from "@dentalops/contracts"
import { useSyncExternalStore } from "react"

const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:3001"

let session: AuthSession | null = null
let demo = false
const listeners = new Set<() => void>()

const emit = () => {
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const getSession = () => session

export const isDemo = () => demo

export const setSession = (next: AuthSession | null, opts?: { demo?: boolean }) => {
  session = next
  demo = next === null ? false : (opts?.demo ?? demo)
  emit()
}

export const useSession = () => useSyncExternalStore(subscribe, getSession)

const bookingRoles: ReadonlySet<UserRole> = new Set<UserRole>(["owner", "receptionist"])

export const canBook = (current: AuthSession | null): boolean =>
  current !== null && bookingRoles.has(current.user.role)

export const useCanBook = (): boolean => canBook(useSession())

const rosterRoles: ReadonlySet<UserRole> = new Set<UserRole>(["owner"])

export const canManageRoster = (current: AuthSession | null): boolean =>
  current !== null && rosterRoles.has(current.user.role)

export const useCanManageRoster = (): boolean => canManageRoster(useSession())

const staffRoles: ReadonlySet<UserRole> = new Set<UserRole>(["owner"])

export const canManageStaff = (current: AuthSession | null): boolean =>
  current !== null && staffRoles.has(current.user.role)

export const useCanManageStaff = (): boolean => canManageStaff(useSession())

const activityRoles: ReadonlySet<UserRole> = new Set<UserRole>(["owner"])

export const canViewActivity = (current: AuthSession | null): boolean =>
  current !== null && activityRoles.has(current.user.role)

export const useCanViewActivity = (): boolean => canViewActivity(useSession())

let refreshing: Promise<AuthSession | null> | null = null

export const refreshSession = (): Promise<AuthSession | null> => {
  refreshing ??= fetch(`${API_URL}/api/v1/auth/refresh`, {
    method: "POST",
    credentials: "include"
  })
    .then(async (res) => (res.ok ? authSessionSchema.parse(await res.json()) : null))
    .catch(() => null)
    .then((next) => {
      refreshing = null
      setSession(next)
      return next
    })
  return refreshing
}

export const logout = () => setSession(null)
