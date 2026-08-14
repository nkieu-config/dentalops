import type { Appointment, Shift, StaffMember } from "@dentalops/contracts"
import { render, screen } from "../../test/render"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { bkkToday } from "./lib/geometry"
import { TimeGrid } from "./time-grid"

const dentist: StaffMember = {
  id: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  name: "Dr. Test",
  role: "dentist",
  isActive: true,
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
    endsAt,
  }) as Shift

describe("TimeGrid", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("groups the header and canvas inside one layered schedule shell", () => {
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[dentistColumn]}
        columnOf={byDentist}
        shifts={[]}
        appointments={[]}
        renderAppointment={() => null}
      />,
    )

    const shell = screen.getByTestId("timeline-shell")
    expect(shell).toContainElement(screen.getByTestId("timeline-header"))
    expect(shell).toContainElement(screen.getByTestId("timeline-canvas"))
    expect(screen.getByTestId(`resource-header-${dentist.id}`)).toHaveTextContent("Dr. Test")
  })

  it("presents resource names as one continuous header rail aligned to the canvas", () => {
    const secondDentist = {
      id: "5f9619ff-8b86-4d01-b42d-00cf4fc964ff",
      name: "Dr. Second",
      staffId: "5f9619ff-8b86-4d01-b42d-00cf4fc964ff",
    }
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[dentistColumn, secondDentist]}
        columnOf={byDentist}
        shifts={[]}
        appointments={[]}
        renderAppointment={() => null}
      />,
    )

    const rail = screen.getByTestId("timeline-header-rail")
    expect(rail).toHaveClass("divide-x", "divide-timeline-resource-line")
    expect(screen.getByTestId("timeline-header")).not.toHaveClass("gap-1")
    expect(screen.getByTestId(`resource-header-${dentist.id}`)).not.toHaveClass(
      "rounded-timeline-header",
    )
  })

  it("keeps a long resource name available when the visible label is clamped", () => {
    const longName = "Dr. Nattapong Chantarapornchai"
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[{ ...dentistColumn, name: longName }]}
        columnOf={byDentist}
        shifts={[]}
        appointments={[]}
        renderAppointment={() => null}
      />,
    )

    expect(screen.getByText(longName)).toHaveAttribute("title", longName)
  })

  it("keeps canvas layers beneath the sticky resource header", () => {
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[dentistColumn]}
        columnOf={byDentist}
        shifts={[]}
        appointments={[]}
        renderAppointment={() => null}
      />,
    )

    expect(screen.getByTestId("timeline-header")).toHaveClass("sticky", "z-30", "bg-timeline-header")
    expect(screen.getByTestId("timeline-canvas")).toHaveClass("relative", "z-0")
  })

  it("uses hour dividers without a persistent fifteen-minute matrix", () => {
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[dentistColumn]}
        columnOf={byDentist}
        shifts={[]}
        appointments={[]}
        renderAppointment={() => null}
      />,
    )

    const canvas = screen.getByTestId("timeline-canvas")
    expect(canvas.getAttribute("style")).toContain("var(--timeline-hour-line)")
    expect(canvas.getAttribute("style")).not.toContain("transparent 1px, transparent 16px")
  })

  it("keeps a fifteen-minute gap between shifts as its own shaded block", () => {
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[dentistColumn]}
        columnOf={byDentist}
        shifts={[
          shift("2026-08-02T17:00:00.000Z", "2026-08-03T02:00:00.000Z"),
          shift("2026-08-03T02:15:00.000Z", "2026-08-03T17:00:00.000Z"),
        ]}
        appointments={[]}
        renderAppointment={() => null}
      />,
    )

    const blocks = screen.getAllByTestId("offshift")
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toHaveStyle({ height: "16px" })
    expect(blocks[0]).toBeEmptyDOMElement()
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
      />,
    )
    const label = screen.getByText("09:17")
    expect(label).toHaveClass("bg-timeline-current-time", "text-timeline-current-time-foreground")
  })

  it("keeps the current-time rule beneath appointment cards", () => {
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
      />,
    )

    expect(screen.getByTestId("now-line")).toHaveClass("z-1")
    expect(screen.getByTestId("now-line")).not.toHaveClass("z-10")
  })

  it("scrolls to one hour before the current time when the displayed date is today", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-03T06:00:00.000Z"))
    const scrollTo = vi.fn()
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    })
    render(
      <TimeGrid
        date={bkkToday()}
        columns={[dentistColumn]}
        columnOf={byDentist}
        shifts={[]}
        appointments={[]}
        renderAppointment={() => null}
      />,
    )
    expect(scrollTo).toHaveBeenCalledWith({ top: 4 * 64 - 16 })
  })

  it("repositions the initial scroll when shift data resolves", () => {
    const scrollTo = vi.fn()
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    })
    const props = {
      date: "2026-08-04",
      columns: [dentistColumn],
      columnOf: byDentist,
      appointments: [],
      renderAppointment: () => null,
    }
    const { rerender } = render(<TimeGrid {...props} shifts={[]} />)
    rerender(
      <TimeGrid
        {...props}
        shifts={[shift("2026-08-04T03:00:00.000Z", "2026-08-04T10:00:00.000Z")]}
      />,
    )
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0 })
  })

  it("keeps the visual inset outside the scrollport and uses proximity snapping", () => {
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[dentistColumn]}
        columnOf={byDentist}
        shifts={[]}
        appointments={[]}
        renderAppointment={() => null}
        snap
      />,
    )
    const frame = screen.getByTestId("timegrid-frame")
    const scroll = screen.getByTestId("timegrid-scroll")
    expect(frame).toHaveClass("p-2", "sm:p-3")
    expect(frame).toContainElement(scroll)
    expect(scroll).toHaveClass(
      "h-full",
      "overflow-auto",
      "border",
      "border-border",
      "rounded-timeline-shell",
      "bg-timeline-shell",
      "snap-proximity",
    )
    expect(scroll).not.toHaveClass("p-2", "sm:p-3", "snap-mandatory")
    expect(screen.getByTestId("timeline-shell")).not.toHaveClass(
      "border",
      "rounded-timeline-shell",
      "bg-timeline-shell",
    )
  })

  it("shows keyboard focus on the scrollable schedule region", () => {
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[dentistColumn]}
        columnOf={byDentist}
        shifts={[]}
        appointments={[]}
        renderAppointment={() => null}
      />,
    )

    expect(screen.getByRole("region", { name: "Appointment timeline" })).toHaveClass(
      "focus-visible:outline-none",
      "focus-visible:ring-2",
      "focus-visible:ring-ring",
    )
  })

  it("contains scroll chaining inside the schedule canvas", () => {
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[dentistColumn]}
        columnOf={byDentist}
        shifts={[]}
        appointments={[]}
        renderAppointment={() => null}
      />,
    )

    expect(screen.getByTestId("timegrid-scroll")).toHaveClass("overscroll-contain")
  })

  it("does not shade off-shift time when shift data is unavailable", () => {
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[dentistColumn]}
        columnOf={byDentist}
        shifts={[]}
        appointments={[]}
        renderAppointment={() => null}
        showOffShift={false}
      />,
    )
    expect(screen.queryAllByTestId("offshift")).toHaveLength(0)
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
      />,
    )
    const blocks = screen.getAllByTestId("offshift")
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toHaveStyle({ top: "0px", height: "64px" })
    expect(blocks[1]).toHaveStyle({ top: "576px", height: "64px" })
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
      />,
    )
    const blocks = screen.getAllByTestId("offshift")
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toHaveStyle({ top: "0px", height: "768px" })
  })

  it("renders appointments through the render prop", () => {
    const appointment = {
      id: "9f9619ff-8b86-4d01-b42d-00cf4fc964ff",
      dentistId: dentist.id,
      startsAt: "2026-08-03T02:00:00.000Z",
      endsAt: "2026-08-03T03:00:00.000Z",
    } as Appointment
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[dentistColumn]}
        columnOf={byDentist}
        shifts={[]}
        appointments={[appointment]}
        renderAppointment={(a) => <div key={a.id}>card-{a.id}</div>}
      />,
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
      />,
    )
    expect(screen.queryAllByTestId("offshift")).toHaveLength(0)
    expect(screen.getByText("Chair 1")).toBeInTheDocument()
  })

  it("uses the chair identifier without repeating the selected branch in every header", () => {
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[{ ...chairColumn, name: "Ladprao Chair 1" }]}
        columnOf={() => chairId}
        resourceKind="chair"
        resourceContext="Ladprao"
        shifts={[]}
        appointments={[]}
        renderAppointment={() => null}
      />,
    )

    const header = screen.getByTestId(`resource-header-${chairId}`)
    expect(header).toHaveTextContent("Chair 1")
    expect(header).not.toHaveTextContent("Ladprao")
  })

  it("names a chair once instead of pairing its number with its name", () => {
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[{ ...chairColumn, name: "Ladprao Chair 1" }]}
        columnOf={() => chairId}
        resourceKind="chair"
        resourceContext="Ladprao"
        shifts={[]}
        appointments={[]}
        renderAppointment={() => null}
      />,
    )

    expect(screen.queryByTestId(`resource-avatar-${chairId}`)).not.toBeInTheDocument()
    expect(screen.getByTitle("Ladprao Chair 1")).toHaveTextContent(/^Chair 1$/)
  })

  it("keeps the initials badge for dentist columns", () => {
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[dentistColumn]}
        columnOf={byDentist}
        shifts={[]}
        appointments={[]}
        renderAppointment={() => null}
      />,
    )

    expect(screen.getByTestId(`resource-avatar-${dentist.id}`)).toHaveTextContent("T")
  })

  it("places a card by the column the mapper names, not by its dentist", () => {
    const appointment = {
      id: "9f9619ff-8b86-4d01-b42d-00cf4fc964ff",
      dentistId: dentist.id,
      startsAt: "2026-08-03T02:00:00.000Z",
      endsAt: "2026-08-03T03:00:00.000Z",
    } as Appointment
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[chairColumn]}
        columnOf={() => chairId}
        shifts={[]}
        appointments={[appointment]}
        renderAppointment={(a) => <div key={a.id}>card-{a.id}</div>}
      />,
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
      />,
    )
    const block = screen.getAllByTestId("offshift")[0]!
    expect(block).toHaveClass("bg-timeline-offshift")
    expect(block.getAttribute("style") ?? "").not.toContain("repeating-linear-gradient")
  })

  it("shades off-shift time without tiling the same words down every column", () => {
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[dentistColumn]}
        columnOf={byDentist}
        shifts={[shift("2026-08-03T01:00:00.000Z", "2026-08-03T17:00:00.000Z")]}
        appointments={[]}
        renderAppointment={() => null}
      />,
    )
    expect(screen.queryByText("Outside shift")).not.toBeInTheDocument()
    for (const block of screen.getAllByTestId("offshift")) {
      expect(block).toHaveAttribute("aria-hidden", "true")
      expect(block).toBeEmptyDOMElement()
    }
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
      />,
    )
    expect(screen.getByText("Mon")).toBeInTheDocument()
    expect(screen.getByText("Tue")).toBeInTheDocument()
    const todayBadge = screen.getByText("04")
    expect(todayBadge).toHaveClass("bg-primary")
    expect(screen.getByText("03")).not.toHaveClass("bg-primary")
  })

  it("rings a resource column with its assigned hue", () => {
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[dentistColumn]}
        columnOf={byDentist}
        columnMeta={() => ({ hue: 2 })}
        shifts={[]}
        appointments={[]}
        renderAppointment={() => null}
      />,
    )
    const avatar = screen.getByText("T")
    expect(avatar.getAttribute("style") ?? "").toContain("var(--hue2-border)")
  })

  it("answers who can still take a case from the column header", () => {
    const appointment = {
      id: "9f9619ff-8b86-4d01-b42d-00cf4fc964ff",
      dentistId: dentist.id,
      status: "confirmed",
      startsAt: "2026-08-03T02:00:00.000Z",
      endsAt: "2026-08-03T03:00:00.000Z",
    } as Appointment
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[dentistColumn]}
        columnOf={byDentist}
        shifts={[shift("2026-08-03T02:00:00.000Z", "2026-08-03T10:00:00.000Z")]}
        appointments={[appointment]}
        renderAppointment={() => null}
      />,
    )

    expect(screen.getByTestId(`resource-load-${dentist.id}`)).toHaveTextContent("1 booked · 7h free")
    expect(screen.queryByTestId(`resource-utilisation-${dentist.id}`)).not.toBeInTheDocument()
  })

  it("counts a chair's bookings but claims no free time it cannot know", () => {
    const appointment = {
      id: "9f9619ff-8b86-4d01-b42d-00cf4fc964ff",
      dentistId: dentist.id,
      status: "confirmed",
      startsAt: "2026-08-03T02:00:00.000Z",
      endsAt: "2026-08-03T03:00:00.000Z",
    } as Appointment
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[chairColumn]}
        columnOf={() => chairId}
        resourceKind="chair"
        shifts={[shift("2026-08-03T02:00:00.000Z", "2026-08-03T10:00:00.000Z")]}
        appointments={[appointment]}
        renderAppointment={() => null}
      />,
    )

    expect(screen.getByTestId(`resource-load-${chairId}`)).toHaveTextContent("1 booked")
    expect(screen.getByTestId(`resource-load-${chairId}`)).not.toHaveTextContent("free")
    expect(screen.queryByTestId(`resource-utilisation-${chairId}`)).not.toBeInTheDocument()
  })

  it("draws only the hours the clinic works instead of a full twenty-four", () => {
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[dentistColumn]}
        columnOf={byDentist}
        shifts={[shift("2026-08-03T02:00:00.000Z", "2026-08-03T10:00:00.000Z")]}
        appointments={[]}
        renderAppointment={() => null}
      />,
    )

    expect(screen.getByTestId("timeline-canvas")).toHaveStyle({ height: "640px" })
    expect(screen.getByText("08:00")).toBeInTheDocument()
    expect(screen.getByText("17:00")).toBeInTheDocument()
    expect(screen.queryByText("00:00")).not.toBeInTheDocument()
    expect(screen.queryByText("23:00")).not.toBeInTheDocument()
  })

  it("opens the whole day on request and returns to clinic hours", async () => {
    const user = userEvent.setup()
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[dentistColumn]}
        columnOf={byDentist}
        shifts={[shift("2026-08-03T02:00:00.000Z", "2026-08-03T10:00:00.000Z")]}
        appointments={[]}
        renderAppointment={() => null}
      />,
    )

    const toggle = screen.getByTestId("full-day-toggle")
    expect(toggle).toHaveAttribute("aria-pressed", "false")

    await user.click(toggle)
    expect(screen.getByTestId("timeline-canvas")).toHaveStyle({ height: "1536px" })
    expect(screen.getByText("00:00")).toBeInTheDocument()
    expect(toggle).toHaveAttribute("aria-pressed", "true")

    await user.click(toggle)
    expect(screen.getByTestId("timeline-canvas")).toHaveStyle({ height: "640px" })
  })

  it("offers no full-day toggle once the whole day is already drawn", () => {
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[dentistColumn]}
        columnOf={byDentist}
        shifts={[shift("2026-08-02T17:00:00.000Z", "2026-08-03T16:59:00.000Z")]}
        appointments={[]}
        renderAppointment={() => null}
      />,
    )

    expect(screen.queryByTestId("full-day-toggle")).not.toBeInTheDocument()
  })

  it("holds the frame steady when a booking moves within the day", () => {
    const early = {
      id: "9f9619ff-8b86-4d01-b42d-00cf4fc964ff",
      dentistId: dentist.id,
      startsAt: "2026-08-03T02:00:00.000Z",
      endsAt: "2026-08-03T03:00:00.000Z",
    } as Appointment
    const props = {
      date: "2026-08-03",
      columns: [dentistColumn],
      columnOf: byDentist,
      shifts: [],
      renderAppointment: () => null,
    }
    const { rerender } = render(<TimeGrid {...props} appointments={[early]} />)
    const height = screen.getByTestId("timeline-canvas").getAttribute("style")

    rerender(
      <TimeGrid
        {...props}
        appointments={[
          { ...early, startsAt: "2026-08-03T06:00:00.000Z", endsAt: "2026-08-03T07:00:00.000Z" },
        ]}
      />,
    )

    expect(screen.getByText("09:00")).toBeInTheDocument()
    expect(screen.getByTestId("timeline-canvas").getAttribute("style")).not.toBe(height)
  })

  it("opens at the start of the working day when the clinic has already closed", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-03T16:00:00.000Z"))
    const scrollTo = vi.fn()
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    })
    render(
      <TimeGrid
        date={bkkToday()}
        columns={[dentistColumn]}
        columnOf={byDentist}
        shifts={[shift("2026-08-03T02:00:00.000Z", "2026-08-03T10:00:00.000Z")]}
        appointments={[]}
        renderAppointment={() => null}
      />,
    )

    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0 })
  })

  it("hides the current-time marker when now falls outside the drawn hours", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-02T20:00:00.000Z"))
    render(
      <TimeGrid
        date={bkkToday()}
        columns={[dentistColumn]}
        columnOf={byDentist}
        shifts={[shift("2026-08-03T02:00:00.000Z", "2026-08-03T10:00:00.000Z")]}
        appointments={[]}
        renderAppointment={() => null}
      />,
    )

    expect(screen.queryByTestId("now-line")).not.toBeInTheDocument()
    expect(screen.queryByText("03:00")).not.toBeInTheDocument()
  })

  it("drops a card no column claims", () => {
    const appointment = {
      id: "9f9619ff-8b86-4d01-b42d-00cf4fc964ff",
      dentistId: dentist.id,
      startsAt: "2026-08-03T02:00:00.000Z",
      endsAt: "2026-08-03T03:00:00.000Z",
    } as Appointment
    render(
      <TimeGrid
        date="2026-08-03"
        columns={[chairColumn]}
        columnOf={() => null}
        shifts={[]}
        appointments={[appointment]}
        renderAppointment={(a) => <div key={a.id}>card-{a.id}</div>}
      />,
    )
    expect(screen.queryByText(`card-${appointment.id}`)).not.toBeInTheDocument()
  })
})
