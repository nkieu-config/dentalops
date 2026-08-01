import { describe, expect, it } from "vitest"
import { hasFreeUnit, unitFree } from "../src/pool"

const iv = (start: number, end: number) => ({ start, end })

describe("unitFree", () => {
  it("free when nothing overlaps the window", () => {
    expect(unitFree({ id: "c1", busy: [iv(0, 10)] }, iv(10, 20))).toBe(true)
  })
  it("busy when any claim overlaps", () => {
    expect(unitFree({ id: "c1", busy: [iv(0, 11)] }, iv(10, 20))).toBe(false)
  })
})

describe("hasFreeUnit", () => {
  it("true when at least one unit is free for the whole window", () => {
    const units = [
      { id: "c1", busy: [iv(0, 30)] },
      { id: "c2", busy: [iv(40, 50)] }
    ]
    expect(hasFreeUnit(units, iv(0, 30))).toBe(true)
  })
  it("two partially free units cannot cover one window between them", () => {
    const units = [
      { id: "c1", busy: [iv(30, 60)] },
      { id: "c2", busy: [iv(0, 30)] }
    ]
    expect(hasFreeUnit(units, iv(0, 60))).toBe(false)
  })
  it("false for an empty pool", () => {
    expect(hasFreeUnit([], iv(0, 10))).toBe(false)
  })
})
