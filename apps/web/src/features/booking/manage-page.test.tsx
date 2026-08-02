import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"
import { beforeEach, describe, expect, it } from "vitest"
import { API, http, HttpResponse, server } from "../../test/msw"
import { ManagePage } from "./manage-page"

const token = "header.payload.signature"
const branchId = "1f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const serviceId = "5f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const dentistId = "2f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const patientId = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const appointmentId = "4f9619ff-8b86-4d01-b42d-00cf4fc964ff"

const sizeClass = (element: Element): string | null => {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const found = /(?:^|\s)(text-(?:xs|sm|base|lg|xl|2xl|3xl))(?:\s|$)/.exec(node.className)
    if (found?.[1]) return found[1]
  }
  return null
}

const appointment = (status: string) => ({
  id: appointmentId,
  status,
  startsAt: "2026-08-03T03:30:00.000Z",
  endsAt: "2026-08-03T04:15:00.000Z",
  branch: { id: branchId, name: "Sukhumvit" },
  service: { id: serviceId, name: "Cleaning", durationMin: 45 },
  dentist: { id: dentistId, name: "Dr. Anong" },
  patient: { id: patientId, name: "Napat Chai" }
})

const cancels: string[] = []
let status = "confirmed"

const handlers = () => [
  http.get(`${API}/public/manage/:token`, () => HttpResponse.json(appointment(status))),
  http.post(`${API}/public/manage/:token/cancel`, ({ params }) => {
    cancels.push(String(params.token))
    status = "cancelled"
    return new HttpResponse(null, { status: 204 })
  })
]

const mount = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/manage/${token}`]}>
        <Routes>
          <Route path="/manage/:token" element={<ManagePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
  return user
}

describe("ManagePage", () => {
  beforeEach(() => {
    cancels.length = 0
    status = "confirmed"
  })

  it("renders the booking behind the signed link", async () => {
    server.use(...handlers())
    mount()

    expect(await screen.findByText("Mon, 3 Aug 2026 · 10:30")).toBeInTheDocument()
    expect(screen.getByText("Cleaning")).toBeInTheDocument()
    expect(screen.getByText("Dr. Anong")).toBeInTheDocument()
    expect(screen.getByText("Sukhumvit")).toBeInTheDocument()
    expect(screen.getByText("Napat Chai")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Cancel this booking" })).toBeInTheDocument()
  })

  it("asks for confirmation before it cancels anything", async () => {
    server.use(...handlers())
    const user = mount()
    await screen.findByText("Mon, 3 Aug 2026 · 10:30")

    await user.click(screen.getByRole("button", { name: "Cancel this booking" }))

    const dialog = await screen.findByTestId("cancel-confirm")
    expect(within(dialog).getByText(/will be given to someone else/)).toBeInTheDocument()
    expect(cancels).toEqual([])

    await user.click(within(dialog).getByRole("button", { name: "Yes, cancel booking" }))

    await waitFor(() => expect(cancels).toEqual([token]))
    expect(await screen.findByTestId("cancelled-notice")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Cancel this booking" })).not.toBeInTheDocument()
  })

  it("keeps the booking when the patient backs out of the confirmation", async () => {
    server.use(...handlers())
    const user = mount()
    await screen.findByText("Mon, 3 Aug 2026 · 10:30")

    await user.click(screen.getByRole("button", { name: "Cancel this booking" }))
    const dialog = await screen.findByTestId("cancel-confirm")
    await user.click(within(dialog).getByRole("button", { name: "Keep my booking" }))

    await waitFor(() => expect(screen.queryByTestId("cancel-confirm")).not.toBeInTheDocument())
    expect(cancels).toEqual([])
    expect(screen.getByRole("button", { name: "Cancel this booking" })).toBeInTheDocument()
  })

  it("shows an already cancelled booking as cancelled instead of offering cancel again", async () => {
    status = "cancelled"
    server.use(...handlers())
    mount()

    expect(await screen.findByTestId("cancelled-notice")).toHaveTextContent(
      "This booking is cancelled"
    )
    expect(screen.queryByRole("button", { name: "Cancel this booking" })).not.toBeInTheDocument()
    expect(screen.getByText("Mon, 3 Aug 2026 · 10:30")).toBeInTheDocument()
  })

  it("explains an expired or forged link instead of failing silently", async () => {
    server.use(
      http.get(`${API}/public/manage/:token`, () =>
        HttpResponse.json(
          { statusCode: 401, errorCode: "UNAUTHORIZED", message: "bad token", requestId: "r" },
          { status: 401 }
        )
      )
    )
    mount()

    expect(await screen.findByText("We could not open that booking")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Cancel this booking" })).not.toBeInTheDocument()
  })

  it("reads at phone size — 16px body, 44px targets, lining figures on the time", async () => {
    server.use(...handlers())
    mount()
    await screen.findByText("Mon, 3 Aug 2026 · 10:30")

    const main = screen.getByRole("main")
    expect(main.className).toContain("min-h-dvh")
    expect(main.className).not.toContain("h-screen")

    const written = Array.from(main.querySelectorAll<HTMLElement>("*")).filter((element) =>
      Array.from(element.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
      )
    )
    expect(written.length).toBeGreaterThan(5)
    for (const element of written) {
      expect(sizeClass(element)).not.toMatch(/text-(xs|sm)/)
    }

    expect(screen.getByText("Mon, 3 Aug 2026 · 10:30").className).toContain("tabular-nums")
    const cancelButton = screen.getByRole("button", { name: "Cancel this booking" })
    const height = /min-h-(\d+)/.exec(cancelButton.className)
    expect(Number(height?.[1]) * 4).toBeGreaterThanOrEqual(44)
  })
})
