import { describe, expect, it } from "vitest"
import {
  bkkDate,
  bkkDayStart,
  bkkShiftDate,
  fmtTime,
  msToY,
  snapCeil,
  snapFloor,
  yToMs
} from "./geometry"

const day = bkkDayStart("2026-08-03")

describe("geometry", () => {
  it("bangkok midnight is 17:00 UTC the previous day", () => {
    expect(day).toBe(Date.parse("2026-08-02T17:00:00Z"))
  })

  it("maps time to pixels at 16px per 15 minutes", () => {
    expect(msToY(day, day)).toBe(0)
    expect(msToY(day + 9 * 3_600_000, day)).toBe(9 * 64)
    expect(msToY(day + 15 * 60_000, day)).toBe(16)
  })

  it("round-trips y back to time", () => {
    const nineFifteen = day + 9.25 * 3_600_000
    expect(yToMs(msToY(nineFifteen, day), day)).toBe(nineFifteen)
  })

  it("snaps to the 15-minute grid in both directions", () => {
    const t = day + 9 * 3_600_000 + 7 * 60_000
    expect(snapFloor(t)).toBe(day + 9 * 3_600_000)
    expect(snapCeil(t)).toBe(day + 9.25 * 3_600_000)
    expect(snapFloor(day + 9 * 3_600_000)).toBe(day + 9 * 3_600_000)
  })

  it("formats clinic wall time regardless of the viewer's zone", () => {
    expect(fmtTime(Date.parse("2026-08-03T02:00:00Z"))).toBe("09:00")
    expect(fmtTime(Date.parse("2026-08-03T16:30:00Z"))).toBe("23:30")
  })

  it("names the bangkok calendar day an instant falls on", () => {
    expect(bkkDate(Date.parse("2026-08-03T02:00:00Z"))).toBe("2026-08-03")
    expect(bkkDate(Date.parse("2026-08-02T17:00:00Z"))).toBe("2026-08-03")
    expect(bkkDate(Date.parse("2026-08-02T16:59:00Z"))).toBe("2026-08-02")
  })

  it("shifts a calendar date across a month boundary", () => {
    expect(bkkShiftDate("2026-08-31", 1)).toBe("2026-09-01")
    expect(bkkShiftDate("2026-08-01", -1)).toBe("2026-07-31")
  })
})
