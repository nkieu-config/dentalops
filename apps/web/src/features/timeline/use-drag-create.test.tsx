import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { bkkDayStart, msToY } from "./lib/geometry"
import { useDragCreate, type DragGhost } from "./use-drag-create"

const dayStart = bkkDayStart("2026-08-03")
const HOUR = 3_600_000

const Harness = ({ onSelect }: { onSelect: (range: DragGhost) => void }) => {
  const { overlayProps, ghost } = useDragCreate({ dayStart, onSelect })
  return (
    <div data-testid="overlay" style={{ height: 24 * 64 }} {...overlayProps}>
      {ghost ? (
        <div
          data-testid="ghost"
          style={{
            top: msToY(ghost.start, dayStart),
            height: msToY(ghost.end, dayStart) - msToY(ghost.start, dayStart)
          }}
        />
      ) : null}
    </div>
  )
}

const mount = () => {
  const onSelect = vi.fn<(range: DragGhost) => void>()
  render(<Harness onSelect={onSelect} />)
  return { overlay: screen.getByTestId("overlay"), onSelect }
}

describe("useDragCreate", () => {
  it("turns a downward drag from 09:00 to 10:00 into that exact range", () => {
    const { overlay, onSelect } = mount()
    fireEvent.pointerDown(overlay, { clientY: 576, button: 0 })
    fireEvent.pointerMove(overlay, { clientY: 640 })
    expect(screen.getByTestId("ghost")).toHaveStyle({ top: "576px", height: "64px" })

    fireEvent.pointerUp(overlay)
    expect(onSelect).toHaveBeenCalledWith({ start: dayStart + 9 * HOUR, end: dayStart + 10 * HOUR })
    expect(screen.queryByTestId("ghost")).not.toBeInTheDocument()
  })

  it("treats a press with no movement as a single fifteen-minute slot", () => {
    const { overlay, onSelect } = mount()
    fireEvent.pointerDown(overlay, { clientY: 576, button: 0 })
    fireEvent.pointerUp(overlay)
    expect(onSelect).toHaveBeenCalledWith({
      start: dayStart + 9 * HOUR,
      end: dayStart + 9 * HOUR + 15 * 60_000
    })
  })

  it("snaps a ragged upward drag outwards to whole quarter hours", () => {
    const { overlay, onSelect } = mount()
    fireEvent.pointerDown(overlay, { clientY: 645, button: 0 })
    fireEvent.pointerMove(overlay, { clientY: 583 })
    fireEvent.pointerUp(overlay)
    expect(onSelect).toHaveBeenCalledWith({
      start: dayStart + 9 * HOUR,
      end: dayStart + 10 * HOUR + 15 * 60_000
    })
  })

  it("ignores non-primary buttons and drops the ghost when the gesture is cancelled", () => {
    const { overlay, onSelect } = mount()
    fireEvent.pointerDown(overlay, { clientY: 576, button: 2 })
    expect(screen.queryByTestId("ghost")).not.toBeInTheDocument()

    fireEvent.pointerDown(overlay, { clientY: 576, button: 0 })
    fireEvent.pointerCancel(overlay)
    expect(screen.queryByTestId("ghost")).not.toBeInTheDocument()

    fireEvent.pointerUp(overlay)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
