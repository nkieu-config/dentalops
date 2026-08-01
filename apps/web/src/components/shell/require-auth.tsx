import { useEffect, useState, type ReactNode } from "react"
import { Navigate } from "react-router"
import { refreshSession, useSession } from "../../lib/session"
import { Skeleton } from "../ui/skeleton"

export const RequireAuth = ({ children }: { children: ReactNode }) => {
  const session = useSession()
  const [checked, setChecked] = useState(session !== null)

  useEffect(() => {
    if (session === null && !checked) {
      void refreshSession().finally(() => setChecked(true))
    }
  }, [session, checked])

  if (session) return children
  if (!checked) {
    return (
      <div className="space-y-3 p-8">
        <Skeleton className="h-topbar w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  return <Navigate to="/" replace />
}
