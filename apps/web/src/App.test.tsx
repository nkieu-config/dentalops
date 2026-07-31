import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import { App } from "./App"

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok", version: "0.0.0", uptimeSeconds: 42 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    )
  )
})

it("renders API health once loaded", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  )
  expect(await screen.findByText(/API ok/)).toBeDefined()
})
