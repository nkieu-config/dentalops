import type { Appointment } from "@dentalops/contracts"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { UnseatedNotice } from "./unseated-notice"

const appointment = (id: string, startsAt: string, name: string): Appointment =>
  ({ id, startsAt, patient: { id: `p-${id}`, name, phone: "0812345678" } }) as Appointment

const one = appointment("a1", "2026-08-03T02:00:00.000Z", "Narin Chai")
const two = appointment("a2", "2026-08-03T04:30:00.000Z", "Suda Wong")

describe("UnseatedNotice", () => {
  it("stays out of the way when every appointment holds a chair", () => {
    render(<UnseatedNotice appointments={[]} />)

    expect(screen.queryByTestId("unseated-notice")).not.toBeInTheDocument()
  })

  it("reports how many appointments the layout is hiding", () => {
    render(<UnseatedNotice appointments={[one, two]} />)

    expect(screen.getByTestId("unseated-notice")).toHaveTextContent(
      "2 appointments have no chair — hidden from this view."
    )
  })

  it("agrees with itself when only one appointment is adrift", () => {
    render(<UnseatedNotice appointments={[one]} />)

    expect(screen.getByTestId("unseated-notice")).toHaveTextContent("1 appointment has no chair")
  })

  it("counts without listing, so a busy day cannot grow the notice", () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      appointment(`a${index}`, "2026-08-03T02:00:00.000Z", `Patient ${index}`)
    )
    render(<UnseatedNotice appointments={many} onGroupByDentist={() => {}} />)

    const notice = screen.getByTestId("unseated-notice")
    expect(notice).toHaveTextContent("9 appointments have no chair")
    expect(screen.getAllByRole("button")).toHaveLength(1)
  })

  it("offers the layout that shows them again only when there is one to switch to", async () => {
    const onGroupByDentist = vi.fn()
    const { rerender } = render(
      <UnseatedNotice appointments={[one]} onGroupByDentist={onGroupByDentist} />
    )

    await userEvent.click(screen.getByRole("button", { name: "Group by dentist" }))
    expect(onGroupByDentist).toHaveBeenCalled()

    rerender(<UnseatedNotice appointments={[one]} />)
    expect(screen.queryByRole("button", { name: "Group by dentist" })).not.toBeInTheDocument()
  })

  it("keeps its one action at a touch-sized target", () => {
    render(<UnseatedNotice appointments={[one, two]} onGroupByDentist={() => {}} />)

    expect(screen.getByRole("button", { name: "Group by dentist" }).className).toContain("min-h-11")
  })
})
