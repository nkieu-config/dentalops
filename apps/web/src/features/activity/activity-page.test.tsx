import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { setSession } from "../../lib/session"
import { API, http, HttpResponse, server } from "../../test/msw"
import { ActivityPage } from "./activity-page"

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

const asOwner = () =>
  setSession({
    accessToken: "t1",
    user: { id: "u1", tenantId, name: "Malee Owner", role: "owner" }
  })

const mount = () => {
  asOwner()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/activity"]}>
        <ActivityPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
  return userEvent.setup()
}

describe("ActivityPage", () => {
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

    expect(rows[0]).toHaveTextContent("appointment")
    expect(rows[0]).toHaveTextContent(appointmentId.slice(0, 8))
    expect(rows[0]).toHaveTextContent("10:30")

    expect(document.body.textContent).not.toMatch(/POST |PATCH |DELETE |[{}[\]]/)
    const timeEls = document.querySelectorAll("time")
    expect(timeEls[0]).toHaveAttribute("datetime", booked.at)

    // A row's flex-wrap parent needs its text sibling to keep its natural min-content width,
    // or long entries overlap the timestamp instead of wrapping — see patient-detail.tsx history.
    const sentence = rows[0]!.querySelector("p")
    expect(sentence?.className).not.toContain("min-w-0")
    expect(sentence).not.toHaveTextContent(appointmentId.slice(0, 8))
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

    expect(await screen.findByText("Nothing has happened yet")).toBeInTheDocument()
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
})
