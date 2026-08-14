import type { Appointment } from "@dentalops/contracts"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { CommandPalette } from "./command-palette"

const appt = (id: string, name: string, phone: string, startsAt: string): Appointment => ({
  id,
  branchId: "b1",
  serviceId: "svc",
  dentistId: "d1",
  patientId: id,
  startsAt,
  endsAt: new Date(Date.parse(startsAt) + 30 * 60_000).toISOString(),
  status: "confirmed",
  version: 1,
  seriesId: null,
  service: { id: "svc", name: "Cleaning", colorIndex: 0 },
  patient: { id, name, phone },
  claims: []
})

const appointments = [
  appt("a1", "Kanya Wongchai", "0812345678", "2026-08-03T02:00:00.000Z"),
  appt("a2", "Somchai Detchat", "0823456789", "2026-08-03T04:00:00.000Z")
]

describe("CommandPalette", () => {
  it("names the search field and makes its current-schedule scope clear", () => {
    render(
      <CommandPalette
        open
        scopeLabel="Ladprao · Mon, 3 Aug · 2 appointments"
        onOpenChange={() => {}}
        appointments={appointments}
        onSelect={() => {}}
      />
    )

    const search = screen.getByRole("combobox", { name: "Search this schedule" })
    expect(search).toHaveAttribute("aria-controls", "schedule-search-results")
    expect(search).toHaveAttribute("aria-activedescendant", "schedule-search-option-a1")
    expect(screen.getByText("Ladprao · Mon, 3 Aug · 2 appointments")).toBeVisible()
  })

  it("tells a cancelled result apart from a live one", () => {
    render(
      <CommandPalette
        open
        onOpenChange={() => {}}
        appointments={[
          { ...appointments[0]!, status: "cancelled" },
          { ...appointments[1]!, status: "no_show" }
        ]}
        onSelect={() => {}}
      />
    )

    const [cancelled, noShow] = screen.getAllByRole("option")
    expect(cancelled).toHaveTextContent("Cancelled")
    expect(noShow).toHaveTextContent("No-show")
    expect(cancelled!.querySelector(".line-through")).toHaveTextContent("Cleaning")
  })

  it("leaves a confirmed result unmarked so only exceptions draw the eye", () => {
    render(
      <CommandPalette open onOpenChange={() => {}} appointments={appointments} onSelect={() => {}} />
    )

    const [first] = screen.getAllByRole("option")
    expect(first).not.toHaveTextContent("Confirmed")
    expect(first!.querySelector(".line-through")).toBeNull()
  })

  it("offers a visible close action", async () => {
    const onOpenChange = vi.fn()
    render(
      <CommandPalette open onOpenChange={onOpenChange} appointments={appointments} onSelect={() => {}} />
    )

    await userEvent.click(screen.getByRole("button", { name: "Close search" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("lists every appointment on this view until the user narrows it down", () => {
    render(
      <CommandPalette open onOpenChange={() => {}} appointments={appointments} onSelect={() => {}} />
    )
    expect(screen.getByText("Kanya Wongchai")).toBeInTheDocument()
    expect(screen.getByText("Somchai Detchat")).toBeInTheDocument()
  })

  it("filters by patient name or phone as the user types", async () => {
    const user = userEvent.setup()
    render(
      <CommandPalette open onOpenChange={() => {}} appointments={appointments} onSelect={() => {}} />
    )
    await user.type(screen.getByPlaceholderText("Search by name, phone, dentist, or chair…"), "0823456789")
    expect(screen.getByText("Somchai Detchat")).toBeInTheDocument()
    expect(screen.getByText("0823456789")).toBeVisible()
    expect(screen.queryByText("Kanya Wongchai")).not.toBeInTheDocument()
  })

  it("shows time without repeating the selected date in every day-view result", () => {
    render(
      <CommandPalette open onOpenChange={() => {}} appointments={appointments} onSelect={() => {}} />
    )

    const firstResult = screen.getByRole("option", { name: /Kanya Wongchai/ })
    expect(firstResult).toHaveTextContent("09:00")
    expect(firstResult).not.toHaveTextContent("Mon, 3 Aug 2026")
  })

  it("keeps week-view dates compact enough to scan on one line", () => {
    render(
      <CommandPalette
        open
        scope="week"
        onOpenChange={() => {}}
        appointments={appointments}
        onSelect={() => {}}
      />
    )

    const firstResult = screen.getByRole("option", { name: /Kanya Wongchai/ })
    expect(firstResult).toHaveTextContent("Mon 3 Aug · 09:00")
    expect(firstResult).not.toHaveTextContent("2026")
  })

  it("matches dentist and chair context, then shows that context in the result", async () => {
    const user = userEvent.setup()
    const chairId = "c1"
    const resourceAppointment = appointments[0]!
    render(
      <CommandPalette
        open
        onOpenChange={() => {}}
        appointments={[
          {
            ...resourceAppointment,
            dentistId: "d2",
            claims: [
              {
                id: "claim-1",
                resourceId: chairId,
                startsAt: resourceAppointment.startsAt,
                endsAt: resourceAppointment.endsAt,
                status: "active"
              }
            ]
          }
        ]}
        dentists={[{ id: "d2", name: "Dr. Boon", role: "dentist", isActive: true }]}
        chairs={[{ id: chairId, name: "Chair 1", type: "chair", branchId: "b1" }]}
        onSelect={() => {}}
      />
    )

    await user.type(screen.getByPlaceholderText("Search by name, phone, dentist, or chair…"), "boon")
    expect(screen.getByText("Kanya Wongchai")).toBeInTheDocument()
    expect(screen.getByRole("option")).toHaveTextContent("Cleaning · Dr. Boon · Chair 1")
  })

  it("shows how many results are available when the list is capped", () => {
    const manyAppointments = Array.from({ length: 10 }, (_, index) =>
      appt(
        `many-${index}`,
        `Patient ${index + 1}`,
        `080000000${index}`,
        `2026-08-03T${String(index).padStart(2, "0")}:00:00.000Z`
      )
    )
    render(
      <CommandPalette open onOpenChange={() => {}} appointments={manyAppointments} onSelect={() => {}} />
    )

    expect(screen.getByText("Showing 8 of 10 appointments")).toBeInTheDocument()
    expect(screen.getAllByRole("option")).toHaveLength(8)
  })

  it("says so when nothing matches", async () => {
    const user = userEvent.setup()
    render(
      <CommandPalette open onOpenChange={() => {}} appointments={appointments} onSelect={() => {}} />
    )
    await user.type(screen.getByPlaceholderText("Search by name, phone, dentist, or chair…"), "nobody")
    expect(screen.getByRole("status")).toHaveTextContent("No appointments match “nobody”")
    await user.click(screen.getByRole("button", { name: "Clear search" }))
    expect(screen.getByText("Kanya Wongchai")).toBeInTheDocument()
  })

  it("selects the clicked result and closes", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <CommandPalette open onOpenChange={onOpenChange} appointments={appointments} onSelect={onSelect} />
    )
    await user.click(screen.getByText("Kanya Wongchai"))
    expect(onSelect).toHaveBeenCalledWith(appointments[0])
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("selects the highlighted result with Enter, moving highlight with the arrow keys", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <CommandPalette open onOpenChange={() => {}} appointments={appointments} onSelect={onSelect} />
    )
    const input = screen.getByPlaceholderText("Search by name, phone, dentist, or chair…")
    await user.click(input)
    await user.keyboard("{ArrowDown}{Enter}")
    expect(onSelect).toHaveBeenCalledWith(appointments[1])
  })
})
