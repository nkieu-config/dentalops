import { computeSlots, type Interval } from "@dentalops/availability"
import type { Appointment, UserRole } from "@dentalops/contracts"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { Toaster, toast } from "sonner"
import { afterEach, describe, expect, it } from "vitest"
import { setSession } from "../../lib/session"
import { API, http, HttpResponse, server } from "../../test/msw"
import { goOffline, goOnline } from "../../test/network"
import { OFFLINE_MESSAGE } from "../../components/shell/offline-banner"
import { AppointmentDrawer } from "./appointment-drawer"
import { bkkDayStart } from "./lib/geometry"
import { useRescheduleAppointment } from "./use-reschedule"

const appointmentId = "4f9619ff-8b86-4d01-b42d-00cf4fc964ff"

const appointment: Appointment = {
  id: appointmentId,
  branchId: "1f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  serviceId: "5f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  dentistId: "2f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  patientId: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  startsAt: "2026-08-03T02:00:00.000Z",
  endsAt: "2026-08-03T03:00:00.000Z",
  status: "confirmed",
  version: 1,
  seriesId: null,
  service: { id: "5f9619ff-8b86-4d01-b42d-00cf4fc964ff", name: "Cleaning", colorIndex: 0 },
  patient: {
    id: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
    name: "S. Chaiwat",
    phone: "0812345678"
  },
  claims: []
}

const seriesId = "c1000000-0000-4000-8000-000000000001"

const Harness = () => {
  const [selected, setSelected] = useState<Appointment | null>(appointment)
  return <AppointmentDrawer appointment={selected} onClose={() => setSelected(null)} />
}

const mount = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <Harness />
      <Toaster />
    </QueryClientProvider>
  )
}

const MoveHarness = ({ recurring = false }: { recurring?: boolean }) => {
  const [selected, setSelected] = useState<Appointment | null>(
    recurring ? { ...appointment, seriesId } : appointment
  )
  const { reschedule } = useRescheduleAppointment({ queryKey: ["appointments"] })
  return (
    <AppointmentDrawer
      appointment={selected}
      onClose={() => setSelected(null)}
      onReschedule={reschedule}
    />
  )
}

const mountMove = (role: UserRole = "receptionist", recurring = false) => {
  setSession({
    accessToken: "t1",
    user: {
      id: "7f9619ff-8b86-4d01-b42d-00cf4fc964ff",
      tenantId: "9f9619ff-8b86-4d01-b42d-00cf4fc964ff",
      name: "Demo User",
      role
    }
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MoveHarness recurring={recurring} />
      <Toaster />
    </QueryClientProvider>
  )
}

const dayStart = bkkDayStart("2026-08-03")
const HOUR = 3_600_000

const ownWindow: Interval = {
  start: Date.parse(appointment.startsAt),
  end: Date.parse(appointment.endsAt)
}

const slotsAsAvailabilityWould = (busy: Interval[]) =>
  computeSlots({
    window: { start: dayStart, end: dayStart + 24 * HOUR },
    stepMin: 15,
    durationMin: 60,
    bufferMin: 0,
    staff: [
      {
        staffId: appointment.dentistId,
        shifts: [{ start: dayStart + 9 * HOUR, end: dayStart + 17 * HOUR }],
        busy
      }
    ],
    chairs: [{ id: "chair-1", busy: [] }],
    equipmentPools: []
  }).map((s) => ({
    dentistId: s.staffId,
    startsAt: new Date(s.start).toISOString(),
    endsAt: new Date(s.end).toISOString()
  }))

afterEach(() => toast.dismiss())

describe("AppointmentDrawer", () => {
  it("shows the appointment detail and patches the status to completed, then closes", async () => {
    const bodies: unknown[] = []
    server.use(
      http.patch(`${API}/appointments/${appointmentId}/status`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ ...appointment, status: "completed", version: 2 })
      })
    )
    mount()
    expect(screen.getByText("09:00–10:00")).toBeInTheDocument()
    expect(screen.getByText("S. Chaiwat · 0812345678")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Complete" }))

    expect(await screen.findByText("Marked completed")).toBeInTheDocument()
    expect(bodies).toEqual([{ status: "completed" }])
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("surfaces the api message on a rejected transition and keeps the drawer open", async () => {
    server.use(
      http.patch(`${API}/appointments/${appointmentId}/status`, () =>
        HttpResponse.json(
          {
            statusCode: 409,
            errorCode: "INVALID_TRANSITION",
            message: "Cannot no_show a cancelled appointment",
            requestId: "r"
          },
          { status: 409 }
        )
      )
    )
    mount()

    await userEvent.click(screen.getByRole("button", { name: "No-show" }))

    expect(await screen.findByText("Cannot no_show a cancelled appointment")).toBeInTheDocument()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("offers no status actions once the appointment has left the confirmed state", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <AppointmentDrawer appointment={{ ...appointment, status: "cancelled" }} onClose={() => {}} />
      </QueryClientProvider>
    )
    expect(screen.getByText("cancelled")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Complete" })).not.toBeInTheDocument()
  })

  it("moves the appointment to a picked slot with no gesture at all", async () => {
    const bodies: unknown[] = []
    server.use(
      http.get(`${API}/availability`, () =>
        HttpResponse.json({ slots: slotsAsAvailabilityWould([ownWindow]) })
      ),
      http.patch(`${API}/appointments/${appointmentId}`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({
          ...appointment,
          startsAt: "2026-08-03T04:00:00.000Z",
          endsAt: "2026-08-03T05:00:00.000Z",
          version: 2
        })
      })
    )
    mountMove()

    expect(await screen.findByText("Move")).toBeInTheDocument()
    await userEvent.click(await screen.findByRole("button", { name: "11:00" }))

    await waitFor(() =>
      expect(bodies).toEqual([{ version: 1, startsAt: "2026-08-03T04:00:00.000Z" }])
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("sends a recurring appointment through the this/following/all dialog, not a plain move", async () => {
    server.use(
      http.get(`${API}/availability`, () =>
        HttpResponse.json({ slots: slotsAsAvailabilityWould([ownWindow]) })
      )
    )
    mountMove("receptionist", true)

    const badge = await screen.findByTestId("series-badge")
    expect(badge).toHaveTextContent("Repeats")
    expect(screen.queryByText("Move")).not.toBeInTheDocument()

    await userEvent.click(badge)

    expect(await screen.findByText("Repeating appointment")).toBeInTheDocument()
    expect(screen.getByLabelText("This appointment")).toBeChecked()
    expect(screen.getByLabelText("This and following")).toBeInTheDocument()
    expect(screen.getByLabelText("All appointments")).toBeInTheDocument()
  })

  it("offers no series badge on a one-off appointment", async () => {
    server.use(
      http.get(`${API}/availability`, () =>
        HttpResponse.json({ slots: slotsAsAvailabilityWould([ownWindow]) })
      )
    )
    mountMove()

    expect(await screen.findByText("Move")).toBeInTheDocument()
    expect(screen.queryByTestId("series-badge")).not.toBeInTheDocument()
  })

  it("hides the move controls from a role the api will not let reschedule", async () => {
    mountMove("dentist")
    expect(await screen.findByText("S. Chaiwat · 0812345678")).toBeInTheDocument()
    expect(screen.queryByText("Move")).not.toBeInTheDocument()
    expect(screen.queryAllByTestId("slot")).toHaveLength(0)
  })

  it("cannot offer a slot the appointment itself occupies, because availability counts it as busy", async () => {
    const withItself = slotsAsAvailabilityWould([ownWindow])
    const withoutItself = slotsAsAvailabilityWould([])
    expect(
      withItself.every(
        (s) =>
          Date.parse(s.endsAt) <= ownWindow.start || Date.parse(s.startsAt) >= ownWindow.end
      )
    ).toBe(true)
    expect(withoutItself.map((s) => s.startsAt)).toContain(appointment.startsAt)
    expect(withItself.map((s) => s.startsAt)).not.toContain(appointment.startsAt)

    server.use(http.get(`${API}/availability`, () => HttpResponse.json({ slots: withItself })))
    mountMove()

    expect(await screen.findByRole("button", { name: "10:00" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "09:00" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "09:15" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "09:45" })).not.toBeInTheDocument()
  })

  it("refuses to fire a status change while the browser is offline", async () => {
    const patches: unknown[] = []
    server.use(
      http.patch(`${API}/appointments/${appointmentId}/status`, async ({ request }) => {
        patches.push(await request.json())
        return HttpResponse.json({ ...appointment, status: "completed", version: 2 })
      })
    )
    mount()
    goOffline()

    const complete = screen.getByRole("button", { name: "Complete" })
    expect(complete).toBeDisabled()
    expect(complete).toHaveAccessibleDescription(OFFLINE_MESSAGE)
    expect(screen.getByRole("button", { name: "No-show" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()

    await userEvent.click(complete)
    expect(patches).toEqual([])

    goOnline()
    expect(screen.getByRole("button", { name: "Complete" })).toBeEnabled()
  })

  it("hides the move affordance offline, since rescheduling is a mutation too", async () => {
    mountMove()
    expect(await screen.findByText("Move")).toBeInTheDocument()
    goOffline()
    expect(screen.queryByText("Move")).not.toBeInTheDocument()
  })
})
