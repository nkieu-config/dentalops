import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API, delay, http, HttpResponse, server } from "../../test/msw"
import { BookingPage } from "./booking-page"

const NOW = "2026-08-03T03:00:00.000Z"
const BKK_DATE = "2026-08-03"
const clinicSlug = "demo-clinic"

const branchId = "1f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const serviceId = "5f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const anong = "2f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const somchai = "8f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const holdId = "3f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const signedHoldId = "eyJhbGciOiJIUzI1NiJ9.eyJwdXJwb3NlIjoiaG9sZCJ9.qA-3_uZ0hSdEXAMPLEsig"
const patientId = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const appointmentId = "4f9619ff-8b86-4d01-b42d-00cf4fc964ff"

const clinic = {
  id: "9f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  name: "Bright Smile Dental",
  slug: clinicSlug,
  branches: [{ id: branchId, name: "Sukhumvit" }],
  services: [
    { id: serviceId, name: "Cleaning", durationMin: 45, colorIndex: 0 },
    { id: "7f9619ff-8b86-4d01-b42d-00cf4fc964ff", name: "Whitening", durationMin: 60, colorIndex: 1 }
  ],
  dentists: [
    { id: anong, name: "Dr. Anong" },
    { id: somchai, name: "Dr. Somchai" }
  ]
}

const slot = (dentistId: string, hhmm: string, endHhmm: string) => ({
  dentistId,
  startsAt: `2026-08-03T${hhmm}:00.000Z`,
  endsAt: `2026-08-03T${endHhmm}:00.000Z`
})

const TEN_THIRTY = slot(anong, "03:30", "04:15")
const TEN_FORTY_FIVE = slot(anong, "03:45", "04:30")

const booking = {
  appointment: {
    id: appointmentId,
    status: "confirmed",
    startsAt: TEN_THIRTY.startsAt,
    endsAt: TEN_THIRTY.endsAt,
    clinic: { id: clinic.id, name: clinic.name, slug: clinicSlug },
    branch: { id: branchId, name: "Sukhumvit" },
    service: { id: serviceId, name: "Cleaning", durationMin: 45 },
    dentist: { id: anong, name: "Dr. Anong" },
    patient: { id: patientId, name: "Napat Chai" }
  },
  manageToken: "header.payload.signature"
}

interface Recorded {
  availability: Record<string, string>[]
  holds: Record<string, unknown>[]
  released: string[]
  confirms: Record<string, unknown>[]
}

const recorded: Recorded = { availability: [], holds: [], released: [], confirms: [] }

const apiError = (status: number, errorCode: string, message: string) =>
  HttpResponse.json({ statusCode: status, errorCode, message, requestId: "r" }, { status })

const tenThirtyGoneOnceHeld = () =>
  recorded.holds.length > 0 ? [TEN_FORTY_FIVE] : [TEN_THIRTY, TEN_FORTY_FIVE]

interface HandlerOptions {
  slots?: () => { dentistId: string; startsAt: string; endsAt: string }[]
  availabilityDelayMs?: number
  holdTtlMs?: number
  holdResponse?: () => Response
  confirmResponse?: () => Response
}

const handlers = (options: HandlerOptions = {}) => [
  http.get(`${API}/public/${clinicSlug}`, () => HttpResponse.json(clinic)),
  http.get(`${API}/public/${clinicSlug}/availability`, async ({ request }) => {
    recorded.availability.push(Object.fromEntries(new URL(request.url).searchParams))
    if (options.availabilityDelayMs) await delay(options.availabilityDelayMs)
    return HttpResponse.json({ slots: options.slots?.() ?? [TEN_THIRTY, TEN_FORTY_FIVE] })
  }),
  http.post(`${API}/public/${clinicSlug}/holds`, async ({ request }) => {
    recorded.holds.push((await request.json()) as Record<string, unknown>)
    if (options.holdResponse) return options.holdResponse()
    return HttpResponse.json(
      {
        holdId,
        expiresAt: new Date(Date.now() + (options.holdTtlMs ?? 300_000)).toISOString()
      },
      { status: 201 }
    )
  }),
  http.delete(`${API}/public/${clinicSlug}/holds/:holdId`, ({ params }) => {
    recorded.released.push(String(params.holdId))
    return new HttpResponse(null, { status: 204 })
  }),
  http.post(`${API}/public/${clinicSlug}/appointments`, async ({ request }) => {
    recorded.confirms.push((await request.json()) as Record<string, unknown>)
    if (options.confirmResponse) return options.confirmResponse()
    return HttpResponse.json(booking, { status: 201 })
  })
]

const mount = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/book/${clinicSlug}`]}>
        <Routes>
          <Route path="/book/:clinicSlug" element={<BookingPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
  return user
}

type User = ReturnType<typeof userEvent.setup>

const walkToSlots = async (user: User) => {
  await user.click(await screen.findByRole("button", { name: /Cleaning/ }))
  await user.click(await screen.findByTestId("any-dentist-option"))
  return screen.findByTestId("group-morning")
}

const fillDetails = async (user: User) => {
  await user.type(screen.getByLabelText("Full name"), "Napat Chai")
  await user.type(screen.getByLabelText("Mobile number"), "0812345678")
}

const sizeClass = (element: Element): string | null => {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const found = /(?:^|\s)(text-(?:xs|sm|base|lg|xl|2xl|3xl))(?:\s|$)/.exec(node.className)
    if (found?.[1]) return found[1]
  }
  return null
}

describe("BookingPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(Date.parse(NOW))
    recorded.availability = []
    recorded.holds = []
    recorded.released = []
    recorded.confirms = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("uses an accessible foreground for the selected branch", async () => {
    server.use(
      http.get(`${API}/public/${clinicSlug}`, () =>
        HttpResponse.json({
          ...clinic,
          branches: [...clinic.branches, { id: "af9619ff-8b86-4d01-b42d-00cf4fc964ff", name: "Ladprao" }]
        })
      )
    )
    mount()

    expect(await screen.findByRole("button", { name: "Sukhumvit" })).toHaveClass(
      "text-secondary-foreground"
    )
  })

  it("asks for one Bangkok day and omits dentistId when the patient takes any dentist", async () => {
    server.use(...handlers({ slots: () => [slot(somchai, "03:30", "04:15"), TEN_FORTY_FIVE] }))
    const user = mount()
    await walkToSlots(user)

    expect(recorded.availability).toEqual([{ serviceId, branchId, date: BKK_DATE }])
    expect(recorded.availability[0]).not.toHaveProperty("dentistId")

    await user.click(screen.getByRole("button", { name: "10:30" }))

    await waitFor(() => expect(recorded.holds).toHaveLength(1))
    expect(recorded.holds[0]).toEqual({
      serviceId,
      branchId,
      dentistId: somchai,
      startsAt: TEN_THIRTY.startsAt
    })
  })

  it("offers every dentist the clinic returned, with any-available first", async () => {
    server.use(...handlers())
    const user = mount()
    await user.click(await screen.findByRole("button", { name: /Cleaning/ }))

    const options = await screen.findAllByRole("listitem")
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      "Any available dentistSoonest booking",
      "ADr. Anong",
      "SDr. Somchai"
    ])
  })

  it("passes the chosen dentist to the availability query and holds with that dentist", async () => {
    server.use(...handlers({ slots: () => [slot(somchai, "03:30", "04:15")] }))
    const user = mount()
    await user.click(await screen.findByRole("button", { name: /Cleaning/ }))
    await user.click(await screen.findByRole("button", { name: /Dr. Somchai/ }))
    await screen.findByTestId("group-morning")

    expect(recorded.availability).toEqual([
      { serviceId, branchId, date: BKK_DATE, dentistId: somchai }
    ])

    await user.click(screen.getByRole("button", { name: "10:30" }))

    await waitFor(() => expect(recorded.holds).toHaveLength(1))
    expect(recorded.holds[0]).toMatchObject({ dentistId: somchai })
  })

  it("holds the slot the moment it is tapped and counts down from the server's expiresAt", async () => {
    server.use(...handlers({ holdTtlMs: 90_000 }))
    const user = mount()
    await walkToSlots(user)

    await user.click(screen.getByRole("button", { name: "10:30" }))

    const banner = await screen.findByTestId("hold-countdown")
    expect(recorded.holds).toHaveLength(1)
    expect(banner).toHaveTextContent("Holding 10:30 for 1:30")
    expect(banner).not.toHaveTextContent("5:00")
    expect(screen.getByLabelText("Full name")).toBeInTheDocument()
  })

  it("replaces the details form with the recovery state when the hold runs out", async () => {
    server.use(...handlers({ holdTtlMs: 30_000, slots: tenThirtyGoneOnceHeld }))
    const user = mount()
    await walkToSlots(user)
    await user.click(screen.getByRole("button", { name: "10:30" }))
    await screen.findByTestId("hold-countdown")

    act(() => vi.advanceTimersByTime(31_000))

    const recovery = await screen.findByTestId("hold-recovery")
    expect(within(recovery).getByText("Your hold expired")).toBeInTheDocument()
    expect(within(recovery).getByText("10:30 was taken.")).toBeInTheDocument()
    expect(screen.queryByLabelText("Full name")).not.toBeInTheDocument()
    await waitFor(() => expect(within(recovery).getByText("10:45")).toBeInTheDocument())

    await user.click(within(recovery).getByRole("button", { name: "Pick another time" }))
    expect(await screen.findByRole("button", { name: "10:45" })).toBeInTheDocument()
    expect(screen.queryByTestId("hold-recovery")).not.toBeInTheDocument()
  })

  it("releases the hold when the patient goes back from the details step", async () => {
    server.use(...handlers())
    const user = mount()
    await walkToSlots(user)
    await user.click(screen.getByRole("button", { name: "10:30" }))
    await screen.findByTestId("hold-countdown")

    await user.click(screen.getByRole("button", { name: "Back" }))

    await waitFor(() => expect(recorded.released).toEqual([holdId]))
    expect(await screen.findByRole("button", { name: "10:30" })).toBeInTheDocument()
  })

  it("recovers from a 409 on confirm without losing what the patient typed", async () => {
    server.use(
      ...handlers({
        slots: tenThirtyGoneOnceHeld,
        confirmResponse: () => apiError(409, "SLOT_CONFLICT", "Dentist is already booked")
      })
    )
    const user = mount()
    await walkToSlots(user)
    await user.click(screen.getByRole("button", { name: "10:30" }))
    await screen.findByTestId("hold-countdown")
    await fillDetails(user)

    await user.click(screen.getByRole("button", { name: "Confirm booking" }))

    const recovery = await screen.findByTestId("hold-recovery")
    expect(within(recovery).getByText("That time was just booked")).toBeInTheDocument()
    expect(screen.queryByText("Dentist is already booked")).not.toBeInTheDocument()
    await waitFor(() => expect(within(recovery).getByText("10:45")).toBeInTheDocument())

    await user.click(within(recovery).getByRole("button", { name: "Pick another time" }))
    await user.click(await screen.findByRole("button", { name: "10:45" }))

    expect(await screen.findByLabelText("Full name")).toHaveValue("Napat Chai")
    expect(screen.getByLabelText("Mobile number")).toHaveValue("0812345678")
  })

  it("treats an expired hold reported by confirm as the same recovery, not a raw error", async () => {
    server.use(
      ...handlers({
        confirmResponse: () => apiError(409, "HOLD_EXPIRED", "That time is no longer held for you")
      })
    )
    const user = mount()
    await walkToSlots(user)
    await user.click(screen.getByRole("button", { name: "10:30" }))
    await screen.findByTestId("hold-countdown")
    await fillDetails(user)

    await user.click(screen.getByRole("button", { name: "Confirm booking" }))

    const recovery = await screen.findByTestId("hold-recovery")
    expect(within(recovery).getByText("Your hold expired")).toBeInTheDocument()
    expect(screen.queryByText("That time is no longer held for you")).not.toBeInTheDocument()
  })

  it("confirms with the held slot and shows the booking with a manage link", async () => {
    server.use(...handlers())
    const user = mount()
    await walkToSlots(user)
    await user.click(screen.getByRole("button", { name: "10:30" }))
    await screen.findByTestId("hold-countdown")
    await fillDetails(user)
    await user.type(screen.getByLabelText(/Email/), "napat@example.com")

    await user.click(screen.getByRole("button", { name: "Confirm booking" }))

    expect(await screen.findByText("You are booked")).toBeInTheDocument()
    expect(recorded.confirms).toEqual([
      { holdId, name: "Napat Chai", phone: "0812345678", email: "napat@example.com" }
    ])
    expect(screen.getByText("Mon, 3 Aug 2026 · 10:30")).toBeInTheDocument()
    expect(screen.getByText("Dr. Anong")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Change or cancel/ })).toHaveAttribute(
      "href",
      "/manage/header.payload.signature"
    )
    expect(screen.queryByTestId("hold-countdown")).not.toBeInTheDocument()
  })

  it("books on a signed hold exactly as it does on a redis one", async () => {
    server.use(
      ...handlers({
        holdResponse: () =>
          HttpResponse.json(
            { holdId: signedHoldId, expiresAt: new Date(Date.now() + 300_000).toISOString() },
            { status: 201 }
          )
      })
    )
    const user = mount()
    await walkToSlots(user)
    await user.click(screen.getByRole("button", { name: "10:30" }))
    await screen.findByTestId("hold-countdown")
    await fillDetails(user)

    await user.click(screen.getByRole("button", { name: "Confirm booking" }))

    expect(await screen.findByText("You are booked")).toBeInTheDocument()
    expect(recorded.confirms).toEqual([
      { holdId: signedHoldId, name: "Napat Chai", phone: "0812345678" }
    ])
  })

  it("releases a signed hold through the same delete route", async () => {
    server.use(
      ...handlers({
        holdResponse: () =>
          HttpResponse.json(
            { holdId: signedHoldId, expiresAt: new Date(Date.now() + 300_000).toISOString() },
            { status: 201 }
          )
      })
    )
    const user = mount()
    await walkToSlots(user)
    await user.click(screen.getByRole("button", { name: "10:30" }))
    await screen.findByTestId("hold-countdown")

    await user.click(screen.getByRole("button", { name: "Back" }))

    await waitFor(() => expect(recorded.released).toEqual([signedHoldId]))
  })

  it("keeps the phone number the only gate on confirming", async () => {
    server.use(...handlers())
    const user = mount()
    await walkToSlots(user)
    await user.click(screen.getByRole("button", { name: "10:30" }))
    await screen.findByTestId("hold-countdown")

    const confirm = screen.getByRole("button", { name: "Confirm booking" })
    expect(confirm).toBeDisabled()

    await user.type(screen.getByLabelText("Full name"), "Napat Chai")
    await user.type(screen.getByLabelText("Mobile number"), "081234")
    expect(confirm).toBeDisabled()

    await user.type(screen.getByLabelText("Mobile number"), "5678")
    expect(confirm).toBeEnabled()
  })

  it("shows one chip per time even when several dentists are free, and omits nothing else", async () => {
    server.use(
      ...handlers({
        slots: () => [slot(anong, "03:30", "04:15"), slot(somchai, "03:30", "04:15"), TEN_FORTY_FIVE]
      })
    )
    const user = mount()
    await walkToSlots(user)

    expect(screen.getAllByTestId("slot")).toHaveLength(2)
    expect(screen.getByText("2 times available")).toBeInTheDocument()
  })

  it("draws the slot step with the shared SlotPicker, skeletons and all", async () => {
    server.use(...handlers({ slots: () => [], availabilityDelayMs: 40 }))
    const user = mount()
    await user.click(await screen.findByRole("button", { name: /Cleaning/ }))
    await user.click(await screen.findByTestId("any-dentist-option"))

    expect(screen.getAllByTestId("slot-skeleton").length).toBeGreaterThan(0)
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()

    expect(await screen.findByText("No free slots this day")).toBeInTheDocument()
    expect(screen.queryAllByTestId("slot")).toHaveLength(0)
    expect(screen.getByRole("button", { name: "Next day of slots" })).toBeInTheDocument()
  })

  it("reads at phone size — 16px body, 44px targets, lining figures on times", async () => {
    server.use(...handlers())
    const user = mount()
    await walkToSlots(user)

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

    for (const chip of screen.getAllByTestId("slot")) {
      expect(chip.className).toContain("tabular-nums")
      const height = /min-h-(\d+)/.exec(chip.className)
      expect(Number(height?.[1]) * 4).toBeGreaterThanOrEqual(44)
    }
  })
})
