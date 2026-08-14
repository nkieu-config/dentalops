import type { Appointment, AppointmentStatus, StaffMember } from "@dentalops/contracts"
import { createElement } from "react"
import { render, screen, within } from "@testing-library/react"
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

type AgendaViewTestProps = Partial<Parameters<typeof AgendaView>[0]> & {
  dentistFilter?: string
  onDentistFilterChange?: (value: string) => void
}

const mount = (props: AgendaViewTestProps = {}) =>
  render(
    createElement(AgendaView, {
      appointments: [late, early, middle],
      dentists,
      date: "2026-08-03",
      dentistFilter: "all",
      onDentistFilterChange: () => {},
      onOpen: () => {},
      ...props
    } as Parameters<typeof AgendaView>[0])
  )

const rowOrder = () =>
  [...screen.getByTestId("agenda-list").querySelectorAll("[data-testid^='agenda-']")].map(
    (element) => element.getAttribute("data-testid")
  )

describe("AgendaView", () => {
  it("sorts every dentist's appointments into one list by start time", () => {
    mount()
    expect(rowOrder()).toEqual([`agenda-${early.id}`, `agenda-${middle.id}`, `agenda-${late.id}`])
    const firstRow = screen.getByTestId(`agenda-${early.id}`)
    expect(firstRow).toHaveTextContent("09:00–10:00")
    expect(firstRow).toHaveTextContent("S. Chaiwat")
    expect(firstRow).toHaveTextContent("Dr. Boon · Ortho adjustment")
    expect(within(firstRow).getByText("S. Chaiwat").className).toContain("font-medium")
    expect(firstRow.className).toContain("rounded-timeline-appointment")
    expect(firstRow.style.backgroundColor).toBe("var(--hue0-bg)")
    expect(firstRow.style.borderLeftColor).toBe("var(--hue0-border)")
    expect(firstRow.textContent?.indexOf("S. Chaiwat")).toBeLessThan(
      firstRow.textContent?.indexOf("Ortho adjustment") ?? 0
    )
  })

  it("switches dentist in one tap and marks which chip is active", async () => {
    const onDentistFilterChange = vi.fn()
    mount({ dentistFilter: anong.id, onDentistFilterChange })

    expect(screen.getByRole("radio", { name: /^Dr\. Anong,/ })).toHaveAttribute("data-state", "on")

    await userEvent.click(screen.getByRole("radio", { name: /^Dr\. Boon,/ }))
    expect(onDentistFilterChange).toHaveBeenCalledWith(boon.id)
    expect(rowOrder()).toEqual([`agenda-${middle.id}`, `agenda-${late.id}`])
    expect(screen.queryByTestId(`agenda-${early.id}`)).not.toBeInTheDocument()
  })

  it("shows each dentist's load on the chip so the filter answers who is busy", () => {
    mount()

    expect(screen.getByRole("radio", { name: "Dr. Anong, 2 appointments" })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Dr. Boon, 1 appointment" })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "All dentists, 3 appointments" })).toBeInTheDocument()
  })

  it("carries every status as visible copy and a treatment, never colour alone", () => {
    const completed = appointment(id("04"), anong.id, "2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z", { status: "completed" })
    const noShow = appointment(id("05"), anong.id, "2026-08-03T03:00:00.000Z", "2026-08-03T04:00:00.000Z", { status: "no_show" })
    const cancelled = appointment(id("06"), anong.id, "2026-08-03T04:00:00.000Z", "2026-08-03T05:00:00.000Z", { status: "cancelled" })
    mount({ appointments: [completed, noShow, cancelled], conflictId: completed.id })

    const completedRow = screen.getByTestId(`agenda-${completed.id}`)
    expect(completedRow.className).not.toContain("opacity-70")
    expect(within(completedRow).getByText("Completed")).toBeInTheDocument()
    expect(within(completedRow).getByText("Completed").previousElementSibling).toHaveAttribute(
      "aria-hidden",
      "true"
    )
    expect(completedRow).toHaveTextContent("Completed")
    expect(completedRow.className).not.toContain("ring-destructive")
    expect(screen.getByLabelText("Conflict")).toBeInTheDocument()

    expect(screen.getByTestId(`agenda-${noShow.id}`).style.borderLeftColor).toBe("var(--warning)")
    expect(within(screen.getByTestId(`agenda-${noShow.id}`)).getByText("No-show")).toBeInTheDocument()
    expect(screen.getByTestId(`agenda-${noShow.id}`)).toHaveTextContent("No-show")

    const cancelledRow = screen.getByTestId(`agenda-${cancelled.id}`)
    expect(cancelledRow.className).toContain("bg-muted")
    expect(within(cancelledRow).getByText("Cancelled")).toBeInTheDocument()
    expect(cancelledRow).toHaveTextContent("Cancelled")
    expect(cancelledRow.querySelector(".line-through")).toHaveTextContent("Cleaning")
  })

  it("keeps the sticky filter and compact agenda rows readable by touch", () => {
    mount()
    expect(screen.getByTestId("agenda-filter-bar")).toHaveClass("sticky", "top-0")
    const rows = screen.getByTestId("agenda-list").querySelectorAll("[data-testid^='agenda-']")
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect(row.className).toContain("min-h-16")
      expect(row.querySelector(".tabular-nums")).not.toBeNull()
    }
    for (const chip of screen.getAllByRole("radio")) {
      expect(chip.className).toContain("min-h-11")
      expect(chip.className).toContain("rounded-full")
    }
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

  it("starts near now and lets the user reveal older appointments", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date("2026-08-03T05:00:00.000Z"))
    const past = Array.from({ length: 7 }, (_, index) =>
      appointment(
        id(`${20 + index}`),
        anong.id,
        new Date(Date.parse("2026-08-03T00:00:00.000Z") + index * 30 * 60_000).toISOString(),
        new Date(Date.parse("2026-08-03T00:30:00.000Z") + index * 30 * 60_000).toISOString()
      )
    )
    const future = appointment(
      id("29"),
      anong.id,
      "2026-08-03T06:00:00.000Z",
      "2026-08-03T06:30:00.000Z"
    )

    mount({ appointments: [...past, future], date: bkkToday() })

    expect(screen.queryByTestId(`agenda-${past[0]!.id}`)).not.toBeInTheDocument()
    expect(screen.getByTestId(`agenda-${past[2]!.id}`)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Show 2 earlier appointments" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Show 2 earlier appointments" }))
    expect(screen.getByTestId(`agenda-${past[0]!.id}`)).toBeInTheDocument()
  })

  it("shows an empty state instead of an empty list", () => {
    mount({ appointments: [] })
    expect(screen.getByText("Nothing scheduled")).toBeInTheDocument()
    expect(screen.queryByTestId("agenda-list")).not.toBeInTheDocument()
  })

  it("names the selected dentist when that filtered agenda has no appointments", () => {
    mount({ appointments: [], dentistFilter: anong.id })

    expect(screen.getByText("No appointments for Dr. Anong")).toBeInTheDocument()
    expect(screen.queryByTestId("agenda-list")).not.toBeInTheDocument()
  })
})
