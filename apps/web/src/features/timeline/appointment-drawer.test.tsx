import { computeSlots, type Interval } from "@dentalops/availability"
import type { Appointment, StaffMember, UserRole } from "@dentalops/contracts"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { Toaster, toast } from "sonner"
import { afterEach, describe, expect, it, vi } from "vitest"
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

const Harness = ({ dentists }: { dentists?: StaffMember[] }) => {
  const [selected, setSelected] = useState<Appointment | null>(appointment)
  return (
    <AppointmentDrawer
      appointment={selected}
      dentists={dentists}
      branchName="Ladprao"
      onClose={() => setSelected(null)}
    />
  )
}

const mount = (dentists?: StaffMember[]) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <Harness dentists={dentists} />
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
    expect(screen.getByText("09:00–10:00 (1h)")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "S. Chaiwat" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "0812345678" })).toHaveAttribute(
      "href",
      "tel:0812345678"
    )
    expect(screen.getByRole("link", { name: "View patient" })).toHaveAttribute(
      "href",
      `/app/patients/${appointment.patientId}`
    )
    expect(screen.getByText("Date")).toBeInTheDocument()
    expect(screen.getByText("Mon, 3 Aug 2026")).toBeInTheDocument()
    expect(screen.getByText("Branch")).toBeInTheDocument()
    expect(screen.getByText("Ladprao")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Complete" }))
    await userEvent.click(screen.getByRole("button", { name: "Complete appointment" }))

    expect(await screen.findByText("Marked completed")).toBeInTheDocument()
    expect(bodies).toEqual([{ status: "completed" }])
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("resolves the dentist's name from the roster it is given, or shows a dash without one", () => {
    mount([
      { id: appointment.dentistId, name: "Dr. Anong", role: "dentist", isActive: true }
    ])
    expect(screen.getByText("Dentist")).toBeInTheDocument()
    expect(screen.getByText("Dr. Anong")).toBeInTheDocument()
  })

  it("shows the chair assignment when the schedule view supplies it", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <AppointmentDrawer appointment={appointment} chairName="Chair 2" onClose={() => {}} />
      </QueryClientProvider>
    )

    expect(screen.getByText("Chair")).toBeInTheDocument()
    expect(screen.getByText("Chair 2")).toBeInTheDocument()
  })

  it("shows a dash for the dentist when no roster was passed in", () => {
    mount()
    expect(screen.getByText("Dentist")).toBeInTheDocument()
    expect(screen.getAllByText("—").length).toBeGreaterThan(0)
  })

  it("requires confirmation before cancelling, and lets the owner back out first", async () => {
    const bodies: unknown[] = []
    server.use(
      http.patch(`${API}/appointments/${appointmentId}/status`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ ...appointment, status: "cancelled", version: 2 })
      })
    )
    mount()

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.getByRole("alertdialog", { name: "Cancel appointment?" })).toBeInTheDocument()
    expect(bodies).toEqual([])

    await userEvent.click(screen.getByRole("button", { name: "Keep appointment" }))
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(bodies).toEqual([])
    expect(screen.getByRole("heading", { name: "S. Chaiwat" })).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    await userEvent.click(screen.getByRole("button", { name: "Cancel appointment" }))

    expect(await screen.findByText("Marked cancelled")).toBeInTheDocument()
    expect(bodies).toEqual([{ status: "cancelled" }])
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
    await userEvent.click(screen.getByRole("button", { name: "Mark no-show" }))

    expect(await screen.findByText("Cannot no_show a cancelled appointment")).toBeInTheDocument()
    expect(screen.getByRole("alertdialog", { name: "Mark as no-show?" })).toBeInTheDocument()
  })

  it("offers no status actions once the appointment has left the confirmed state", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <AppointmentDrawer appointment={{ ...appointment, status: "cancelled" }} onClose={() => {}} />
      </QueryClientProvider>
    )
    expect(screen.getByText("Cancelled")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Complete" })).not.toBeInTheDocument()
  })

  it("says why a closed appointment cannot change and offers the way forward", async () => {
    const onBookFollowUp = vi.fn()
    setSession({
      accessToken: "t1",
      user: {
        id: "7f9619ff-8b86-4d01-b42d-00cf4fc964ff",
        tenantId: "9f9619ff-8b86-4d01-b42d-00cf4fc964ff",
        name: "Demo User",
        role: "receptionist"
      }
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const closed = { ...appointment, status: "no_show" as const }
    render(
      <QueryClientProvider client={client}>
        <AppointmentDrawer
          appointment={closed}
          onClose={() => {}}
          onBookFollowUp={onBookFollowUp}
        />
      </QueryClientProvider>
    )

    expect(screen.getByTestId("closed-appointment")).toHaveTextContent(
      "A no-show cannot be undone."
    )
    await userEvent.click(screen.getByRole("button", { name: "Book a follow-up" }))
    expect(onBookFollowUp).toHaveBeenCalledWith(closed)
  })

  it("leaves a confirmed appointment free of the closed-status note", () => {
    mount()

    expect(screen.queryByTestId("closed-appointment")).not.toBeInTheDocument()
  })

  it("uses a compact mobile detail surface for a completed appointment", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <AppointmentDrawer appointment={{ ...appointment, status: "completed" }} onClose={() => {}} />
      </QueryClientProvider>
    )

    expect(screen.getByRole("dialog")).toHaveAttribute("data-sheet-layout", "adaptive")
  })

  it("keeps an actionable appointment in the full working sheet", () => {
    mount()

    expect(screen.getByRole("dialog")).toHaveAttribute("data-sheet-layout", "full")
  })

  it("wraps long appointment metadata inside its grid", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <AppointmentDrawer
          appointment={appointment}
          dentists={[
            {
              id: appointment.dentistId,
              name: "Dr. A clinician with an unusually long name that needs to remain inside the detail sheet",
              role: "dentist",
              isActive: true
            }
          ]}
          chairName="A chair assignment with a long descriptive label that must wrap safely"
          onClose={() => {}}
        />
      </QueryClientProvider>
    )

    expect(screen.getByTestId("appointment-meta")).toHaveClass("min-w-0")
    expect(screen.getByText(/unusually long name/)).toHaveClass("break-words")
  })

  it("reveals rescheduling only after the user asks to change the time", async () => {
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

    expect(screen.queryByText("Choose a new time")).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Reschedule" }))
    expect(await screen.findByText("Choose a new time")).toBeInTheDocument()
    await userEvent.click(await screen.findByRole("button", { name: "11:00" }))
    await userEvent.click(screen.getByRole("button", { name: "Confirm new time" }))

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
    expect(screen.queryByRole("button", { name: "Reschedule" })).not.toBeInTheDocument()

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

    expect(await screen.findByRole("button", { name: "Reschedule" })).toBeInTheDocument()
    expect(screen.queryByTestId("series-badge")).not.toBeInTheDocument()
  })

  it("hides the move controls from a role the api will not let reschedule", async () => {
    mountMove("dentist")
    expect(await screen.findByRole("heading", { name: "S. Chaiwat" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Reschedule" })).not.toBeInTheDocument()
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

    await userEvent.click(screen.getByRole("button", { name: "Reschedule" }))
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
    expect(await screen.findByRole("button", { name: "Reschedule" })).toBeInTheDocument()
    goOffline()
    expect(screen.queryByRole("button", { name: "Reschedule" })).not.toBeInTheDocument()
  })
})
