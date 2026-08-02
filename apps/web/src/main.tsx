import "@fontsource-variable/inter"
import "./app.css"
import * as Sentry from "@sentry/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router"
import { Toaster } from "sonner"
import { initTheme } from "./lib/theme"
import { router } from "./routes"

initTheme()

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
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

const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } }
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  </StrictMode>
)
