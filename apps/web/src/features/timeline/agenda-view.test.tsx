import type { Appointment, AppointmentStatus, StaffMember } from "@dentalops/contracts"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { AgendaView } from "./agenda-view"
import { bkkShiftDate, bkkToday } from "./lib/geometry"

const anong: StaffMember = {
  id: "2f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  name: "Dr. Anong",
  role: "dentist",
  isActive: true
}
const boon: StaffMember = {
  id: "8f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  name: "Dr. Boon",
  role: "dentist",
  isActive: true
}
const dentists = [anong, boon]

const branchId = "1f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const serviceId = "5f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const patientId = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff"

interface Overrides {
  status?: AppointmentStatus
  serviceName?: string
  patientName?: string
  colorIndex?: number
}

const appointment = (
  id: string,
  dentistId: string,
  startsAt: string,
  endsAt: string,
  overrides: Overrides = {}
): Appointment => ({
  id,
  branchId,
  serviceId,
  dentistId,
  patientId,
  startsAt,
  endsAt,
  status: overrides.status ?? "confirmed",
  version: 1,
  seriesId: null,
  service: { id: serviceId, name: overrides.serviceName ?? "Cleaning", colorIndex: overrides.colorIndex ?? 0 },
  patient: { id: patientId, name: overrides.patientName ?? "S. Chaiwat", phone: "0812345678" },
  claims: []
})

const id = (suffix: string) => `a1000000-0000-4000-8000-0000000000${suffix}`

const late = appointment(id("01"), anong.id, "2026-08-03T05:00:00.000Z", "2026-08-03T06:00:00.000Z", {
  serviceName: "Root canal"
})
const early = appointment(id("02"), boon.id, "2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z", {
  serviceName: "Ortho adjustment"
})
const middle = appointment(
  id("03"),
  anong.id,
  "2026-08-03T03:30:00.000Z",
  "2026-08-03T04:00:00.000Z",
  { serviceName: "Implant consult" }
)

const mount = (props: Partial<Parameters<typeof AgendaView>[0]> = {}) =>
  render(
    <AgendaView
      appointments={[late, early, middle]}
      dentists={dentists}
      date="2026-08-03"
      onOpen={() => {}}
      {...props}
    />
  )

const rowOrder = () =>
  [...screen.getByTestId("agenda-list").querySelectorAll("[data-testid^='agenda-']")].map(
    (element) => element.getAttribute("data-testid")
  )

describe("AgendaView", () => {
  it("sorts every dentist's appointments into one list by start time", () => {
    mount()
    expect(rowOrder()).toEqual([`agenda-${early.id}`, `agenda-${middle.id}`, `agenda-${late.id}`])
    expect(screen.getByTestId(`agenda-${early.id}`)).toHaveTextContent("09:00–10:00")
    expect(screen.getByTestId(`agenda-${early.id}`)).toHaveTextContent("S. Chaiwat · Dr. Boon")
  })

  it("narrows the list to the dentist chosen in the filter", async () => {
    mount()
    await userEvent.selectOptions(screen.getByLabelText("Dentist"), anong.id)
    expect(rowOrder()).toEqual([`agenda-${middle.id}`, `agenda-${late.id}`])
    expect(screen.queryByTestId(`agenda-${early.id}`)).not.toBeInTheDocument()
  })

  it("carries every status as an icon and a treatment, never colour alone", () => {
    const completed = appointment(id("04"), anong.id, "2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z", { status: "completed" })
    const noShow = appointment(id("05"), anong.id, "2026-08-03T03:00:00.000Z", "2026-08-03T04:00:00.000Z", { status: "no_show" })
    const cancelled = appointment(id("06"), anong.id, "2026-08-03T04:00:00.000Z", "2026-08-03T05:00:00.000Z", { status: "cancelled" })
    mount({ appointments: [completed, noShow, cancelled], conflictId: completed.id })

    const completedRow = screen.getByTestId(`agenda-${completed.id}`)
    expect(completedRow.className).toContain("opacity-70")
    expect(screen.getByLabelText("Completed")).toBeInTheDocument()
    expect(completedRow.className).toContain("ring-destructive")
    expect(screen.getByLabelText("Conflict")).toBeInTheDocument()

    expect(screen.getByTestId(`agenda-${noShow.id}`).style.borderLeftColor).toBe("var(--warning)")
    expect(screen.getByLabelText("No-show")).toBeInTheDocument()

    const cancelledRow = screen.getByTestId(`agenda-${cancelled.id}`)
    expect(cancelledRow.className).toContain("bg-muted")
    expect(screen.getByLabelText("Cancelled")).toBeInTheDocument()
    expect(cancelledRow.querySelector(".line-through")).toHaveTextContent("Cleaning")
  })

  it("gives every row a 44px touch target and tabular time", () => {
    mount()
    const rows = screen.getByTestId("agenda-list").querySelectorAll("[data-testid^='agenda-']")
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect(row.className).toContain("min-h-11")
      expect(row.querySelector(".tabular-nums")).not.toBeNull()
    }
    expect(screen.getByLabelText("Dentist").className).toContain("h-11")
  })

  it("opens the drawer for the row that was tapped", async () => {
    const onOpen = vi.fn()
    mount({ onOpen })
    await userEvent.click(screen.getByTestId(`agenda-${middle.id}`))
    expect(onOpen).toHaveBeenCalledWith(middle)
  })

  it("draws the now divider between past and future rows only when the day is today", () => {
    const past = appointment(id("07"), anong.id, new Date(Date.now() - 7_200_000).toISOString(), new Date(Date.now() - 3_600_000).toISOString())
    const future = appointment(id("08"), anong.id, new Date(Date.now() + 3_600_000).toISOString(), new Date(Date.now() + 7_200_000).toISOString())

    const other = mount({ appointments: [past, future], date: bkkShiftDate(bkkToday(), 1) })
    expect(screen.queryByTestId("now-divider")).not.toBeInTheDocument()
    other.unmount()

    mount({ appointments: [past, future], date: bkkToday() })
    const divider = screen.getByTestId("now-divider")
    expect(divider).toHaveTextContent(/^now \d{2}:\d{2}$/)
    expect(
      divider.compareDocumentPosition(screen.getByTestId(`agenda-${past.id}`)) &
        Node.DOCUMENT_POSITION_PRECEDING
    ).toBeTruthy()
    expect(
      divider.compareDocumentPosition(screen.getByTestId(`agenda-${future.id}`)) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it("shows an empty state instead of an empty list", () => {
    mount({ appointments: [] })
    expect(screen.getByText("Nothing scheduled")).toBeInTheDocument()
    expect(screen.queryByTestId("agenda-list")).not.toBeInTheDocument()
  })
})
