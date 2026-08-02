import type { Shift, UserRole, Violation } from "@dentalops/contracts"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"
import { describe, expect, it } from "vitest"
import { OFFLINE_MESSAGE } from "../../components/shell/offline-banner"
import { setSession } from "../../lib/session"
import { API, http, HttpResponse, server } from "../../test/msw"
import { goOffline, goOnline } from "../../test/network"
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
const tueShiftId = "b1000000-0000-4000-8000-000000000002"
const somchaiShiftId = "b1000000-0000-4000-8000-000000000003"
const apptId = "a1000000-0000-4000-8000-000000000021"

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
  shift(tueShiftId, anongId, "2026-08-04T02:00:00.000Z", "2026-08-04T10:00:00.000Z"),
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
      state.shifts = state.shifts.filter((s) => s.id !== String(params.id))
      return new HttpResponse(null, { status: 204 })
    }),
    http.post(`${API}/shifts`, async ({ request }) => {
      const body = (await request.json()) as { staffId: string; startsAt: string; endsAt: string }
      state.created.push(body)
      const created = shift("b1000000-0000-4000-8000-0000000000ff", body.staffId, body.startsAt, body.endsAt)
      state.shifts = [...state.shifts, created]
      return HttpResponse.json(created, { status: 201 })
    })
  )
}

const freshState = (shifts = savedShifts()): RosterState => ({
  shifts,
  bodies: [],
  deleted: [],
  created: [],
  patched: []
})

const mount = (viewport: Viewport, role: UserRole = "owner") => {
  setViewport(viewport)
  setSession({
    accessToken: "t1",
    user: { id: ownerId, tenantId, name: "Owner", role }
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/roster?w=2026-08-03"]}>
        <Routes>
          <Route path="/app/roster" element={<RosterRoute />} />
          <Route path="/app/timeline" element={<p>Timeline stub</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const openMondayShift = async () => {
  await userEvent.click(await screen.findByTestId(`shift-${monShiftId}`))
  return await screen.findByRole("dialog")
}

const setEndTime = (dialog: HTMLElement, value: string) => {
  fireEvent.change(within(dialog).getByLabelText("Ends"), { target: { value } })
}

describe("RosterPage", () => {
  it("renders the whole week with each staff member's shifts", async () => {
    useHandlers(freshState())
    mount("lg")

    expect(await screen.findByTestId(`shift-${monShiftId}`)).toHaveTextContent("09:00–17:00")
    expect(screen.getByTestId("roster-grid")).toBeInTheDocument()
    expect(screen.getByTestId("day-2026-08-03")).toHaveTextContent("Mon 3")
    expect(screen.getByTestId("day-2026-08-09")).toHaveTextContent("Sun 9")
    expect(screen.getAllByTestId(/^day-/)).toHaveLength(7)

    expect(screen.getByText("Dr. Anong")).toBeInTheDocument()
    expect(screen.getByText("Dr. Somchai")).toBeInTheDocument()
    expect(screen.getByTestId(`shift-${tueShiftId}`)).toBeInTheDocument()
    expect(screen.getByTestId(`shift-${somchaiShiftId}`)).toBeInTheDocument()
    expect(screen.getByTestId("violations-panel")).toBeInTheDocument()
  })

  it("validates the draft being edited, not the shifts already saved", async () => {
    const state = freshState()
    useHandlers(state)
    mount("lg")

    const dialog = await openMondayShift()
    state.bodies.length = 0
    setEndTime(dialog, "15:00")

    await waitFor(() => expect(state.bodies.length).toBeGreaterThan(0))
    const last = state.bodies[state.bodies.length - 1]!
    expect(last.branchId).toBe(branchId)
    expect(last.from).toBe("2026-08-02T17:00:00.000Z")
    expect(last.to).toBe("2026-08-09T17:00:00.000Z")
    expect(last.draftShifts).toHaveLength(2)
    expect(last.draftShifts).toContainEqual({
      id: monShiftId,
      staffId: anongId,
      startsAt: "2026-08-03T02:00:00.000Z",
      endsAt: "2026-08-03T08:00:00.000Z"
    })
    expect(last.draftShifts.map((d) => d.endsAt)).not.toContain("2026-08-03T10:00:00.000Z")
    expect(last.draftShifts.every((d) => d.staffId === anongId)).toBe(true)
  })

  it("a blocking violation disables Save and resolving it re-enables Save", async () => {
    const state = freshState()
    useHandlers(state)
    mount("lg")

    const dialog = await openMondayShift()
    const save = within(dialog).getByRole("button", { name: "Save" })
    await waitFor(() => expect(save).toBeEnabled())

    setEndTime(dialog, "15:00")
    await waitFor(() =>
      expect(within(dialog).getByTestId("violations-blocking")).toHaveTextContent(
        "1 confirmed appointment falls outside"
      )
    )
    expect(save).toBeDisabled()

    setEndTime(dialog, "17:00")
    await waitFor(() => expect(within(dialog).getByTestId("violations-clean")).toBeInTheDocument())
    await waitFor(() => expect(save).toBeEnabled())
  })

  it("links each blocking violation to the affected appointments on the timeline", async () => {
    useHandlers(freshState())
    mount("lg")

    const dialog = await openMondayShift()
    setEndTime(dialog, "15:00")

    const link = await within(dialog).findByRole("link", { name: "View the appointment" })
    expect(link).toHaveAttribute("href", `/app/timeline?d=2026-08-03&b=${branchId}`)
  })

  it("edits a shift in place, never deleting it first, and closes the dialog", async () => {
    const state = freshState()
    useHandlers(state)
    mount("lg")

    const dialog = await openMondayShift()
    setEndTime(dialog, "18:00")
    const save = within(dialog).getByRole("button", { name: "Save" })
    await waitFor(() => expect(save).toBeEnabled())
    await userEvent.click(save)

    await waitFor(() => expect(state.patched).toHaveLength(1))
    expect(state.patched[0]).toEqual({
      id: monShiftId,
      body: {
        startsAt: "2026-08-03T02:00:00.000Z",
        endsAt: "2026-08-03T11:00:00.000Z"
      }
    })
    expect(state.deleted).toEqual([])
    expect(state.created).toEqual([])
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("deletes a shift from the dialog", async () => {
    const state = freshState()
    useHandlers(state)
    mount("lg")

    const dialog = await openMondayShift()
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }))

    await waitFor(() => expect(state.deleted).toEqual([monShiftId]))
    expect(state.created).toHaveLength(0)
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("shows a three-day window between 768 and 1023", async () => {
    useHandlers(freshState())
    mount("md")

    expect(await screen.findByTestId("roster-grid")).toBeInTheDocument()
    expect(screen.getAllByTestId(/^day-/)).toHaveLength(3)
    expect(screen.getByTestId("day-2026-08-03")).toBeInTheDocument()
    expect(screen.queryByTestId("day-2026-08-06")).not.toBeInTheDocument()
    expect(screen.queryByTestId("violations-panel")).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Later days" }))
    expect(await screen.findByTestId("day-2026-08-06")).toBeInTheDocument()
    expect(screen.queryByTestId("day-2026-08-03")).not.toBeInTheDocument()
    expect(screen.getAllByTestId(/^day-/)).toHaveLength(3)
  })

  it("falls back to a per-staff list below 768 with violations in a bottom sheet", async () => {
    const shrunk = savedShifts().map((s) =>
      s.id === monShiftId ? { ...s, endsAt: "2026-08-03T08:00:00.000Z" } : s
    )
    useHandlers(freshState(shrunk))
    mount("sm")

    expect(await screen.findByTestId(`shift-${monShiftId}`)).toHaveTextContent("09:00–15:00")
    expect(screen.getByTestId("roster-list")).toBeInTheDocument()
    expect(screen.queryByTestId("roster-grid")).not.toBeInTheDocument()
    expect(screen.queryByTestId("violations-panel")).not.toBeInTheDocument()

    const trigger = await screen.findByRole("button", { name: /Validation/ })
    await waitFor(() => expect(trigger).toHaveAccessibleName("Validation (1 blocking)"))
    await userEvent.click(trigger)

    const sheet = await screen.findByTestId("violations-sheet")
    expect(within(sheet).getByTestId("violations-blocking")).toHaveTextContent(
      "1 confirmed appointment falls outside"
    )
  })

  it("marks a staff member's shifts as conflicting while a blocking violation stands", async () => {
    const shrunk = savedShifts().map((s) =>
      s.id === monShiftId ? { ...s, endsAt: "2026-08-03T08:00:00.000Z" } : s
    )
    useHandlers(freshState(shrunk))
    mount("lg")

    await waitFor(() =>
      expect(screen.getByTestId(`shift-${monShiftId}`)).toHaveAttribute("data-conflicting", "true")
    )
    expect(screen.getByTestId(`shift-${somchaiShiftId}`)).not.toHaveAttribute("data-conflicting")
  })

  it("disables Save while offline, says why, and restores it on reconnect", async () => {
    const state = freshState()
    useHandlers(state)
    mount("lg")

    const dialog = await openMondayShift()
    const save = within(dialog).getByRole("button", { name: "Save" })
    await waitFor(() => expect(save).toBeEnabled())

    goOffline()
    expect(save).toBeDisabled()
    expect(save).toHaveAccessibleDescription(OFFLINE_MESSAGE)
    expect(save).toHaveAttribute("title", OFFLINE_MESSAGE)
    expect(within(dialog).getByRole("button", { name: "Delete" })).toBeDisabled()

    await userEvent.click(save)
    expect(state.patched).toEqual([])
    expect(state.created).toEqual([])

    goOnline()
    await waitFor(() => expect(save).toBeEnabled())
    expect(save).not.toHaveAttribute("title")
  })

  it("withdraws the shift drag handle while offline so no move can be started", async () => {
    useHandlers(freshState())
    mount("lg")

    const block = await screen.findByTestId(`shift-${monShiftId}`)
    expect(block.classList.contains("cursor-grab")).toBe(true)

    goOffline()
    expect(screen.getByTestId(`shift-${monShiftId}`).classList.contains("cursor-grab")).toBe(false)
  })

  it("sends a receptionist back to the timeline instead of the roster", async () => {
    mount("lg", "receptionist")
    expect(await screen.findByText("Timeline stub")).toBeInTheDocument()
    expect(screen.queryByTestId("roster-grid")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Add shift" })).not.toBeInTheDocument()
  })
})
