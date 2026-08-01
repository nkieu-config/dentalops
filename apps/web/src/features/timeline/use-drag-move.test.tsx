import type { Appointment } from "@dentalops/contracts"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AppointmentCard } from "./appointment-card"
import { bkkDayStart } from "./lib/geometry"
import { useDragMove, type RescheduleDrop } from "./use-drag-move"

const firstDentist = "2f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const secondDentist = "8f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const serviceId = "5f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const apptId = "a1000000-0000-4000-8000-000000000001"
const dayStart = bkkDayStart("2026-08-03")

const appointment: Appointment = {
  id: apptId,
  branchId: "1f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  serviceId,
  dentistId: firstDentist,
  patientId: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  startsAt: "2026-08-03T02:00:00.000Z",
  endsAt: "2026-08-03T03:00:00.000Z",
  status: "confirmed",
  version: 3,
  seriesId: null,
  service: { id: serviceId, name: "Cleaning", colorIndex: 0 },
  patient: { id: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff", name: "S. Chaiwat", phone: "0812345678" },
  claims: []
}

interface HarnessProps {
  onDrop: (drop: RescheduleDrop) => void
  onOpen: (appointment: Appointment) => void
  busy?: boolean
}

const Harness = ({ onDrop, onOpen, busy = false }: HarnessProps) => {
  const drag = useDragMove({
    dentistIds: [firstDentist, secondDentist],
    columnLefts: () => [0, 200],
    isBusy: () => busy,
    onDrop
  })
  return (
    <div>
      <AppointmentCard
        appointment={appointment}
        dayStart={dayStart}
        lane={0}
        lanes={1}
        onClick={(picked) => {
          if (!drag.consumeDrag()) onOpen(picked)
        }}
        onMoveStart={drag.startMove(appointment)}
        onResizeStart={drag.startResize(appointment)}
      />
      <p data-testid="preview">
        {drag.preview
          ? `${drag.preview.dentistId} ${drag.preview.startMs} ${drag.preview.endMs}`
          : "none"}
      </p>
    </div>
  )
}

const mount = (busy = false) => {
  const onDrop = vi.fn()
  const onOpen = vi.fn()
  render(<Harness onDrop={onDrop} onOpen={onOpen} busy={busy} />)
  return { onDrop, onOpen, card: screen.getByTestId(`appt-${apptId}`) }
}

const previewText = () => screen.getByTestId("preview").textContent

describe("useDragMove", () => {
  it("drags a card down an hour and drops it with the new start only", () => {
    const { onDrop, card } = mount()
    fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 576 })
    fireEvent.pointerMove(window, { clientX: 10, clientY: 640 })

    expect(previewText()).toBe(
      `${firstDentist} ${Date.parse("2026-08-03T03:00:00.000Z")} ${Date.parse("2026-08-03T04:00:00.000Z")}`
    )

    fireEvent.pointerUp(window)
    expect(onDrop).toHaveBeenCalledWith({
      id: apptId,
      version: 3,
      startsAt: "2026-08-03T03:00:00.000Z"
    })
    expect(previewText()).toBe("none")
  })

  it("treats a press that barely moves as a click on the card", () => {
    const { onDrop, onOpen, card } = mount()
    fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 576 })
    fireEvent.pointerMove(window, { clientX: 10, clientY: 579 })
    fireEvent.pointerUp(window)
    fireEvent.click(card)

    expect(previewText()).toBe("none")
    expect(onDrop).not.toHaveBeenCalled()
    expect(onOpen).toHaveBeenCalledWith(appointment)
  })

  it("drags the bottom edge and drops a duration without touching the start", () => {
    const { onDrop } = mount()
    fireEvent.pointerDown(screen.getByTestId(`resize-${apptId}`), {
      button: 0,
      clientX: 10,
      clientY: 640
    })
    fireEvent.pointerMove(window, { clientX: 10, clientY: 672 })

    expect(previewText()).toBe(
      `${firstDentist} ${Date.parse("2026-08-03T02:00:00.000Z")} ${Date.parse("2026-08-03T03:30:00.000Z")}`
    )

    fireEvent.pointerUp(window)
    expect(onDrop).toHaveBeenCalledWith({ id: apptId, version: 3, durationMin: 90 })
  })

  it("abandons the drag on Escape and keeps the pointer release silent", () => {
    const { onDrop, onOpen, card } = mount()
    fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 576 })
    fireEvent.pointerMove(window, { clientX: 10, clientY: 640 })
    expect(previewText()).not.toBe("none")

    fireEvent.keyDown(window, { key: "Escape" })
    expect(previewText()).toBe("none")

    fireEvent.pointerUp(window)
    fireEvent.click(card)
    expect(onDrop).not.toHaveBeenCalled()
    expect(onOpen).not.toHaveBeenCalled()
  })

  it("carries the dentist of the column the pointer ended in", () => {
    const { onDrop, card } = mount()
    fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 576 })
    fireEvent.pointerMove(window, { clientX: 250, clientY: 576 })

    expect(previewText()).toBe(
      `${secondDentist} ${Date.parse("2026-08-03T02:00:00.000Z")} ${Date.parse("2026-08-03T03:00:00.000Z")}`
    )

    fireEvent.pointerUp(window)
    expect(onDrop).toHaveBeenCalledWith({ id: apptId, version: 3, dentistId: secondDentist })
  })

  it("sends nothing when the drop lands back on the slot it started from", () => {
    const { onDrop, onOpen, card } = mount()
    fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 576 })
    fireEvent.pointerMove(window, { clientX: 10, clientY: 581 })
    fireEvent.pointerUp(window)
    fireEvent.click(card)

    expect(onDrop).not.toHaveBeenCalled()
    expect(onOpen).not.toHaveBeenCalled()
  })

  it("ignores a drag on an appointment that already has a mutation in flight", () => {
    const { onDrop, card } = mount(true)
    fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 576 })
    fireEvent.pointerMove(window, { clientX: 10, clientY: 640 })

    expect(previewText()).toBe("none")
    fireEvent.pointerUp(window)
    expect(onDrop).not.toHaveBeenCalled()
  })
})
