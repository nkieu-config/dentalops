const SENSITIVE_KEYS = new Set([
  "name",
  "phone",
  "email",
  "password",
  "passwordhash",
  "accesstoken",
  "refreshtoken",
  "managetoken",
  "token",
  "authorization",
  "cookie",
  "set-cookie"
])

export const REDACTED = "[redacted]"

export const scrubValue = (value: unknown, depth = 0): unknown => {
  if (depth > 6 || value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : scrubValue(inner, depth + 1)
  }
  return out
}

export interface ScrubbableEvent {
  request?: {
    data?: unknown
    headers?: Record<string, unknown>
    cookies?: unknown
    query_string?: unknown
    url?: string
  }
  user?: unknown
  extra?: unknown
  contexts?: unknown
}

export const scrubEvent = <T extends ScrubbableEvent>(event: T): T => {
  if (event.request) {
    if (event.request.data !== undefined) event.request.data = REDACTED
    if (event.request.cookies !== undefined) event.request.cookies = REDACTED
    if (event.request.headers) {
      event.request.headers = scrubValue(event.request.headers) as Record<string, unknown>
    }
    if (typeof event.request.url === "string") {
      event.request.url = event.request.url.split("?")[0] ?? event.request.url
    }
    if (event.request.query_string !== undefined) event.request.query_string = REDACTED
  }
  if (event.user !== undefined) event.user = scrubValue(event.user)
  if (event.extra !== undefined) event.extra = scrubValue(event.extra)
  return event
}
