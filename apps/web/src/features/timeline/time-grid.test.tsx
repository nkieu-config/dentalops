import type { Appointment, Shift, StaffMember } from "@dentalops/contracts"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { TimeGrid } from "./time-grid"

const dentist: StaffMember = {
  id: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  name: "Dr. Test",
  role: "dentist",
  isActive: true
}

const shift = (startsAt: string, endsAt: string): Shift =>
  ({
    id: "7f9619ff-8b86-4d01-b42d-00cf4fc964ff",
    staffId: dentist.id,
    branchId: "8f9619ff-8b86-4d01-b42d-00cf4fc964ff",
    startsAt,
    endsAt
  }) as Shift

describe("TimeGrid", () => {
  it("shades everything outside the shift as off-shift", () => {
    render(
      <TimeGrid
        date="2026-08-03"
        dentists={[dentist]}
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
        dentists={[dentist]}
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
        dentists={[dentist]}
        shifts={[]}
        appointments={[appointment]}
        renderAppointment={(a) => <div key={a.id}>card-{a.id}</div>}
      />
    )
    expect(screen.getByText(`card-${appointment.id}`)).toBeInTheDocument()
  })
})
