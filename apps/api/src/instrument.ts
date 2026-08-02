import * as Sentry from "@sentry/nestjs"
import { scrubEvent } from "./common/sentry-scrub"

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => {
      if (breadcrumb.data && typeof breadcrumb.data === "object") {
        delete (breadcrumb.data as Record<string, unknown>).body
      }
      return breadcrumb
    }
  })
}
