import type { Appointment, StaffMember } from "@dentalops/contracts"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { stubHorizontalOverflow } from "../../test/overflow"
import { WeeklyAgendaBoard } from "./weekly-agenda-board"

const branchId = "1f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const dentistA: StaffMember = {
  id: "2f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  name: "Dr. Anong",
  role: "dentist",
  isActive: true
}
const dentistB: StaffMember = {
  id: "8f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  name: "Dr. Boon",
  role: "dentist",
  isActive: true
}

const appointment = (
  id: string,
  dentistId: string,
  startsAt: string,
  patientName: string,
  serviceName: string
): Appointment => ({
  id,
  branchId,
  serviceId: "5f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  dentistId,
  patientId: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  startsAt,
  endsAt: "2026-08-11T03:00:00.000Z",
  status: "confirmed",
  version: 1,
  seriesId: null,
  service: { id: "5f9619ff-8b86-4d01-b42d-00cf4fc964ff", name: serviceName, colorIndex: 0 },
  patient: { id: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff", name: patientName, phone: "0812345678" },
  claims: []
})

const first = appointment(
  "a1000000-0000-4000-8000-000000000001",
  dentistA.id,
  "2026-08-11T02:00:00.000Z",
  "Narin Chai",
  "Cleaning"
)
const parallel = appointment(
  "a1000000-0000-4000-8000-000000000002",
  dentistB.id,
  "2026-08-11T02:00:00.000Z",
  "Pimdao Kittisak",
  "Root canal"
)
const later = appointment(
  "a1000000-0000-4000-8000-000000000003",
  dentistA.id,
  "2026-08-11T05:00:00.000Z",
  "Suda Wong",
  "Implant consult"
)

const mount = (onOpen = vi.fn()) => {
  render(
    <WeeklyAgendaBoard
      weekStart="2026-08-10"
      appointments={[later, parallel, first]}
      dentists={[dentistA, dentistB]}
      onOpen={onOpen}
    />
  )
  return onOpen
}

afterEach(() => vi.useRealTimers())

describe("WeeklyAgendaBoard", () => {
  it("keeps seven dated columns, including empty days", () => {
    mount()

    expect(screen.getAllByTestId(/week-day-/)).toHaveLength(7)
    expect(screen.getByTestId("week-day-2026-08-11")).toHaveTextContent("Tue")
    expect(within(screen.getByTestId("week-day-2026-08-16"))).toBeDefined()
    expect(screen.getByTestId("week-day-2026-08-16")).toHaveTextContent("No appointments")
  })

  it("counts each day's load in its header and leaves empty days uncounted", () => {
    mount()

    expect(screen.getByTestId("week-count-2026-08-11")).toHaveTextContent("3")
    expect(screen.getByTestId("week-count-2026-08-11")).toHaveAccessibleName("3 appointments")
    expect(screen.queryByTestId("week-count-2026-08-16")).not.toBeInTheDocument()
  })

  it("truncates the dentist and the service independently so neither swallows the other", () => {
    const long = appointment(
      "a1000000-0000-4000-8000-000000000005",
      dentistA.id,
      "2026-08-11T02:00:00.000Z",
      "Narin Chai",
      "Comprehensive restorative consultation"
    )
    render(
      <WeeklyAgendaBoard
        weekStart="2026-08-10"
        appointments={[long]}
        dentists={[dentistA]}
        onOpen={() => {}}
      />
    )

    const row = screen.getByTestId(`week-appt-${long.id}`)
    const dentistLine = within(row).getByTitle("Dr. Anong")
    const serviceLine = within(row).getByTitle("Comprehensive restorative consultation")
    expect(dentistLine).not.toBe(serviceLine)
    expect(dentistLine).toHaveClass("truncate")
    expect(serviceLine).toHaveClass("truncate")
    expect(dentistLine).toHaveTextContent(/^Dr\. Anong$/)
  })

  it("lists parallel bookings as full-width chronological rows", () => {
    mount()

    const tuesday = screen.getByTestId("week-day-2026-08-11")
    const rows = within(tuesday).getAllByRole("button")
    expect(rows.map((row) => row.getAttribute("data-testid"))).toEqual([
      `week-appt-${first.id}`,
      `week-appt-${parallel.id}`,
      `week-appt-${later.id}`
    ])
    expect(screen.getByTestId(`week-appt-${first.id}`)).toHaveTextContent("09:00–10:00")
    expect(screen.getByTestId(`week-appt-${first.id}`)).toHaveTextContent("Narin Chai")
    expect(screen.getByTestId(`week-appt-${first.id}`)).toHaveTextContent("Dr. Anong")
    expect(screen.getByTestId(`week-appt-${parallel.id}`)).toHaveClass("min-h-11", "w-full")
  })

  it("identifies today and preserves long row content within its column", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-11T02:00:00.000Z"))
    const longName = "Prachaya Srisawat With A Long Patient Name"
    const long = appointment(
      "a1000000-0000-4000-8000-000000000004",
      dentistA.id,
      "2026-08-11T07:00:00.000Z",
      longName,
      "Comprehensive restorative consultation"
    )
    render(
      <WeeklyAgendaBoard
        weekStart="2026-08-10"
        appointments={[long]}
        dentists={[dentistA]}
        onOpen={() => {}}
      />
    )

    expect(screen.getByTestId("week-day-2026-08-11")).toHaveAttribute("data-today", "true")
    expect(screen.getByTestId(`week-appt-${long.id}`)).toHaveTextContent(longName)
    expect(screen.getByTestId(`week-appt-${long.id}`).className).toContain("min-w-0")
    expect(screen.getByTestId(`week-appt-${long.id}`).innerHTML).toContain("truncate")
  })

  it("opens the selected appointment from its weekly row", async () => {
    const onOpen = mount()

    await userEvent.click(screen.getByTestId(`week-appt-${parallel.id}`))

    expect(onOpen).toHaveBeenCalledWith(parallel)
  })

  it("keeps completed appointments fully legible and identifies status without colour", () => {
    render(
      <WeeklyAgendaBoard
        weekStart="2026-08-10"
        appointments={[{ ...first, status: "completed" }]}
        dentists={[dentistA]}
        onOpen={() => {}}
      />
    )

    const row = screen.getByTestId(`week-appt-${first.id}`)
    expect(row).not.toHaveClass("opacity-70")
    expect(within(row).getByLabelText("Completed")).toBeInTheDocument()
  })

  it("shows the week continues past the viewport instead of ending at Thursday", () => {
    const restore = stubHorizontalOverflow(660, 1120)
    try {
      mount()
      expect(screen.getByTestId("week-more-end")).toBeInTheDocument()
      expect(screen.queryByTestId("week-more-start")).not.toBeInTheDocument()
    } finally {
      restore()
    }
  })

  it("leaves the board unmarked when the whole week already fits", () => {
    mount()

    expect(screen.queryByTestId("week-more-end")).not.toBeInTheDocument()
    expect(screen.queryByTestId("week-more-start")).not.toBeInTheDocument()
  })

  it("uses a week-specific empty state when there are no appointments", () => {
    render(
      <WeeklyAgendaBoard
        weekStart="2026-08-10"
        appointments={[]}
        dentists={[dentistA]}
        onOpen={() => {}}
      />
    )

    expect(screen.getByText("No appointments this week")).toBeInTheDocument()
  })
})
