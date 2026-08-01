import { describe, expect, it } from "vitest"
import { columnAtX, DRAG_THRESHOLD_PX, exceedsThreshold, planMove, planResize } from "./drag-plan"
import { bkkDayStart } from "./geometry"

const dayStart = bkkDayStart("2026-08-03")
const MIN = 60_000
const at = (h: number, m = 0) => dayStart + h * 60 * MIN + m * MIN

describe("exceedsThreshold", () => {
  it("treats movement under four pixels as a click", () => {
    expect(DRAG_THRESHOLD_PX).toBe(4)
    expect(exceedsThreshold(100, 100, 100, 100)).toBe(false)
    expect(exceedsThreshold(100, 100, 103, 100)).toBe(false)
    expect(exceedsThreshold(100, 100, 100, 97)).toBe(false)
  })

  it("treats four pixels or more, in any direction, as a drag", () => {
    expect(exceedsThreshold(100, 100, 104, 100)).toBe(true)
    expect(exceedsThreshold(100, 100, 100, 105)).toBe(true)
    expect(exceedsThreshold(100, 100, 97, 97)).toBe(true)
  })
})

describe("planMove", () => {
  const base = { anchorY: 100, anchorColumn: 0, currentColumn: 0, startMs: at(9, 7) }

  it("snaps the delta, not the absolute time, so an off-grid card keeps its offset", () => {
    expect(planMove({ ...base, currentY: 137 }).startMs).toBe(at(9, 37))
  })

  it("snaps a negative delta by the same amount in the other direction", () => {
    expect(planMove({ ...base, currentY: 63 }).startMs).toBe(at(8, 37))
  })

  it("holds the start still while the delta is shorter than half a slot", () => {
    expect(planMove({ ...base, currentY: 105 }).startMs).toBe(at(9, 7))
    expect(planMove({ ...base, currentY: 92 }).startMs).toBe(at(9, 7))
  })

  it("moves a whole hour for a whole hour of pixels", () => {
    expect(planMove({ ...base, currentY: 164 }).startMs).toBe(at(10, 7))
    expect(planMove({ ...base, currentY: 36 }).startMs).toBe(at(8, 7))
  })

  it("reports how many columns the pointer crossed", () => {
    expect(planMove({ ...base, currentY: 100, currentColumn: 2 }).columnDelta).toBe(2)
    expect(planMove({ ...base, anchorColumn: 2, currentY: 100 }).columnDelta).toBe(-2)
  })
})

describe("planResize", () => {
  const base = { anchorY: 640, startMs: at(9), endMs: at(10) }

  it("keeps the duration when the bottom edge has not moved", () => {
    expect(planResize({ ...base, currentY: 640 }).durationMin).toBe(60)
  })

  it("grows the duration by the dragged slots", () => {
    expect(planResize({ ...base, currentY: 672 }).durationMin).toBe(90)
  })

  it("rounds a partial slot up so the card never ends mid-slot", () => {
    expect(planResize({ ...base, currentY: 677 }).durationMin).toBe(105)
  })

  it("shrinks to the slot the bottom edge was dragged to", () => {
    expect(planResize({ ...base, currentY: 592 }).durationMin).toBe(15)
    expect(planResize({ ...base, currentY: 600 }).durationMin).toBe(30)
  })

  it("never shrinks below a single fifteen minute slot", () => {
    expect(planResize({ ...base, currentY: 400 }).durationMin).toBe(15)
    expect(planResize({ ...base, currentY: 200 }).durationMin).toBe(15)
  })

  it("never grows past the eight hour maximum the api accepts", () => {
    expect(planResize({ ...base, currentY: 2640 }).durationMin).toBe(480)
  })

  it("measures from the start even when the card starts off-grid", () => {
    expect(
      planResize({ anchorY: 640, currentY: 640, startMs: at(9, 7), endMs: at(10) }).durationMin
    ).toBe(53)
  })
})

describe("columnAtX", () => {
  const lefts = [0, 200, 400]

  it("maps a pointer to the column whose left edge it has passed", () => {
    expect(columnAtX(0, lefts)).toBe(0)
    expect(columnAtX(150, lefts)).toBe(0)
    expect(columnAtX(200, lefts)).toBe(1)
    expect(columnAtX(399, lefts)).toBe(1)
    expect(columnAtX(400, lefts)).toBe(2)
  })

  it("clamps to the first and last column outside the measured range", () => {
    expect(columnAtX(-500, lefts)).toBe(0)
    expect(columnAtX(9999, lefts)).toBe(2)
    expect(columnAtX(50, [])).toBe(0)
  })
})
