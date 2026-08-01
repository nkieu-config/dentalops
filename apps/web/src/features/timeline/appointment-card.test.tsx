import type { Appointment } from "@dentalops/contracts"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { AppointmentCard } from "./appointment-card"
import { bkkDayStart } from "./lib/geometry"

const dayStart = bkkDayStart("2026-08-03")

const makeAppointment = (overrides: Partial<Appointment> = {}): Appointment => ({
  id: "4f9619ff-8b86-4d01-b42d-00cf4fc964ff",
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
  claims: [],
  ...overrides
})

const renderCard = (appointment: Appointment, lane = 0, lanes = 1) => {
  const onClick = vi.fn()
  render(
    <AppointmentCard
      appointment={appointment}
      dayStart={dayStart}
      lane={lane}
      lanes={lanes}
      onClick={onClick}
    />
  )
  return { card: screen.getByTestId(`appt-${appointment.id}`), onClick }
}

describe("AppointmentCard", () => {
  it("places a 09:00–10:00 clinic-time appointment at 576px with a 64px height", () => {
    const { card } = renderCard(makeAppointment())
    expect(card).toHaveStyle({ top: "576px", height: "64px" })
    expect(screen.getByText("09:00–10:00")).toBeInTheDocument()
    expect(screen.getByText("Cleaning")).toBeInTheDocument()
    expect(screen.getByText("S. Chaiwat")).toBeInTheDocument()
  })

  it("splits the column by lane so concurrent cards sit side by side", () => {
    const { card } = renderCard(makeAppointment(), 1, 2)
    expect(card.style.left).toBe("calc(50% + 2px)")
    expect(card.style.width).toBe("calc(50% - 4px)")
  })

  it("takes its fill and left border from the service hue and calls back on click", async () => {
    const appointment = makeAppointment({
      service: { id: "5f9619ff-8b86-4d01-b42d-00cf4fc964ff", name: "Whitening", colorIndex: 4 }
    })
    const { card, onClick } = renderCard(appointment)
    expect(card.style.backgroundColor).toBe("var(--hue4-bg)")
    expect(card.style.borderLeftColor).toBe("var(--hue4-border)")
    expect(screen.queryByLabelText("Completed")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("No-show")).not.toBeInTheDocument()
    await userEvent.click(card)
    expect(onClick).toHaveBeenCalledWith(appointment)
  })

  it("fades a completed appointment and marks it with a check icon", () => {
    const { card } = renderCard(makeAppointment({ status: "completed" }))
    expect(card.className).toContain("opacity-70")
    expect(screen.getByLabelText("Completed")).toBeInTheDocument()
  })

  it("overrides the hue border with the warning token for a no-show and adds an icon", () => {
    const { card } = renderCard(makeAppointment({ status: "no_show" }))
    expect(card.style.borderLeftColor).toBe("var(--warning)")
    expect(card.style.backgroundColor).toBe("var(--hue0-bg)")
    expect(screen.getByLabelText("No-show")).toBeInTheDocument()
  })

  it("drops the service hue for a cancelled appointment and strikes the title through", () => {
    const { card } = renderCard(makeAppointment({ status: "cancelled" }))
    expect(card.style.backgroundColor).toBe("")
    expect(card.style.borderLeftColor).toBe("")
    expect(card.className).toContain("bg-muted")
    expect(screen.getByText("Cleaning").className).toContain("line-through")
    expect(screen.getByLabelText("Cancelled")).toBeInTheDocument()
  })

  it("flags an appointment that belongs to a recurring series", () => {
    renderCard(makeAppointment({ seriesId: "7f9619ff-8b86-4d01-b42d-00cf4fc964ff" }))
    expect(screen.getByLabelText("Recurring")).toBeInTheDocument()
  })
})
