import { createBrowserRouter, Outlet } from "react-router"
import { DevUiPage } from "./pages/dev-ui-page"

const Placeholder = ({ label }: { label: string }) => (
  <div className="p-8 text-muted-foreground">{label}</div>
)

export const router = createBrowserRouter([
  { path: "/", element: <Placeholder label="Landing — Task 3" /> },
  {
    path: "/app",
    element: <Outlet />,
    children: [{ path: "timeline", element: <Placeholder label="Timeline — Task 5" /> }]
  },
  { path: "/dev/ui", element: <DevUiPage /> }
])
