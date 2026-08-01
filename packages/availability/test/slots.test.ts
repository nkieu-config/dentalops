import { describe, expect, it } from "vitest"
import { computeSlots } from "../src/slots"

const M = 60_000
const H = 60 * M
const iv = (start: number, end: number) => ({ start, end })

const base = {
  window: iv(0, 8 * H),
  stepMin: 15,
  durationMin: 60,
  bufferMin: 10,
  chairs: [{ id: "c1", busy: [] }],
  equipmentPools: [] as { id: string; busy: { start: number; end: number }[] }[][]
}

describe("computeSlots", () => {
  it("an empty calendar yields every grid start that fits the shift", () => {
    const slots = computeSlots({
      ...base,
      staff: [{ staffId: "d1", shifts: [iv(0, 8 * H)], busy: [] }]
    })
    expect(slots).toHaveLength(29)
    expect(slots[0]).toEqual({ staffId: "d1", start: 0, end: H })
    expect(slots[slots.length - 1]).toEqual({ staffId: "d1", start: 7 * H, end: 8 * H })
    expect(slots.every((s) => s.start % (15 * M) === 0)).toBe(true)
  })

  it("aligns the first slot up to the 15-minute grid", () => {
    const slots = computeSlots({
      ...base,
      staff: [{ staffId: "d1", shifts: [iv(7 * M, 8 * H)], busy: [] }]
    })
    expect(slots[0]!.start).toBe(15 * M)
  })

  it("subtracts busy time with half-open boundaries", () => {
    const slots = computeSlots({
      ...base,
      staff: [{ staffId: "d1", shifts: [iv(0, 8 * H)], busy: [iv(H, 2 * H)] }]
    })
    const starts = slots.map((s) => s.start)
    expect(starts).toContain(0)
    expect(starts).not.toContain(15 * M)
    expect(starts).not.toContain(H)
    expect(starts).toContain(2 * H)
    expect(slots).toHaveLength(1 + 21)
  })

  it("blocks a slot when no single chair covers the buffered window", () => {
    const slots = computeSlots({
      ...base,
      staff: [{ staffId: "d1", shifts: [iv(0, 2 * H)], busy: [] }],
      chairs: [
        { id: "c1", busy: [iv(0, 30 * M), iv(60 * M, 90 * M)] },
        { id: "c2", busy: [iv(30 * M, 60 * M), iv(90 * M, 2 * H)] }
      ]
    })
    expect(slots).toHaveLength(0)
  })

  it("the chair window includes the buffer, the dentist window does not", () => {
    const slots = computeSlots({
      ...base,
      window: iv(0, 2 * H),
      staff: [{ staffId: "d1", shifts: [iv(0, 2 * H)], busy: [] }],
      chairs: [{ id: "c1", busy: [iv(65 * M, 2 * H)] }]
    })
    const starts = slots.map((s) => s.start)
    expect(starts).not.toContain(0)
  })

  it("requires a free unit in every equipment pool for the unbuffered window", () => {
    const slots = computeSlots({
      ...base,
      window: iv(0, 2 * H),
      staff: [{ staffId: "d1", shifts: [iv(0, 2 * H)], busy: [] }],
      equipmentPools: [[{ id: "x1", busy: [iv(0, H)] }]]
    })
    const starts = slots.map((s) => s.start)
    expect(starts).not.toContain(45 * M)
    expect(starts).toContain(H)
  })

  it("a shift entirely outside the window yields nothing", () => {
    const slots = computeSlots({
      ...base,
      window: iv(0, 2 * H),
      staff: [{ staffId: "d1", shifts: [iv(3 * H, 5 * H)], busy: [] }]
    })
    expect(slots).toHaveLength(0)
  })

  it("clips shifts to the query window and sorts across staff", () => {
    const slots = computeSlots({
      ...base,
      window: iv(H, 3 * H),
      staff: [
        { staffId: "d2", shifts: [iv(0, 8 * H)], busy: [] },
        { staffId: "d1", shifts: [iv(0, 8 * H)], busy: [] }
      ]
    })
    expect(slots[0]!.start).toBe(H)
    expect(slots[0]!.staffId).toBe("d1")
    expect(slots[1]!.staffId).toBe("d2")
    expect(slots[slots.length - 1]!.start).toBe(2 * H)
  })
})
