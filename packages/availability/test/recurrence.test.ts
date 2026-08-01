import { describe, expect, it } from "vitest"
import { expandRecurrence } from "../src/recurrence"

const utc = (iso: string) => Date.parse(iso)
const wideWindow = { start: utc("2026-01-01T00:00:00Z"), end: utc("2027-01-01T00:00:00Z") }

describe("weekly", () => {
  const monWed = {
    freq: "weekly" as const,
    interval: 1,
    byWeekday: [1, 3],
    timeStartMin: 9 * 60,
    durationMin: 8 * 60,
    startsOn: "2026-08-03"
  }

  it("expands mon/wed at 09:00 Bangkok as 02:00 UTC", () => {
    const out = expandRecurrence(monWed, {
      start: utc("2026-08-03T00:00:00Z"),
      end: utc("2026-08-10T00:00:00Z")
    })
    expect(out).toEqual([
      { start: utc("2026-08-03T02:00:00Z"), end: utc("2026-08-03T10:00:00Z") },
      { start: utc("2026-08-05T02:00:00Z"), end: utc("2026-08-05T10:00:00Z") }
    ])
  })

  it("interval 2 skips the in-between week from the Monday anchor", () => {
    const out = expandRecurrence(
      { ...monWed, interval: 2, byWeekday: [1] },
      { start: utc("2026-08-03T00:00:00Z"), end: utc("2026-08-31T00:00:00Z") }
    )
    expect(out.map((o) => new Date(o.start).toISOString().slice(0, 10))).toEqual([
      "2026-08-03",
      "2026-08-17"
    ])
  })

  it("count is consumed by occurrences before the window", () => {
    const out = expandRecurrence(
      { ...monWed, byWeekday: [1], count: 3 },
      {
        start: utc("2026-08-15T00:00:00Z"),
        end: utc("2026-09-30T00:00:00Z")
      }
    )
    expect(out.map((o) => new Date(o.start).toISOString().slice(0, 10))).toEqual(["2026-08-17"])
  })

  it("endsOn is inclusive as a local date", () => {
    const out = expandRecurrence({ ...monWed, byWeekday: [1], endsOn: "2026-08-17" }, wideWindow)
    expect(out).toHaveLength(3)
  })

  it("a duration crossing local midnight stays a single interval", () => {
    const out = expandRecurrence(
      { ...monWed, byWeekday: [1], timeStartMin: 23 * 60 + 30, durationMin: 90, count: 1 },
      wideWindow
    )
    expect(out).toEqual([{ start: utc("2026-08-03T16:30:00Z"), end: utc("2026-08-03T18:00:00Z") }])
  })

  it("an occurrence straddling the window edge is included", () => {
    const out = expandRecurrence(
      { ...monWed, byWeekday: [1], count: 1 },
      {
        start: utc("2026-08-03T09:59:00Z"),
        end: utc("2026-08-04T00:00:00Z")
      }
    )
    expect(out).toHaveLength(1)
  })
})

describe("monthly_date", () => {
  it("skips short months without consuming count", () => {
    const out = expandRecurrence(
      {
        freq: "monthly_date",
        interval: 1,
        byWeekday: [],
        timeStartMin: 10 * 60,
        durationMin: 60,
        startsOn: "2026-01-31",
        count: 3
      },
      wideWindow
    )
    expect(out.map((o) => new Date(o.start).toISOString().slice(0, 10))).toEqual([
      "2026-01-31",
      "2026-03-31",
      "2026-05-31"
    ])
  })

  it("stops at an inclusive endsOn", () => {
    const out = expandRecurrence(
      {
        freq: "monthly_date",
        interval: 1,
        byWeekday: [],
        timeStartMin: 10 * 60,
        durationMin: 60,
        startsOn: "2026-01-15",
        endsOn: "2026-03-15"
      },
      wideWindow
    )
    expect(out.map((o) => new Date(o.start).toISOString().slice(0, 10))).toEqual([
      "2026-01-15",
      "2026-02-15",
      "2026-03-15"
    ])
  })

  it("an unbounded rule stops at the window end", () => {
    const out = expandRecurrence(
      {
        freq: "monthly_date",
        interval: 1,
        byWeekday: [],
        timeStartMin: 10 * 60,
        durationMin: 60,
        startsOn: "2026-01-15"
      },
      { start: utc("2026-01-01T00:00:00Z"), end: utc("2026-04-01T00:00:00Z") }
    )
    expect(out.map((o) => new Date(o.start).toISOString().slice(0, 10))).toEqual([
      "2026-01-15",
      "2026-02-15",
      "2026-03-15"
    ])
  })

  it("respects the month interval", () => {
    const out = expandRecurrence(
      {
        freq: "monthly_date",
        interval: 3,
        byWeekday: [],
        timeStartMin: 10 * 60,
        durationMin: 60,
        startsOn: "2026-01-15",
        count: 3
      },
      wideWindow
    )
    expect(out.map((o) => new Date(o.start).toISOString().slice(0, 10))).toEqual([
      "2026-01-15",
      "2026-04-15",
      "2026-07-15"
    ])
  })
})
