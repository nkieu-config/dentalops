import { Settings } from "lucide-react"
import { lazy, Suspense, type ReactNode } from "react"
import { createBrowserRouter, Navigate } from "react-router"
import { OutOfScope } from "./components/shell/out-of-scope"
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
const ActivityRoute = lazy(() =>
  import("./features/activity/activity-page").then((m) => ({ default: m.ActivityRoute }))
)
const PatientsPage = lazy(() =>
  import("./features/patients/patients-page").then((m) => ({ default: m.PatientsPage }))
)
const PatientDetail = lazy(() =>
  import("./features/patients/patient-detail").then((m) => ({ default: m.PatientDetail }))
)
const DevUiPage = lazy(() =>
  import("./pages/dev-ui-page").then((m) => ({ default: m.DevUiPage }))
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
      { path: "activity", element: deferred(<ActivityRoute />) },
      { path: "patients", element: deferred(<PatientsPage />) },
      { path: "patients/:id", element: deferred(<PatientDetail />) },
      {
        path: "settings",
        element: (
          <OutOfScope
            icon={Settings}
            title="The settings screen is not part of this build"
            reason="Branches, services, resources and staff are real records with a working API behind them. An editor for them was cut so the eight weeks could finish the scheduling core instead."
          />
        )
      }
    ]
  },
  { path: "/dev/ui", element: deferred(<DevUiPage />) }
])
