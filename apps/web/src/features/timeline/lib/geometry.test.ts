import type { Shift } from "@dentalops/contracts"
import { describe, expect, it } from "vitest"
import {
  bkkDate,
  bkkDayStart,
  bkkShiftDate,
  bkkWeekStart,
  fmtCompactDay,
  fmtTime,
  fmtWeekdayShort,
  initialTimelineMinute,
  MINUTES_PER_DAY,
  msToY,
  snapCeil,
  snapFloor,
  timelineWindow,
  weekDates,
  yToMs,
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

  it("finds the Monday that starts a date's week", () => {
    expect(bkkWeekStart("2026-08-03")).toBe("2026-08-03")
    expect(bkkWeekStart("2026-08-01")).toBe("2026-07-27")
    expect(bkkWeekStart("2026-08-09")).toBe("2026-08-03")
  })

  it("lists the 7 dates of a week starting from its Monday", () => {
    expect(weekDates("2026-08-03")).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
    ])
  })

  it("abbreviates the weekday for a compact column label", () => {
    expect(fmtWeekdayShort("2026-08-03")).toBe("Mon")
    expect(fmtWeekdayShort("2026-08-01")).toBe("Sat")
  })

  it("formats a compact day label without the weekday or year", () => {
    expect(fmtCompactDay("2026-08-03")).toBe("3 Aug")
  })

  it("frames the grid an hour either side of the day's shifts", () => {
    expect(
      timelineWindow(
        [{ startsAt: "2026-08-03T02:00:00.000Z", endsAt: "2026-08-03T12:00:00.000Z" }],
        [],
      ),
    ).toEqual({ startMin: 8 * 60, endMin: 20 * 60 })
  })

  it("stretches the frame to cover an appointment booked outside every shift", () => {
    expect(
      timelineWindow(
        [{ startsAt: "2026-08-03T02:00:00.000Z", endsAt: "2026-08-03T10:00:00.000Z" }],
        [{ startsAt: "2026-08-03T13:30:00.000Z", endsAt: "2026-08-03T14:30:00.000Z" }],
      ),
    ).toEqual({ startMin: 8 * 60, endMin: 22 * 60 })
  })

  it("falls back to a working day when neither shifts nor appointments exist", () => {
    expect(timelineWindow([], [])).toEqual({ startMin: 8 * 60, endMin: 20 * 60 })
  })

  it("never frames less than eight hours around a short shift", () => {
    const { startMin, endMin } = timelineWindow(
      [{ startsAt: "2026-08-03T02:00:00.000Z", endsAt: "2026-08-03T03:00:00.000Z" }],
      [],
    )
    expect(endMin - startMin).toBe(8 * 60)
    expect(startMin).toBe(8 * 60)
  })

  it("keeps the frame inside the calendar day when a shift runs to midnight", () => {
    const { startMin, endMin } = timelineWindow(
      [{ startsAt: "2026-08-03T14:00:00.000Z", endsAt: "2026-08-03T16:59:00.000Z" }],
      [],
    )
    expect(startMin).toBeGreaterThanOrEqual(0)
    expect(endMin).toBe(MINUTES_PER_DAY)
  })

  it("starts today's grid one hour before the current clinic time", () => {
    const now = Date.parse("2026-08-03T06:00:00.000Z")
    expect(initialTimelineMinute("2026-08-03", now, [])).toBe(12 * 60)
  })

  it("starts a future grid one hour before its earliest shift", () => {
    const shifts = [{ startsAt: "2026-08-04T03:00:00.000Z" }] as Shift[]
    expect(
      initialTimelineMinute("2026-08-04", Date.parse("2026-08-03T06:00:00.000Z"), shifts),
    ).toBe(9 * 60)
  })

  it("falls back to 08:00 and clamps the initial grid position", () => {
    expect(initialTimelineMinute("2026-08-04", Date.parse("2026-08-03T06:00:00.000Z"), [])).toBe(
      480,
    )
    expect(initialTimelineMinute("2026-08-03", Date.parse("2026-08-02T18:00:00.000Z"), [])).toBe(0)
    expect(
      initialTimelineMinute("2026-08-04", Date.parse("2026-08-03T06:00:00.000Z"), [
        { startsAt: "2026-08-05T01:00:00.000Z" },
      ] as Shift[]),
    ).toBe(23 * 60)
  })
})
