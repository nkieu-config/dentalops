import type { Appointment } from "@dentalops/contracts"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AppointmentCard } from "./appointment-card"
import { bkkDayStart } from "./lib/geometry"
import { useGridKeyboard } from "./use-grid-keyboard"

const firstDentist = "2f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const secondDentist = "8f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const serviceId = "5f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const patientId = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const dayStart = bkkDayStart("2026-08-03")

const card = (id: string, dentistId: string, startsAt: string, endsAt: string): Appointment => ({
  id,
  branchId: "1f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  serviceId,
  dentistId,
  patientId,
  startsAt,
  endsAt,
  status: "confirmed",
  version: 4,
  seriesId: null,
  service: { id: serviceId, name: "Cleaning", colorIndex: 0 },
  patient: { id: patientId, name: "S. Chaiwat", phone: "0812345678" },
  claims: []
})

const nine = card(
  "a1000000-0000-4000-8000-000000000001",
  firstDentist,
  "2026-08-03T02:00:00.000Z",
  "2026-08-03T03:00:00.000Z"
)
const ten = card(
  "a1000000-0000-4000-8000-000000000002",
  firstDentist,
  "2026-08-03T03:00:00.000Z",
  "2026-08-03T04:00:00.000Z"
)
const eleven = card(
  "a1000000-0000-4000-8000-000000000003",
  firstDentist,
  "2026-08-03T04:00:00.000Z",
  "2026-08-03T05:00:00.000Z"
)
const nineFortyFive = card(
  "a1000000-0000-4000-8000-000000000004",
  secondDentist,
  "2026-08-03T02:45:00.000Z",
  "2026-08-03T03:45:00.000Z"
)
const elevenThirty = card(
  "a1000000-0000-4000-8000-000000000005",
  secondDentist,
  "2026-08-03T04:30:00.000Z",
  "2026-08-03T05:30:00.000Z"
)
const quarterHour = card(
  "a1000000-0000-4000-8000-000000000006",
  secondDentist,
  "2026-08-03T06:00:00.000Z",
  "2026-08-03T06:15:00.000Z"
)

const columns: [string, Appointment[]][] = [
  [firstDentist, [ten, nine, eleven]],
  [secondDentist, [elevenThirty, nineFortyFive, quarterHour]]
]

interface HarnessProps {
  reschedule: (input: {
    id: string
    version: number
    startsAt?: string
    durationMin?: number
  }) => void
  busy?: string
}

const Harness = ({ reschedule, busy }: HarnessProps) => {
  const keyboard = useGridKeyboard({ reschedule, isBusy: (id) => id === busy })
  return (
    <div>
      <button type="button">outside</button>
      <div onKeyDown={keyboard.onKeyDown}>
        {columns.map(([dentistId, appointments]) => (
          <div key={dentistId}>
            {appointments.map((a) => (
              <AppointmentCard
                key={a.id}
                appointment={a}
                dayStart={dayStart}
                lane={0}
                lanes={1}
                onClick={() => {}}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

const mount = (busy?: string) => {
  const reschedule = vi.fn()
  render(<Harness reschedule={reschedule} busy={busy} />)
  return {
    reschedule,
    at: (appointment: Appointment) => screen.getByTestId(`appt-${appointment.id}`)
  }
}

describe("useGridKeyboard", () => {
  it("walks the column in start-time order, not the order the cards were rendered", () => {
    const { at } = mount()
    at(nine).focus()

    expect(fireEvent.keyDown(at(nine), { key: "ArrowDown" })).toBe(false)
    expect(document.activeElement).toBe(at(ten))

    fireEvent.keyDown(at(ten), { key: "ArrowDown" })
    expect(document.activeElement).toBe(at(eleven))

    fireEvent.keyDown(at(eleven), { key: "ArrowUp" })
    expect(document.activeElement).toBe(at(ten))
  })

  it("stops at the ends of a column and still swallows the key", () => {
    const { at } = mount()
    at(nine).focus()

    expect(fireEvent.keyDown(at(nine), { key: "ArrowUp" })).toBe(false)
    expect(document.activeElement).toBe(at(nine))

    at(eleven).focus()
    expect(fireEvent.keyDown(at(eleven), { key: "ArrowDown" })).toBe(false)
    expect(document.activeElement).toBe(at(eleven))
  })

  it("crosses columns to the card whose start is nearest the focused one", () => {
    const { at } = mount()
    at(nine).focus()

    fireEvent.keyDown(at(nine), { key: "ArrowRight" })
    expect(document.activeElement).toBe(at(nineFortyFive))

    fireEvent.keyDown(at(nineFortyFive), { key: "ArrowLeft" })
    expect(document.activeElement).toBe(at(ten))

    fireEvent.keyDown(at(ten), { key: "ArrowLeft" })
    expect(document.activeElement).toBe(at(ten))
  })

  it("nudges the focused card by a quarter hour in either direction", () => {
    const { at, reschedule } = mount()
    at(ten).focus()

    expect(fireEvent.keyDown(at(ten), { key: "ArrowDown", shiftKey: true })).toBe(false)
    expect(reschedule).toHaveBeenCalledWith({
      id: ten.id,
      version: 4,
      startsAt: "2026-08-03T03:15:00.000Z"
    })
    expect(document.activeElement).toBe(at(ten))

    fireEvent.keyDown(at(ten), { key: "ArrowUp", shiftKey: true })
    expect(reschedule).toHaveBeenLastCalledWith({
      id: ten.id,
      version: 4,
      startsAt: "2026-08-03T02:45:00.000Z"
    })
  })

  it("resizes the focused card's duration by a quarter hour with shift+left/right", () => {
    const { at, reschedule } = mount()
    at(ten).focus()

    expect(fireEvent.keyDown(at(ten), { key: "ArrowRight", shiftKey: true })).toBe(false)
    expect(reschedule).toHaveBeenCalledWith({
      id: ten.id,
      version: 4,
      durationMin: 75
    })
    expect(document.activeElement).toBe(at(ten))

    fireEvent.keyDown(at(ten), { key: "ArrowLeft", shiftKey: true })
    expect(reschedule).toHaveBeenLastCalledWith({
      id: ten.id,
      version: 4,
      durationMin: 45
    })
  })

  it("does not shrink a resize below the minimum grid increment", () => {
    const { at, reschedule } = mount()
    at(quarterHour).focus()

    fireEvent.keyDown(at(quarterHour), { key: "ArrowLeft", shiftKey: true })
    expect(reschedule).toHaveBeenCalledWith({
      id: quarterHour.id,
      version: 4,
      durationMin: 15
    })
  })

  it("refuses to nudge a card that already has a mutation in flight", () => {
    const { at, reschedule } = mount(ten.id)
    at(ten).focus()
    fireEvent.keyDown(at(ten), { key: "ArrowDown", shiftKey: true })
    expect(reschedule).not.toHaveBeenCalled()

    at(nine).focus()
    fireEvent.keyDown(at(nine), { key: "ArrowDown", shiftKey: true })
    expect(reschedule).toHaveBeenCalledTimes(1)
  })

  it("leaves keys alone when the focus is not on a card", () => {
    const { at, reschedule } = mount()
    screen.getByRole("button", { name: "outside" }).focus()

    expect(fireEvent.keyDown(at(nine), { key: "ArrowDown" })).toBe(true)
    expect(fireEvent.keyDown(at(nine), { key: "ArrowDown", shiftKey: true })).toBe(true)
    expect(reschedule).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "outside" }))
  })
})
