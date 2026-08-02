import { lazy, Suspense, type ReactNode } from "react"
import { createBrowserRouter, Navigate } from "react-router"
import { Skeleton } from "./components/ui/skeleton"
import { BookingPage } from "./features/booking/booking-page"
import { ManagePage } from "./features/booking/manage-page"
import { LandingPage } from "./pages/landing-page"

const AppShell = lazy(() =>
  import("./components/shell/app-shell").then((m) => ({ default: m.AppShell }))
)
const RequireAuth = lazy(() =>
  import("./components/shell/require-auth").then((m) => ({ default: m.RequireAuth }))
)
const TimelinePage = lazy(() =>
  import("./features/timeline/timeline-page").then((m) => ({ default: m.TimelinePage }))
)
const RosterRoute = lazy(() =>
  import("./features/roster/roster-page").then((m) => ({ default: m.RosterRoute }))
)
const DevUiPage = lazy(() =>
  import("./pages/dev-ui-page").then((m) => ({ default: m.DevUiPage }))
)

const Placeholder = ({ label }: { label: string }) => (
  <div className="p-8 text-muted-foreground">{label}</div>
)

const Loading = () => (
  <div className="space-y-3 p-6">
    <Skeleton className="h-9 w-48" />
    <Skeleton className="h-64 w-full" />
  </div>
)

const deferred = (node: ReactNode) => <Suspense fallback={<Loading />}>{node}</Suspense>

export const router = createBrowserRouter([
  { path: "/", element: <LandingPage /> },
  { path: "/book/:clinicSlug", element: <BookingPage /> },
  { path: "/manage/:token", element: <ManagePage /> },
  {
    path: "/app",
    element: deferred(
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/app/timeline" replace /> },
      { path: "timeline", element: deferred(<TimelinePage />) },
      { path: "roster", element: deferred(<RosterRoute />) },
      { path: "patients", element: <Placeholder label="Patients — arrives in W6" /> },
      { path: "settings", element: <Placeholder label="Settings — arrives in W6" /> }
    ]
  },
  { path: "/dev/ui", element: deferred(<DevUiPage />) }
])
