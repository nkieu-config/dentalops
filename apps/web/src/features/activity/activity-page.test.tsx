import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "../../test/render"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { setSession } from "../../lib/session"
import { API, http, HttpResponse, server } from "../../test/msw"
import { bkkDayStart } from "../timeline/lib/geometry"
import { ActivityPage } from "./activity-page"

const ownerStaffId = "0f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const dentistStaffId = "2f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const cleaningServiceId = "3f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const staffList = [
  { id: ownerStaffId, name: "Malee Owner", role: "owner" as const, isActive: true },
  { id: dentistStaffId, name: "Dr. Anong", role: "dentist" as const, isActive: true }
]
const servicesList = [
  {
    id: cleaningServiceId,
    name: "Cleaning",
    durationMin: 45,
    bufferMin: 0,
    colorIndex: 0,
    isActive: true
  }
]

const tenantId = "9f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const appointmentId = "4f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const shiftId = "1f9619ff-8b86-4d01-b42d-00cf4fc964ff"

const staffActor = { type: "staff" as const, id: "u1", name: "Malee Owner" }
const guestActor = { type: "public" as const, id: "public", name: "Guest" }

const booked = {
  tenantId,
  actor: staffActor,
  action: "POST /appointments",
  entity: { type: "appointments", id: appointmentId },
  after: { id: appointmentId },
  at: "2026-08-03T03:30:00.000Z",
  requestId: "req-1"
}

const completed = {
  tenantId,
  actor: staffActor,
  action: "appointment.status",
  entity: { type: "appointment", id: appointmentId },
  before: { status: "confirmed" },
  after: { status: "completed" },
  at: "2026-08-03T02:15:00.000Z",
  requestId: "req-2"
}

const cancelledOnline = {
  tenantId,
  actor: guestActor,
  action: "POST /public/manage/:token/cancel",
  entity: { type: "public", id: appointmentId },
  at: "2026-08-02T09:00:00.000Z",
  requestId: "req-3"
}

const shiftAdded = {
  tenantId,
  actor: staffActor,
  action: "POST /shifts",
  entity: { type: "shifts", id: shiftId },
  at: "2026-08-01T01:00:00.000Z",
  requestId: "req-4"
}

const rosterChecked = (at: string, requestId: string) => ({
  tenantId,
  actor: staffActor,
  action: "POST /roster/validate",
  entity: { type: "unknown", id: "" },
  at,
  requestId
})

const asOwner = () =>
  setSession({
    accessToken: "t1",
    user: { id: "u1", tenantId, name: "Malee Owner", role: "owner" }
  })

const mount = (entry = "/app/activity") => {
  asOwner()
  server.use(
    http.get(`${API}/staff`, () => HttpResponse.json(staffList)),
    http.get(`${API}/services`, () => HttpResponse.json(servicesList))
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <ActivityPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
  return userEvent.setup()
}

describe("ActivityPage", () => {
  it("uses a calm command surface with clear page context", async () => {
    server.use(http.get(`${API}/audit-logs`, () => HttpResponse.json({ entries: [booked], nextCursor: null })))
    mount()

    expect(await screen.findByTestId("activity-command-surface")).toBeVisible()
    expect(screen.getByRole("heading", { name: "Activity", level: 1 })).toBeVisible()
    expect(screen.getByText("A chronological record of clinic changes.")).toBeVisible()
    expect(screen.getByRole("button", { name: "Filter" })).toHaveClass("[@media(pointer:coarse)]:h-11")
  })

  it("reads every entry as a sentence, never as a verb, a path or a json blob", async () => {
    server.use(
      http.get(`${API}/audit-logs`, () =>
        HttpResponse.json({
          entries: [booked, completed, cancelledOnline, shiftAdded],
          nextCursor: null
        })
      )
    )
    mount()

    const rows = await screen.findAllByRole("listitem")
    expect(rows).toHaveLength(4)

    expect(rows[0]).toHaveTextContent("Malee Owner booked an appointment")
    expect(rows[1]).toHaveTextContent("Malee Owner marked an appointment completed")
    expect(rows[2]).toHaveTextContent("Guest cancelled their own booking")
    expect(rows[3]).toHaveTextContent("Malee Owner added a shift")

    expect(rows[0]).not.toHaveTextContent(appointmentId.slice(0, 8))
    expect(rows[0]).toHaveTextContent("10:30")

    expect(document.body.textContent).not.toMatch(/POST |PATCH |DELETE |[{}[\]]/)
    const timeEls = document.querySelectorAll("time")
    expect(timeEls[0]).toHaveAttribute("datetime", booked.at)

    const sentence = rows[0]!.querySelector("p")
    expect(sentence?.className).toContain("min-w-0")
    expect(sentence).not.toHaveTextContent(appointmentId.slice(0, 8))
  })

  it("shows which service, which dentist and when, not just who and what verb", async () => {
    const fullyBooked = {
      tenantId,
      actor: staffActor,
      action: "POST /appointments",
      entity: { type: "appointments", id: appointmentId },
      after: {
        id: appointmentId,
        branchId: "branch-1",
        serviceId: cleaningServiceId,
        dentistId: dentistStaffId,
        patientId: "patient-1",
        startsAt: "2026-08-18T04:15:00.000Z",
        status: "confirmed"
      },
      at: "2026-08-03T03:30:00.000Z",
      requestId: "req-full"
    }
    server.use(
      http.get(`${API}/audit-logs`, () => HttpResponse.json({ entries: [fullyBooked], nextCursor: null }))
    )
    mount()

    const rows = await screen.findAllByRole("listitem")
    expect(rows[0]).toHaveTextContent("Cleaning")
    expect(rows[0]).toHaveTextContent("Dr. Anong")
    expect(rows[0]).toHaveTextContent("11:15")
  })

  it("omits the context line rather than showing nothing resolvable", async () => {
    server.use(
      http.get(`${API}/audit-logs`, () => HttpResponse.json({ entries: [booked], nextCursor: null }))
    )
    mount()

    const rows = await screen.findAllByRole("listitem")
    expect(rows[0]!.querySelectorAll("p")).toHaveLength(1)
  })

  it("groups consecutive routine events while keeping their individual times available", async () => {
    server.use(
      http.get(`${API}/audit-logs`, () =>
        HttpResponse.json({
          entries: [
            rosterChecked("2026-08-03T03:46:00.000Z", "req-r4"),
            rosterChecked("2026-08-03T03:45:00.000Z", "req-r3"),
            rosterChecked("2026-08-03T03:39:00.000Z", "req-r2"),
            rosterChecked("2026-08-03T03:39:00.000Z", "req-r1")
          ],
          nextCursor: null
        })
      )
    )
    mount()

    const rows = await screen.findAllByRole("listitem")
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent("Malee Owner checked the roster")
    expect(screen.getByText("4 checks")).toBeInTheDocument()
    expect(screen.getByText("10:46")).toBeInTheDocument()
  })

  it("keeps filters out of the default activity scan and reveals them on demand", async () => {
    server.use(http.get(`${API}/audit-logs`, () => HttpResponse.json({ entries: [booked], nextCursor: null })))
    const user = mount()

    expect(screen.queryByRole("combobox", { name: "Activity type" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Filter" }))
    expect(await screen.findByRole("combobox", { name: "Activity type" })).toBeInTheDocument()
    expect(screen.getByLabelText("From date")).toBeInTheDocument()
  })

  it("offers Load older only while a cursor remains, and pages with it", async () => {
    const cursors: (string | null)[] = []
    server.use(
      http.get(`${API}/audit-logs`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor")
        cursors.push(cursor)
        return HttpResponse.json(
          cursor === null
            ? { entries: [booked], nextCursor: "68a0000000000000000000aa" }
            : { entries: [shiftAdded], nextCursor: null }
        )
      })
    )
    const user = mount()

    const older = await screen.findByRole("button", { name: "Load older" })
    expect(await screen.findAllByRole("listitem")).toHaveLength(1)

    await user.click(older)

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2))
    expect(cursors).toEqual([null, "68a0000000000000000000aa"])
    expect(screen.getAllByRole("listitem")[1]).toHaveTextContent("added a shift")
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Load older" })).not.toBeInTheDocument()
    )
  })

  it("says the log is empty instead of drawing an empty list", async () => {
    server.use(
      http.get(`${API}/audit-logs`, () => HttpResponse.json({ entries: [], nextCursor: null }))
    )
    mount()

    expect(await screen.findByText("No recorded activity yet")).toBeInTheDocument()
    expect(screen.queryByRole("list")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Load older" })).not.toBeInTheDocument()
  })

  it("says so when the log cannot be loaded, and a retry actually recovers it", async () => {
    server.use(http.get(`${API}/audit-logs`, () => HttpResponse.error()))
    const user = mount()

    expect(await screen.findByText("Could not load the activity log")).toBeInTheDocument()

    server.use(
      http.get(`${API}/audit-logs`, () => HttpResponse.json({ entries: [booked], nextCursor: null }))
    )
    await user.click(screen.getByRole("button", { name: "Retry" }))

    expect(await screen.findAllByRole("listitem")).toHaveLength(1)
    expect(screen.queryByText("Could not load the activity log")).not.toBeInTheDocument()
  })

  describe("day grouping", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(new Date("2026-08-03T12:00:00+07:00"))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("buckets entries into Today, Yesterday and a formatted date for older days", async () => {
      server.use(
        http.get(`${API}/audit-logs`, () =>
          HttpResponse.json({
            entries: [booked, completed, cancelledOnline, shiftAdded],
            nextCursor: null
          })
        )
      )
      mount()

      expect(await screen.findByRole("heading", { name: "Today", level: 2 })).toBeInTheDocument()
      expect(screen.getByRole("heading", { name: "Yesterday", level: 2 })).toBeInTheDocument()
      expect(
        screen.getByRole("heading", { name: "Sat, 1 Aug 2026", level: 2 })
      ).toBeInTheDocument()

      const todayList = screen.getByRole("list", { name: "Today" })
      expect(todayList).toHaveTextContent("booked an appointment")
      expect(todayList).toHaveTextContent("marked an appointment completed")

      const yesterdayList = screen.getByRole("list", { name: "Yesterday" })
      expect(yesterdayList).toHaveTextContent("cancelled their own booking")

      const olderList = screen.getByRole("list", { name: "Sat, 1 Aug 2026" })
      expect(olderList).toHaveTextContent("added a shift")
    })
  })

  describe("filters", () => {
    it("sends the chosen type, actor and date range to the API", async () => {
      const queries: URLSearchParams[] = []
      server.use(
        http.get(`${API}/audit-logs`, ({ request }) => {
          queries.push(new URL(request.url).searchParams)
          return HttpResponse.json({ entries: [booked], nextCursor: null })
        })
      )
      const user = mount()

      await screen.findAllByRole("listitem")

      await user.click(screen.getByRole("button", { name: "Filter" }))

      await user.click(screen.getByRole("combobox", { name: "Activity type" }))
      await user.click(await screen.findByRole("option", { name: "Appointments" }))

      const actorTrigger = screen.getByRole("combobox", { name: "Actor" })
      await waitFor(() => expect(actorTrigger).not.toBeDisabled())
      await user.click(actorTrigger)
      await user.click(await screen.findByRole("option", { name: "Dr. Anong" }))

      await user.type(screen.getByLabelText("From date"), "2026-08-01")
      await user.type(screen.getByLabelText("To date"), "2026-08-02")

      expect(queries).toHaveLength(1)
      await user.click(screen.getByRole("button", { name: "Apply filters" }))

      await waitFor(() => {
        expect(queries.at(-1)?.get("entityTypes")).toBe("appointments,appointment,series")
        expect(queries.at(-1)?.get("actorId")).toBe(dentistStaffId)
        expect(queries.at(-1)?.get("from")).toBe(new Date(bkkDayStart("2026-08-01")).toISOString())
        const to = queries.at(-1)?.get("to")
        expect(to).not.toBeNull()
        expect(Date.parse(to!) - bkkDayStart("2026-08-02")).toBe(86_400_000 - 1)
      })
    })

    it("lets guests be isolated from staff activity", async () => {
      const queries: URLSearchParams[] = []
      server.use(
        http.get(`${API}/audit-logs`, ({ request }) => {
          queries.push(new URL(request.url).searchParams)
          return HttpResponse.json({ entries: [cancelledOnline], nextCursor: null })
        })
      )
      const user = mount()
      await screen.findAllByRole("listitem")

      await user.click(screen.getByRole("button", { name: "Filter" }))

      await user.click(screen.getByRole("combobox", { name: "Actor" }))
      await user.click(await screen.findByRole("option", { name: "Guests (public)" }))
      expect(queries).toHaveLength(1)
      await user.click(screen.getByRole("button", { name: "Apply filters" }))

      await waitFor(() => expect(queries.at(-1)?.get("actorType")).toBe("public"))
      expect(queries.at(-1)?.get("actorId")).toBeNull()
    })

    it("shows a filtered empty state, distinct from a genuinely quiet log, with a way to clear it", async () => {
      const queries: URLSearchParams[] = []
      server.use(
        http.get(`${API}/audit-logs`, ({ request }) => {
          queries.push(new URL(request.url).searchParams)
          return HttpResponse.json({ entries: [], nextCursor: null })
        })
      )
      const user = mount("/app/activity?type=patients")

      expect(await screen.findByText("No activity matches these filters")).toBeInTheDocument()
      expect(queries.at(-1)?.get("entityTypes")).toBe("patients")

      await user.click(screen.getAllByRole("button", { name: "Clear filters" })[0]!)

      expect(await screen.findByText("No recorded activity yet")).toBeInTheDocument()
      await waitFor(() => expect(queries.at(-1)?.get("entityTypes")).toBeNull())
    })
  })

  it("announces that it is loading instead of leaving a screen reader in silence", async () => {
    server.use(http.get(`${API}/audit`, () => new Promise(() => {})))
    mount()

    const loading = await screen.findByTestId("activity-loading")
    expect(loading).toHaveAttribute("aria-busy", "true")
    expect(loading).toHaveAccessibleName("Loading activity")
    expect(within(loading).getAllByTestId("activity-row-skeleton").length).toBeGreaterThan(0)
  })

  it("keeps loaded activity visible when loading an older page fails", async () => {
    server.use(
      http.get(`${API}/audit-logs`, ({ request }) =>
        new URL(request.url).searchParams.has("cursor")
          ? HttpResponse.json({ message: "Unavailable" }, { status: 500 })
          : HttpResponse.json({ entries: [booked], nextCursor: "68a0000000000000000000aa" })
      )
    )
    const user = mount()

    await user.click(await screen.findByRole("button", { name: "Load older" }))

    expect(await screen.findByText("Could not load older activity")).toBeVisible()
    expect(screen.getByText("Malee Owner")).toBeVisible()
    expect(within(screen.getByRole("alert")).getByRole("button", { name: "Retry" })).toBeVisible()
  })

  describe("deep links", () => {
    it("links an entry to where it happened once the payload carries enough to resolve it, and leaves the rest as plain text", async () => {
      const dated = {
        tenantId,
        actor: staffActor,
        action: "POST /appointments",
        entity: { type: "appointments", id: appointmentId },
        after: { id: appointmentId, startsAt: "2026-08-05T03:00:00.000Z", branchId: "branch-1" },
        at: "2026-08-05T03:00:00.000Z",
        requestId: "req-dated"
      }
      const patientAdded = {
        tenantId,
        actor: staffActor,
        action: "POST /patients",
        entity: { type: "patients", id: "patient-1" },
        after: { id: "patient-1" },
        at: "2026-08-05T04:00:00.000Z",
        requestId: "req-patient"
      }
      const shiftDated = {
        tenantId,
        actor: staffActor,
        action: "POST /shifts",
        entity: { type: "shifts", id: shiftId },
        after: { id: shiftId, startsAt: "2026-08-06T01:00:00.000Z", branchId: "branch-2" },
        at: "2026-08-06T01:00:00.000Z",
        requestId: "req-shift"
      }
      server.use(
        http.get(`${API}/audit-logs`, () =>
          HttpResponse.json({
            entries: [dated, patientAdded, shiftDated, booked],
            nextCursor: null
          })
        )
      )
      mount()

      const rows = await screen.findAllByRole("listitem")
      expect(rows).toHaveLength(4)

      expect(within(rows[0]!).getByRole("link")).toHaveAttribute(
        "href",
        `/app/timeline?d=2026-08-05&b=branch-1&a=${appointmentId}`
      )
      expect(within(rows[1]!).getByRole("link")).toHaveAttribute("href", "/app/patients/patient-1")
      expect(within(rows[2]!).getByRole("link")).toHaveAttribute(
        "href",
        "/app/roster?w=2026-08-06&b=branch-2"
      )
      expect(within(rows[3]!).queryByRole("link")).not.toBeInTheDocument()
    })
  })
})
