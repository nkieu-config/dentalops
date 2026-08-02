import { describe, expect, it } from "vitest"
import { validateRoster } from "../src/roster"

const at = (day: number, hhmm: string) =>
  Date.parse(`2026-08-${String(day).padStart(2, "0")}T${hhmm}:00+07:00`)

const shift = (id: string, day: number, from: string, toDay: number, to: string) => ({
  id,
  start: at(day, from),
  end: at(toDay, to)
})

const sameDayShift = (id: string, day: number, from: string, to: string) =>
  shift(id, day, from, day, to)

const appt = (id: string, day: number, from: string, to: string) => ({
  id,
  start: at(day, from),
  end: at(day, to)
})

describe("appointment_outside_shift", () => {
  it("treats an appointment straddling two back-to-back shifts as covered", () => {
    const violations = validateRoster({
      staff: [
        {
          staffId: "d1",
          shifts: [
            sameDayShift("s1", 3, "09:00", "13:00"),
            sameDayShift("s2", 3, "13:00", "17:00")
          ],
          appointments: [appt("a1", 3, "12:30", "13:30")]
        }
      ]
    })
    expect(violations).toEqual([])
  })

  it("a half-open shift covers an appointment ending exactly at the shift end", () => {
    const violations = validateRoster({
      staff: [
        {
          staffId: "d1",
          shifts: [sameDayShift("s1", 3, "09:00", "17:00")],
          appointments: [appt("a1", 3, "16:00", "17:00")]
        }
      ]
    })
    expect(violations).toEqual([])
  })

  it("flags an appointment running fifteen minutes past the shift end", () => {
    const violations = validateRoster({
      staff: [
        {
          staffId: "d1",
          shifts: [sameDayShift("s1", 3, "09:00", "17:00")],
          appointments: [appt("a1", 3, "16:30", "17:15")]
        }
      ]
    })
    expect(violations).toEqual([
      {
        rule: "appointment_outside_shift",
        severity: "block",
        staffId: "d1",
        detail: "1 confirmed appointment falls outside the rostered shifts",
        appointmentIds: ["a1"]
      }
    ])
  })

  it("carries every offending appointment id in one violation", () => {
    const violations = validateRoster({
      staff: [
        {
          staffId: "d1",
          shifts: [sameDayShift("s1", 3, "09:00", "15:00")],
          appointments: [
            appt("a1", 3, "10:00", "11:00"),
            appt("a2", 3, "15:30", "16:00"),
            appt("a3", 3, "14:30", "15:30")
          ]
        }
      ]
    })
    expect(violations).toHaveLength(1)
    expect(violations[0]!.appointmentIds).toEqual(["a2", "a3"])
    expect(violations[0]!.detail).toBe("2 confirmed appointments fall outside the rostered shifts")
  })
})

describe("overlapping_shifts", () => {
  it("shifts that only touch at 17:00 do not overlap", () => {
    const violations = validateRoster({
      staff: [
        {
          staffId: "d1",
          shifts: [
            sameDayShift("s1", 3, "09:00", "17:00"),
            sameDayShift("s2", 3, "17:00", "20:00")
          ],
          appointments: []
        }
      ]
    })
    expect(violations).toEqual([])
  })

  it("blocks a genuine overlap and names both shifts", () => {
    const violations = validateRoster({
      staff: [
        {
          staffId: "d1",
          shifts: [
            sameDayShift("s2", 3, "16:00", "20:00"),
            sameDayShift("s1", 3, "09:00", "17:00")
          ],
          appointments: []
        }
      ]
    })
    expect(violations).toEqual([
      {
        rule: "overlapping_shifts",
        severity: "block",
        staffId: "d1",
        detail: "Shifts s1 and s2 overlap"
      }
    ])
  })
})

describe("weekly_hours_exceeded", () => {
  const tenHourDays = (days: number[]) =>
    days.map((d) => sameDayShift(`s${d}`, d, "08:00", "18:00"))

  it("warns on a fifty hour week", () => {
    const violations = validateRoster({
      staff: [{ staffId: "d1", shifts: tenHourDays([3, 4, 5, 6, 7]), appointments: [] }]
    })
    expect(violations).toEqual([
      {
        rule: "weekly_hours_exceeded",
        severity: "warn",
        staffId: "d1",
        detail: "3000 minutes rostered in the week of 2026-08-03, over the 2880 minute limit"
      }
    ])
  })

  it("exactly forty-eight hours is not over the limit", () => {
    const violations = validateRoster({
      staff: [
        {
          staffId: "d1",
          shifts: [3, 4, 5, 6, 7, 8].map((d) => sameDayShift(`s${d}`, d, "09:00", "17:00")),
          appointments: []
        }
      ]
    })
    expect(violations).toEqual([])
  })

  it("splits a shift crossing the local Monday boundary across both weeks", () => {
    const violations = validateRoster({
      staff: [{ staffId: "d1", shifts: [shift("s1", 9, "22:00", 10, "06:00")], appointments: [] }],
      maxWeeklyMinutes: 60
    })
    expect(violations.map((v) => v.detail)).toEqual([
      "120 minutes rostered in the week of 2026-08-03, over the 60 minute limit",
      "360 minutes rostered in the week of 2026-08-10, over the 60 minute limit"
    ])
  })

  it("honours a custom maxWeeklyMinutes", () => {
    const staff = [
      {
        staffId: "d1",
        shifts: [sameDayShift("s1", 3, "09:00", "17:00")],
        appointments: []
      }
    ]
    expect(validateRoster({ staff })).toEqual([])
    expect(validateRoster({ staff, maxWeeklyMinutes: 400 })).toHaveLength(1)
  })
})

describe("insufficient_rest", () => {
  it("warns on a nine hour turnaround", () => {
    const violations = validateRoster({
      staff: [
        {
          staffId: "d1",
          shifts: [sameDayShift("s1", 3, "09:00", "17:00"), sameDayShift("s2", 4, "02:00", "10:00")],
          appointments: []
        }
      ]
    })
    expect(violations).toEqual([
      {
        rule: "insufficient_rest",
        severity: "warn",
        staffId: "d1",
        detail: "540 minutes of rest before the next shift, under the 660 minute minimum"
      }
    ])
  })

  it("exactly eleven hours of rest is enough", () => {
    const violations = validateRoster({
      staff: [
        {
          staffId: "d1",
          shifts: [sameDayShift("s1", 3, "09:00", "17:00"), sameDayShift("s2", 4, "04:00", "10:00")],
          appointments: []
        }
      ]
    })
    expect(violations).toEqual([])
  })

  it("an overlap does not also produce a negative rest warning", () => {
    const violations = validateRoster({
      staff: [
        {
          staffId: "d1",
          shifts: [
            sameDayShift("s1", 3, "09:00", "17:00"),
            sameDayShift("s2", 3, "16:00", "20:00")
          ],
          appointments: []
        }
      ]
    })
    expect(violations.map((v) => v.rule)).toEqual(["overlapping_shifts"])
  })

  it("honours a custom minRestMinutes", () => {
    const staff = [
      {
        staffId: "d1",
        shifts: [sameDayShift("s1", 3, "09:00", "17:00"), sameDayShift("s2", 4, "02:00", "10:00")],
        appointments: []
      }
    ]
    expect(validateRoster({ staff, minRestMinutes: 480 })).toEqual([])
  })
})

describe("validateRoster", () => {
  it("returns nothing for empty input", () => {
    expect(validateRoster({ staff: [] })).toEqual([])
  })

  it("a staff member with no shifts produces no violations at all", () => {
    const violations = validateRoster({
      staff: [
        {
          staffId: "d1",
          shifts: [],
          appointments: [appt("a1", 3, "10:00", "11:00")]
        }
      ]
    })
    expect(violations).toEqual([])
  })

  it("orders by severity, then staffId, then start", () => {
    const violations = validateRoster({
      staff: [
        {
          staffId: "d-a",
          shifts: [
            sameDayShift("a1", 3, "09:00", "17:00"),
            sameDayShift("a2", 4, "02:00", "10:00"),
            sameDayShift("a3", 4, "18:00", "22:00")
          ],
          appointments: []
        },
        {
          staffId: "d-b",
          shifts: [
            sameDayShift("b1", 5, "09:00", "17:00"),
            sameDayShift("b2", 5, "16:00", "20:00")
          ],
          appointments: []
        },
        {
          staffId: "d-c",
          shifts: [sameDayShift("c1", 6, "09:00", "17:00"), sameDayShift("c2", 7, "02:00", "10:00")],
          appointments: []
        }
      ]
    })
    expect(violations.map((v) => `${v.severity} ${v.staffId} ${v.rule}`)).toEqual([
      "block d-b overlapping_shifts",
      "warn d-a insufficient_rest",
      "warn d-a insufficient_rest",
      "warn d-c insufficient_rest"
    ])
    expect(violations[1]!.detail).toContain("540 minutes")
    expect(violations[2]!.detail).toContain("480 minutes")
  })
})
