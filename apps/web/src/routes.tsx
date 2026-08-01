import { createBrowserRouter, Navigate } from "react-router"
import { AppShell } from "./components/shell/app-shell"
import { RequireAuth } from "./components/shell/require-auth"
import { TimelinePage } from "./features/timeline/timeline-page"
import { DevUiPage } from "./pages/dev-ui-page"
import { LandingPage } from "./pages/landing-page"

const Placeholder = ({ label }: { label: string }) => (
  <div className="p-8 text-muted-foreground">{label}</div>
)

export const router = createBrowserRouter([
  { path: "/", element: <LandingPage /> },
  {
    path: "/app",
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/app/timeline" replace /> },
      { path: "timeline", element: <TimelinePage /> },
      { path: "roster", element: <Placeholder label="Roster — arrives in W7" /> },
      { path: "patients", element: <Placeholder label="Patients — arrives in W6" /> },
      { path: "settings", element: <Placeholder label="Settings — arrives in W6" /> }
    ]
  },
  { path: "/dev/ui", element: <DevUiPage /> }
])
