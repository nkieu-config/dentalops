import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"
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

    const feed = screen.getByRole("list", { name: "Activity" })
    expect(feed.textContent).not.toMatch(/POST |PATCH |DELETE |[{}[\]]/)
    expect(feed.querySelector("time")).toHaveAttribute("datetime", booked.at)
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
    expect(screen.queryByRole("list", { name: "Activity" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Load older" })).not.toBeInTheDocument()
  })
})
