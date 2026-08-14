import "@fontsource-variable/plus-jakarta-sans"
import "@fontsource-variable/noto-sans-thai"
import "./app.css"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router"
import { Toaster } from "sonner"
import { initTheme } from "./lib/theme"
import { router } from "./routes"
import { MotionProvider } from "./components/ui/motion-provider"
import { TooltipProvider } from "./components/ui/tooltip"

initTheme()

const startErrorReporting = async (dsn: string) => {
  const Sentry = await import("@sentry/react")
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    beforeBreadcrumb: (breadcrumb) => {
      if (breadcrumb.category === "fetch" || breadcrumb.category === "xhr") {
        const data = breadcrumb.data as { url?: string } | undefined
        if (data?.url) data.url = data.url.split("?")[0] ?? data.url
      }
      return breadcrumb
    }
  })
}

if (import.meta.env.VITE_SENTRY_DSN) {
  void startErrorReporting(import.meta.env.VITE_SENTRY_DSN)
}

const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } }
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <MotionProvider>
        <TooltipProvider>
          <RouterProvider router={router} />
          <Toaster position="top-center" richColors />
        </TooltipProvider>
      </MotionProvider>
    </QueryClientProvider>
  </StrictMode>
)
