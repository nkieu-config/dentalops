import type { Appointment, Shift, StaffMember } from "@dentalops/contracts"
import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { bkkToday } from "./lib/geometry"
import { TimeGrid } from "./time-grid"

const dentist: StaffMember = {
  id: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  name: "Dr. Test",
  role: "dentist",
  isActive: true
}

const dentistColumn = { id: dentist.id, name: dentist.name, staffId: dentist.id }
const byDentist = (appointment: Appointment) => appointment.dentistId

const chairId = "cf9619ff-8b86-4d01-b42d-00cf4fc964ff"
const chairColumn = { id: chairId, name: "Chair 1" }

const shift = (startsAt: string, endsAt: string): Shift =>
  ({
    id: "7f9619ff-8b86-4d01-b42d-00cf4fc964ff",
    staffId: dentist.id,
    branchId: "8f9619ff-8b86-4d01-b42d-00cf4fc964ff",
    startsAt,
    endsAt
  }) as Shift

describe("TimeGrid", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("labels the current time with a token pair, not a hardcoded white-on-color that fails in dark mode", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-03T02:17:00.000Z"))
    render(
      <TimeGrid
        date={bkkToday()}
        columns={[dentistColumn]}
        columnOf={byDentist}
        shifts={[]}
        appointments={[]}
        renderAppointment={() => null}
      />
    )
    const label = screen.getByText("09:17")
    expect(label).toHaveClass("bg-destructive", "text-destructive-foreground")
    expect(label.className).not.toContain("text-white")
    expect(label.getAttribute("style") ?? "").not.toContain("var(--now-line)")
  })

  it("shades everything outside the shift as off-shift", () => {
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[dentistColumn]}
        columnOf={byDentist}
        shifts={[shift("2026-08-03T02:00:00.000Z", "2026-08-03T10:00:00.000Z")]}
        appointments={[]}
        renderAppointment={() => null}
      />
    )
    const blocks = screen.getAllByTestId("offshift")
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toHaveStyle({ top: "0px", height: "576px" })
    expect(blocks[1]).toHaveStyle({ top: "1088px" })
  })

  it("a dentist with no shift is fully shaded", () => {
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[dentistColumn]}
        columnOf={byDentist}
        shifts={[]}
        appointments={[]}
        renderAppointment={() => null}
      />
    )
    const blocks = screen.getAllByTestId("offshift")
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toHaveStyle({ top: "0px", height: "1536px" })
  })

  it("renders appointments through the render prop", () => {
    const appointment = {
      id: "9f9619ff-8b86-4d01-b42d-00cf4fc964ff",
      dentistId: dentist.id,
      startsAt: "2026-08-03T02:00:00.000Z",
      endsAt: "2026-08-03T03:00:00.000Z"
    } as Appointment
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[dentistColumn]}
        columnOf={byDentist}
        shifts={[]}
        appointments={[appointment]}
        renderAppointment={(a) => <div key={a.id}>card-{a.id}</div>}
      />
    )
    expect(screen.getByText(`card-${appointment.id}`)).toBeInTheDocument()
  })

  it("shades nothing on a column that has no staff to be off shift", () => {
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[chairColumn]}
        columnOf={() => chairId}
        shifts={[shift("2026-08-03T02:00:00.000Z", "2026-08-03T10:00:00.000Z")]}
        appointments={[]}
        renderAppointment={() => null}
      />
    )
    expect(screen.queryAllByTestId("offshift")).toHaveLength(0)
    expect(screen.getByText("Chair 1")).toBeInTheDocument()
  })

  it("places a card by the column the mapper names, not by its dentist", () => {
    const appointment = {
      id: "9f9619ff-8b86-4d01-b42d-00cf4fc964ff",
      dentistId: dentist.id,
      startsAt: "2026-08-03T02:00:00.000Z",
      endsAt: "2026-08-03T03:00:00.000Z"
    } as Appointment
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[chairColumn]}
        columnOf={() => chairId}
        shifts={[]}
        appointments={[appointment]}
        renderAppointment={(a) => <div key={a.id}>card-{a.id}</div>}
      />
    )
    expect(screen.getByTestId(`col-${chairId}`)).toHaveTextContent(`card-${appointment.id}`)
  })

  it("shades off-shift with a flat calm fill, not a diagonal hazard stripe", () => {
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[dentistColumn]}
        columnOf={byDentist}
        shifts={[shift("2026-08-03T02:00:00.000Z", "2026-08-03T10:00:00.000Z")]}
        appointments={[]}
        renderAppointment={() => null}
      />
    )
    const block = screen.getAllByTestId("offshift")[0]!
    expect(block.getAttribute("style") ?? "").toContain("var(--offshift)")
    expect(block.getAttribute("style") ?? "").not.toContain("repeating-linear-gradient")
  })

  it("renders week columns as weekday-and-date headers and highlights today's column", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-04T02:00:00.000Z"))
    const mon = { id: "2026-08-03", name: "Mon, 3 Aug 2026" }
    const tue = { id: "2026-08-04", name: "Tue, 4 Aug 2026" }
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[mon, tue]}
        columnOf={() => null}
        columnDate={(column) => column.id}
        columnKind="day"
        shifts={[]}
        appointments={[]}
        renderAppointment={() => null}
      />
    )
    expect(screen.getByText("Mon")).toBeInTheDocument()
    expect(screen.getByText("Tue")).toBeInTheDocument()
    const todayBadge = screen.getByText("04")
    expect(todayBadge).toHaveClass("bg-primary")
    expect(screen.getByText("03")).not.toHaveClass("bg-primary")
  })

  it("rings a resource column with its assigned hue and shows its load caption", () => {
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[dentistColumn]}
        columnOf={byDentist}
        columnMeta={() => ({ hue: 2, load: "3 booked · 4h open" })}
        shifts={[]}
        appointments={[]}
        renderAppointment={() => null}
      />
    )
    expect(screen.getByText("3 booked · 4h open")).toBeInTheDocument()
    const avatar = screen.getByText("T")
    expect(avatar.getAttribute("style") ?? "").toContain("var(--hue2-border)")
  })

  it("drops a card no column claims", () => {
    const appointment = {
      id: "9f9619ff-8b86-4d01-b42d-00cf4fc964ff",
      dentistId: dentist.id,
      startsAt: "2026-08-03T02:00:00.000Z",
      endsAt: "2026-08-03T03:00:00.000Z"
    } as Appointment
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[chairColumn]}
        columnOf={() => null}
        shifts={[]}
        appointments={[appointment]}
        renderAppointment={(a) => <div key={a.id}>card-{a.id}</div>}
      />
    )
    expect(screen.queryByText(`card-${appointment.id}`)).not.toBeInTheDocument()
  })
})
