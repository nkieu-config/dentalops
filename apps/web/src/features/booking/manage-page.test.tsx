import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"
import { beforeEach, describe, expect, it } from "vitest"
import { API, http, HttpResponse, server } from "../../test/msw"
import { ManagePage } from "./manage-page"

const token = "header.payload.signature"
const clinicId = "9f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const clinicSlug = "demo-clinic"
const branchId = "1f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const serviceId = "5f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const dentistId = "2f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const patientId = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const appointmentId = "4f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const holdId = "3f9619ff-8b86-4d01-b42d-00cf4fc964ff"

const NOON = "2026-08-03T05:00:00.000Z"
const ONE = "2026-08-03T06:00:00.000Z"

const sizeClass = (element: Element): string | null => {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const className = typeof node.className === "string" ? node.className : ""
    const found = /(?:^|\s)(type-(?:meta|dense|ui|supporting|body|card-title|subsection-title|section-title|page-title|display|display-lg))(?:\s|$)/.exec(className)
    if (found?.[1]) return found[1]
  }
  return null
}

const appointment = () => ({
  id: appointmentId,
  status,
  startsAt,
  endsAt: new Date(Date.parse(startsAt) + 45 * 60_000).toISOString(),
  clinic: { id: clinicId, name: "Bright Smile Dental", slug: clinicSlug },
  branch: { id: branchId, name: "Sukhumvit" },
  service: { id: serviceId, name: "Cleaning", durationMin: 45 },
  dentist: { id: dentistId, name: "Dr. Anong" },
  patient: { id: patientId, name: "Napat Chai" }
})

const slot = (startsAtIso: string) => ({
  dentistId,
  startsAt: startsAtIso,
  endsAt: new Date(Date.parse(startsAtIso) + 45 * 60_000).toISOString()
})

const cancels: string[] = []
const holds: Record<string, unknown>[] = []
const released: string[] = []
const reschedules: Record<string, unknown>[] = []
let status = "confirmed"
let startsAt = "2026-08-03T03:30:00.000Z"

const apiError = (httpStatus: number, errorCode: string, message: string) =>
  HttpResponse.json({ statusCode: httpStatus, errorCode, message, requestId: "r" }, { status: httpStatus })

interface HandlerOptions {
  holdResponse?: () => Response
  rescheduleResponse?: () => Response
}

const handlers = (options: HandlerOptions = {}) => [
  http.get(`${API}/public/manage/:token`, () => HttpResponse.json(appointment())),
  http.post(`${API}/public/manage/:token/cancel`, ({ params }) => {
    cancels.push(String(params.token))
    status = "cancelled"
    return new HttpResponse(null, { status: 204 })
  }),
  http.get(`${API}/public/${clinicSlug}/availability`, () =>
    HttpResponse.json({ slots: [slot(NOON), slot(ONE)] })
  ),
  http.post(`${API}/public/${clinicSlug}/holds`, async ({ request }) => {
    holds.push((await request.json()) as Record<string, unknown>)
    if (options.holdResponse) return options.holdResponse()
    return HttpResponse.json(
      { holdId, expiresAt: new Date(Date.now() + 300_000).toISOString() },
      { status: 201 }
    )
  }),
  http.delete(`${API}/public/${clinicSlug}/holds/:holdId`, ({ params }) => {
    released.push(String(params.holdId))
    return new HttpResponse(null, { status: 204 })
  }),
  http.post(`${API}/public/manage/:token/reschedule`, async ({ request }) => {
    reschedules.push((await request.json()) as Record<string, unknown>)
    if (options.rescheduleResponse) return options.rescheduleResponse()
    startsAt = NOON
    return HttpResponse.json(appointment())
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
    holds.length = 0
    released.length = 0
    reschedules.length = 0
    status = "confirmed"
    startsAt = "2026-08-03T03:30:00.000Z"
  })

  it("renders the booking behind the signed link", async () => {
    server.use(...handlers())
    mount()

    expect(await screen.findByText("Mon, 3 Aug 2026 · 10:30")).toBeInTheDocument()
    expect(screen.getByText("Cleaning")).toBeInTheDocument()
    expect(screen.getByText("Dr. Anong")).toBeInTheDocument()
    expect(screen.getByText("Sukhumvit")).toBeInTheDocument()
    expect(screen.getByText("Napat Chai")).toBeInTheDocument()
    expect(screen.getByText("Bright Smile Dental")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Cancel this booking" })).toBeInTheDocument()
  })

  it("asks for confirmation before it cancels anything", async () => {
    server.use(...handlers())
    const user = mount()
    await screen.findByText("Mon, 3 Aug 2026 · 10:30")

    await user.click(screen.getByRole("button", { name: "Cancel this booking" }))

    const dialog = await screen.findByRole("alertdialog")
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
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Keep my booking" }))

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
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

  it("moves the booking through a fresh hold the patient confirms", async () => {
    server.use(...handlers())
    const user = mount()
    await screen.findByText("Mon, 3 Aug 2026 · 10:30")

    await user.click(screen.getByRole("button", { name: "Move to another time" }))
    const panel = await screen.findByTestId("reschedule-panel")
    const offered = await within(panel).findAllByTestId("slot")
    expect(offered.map((button) => button.textContent)).toEqual(["12:00", "13:00"])

    await user.click(offered[0]!)

    expect(await screen.findByTestId("hold-countdown")).toHaveTextContent("Holding 12:00")
    expect(holds).toEqual([{ serviceId, branchId, dentistId, startsAt: NOON }])
    expect(reschedules).toEqual([])

    const comparison = screen.getByTestId("reschedule-comparison")
    expect(comparison).toHaveTextContent("Mon, 3 Aug 2026 · 10:30")
    expect(comparison).toHaveTextContent("Mon, 3 Aug 2026 · 12:00")

    await user.click(screen.getByRole("button", { name: "Confirm new time" }))

    await waitFor(() => expect(reschedules).toEqual([{ holdId }]))
    expect(await screen.findByText("Mon, 3 Aug 2026 · 12:00")).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByTestId("reschedule-panel")).not.toBeInTheDocument()
    )
    expect(released).toEqual([])
  })

  it("gives the held slot back when the patient picks again", async () => {
    server.use(...handlers())
    const user = mount()
    await screen.findByText("Mon, 3 Aug 2026 · 10:30")

    await user.click(screen.getByRole("button", { name: "Move to another time" }))
    const panel = await screen.findByTestId("reschedule-panel")
    await user.click((await within(panel).findAllByTestId("slot"))[1]!)
    await screen.findByTestId("hold-countdown")

    await user.click(screen.getByRole("button", { name: "Pick another time" }))

    await waitFor(() => expect(released).toEqual([holdId]))
    expect(await within(panel).findAllByTestId("slot")).toHaveLength(2)
    expect(reschedules).toEqual([])
  })

  it("returns the patient to the picker when the server says the hold expired", async () => {
    server.use(
      ...handlers({
        rescheduleResponse: () => apiError(409, "HOLD_EXPIRED", "That time is no longer held")
      })
    )
    const user = mount()
    await screen.findByText("Mon, 3 Aug 2026 · 10:30")

    await user.click(screen.getByRole("button", { name: "Move to another time" }))
    const panel = await screen.findByTestId("reschedule-panel")
    await user.click((await within(panel).findAllByTestId("slot"))[0]!)
    await screen.findByTestId("hold-countdown")
    await user.click(screen.getByRole("button", { name: "Confirm new time" }))

    await waitFor(() => expect(screen.queryByTestId("hold-countdown")).not.toBeInTheDocument())
    expect(await within(panel).findAllByTestId("slot")).toHaveLength(2)
    expect(screen.getByText("Mon, 3 Aug 2026 · 10:30")).toBeInTheDocument()
  })

  it("offers no move at all once the booking is cancelled", async () => {
    status = "cancelled"
    server.use(...handlers())
    mount()

    await screen.findByTestId("cancelled-notice")
    expect(screen.queryByRole("button", { name: "Move to another time" })).not.toBeInTheDocument()
  })

  it("reads at phone size — 16px body, 44px targets, lining figures on the time", async () => {
    server.use(...handlers())
    mount()
    await screen.findByText("Mon, 3 Aug 2026 · 10:30")

    const main = screen.getByRole("main")
    expect(main.className).toContain("min-h-dvh")
    expect(main.className).toContain("safe-area-inset-bottom")
    expect(main.className).not.toContain("h-screen")

    const written = Array.from(main.querySelectorAll<HTMLElement>("*")).filter((element) =>
      Array.from(element.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
      )
    )
    expect(written.length).toBeGreaterThan(5)
    for (const element of written) {
      expect(sizeClass(element)).not.toMatch(/type-(meta|dense)/)
    }

    expect(screen.getByText("Mon, 3 Aug 2026 · 10:30").className).toContain("tabular-nums")
    const cancelButton = screen.getByRole("button", { name: "Cancel this booking" })
    const height = /min-h-(\d+)/.exec(cancelButton.className)
    expect(Number(height?.[1]) * 4).toBeGreaterThanOrEqual(44)
  })
})
