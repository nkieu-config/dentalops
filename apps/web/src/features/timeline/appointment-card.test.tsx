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
  it("uses full details for a booking with at least 72px of vertical space", () => {
    const appointment = makeAppointment({
      endsAt: "2026-08-03T03:15:00.000Z"
    })
    const { card } = renderCard(appointment)
    expect(card).toHaveStyle({ top: "576px", height: "80px" })
    expect(card).toHaveAttribute("data-density", "full")
    expect(card).toHaveTextContent("09:00–10:15")
    expect(card).toHaveTextContent("S. Chaiwat")
    expect(card).toHaveTextContent("Cleaning")
    expect(card.textContent?.indexOf("S. Chaiwat")).toBeLessThan(card.textContent?.indexOf("Cleaning") ?? 0)
  })

  it("keeps patient identity visible on compact cards and hides the service", () => {
    const { card } = renderCard(
      makeAppointment({
        endsAt: "2026-08-03T02:30:00.000Z"
      })
    )

    expect(card).toHaveStyle({ height: "32px" })
    expect(card).toHaveAttribute("data-density", "compact")
    expect(card).toHaveAttribute("data-time-format", "start")
    expect(card).toHaveTextContent("09:00")
    expect(card).toHaveTextContent("S. Chaiwat")
    expect(screen.getByText("Cleaning").className).toContain("sr-only")
  })

  it("uses medium content from 48px through 71px so the service remains visible", () => {
    const { card } = renderCard(
      makeAppointment({
        endsAt: "2026-08-03T02:45:00.000Z"
      })
    )

    expect(card).toHaveStyle({ height: "48px" })
    expect(card).toHaveAttribute("data-density", "medium")
    expect(card).toHaveTextContent("S. Chaiwat")
    expect(screen.getByText("Cleaning").className).not.toContain("sr-only")
  })

  it("keeps a 64px booking in medium density", () => {
    const { card } = renderCard(makeAppointment())

    expect(card).toHaveStyle({ height: "64px" })
    expect(card).toHaveAttribute("data-density", "medium")
    expect(card).toHaveTextContent("Cleaning")
    expect(screen.getByText("Cleaning").className).not.toContain("sr-only")
  })

  it("uses compact content in a narrow week column even when a booking is one hour", () => {
    render(
      <AppointmentCard
        appointment={makeAppointment()}
        dayStart={dayStart}
        lane={0}
        lanes={1}
        contentDensity="compact"
        onClick={() => {}}
      />
    )

    const card = screen.getByTestId(`appt-${makeAppointment().id}`)
    expect(card).toHaveStyle({ height: "64px" })
    expect(card).toHaveAttribute("data-density", "compact")
    expect(card).toHaveAttribute("data-time-format", "start")
    expect(card).toHaveTextContent("S. Chaiwat")
    expect(screen.getByText("Cleaning").className).toContain("sr-only")
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

  it("keeps a completed appointment legible and marks it with a check icon", () => {
    const { card } = renderCard(makeAppointment({ status: "completed" }))
    expect(card.className).not.toContain("opacity-70")
    expect(screen.getByLabelText("Completed")).toBeInTheDocument()
  })

  it("marks a no-show with its own icon rather than repainting the service edge", () => {
    const { card } = renderCard(makeAppointment({ status: "no_show" }))
    expect(card.style.borderLeftColor).toBe("var(--hue0-border)")
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

  it("does not show patient initials inside a dense scheduling card", () => {
    renderCard(
      makeAppointment({
        endsAt: "2026-08-03T03:15:00.000Z"
      })
    )
    expect(screen.queryByText("SC")).not.toBeInTheDocument()
  })

  it("reduces content density when concurrent lanes make the card narrow", () => {
    const { card } = renderCard(
      makeAppointment({ endsAt: "2026-08-03T03:15:00.000Z" }),
      0,
      3
    )

    expect(card).toHaveAttribute("data-density", "compact")
    expect(card).toHaveAttribute("data-time-format", "start")
    expect(screen.getByText("Cleaning").className).toContain("sr-only")
  })

  it("exposes one complete booking summary and exact keyboard shortcuts", () => {
    render(
      <AppointmentCard
        appointment={makeAppointment()}
        dentistName="Dr. Anong"
        dayStart={dayStart}
        lane={0}
        lanes={1}
        interactionHintId="timeline-interaction-hint"
        onClick={() => {}}
      />
    )

    const card = screen.getByTestId(`appt-${makeAppointment().id}`)
    expect(card).toHaveAccessibleName(
      "09:00–10:00, S. Chaiwat, Dr. Anong, Cleaning, Confirmed"
    )
    expect(card).toHaveAttribute(
      "aria-keyshortcuts",
      "Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight"
    )
  })

  it("keeps time-positioned cards in place on hover and exposes a 16px resize hit area", () => {
    const onResizeStart = vi.fn()
    render(
      <AppointmentCard
        appointment={makeAppointment()}
        dayStart={dayStart}
        lane={0}
        lanes={1}
        onClick={() => {}}
        onResizeStart={onResizeStart}
      />
    )
    const card = screen.getByTestId(`appt-${makeAppointment().id}`)
    expect(card.className).not.toContain("translate-y")
    expect(card.className).toContain("hover:shadow-(--shadow-appointment-hover)")
    expect(screen.getByTestId(`resize-${makeAppointment().id}`).className).toContain("h-4")
    expect(
      screen.getByTestId(`resize-${makeAppointment().id}`).querySelector("span")?.className
    ).toContain("group-focus-within:opacity-70")
    expect(screen.getByTestId(`resize-${makeAppointment().id}`)).toBeInTheDocument()
  })

  it("shows the resize grip before the pointer arrives when the card has room", () => {
    render(
      <AppointmentCard
        appointment={makeAppointment()}
        dayStart={dayStart}
        lane={0}
        lanes={1}
        onClick={() => {}}
        onResizeStart={vi.fn()}
      />
    )

    const grip = screen.getByTestId(`resize-${makeAppointment().id}`).querySelector("span")
    expect(grip?.className).toContain("opacity-30")
    expect(grip?.className).not.toContain("opacity-0")
  })

  it("keeps the grip out of the way on a card too short to spare the room", () => {
    render(
      <AppointmentCard
        appointment={makeAppointment()}
        dayStart={dayStart}
        lane={0}
        lanes={1}
        contentDensity="compact"
        onClick={() => {}}
        onResizeStart={vi.fn()}
      />
    )

    const grip = screen.getByTestId(`resize-${makeAppointment().id}`).querySelector("span")
    expect(grip?.className).toContain("opacity-0")
  })

  it("keeps the full time range visible in a drag preview", () => {
    render(
      <AppointmentCard
        appointment={makeAppointment()}
        dayStart={dayStart}
        lane={0}
        lanes={1}
        contentDensity="compact"
        preview
        onClick={() => {}}
      />
    )

    const preview = screen.getByTestId("drag-preview")
    expect(preview).toHaveTextContent("09:00–10:00")
    expect(preview).toHaveAttribute("data-time-format", "range")
  })

  it("offers no resize grip when the card cannot be resized", () => {
    renderCard(makeAppointment())
    expect(screen.queryByTestId(`resize-${makeAppointment().id}`)).not.toBeInTheDocument()
  })

  it("uses an inset outline only for the card opened in the inspector", () => {
    render(
      <AppointmentCard
        appointment={makeAppointment()}
        dayStart={dayStart}
        lane={0}
        lanes={1}
        onClick={() => {}}
        selected
      />
    )

    const card = screen.getByTestId(`appt-${makeAppointment().id}`)
    expect(card.className).toContain("outline-primary")
    expect(card.className).not.toContain("ring-primary")
  })

  it("flags a conflict without costing the card its selection or service colour", () => {
    const appointment = makeAppointment()
    render(
      <AppointmentCard
        appointment={appointment}
        dayStart={dayStart}
        lane={0}
        lanes={1}
        conflict
        selected
        onClick={() => {}}
      />
    )

    const card = screen.getByTestId(`appt-${appointment.id}`)
    expect(card.style.borderLeftColor).toBe("var(--hue0-border)")
    expect(screen.getByLabelText("Conflict")).toBeInTheDocument()
    expect(card.className).toContain("outline-primary")
    expect(card.className).toContain("focus-visible:ring-ring")
  })

  it("associates an interactive card with its move and resize guidance", () => {
    render(
      <AppointmentCard
        appointment={makeAppointment()}
        dayStart={dayStart}
        lane={0}
        lanes={1}
        interactionHintId="timeline-interaction-hint"
        onClick={() => {}}
      />
    )

    expect(screen.getByTestId(`appt-${makeAppointment().id}`)).toHaveAttribute(
      "aria-describedby",
      "timeline-interaction-hint"
    )
  })
})
