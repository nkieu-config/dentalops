import { describe, expect, it } from "vitest"
import { openingSpans, readOpeningHours } from "./opening-hours"

const closed = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }

describe("readOpeningHours", () => {
  it("accepts a full week of hours", () => {
    expect(readOpeningHours({ ...closed, mon: [["09:00", "17:00"]] })).toEqual({
      ...closed,
      mon: [["09:00", "17:00"]],
    })
  })

  it("refuses a partial week rather than shading days it knows nothing about", () => {
    expect(readOpeningHours({ mon: [["09:00", "17:00"]] })).toBeUndefined()
  })

  it("refuses anything that is not opening hours at all", () => {
    expect(readOpeningHours({})).toBeUndefined()
    expect(readOpeningHours(undefined)).toBeUndefined()
    expect(readOpeningHours("09:00-17:00")).toBeUndefined()
  })
})

describe("openingSpans", () => {
  it("anchors each interval to the Bangkok day, not the browser's", () => {
    const [span] = openingSpans({ ...closed, mon: [["09:00", "17:30"]] }, "2026-08-03")

    expect(span).toEqual({
      startsAt: "2026-08-03T02:00:00.000Z",
      endsAt: "2026-08-03T10:30:00.000Z",
    })
  })

  it("reads the weekday from the date so a Sunday never borrows Monday's hours", () => {
    expect(
      openingSpans(
        { ...closed, mon: [["09:00", "17:00"]], sun: [["10:00", "14:00"]] },
        "2026-08-09",
      ),
    ).toEqual([{ startsAt: "2026-08-09T03:00:00.000Z", endsAt: "2026-08-09T07:00:00.000Z" }])
  })

  it("returns nothing on a day the branch never opens", () => {
    expect(openingSpans(closed, "2026-08-03")).toEqual([])
  })

  it("keeps a split day as two separate open windows", () => {
    expect(
      openingSpans({ ...closed, mon: [["09:00", "12:00"], ["13:00", "18:00"]] }, "2026-08-03"),
    ).toEqual([
      { startsAt: "2026-08-03T02:00:00.000Z", endsAt: "2026-08-03T05:00:00.000Z" },
      { startsAt: "2026-08-03T06:00:00.000Z", endsAt: "2026-08-03T11:00:00.000Z" },
    ])
  })
})
