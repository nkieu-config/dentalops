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
    await user.type(screen.getByPlaceholderText("Search by patient name or phone…"), "0823456789")
    expect(screen.getByText("Somchai Detchat")).toBeInTheDocument()
    expect(screen.queryByText("Kanya Wongchai")).not.toBeInTheDocument()
  })

  it("says so when nothing matches", async () => {
    const user = userEvent.setup()
    render(
      <CommandPalette open onOpenChange={() => {}} appointments={appointments} onSelect={() => {}} />
    )
    await user.type(screen.getByPlaceholderText("Search by patient name or phone…"), "nobody")
    expect(screen.getByText("No matches on this view")).toBeInTheDocument()
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
    const input = screen.getByPlaceholderText("Search by patient name or phone…")
    await user.click(input)
    await user.keyboard("{ArrowDown}{Enter}")
    expect(onSelect).toHaveBeenCalledWith(appointments[1])
  })
})
