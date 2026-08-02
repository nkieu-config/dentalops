import type { Shift, Violation } from "@dentalops/contracts"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"
import { Toaster } from "sonner"
import { describe, expect, it } from "vitest"
import { setSession } from "../../lib/session"
import { API, http, HttpResponse, server } from "../../test/msw"
import { setViewport, type Viewport } from "../../test/viewport"
import { RosterRoute } from "./roster-page"

const branchId = "1f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const anongId = "2f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const somchaiId = "8f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const serviceId = "5f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const patientId = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const ownerId = "7f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const tenantId = "9f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const monShiftId = "b1000000-0000-4000-8000-000000000001"
const somchaiShiftId = "b1000000-0000-4000-8000-000000000003"
const apptId = "a1000000-0000-4000-8000-000000000021"

const WEEK = ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"]
const COLUMN_WIDTH = 100
const FIRST_COLUMN_LEFT = 200

const APPT_STARTS = "2026-08-03T08:30:00.000Z"
const APPT_ENDS = "2026-08-03T09:30:00.000Z"

interface DraftBody {
  branchId: string
  from: string
  to: string
  draftShifts: { id?: string; staffId: string; startsAt: string; endsAt: string }[]
}

const shift = (id: string, staffId: string, startsAt: string, endsAt: string): Shift => ({
  id,
  staffId,
  branchId,
  startsAt,
  endsAt,
  seriesId: null
})

const savedShifts = (): Shift[] => [
  shift(monShiftId, anongId, "2026-08-03T02:00:00.000Z", "2026-08-03T10:00:00.000Z"),
  shift(somchaiShiftId, somchaiId, "2026-08-05T02:00:00.000Z", "2026-08-05T10:00:00.000Z")
]

const appointment = {
  id: apptId,
  branchId,
  serviceId,
  dentistId: anongId,
  patientId,
  startsAt: APPT_STARTS,
  endsAt: APPT_ENDS,
  status: "confirmed",
  version: 1,
  seriesId: null,
  service: { id: serviceId, name: "Root canal", colorIndex: 0 },
  patient: { id: patientId, name: "S. Chaiwat", phone: "0812345678" },
  claims: []
}

const outsideShift: Violation = {
  rule: "appointment_outside_shift",
  severity: "block",
  staffId: anongId,
  detail: "1 confirmed appointment falls outside the rostered shifts",
  appointmentIds: [apptId]
}

const covers = (list: { startsAt: string; endsAt: string }[]) =>
  list.some(
    (s) =>
      Date.parse(s.startsAt) <= Date.parse(APPT_STARTS) &&
      Date.parse(s.endsAt) >= Date.parse(APPT_ENDS)
  )

interface RosterState {
  shifts: Shift[]
  bodies: DraftBody[]
  deleted: string[]
  created: unknown[]
  patched: Array<{ id: string; body: unknown }>
}

const freshState = (): RosterState => ({
  shifts: savedShifts(),
  bodies: [],
  deleted: [],
  created: [],
  patched: []
})

const useHandlers = (state: RosterState) => {
  server.use(
    http.get(`${API}/branches`, () =>
      HttpResponse.json([{ id: branchId, name: "Sukhumvit", openingHours: {} }])
    ),
    http.get(`${API}/staff`, () =>
      HttpResponse.json([
        { id: anongId, name: "Dr. Anong", role: "dentist", isActive: true },
        { id: somchaiId, name: "Dr. Somchai", role: "dentist", isActive: true }
      ])
    ),
    http.get(`${API}/shifts`, () => HttpResponse.json(state.shifts)),
    http.get(`${API}/appointments`, () => HttpResponse.json([appointment])),
    http.post(`${API}/roster/validate`, async ({ request }) => {
      const body = (await request.json()) as DraftBody
      state.bodies.push(body)
      const drafted = body.draftShifts.filter((d) => d.staffId === anongId)
      const effective =
        drafted.length > 0 ? drafted : state.shifts.filter((s) => s.staffId === anongId)
      return HttpResponse.json({ violations: covers(effective) ? [] : [outsideShift] })
    }),
    http.patch(`${API}/shifts/:id`, async ({ params, request }) => {
      const id = String(params.id)
      const body = (await request.json()) as { startsAt: string; endsAt: string }
      state.patched.push({ id, body })
      const existing = state.shifts.find((s) => s.id === id)
      const updated = shift(id, existing?.staffId ?? anongId, body.startsAt, body.endsAt)
      state.shifts = state.shifts.map((s) => (s.id === id ? updated : s))
      return HttpResponse.json(updated)
    }),
    http.delete(`${API}/shifts/:id`, ({ params }) => {
      state.deleted.push(String(params.id))
      return new HttpResponse(null, { status: 204 })
    }),
    http.post(`${API}/shifts`, async ({ request }) => {
      state.created.push(await request.json())
      return HttpResponse.json(savedShifts()[0], { status: 201 })
    })
  )
}

const mount = (viewport: Viewport = "lg") => {
  setViewport(viewport)
  setSession({ accessToken: "t1", user: { id: ownerId, tenantId, name: "Owner", role: "owner" } })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/roster?w=2026-08-03"]}>
        <Routes>
          <Route path="/app/roster" element={<RosterRoute />} />
          <Route path="/app/timeline" element={<p>Timeline stub</p>} />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </QueryClientProvider>
  )
}

const rect = (left: number): DOMRect =>
  ({
    x: left,
    y: 0,
    left,
    right: left + COLUMN_WIDTH,
    top: 0,
    bottom: 60,
    width: COLUMN_WIDTH,
    height: 60,
    toJSON: () => ({})
  }) as DOMRect

const layoutColumns = () => {
  WEEK.forEach((date, index) => {
    const header = screen.getByTestId(`day-${date}`)
    header.getBoundingClientRect = () => rect(FIRST_COLUMN_LEFT + index * COLUMN_WIDTH)
  })
}

const midColumn = (index: number) => FIRST_COLUMN_LEFT + index * COLUMN_WIDTH + COLUMN_WIDTH / 2

const openGrid = async (viewport: Viewport = "lg") => {
  mount(viewport)
  const block = await screen.findByTestId(`shift-${monShiftId}`)
  if (viewport !== "sm") layoutColumns()
  return block
}

const dragTo = (block: HTMLElement, fromColumn: number, toColumn: number) => {
  fireEvent.pointerDown(block, { button: 0, clientX: midColumn(fromColumn), clientY: 40 })
  fireEvent.pointerMove(window, { clientX: midColumn(toColumn), clientY: 40 })
}

const cell = (staffId: string, date: string) => screen.getByTestId(`cell-${staffId}-${date}`)

const lastBody = (state: RosterState) => state.bodies[state.bodies.length - 1]

describe("roster drag", () => {
  it("previews the shift on the day it is dragged to and validates that draft", async () => {
    const state = freshState()
    useHandlers(state)
    const block = await openGrid()

    state.bodies.length = 0
    dragTo(block, 0, 2)

    const moved = within(cell(anongId, "2026-08-05")).getByTestId(`shift-${monShiftId}`)
    expect(moved).toBeVisible()
    expect(within(cell(anongId, "2026-08-03")).queryByTestId(`shift-${monShiftId}`)).toBeNull()
    expect(moved).toHaveAttribute("data-dragging", "true")
    expect(moved.className).toContain("shadow-lg")

    await waitFor(() =>
      expect(lastBody(state)?.draftShifts).toEqual([
        {
          id: monShiftId,
          staffId: anongId,
          startsAt: "2026-08-05T02:00:00.000Z",
          endsAt: "2026-08-05T10:00:00.000Z"
        }
      ])
    )
  })

  it("patches the moved shift in place once validation comes back clean", async () => {
    const state = freshState()
    useHandlers(state)
    await openGrid()

    const block = within(cell(somchaiId, "2026-08-05")).getByTestId(`shift-${somchaiShiftId}`)
    dragTo(block, 2, 3)
    fireEvent.pointerUp(window)

    await waitFor(() => expect(state.patched).toHaveLength(1))
    expect(state.patched[0]).toEqual({
      id: somchaiShiftId,
      body: { startsAt: "2026-08-06T02:00:00.000Z", endsAt: "2026-08-06T10:00:00.000Z" }
    })
    expect(state.deleted).toEqual([])
    expect(state.created).toEqual([])
    expect(await screen.findByText("Shift moved")).toBeVisible()
  })

  it("refuses a drop that leaves a confirmed appointment outside the shift", async () => {
    const state = freshState()
    useHandlers(state)
    const block = await openGrid()

    dragTo(block, 0, 2)
    fireEvent.pointerUp(window)

    expect(
      await screen.findByText(
        "Cannot move that shift — 1 confirmed appointment falls outside the rostered shifts"
      )
    ).toBeVisible()
    expect(state.patched).toEqual([])
    expect(state.deleted).toEqual([])
    await waitFor(() =>
      expect(within(cell(anongId, "2026-08-03")).getByTestId(`shift-${monShiftId}`)).toBeVisible()
    )
  })

  it("abandons the drag on Escape and saves nothing", async () => {
    const state = freshState()
    useHandlers(state)
    const block = await openGrid()

    dragTo(block, 0, 3)
    expect(within(cell(anongId, "2026-08-06")).getByTestId(`shift-${monShiftId}`)).toBeVisible()

    fireEvent.keyDown(window, { key: "Escape" })
    expect(within(cell(anongId, "2026-08-03")).getByTestId(`shift-${monShiftId}`)).toBeVisible()

    fireEvent.pointerUp(window)
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(state.patched).toEqual([])
  })

  it("treats a press that barely moves as a click that opens the editor", async () => {
    const state = freshState()
    useHandlers(state)
    const block = await openGrid()

    fireEvent.pointerDown(block, { button: 0, clientX: midColumn(0), clientY: 40 })
    fireEvent.pointerMove(window, { clientX: midColumn(0) + 2, clientY: 40 })
    fireEvent.pointerUp(window)
    await userEvent.click(block)

    expect(await screen.findByRole("dialog")).toBeInTheDocument()
    expect(state.patched).toEqual([])
  })

  it("never drags in the list view below 768", async () => {
    const state = freshState()
    useHandlers(state)
    const block = await openGrid("sm")

    fireEvent.pointerDown(block, { button: 0, clientX: 20, clientY: 40 })
    fireEvent.pointerMove(window, { clientX: 320, clientY: 40 })

    expect(block).not.toHaveAttribute("data-dragging")
    fireEvent.pointerUp(window)
    expect(state.patched).toEqual([])
    expect(screen.queryByTestId("roster-grid")).not.toBeInTheDocument()
  })
})
