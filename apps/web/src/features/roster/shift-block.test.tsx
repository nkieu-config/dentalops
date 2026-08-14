import type { Shift } from "@dentalops/contracts"
import { cleanup, fireEvent, render, screen } from "../../test/render"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ShiftBlock } from "./shift-block"

const shift: Shift = {
  id: "b1000000-0000-4000-8000-000000000001",
  staffId: "2f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  branchId: "1f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  startsAt: "2026-08-03T02:00:00.000Z",
  endsAt: "2026-08-03T10:00:00.000Z",
  seriesId: null
}

const mount = (props: Partial<Parameters<typeof ShiftBlock>[0]> = {}) => {
  const onEdit = vi.fn()
  render(<ShiftBlock shift={shift} staffName="Dr. Anong" onEdit={onEdit} {...props} />)
  return { onEdit, block: screen.getByTestId(`shift-${shift.id}`) }
}

describe("ShiftBlock", () => {
  it("shows a saved shift as local times on a 44px target and opens the editor", async () => {
    const { onEdit, block } = mount()
    const edit = screen.getByTestId(`shift-edit-${shift.id}`)
    expect(block).toHaveTextContent("09:00–17:00")
    expect(block.className).toContain("min-h-11")
    expect(screen.getByText("09:00–17:00").className).toContain("tabular-nums")
    expect(edit).toHaveAccessibleName("Edit Dr. Anong shift 09:00 to 17:00")
    expect(screen.queryByLabelText("Recurring")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Blocking violation")).not.toBeInTheDocument()

    await userEvent.click(edit)
    expect(onEdit).toHaveBeenCalledWith(shift)
  })

  it("badges a shift that came from a series", () => {
    mount({ shift: { ...shift, seriesId: "c1000000-0000-4000-8000-000000000001" } })
    expect(screen.getByLabelText("Recurring")).toBeInTheDocument()
  })

  it("marks a conflicting shift with the destructive ring and an icon, not colour alone", () => {
    const { block } = mount({ conflicting: true })
    expect(block.className).toContain("border-destructive")
    expect(block).toHaveAttribute("data-conflicting", "true")
    expect(screen.getByLabelText("Blocking violation")).toBeInTheDocument()
  })

  it("shows a dragging shift as a dashed live-validating block with the only shadow", () => {
    const { block } = mount({ dragging: true })
    expect(block.className).toContain("border-dashed")
    expect(block.className).toContain("shadow-lg")
    expect(block).toHaveAttribute("data-dragging", "true")
    expect(block).toHaveTextContent("Validating…")
  })

  it("hands a pointer press to the grid only when the grid offers a drag", () => {
    expect(mount().block.className).not.toContain("cursor-grab")

    cleanup()
    const onMoveStart = vi.fn()
    mount({ onMoveStart })
    const handle = screen.getByTestId(`shift-drag-${shift.id}`)
    expect(handle.className).toContain("cursor-grab")

    fireEvent.pointerDown(handle, { button: 0, clientX: 10, clientY: 10 })
    expect(onMoveStart).toHaveBeenCalled()
  })
})
