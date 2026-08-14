import type { Appointment, Shift } from "@dentalops/contracts"
import { describe, expect, it } from "vitest"
import { columnLoad, describeLoad, fmtDurationShort } from "./capacity"

const appointment = (startsAt: string, endsAt: string, status = "confirmed"): Appointment =>
  ({ startsAt, endsAt, status }) as Appointment

const shift = (startsAt: string, endsAt: string): Shift => ({ startsAt, endsAt }) as Shift

const nineToFive = shift("2026-08-03T02:00:00.000Z", "2026-08-03T10:00:00.000Z")

describe("columnLoad", () => {
  it("reports free time as the shift minus everything booked in it", () => {
    const load = columnLoad(
      [
        appointment("2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z"),
        appointment("2026-08-03T04:00:00.000Z", "2026-08-03T05:30:00.000Z"),
      ],
      [nineToFive],
    )

    expect(load).toEqual({ booked: 2, bookedMin: 150, rosteredMin: 480, freeMin: 330 })
  })

  it("counts overlapping bookings as one block of busy time", () => {
    const load = columnLoad(
      [
        appointment("2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z"),
        appointment("2026-08-03T02:30:00.000Z", "2026-08-03T03:30:00.000Z"),
      ],
      [nineToFive],
    )

    expect(load.booked).toBe(2)
    expect(load.bookedMin).toBe(90)
    expect(load.freeMin).toBe(390)
  })

  it("ignores a cancelled booking because its time is free again", () => {
    const load = columnLoad(
      [appointment("2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z", "cancelled")],
      [nineToFive],
    )

    expect(load).toEqual({ booked: 0, bookedMin: 0, rosteredMin: 480, freeMin: 480 })
  })

  it("does not count time booked outside the shift as filling it", () => {
    const load = columnLoad(
      [appointment("2026-08-03T11:00:00.000Z", "2026-08-03T12:00:00.000Z")],
      [nineToFive],
    )

    expect(load.bookedMin).toBe(0)
    expect(load.freeMin).toBe(480)
  })

  it("claims no free time for a column with nobody rostered", () => {
    const load = columnLoad(
      [appointment("2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z")],
      [],
    )

    expect(load).toEqual({ booked: 1, bookedMin: 60, rosteredMin: 0, freeMin: 0 })
  })
})

describe("describeLoad", () => {
  it("names the gap a receptionist can still sell", () => {
    expect(
      describeLoad({ booked: 8, bookedMin: 345, rosteredMin: 480, freeMin: 135 }, "Not rostered"),
    ).toBe("8 booked · 2h 15m free")
  })

  it("says outright when a rostered day has no gap left", () => {
    expect(
      describeLoad({ booked: 8, bookedMin: 480, rosteredMin: 480, freeMin: 0 }, "Not rostered"),
    ).toBe("8 booked · no gaps")
  })

  it("names the unavailability once instead of shading the column with words", () => {
    expect(
      describeLoad({ booked: 0, bookedMin: 0, rosteredMin: 0, freeMin: 0 }, "Closed"),
    ).toBe("Closed")
  })

  it("still reports bookings that survive on an unrostered column", () => {
    expect(
      describeLoad({ booked: 2, bookedMin: 90, rosteredMin: 0, freeMin: 0 }, "Not rostered"),
    ).toBe("Not rostered · 2 booked")
  })
})

describe("fmtDurationShort", () => {
  it("writes hours and minutes the way a front desk says them", () => {
    expect(fmtDurationShort(135)).toBe("2h 15m")
    expect(fmtDurationShort(120)).toBe("2h")
    expect(fmtDurationShort(45)).toBe("45m")
    expect(fmtDurationShort(0)).toBe("0m")
  })
})
