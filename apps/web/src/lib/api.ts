import { apiErrorSchema } from "@dentalops/contracts"
import type { ZodType } from "zod"
import { getSession, refreshSession } from "./session"

const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:3001"

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly errorCode: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export interface ApiInit {
  method?: "GET" | "POST" | "PATCH" | "DELETE"
  body?: unknown
  query?: Record<string, string | undefined>
}

export const api = async <T>(path: string, schema: ZodType<T>, init: ApiInit = {}): Promise<T> => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (value !== undefined) params.set(key, value)
  }
  const qs = params.size > 0 ? `?${params.toString()}` : ""
  const url = `${API_URL}/api/v1${path}${qs}`

  const run = () => {
    const current = getSession()
    return fetch(url, {
      method: init.method ?? "GET",
      credentials: "include",
      headers: {
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(current ? { authorization: `Bearer ${current.accessToken}` } : {})
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined
    })
  }

  let res = await run()
  if (res.status === 401 && getSession()) {
    const renewed = await refreshSession()
    if (renewed) res = await run()
  }
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null)
    const parsed = apiErrorSchema.safeParse(body)
    if (parsed.success) {
      throw new ApiError(res.status, parsed.data.errorCode, parsed.data.message, parsed.data.details)
    }
    throw new ApiError(res.status, "HTTP_ERROR", `API responded ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return schema.parse(await res.json())
}
