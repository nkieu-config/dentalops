import type { Appointment, Shift } from "@dentalops/contracts"
import { describe, expect, it } from "vitest"
import { dentistLoad, fmtLoad } from "./load"

const staffId = "2f9619ff-8b86-4d01-b42d-00cf4fc964ff"

const shift = (startsAt: string, endsAt: string): Shift => ({
  id: "s1",
  staffId,
  branchId: "b1",
  startsAt,
  endsAt
})

const appt = (startsAt: string, endsAt: string, status: Appointment["status"] = "confirmed"): Appointment => ({
  id: `a-${startsAt}`,
  branchId: "b1",
  serviceId: "svc",
  dentistId: staffId,
  patientId: "p1",
  startsAt,
  endsAt,
  status,
  version: 1,
  seriesId: null,
  service: { id: "svc", name: "Cleaning", colorIndex: 0 },
  patient: { id: "p1", name: "Someone", phone: "0800000000" },
  claims: []
})

describe("dentistLoad", () => {
  it("counts booked minutes against the shift and leaves the rest open", () => {
    const shifts = [shift("2026-08-03T02:00:00.000Z", "2026-08-03T10:00:00.000Z")]
    const appointments = [appt("2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z")]
    const load = dentistLoad(staffId, shifts, appointments)
    expect(load.bookedCount).toBe(1)
    expect(load.hasShift).toBe(true)
    expect(load.openMin).toBe(7 * 60)
  })

  it("does not count a cancelled appointment as booked time", () => {
    const shifts = [shift("2026-08-03T02:00:00.000Z", "2026-08-03T10:00:00.000Z")]
    const appointments = [appt("2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z", "cancelled")]
    const load = dentistLoad(staffId, shifts, appointments)
    expect(load.bookedCount).toBe(0)
    expect(load.openMin).toBe(8 * 60)
  })

  it("reports no shift when the dentist is not scheduled that day", () => {
    const load = dentistLoad(staffId, [], [])
    expect(load.hasShift).toBe(false)
    expect(load.openMin).toBe(0)
  })

  it("never reports negative open minutes when overbooked past the shift", () => {
    const shifts = [shift("2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z")]
    const appointments = [appt("2026-08-03T02:00:00.000Z", "2026-08-03T04:00:00.000Z")]
    const load = dentistLoad(staffId, shifts, appointments)
    expect(load.openMin).toBe(0)
  })
})

describe("fmtLoad", () => {
  it("says off today when there is no shift and nothing booked", () => {
    expect(fmtLoad({ bookedCount: 0, openMin: 0, hasShift: false })).toBe("Off today")
  })

  it("still counts bookings without a shift on record", () => {
    expect(fmtLoad({ bookedCount: 2, openMin: 0, hasShift: false })).toBe("2 booked")
  })

  it("says full when there is no open time left in the shift", () => {
    expect(fmtLoad({ bookedCount: 5, openMin: 0, hasShift: true })).toBe("5 booked · full")
  })

  it("formats hours and minutes of open time", () => {
    expect(fmtLoad({ bookedCount: 3, openMin: 135, hasShift: true })).toBe("3 booked · 2h 15m open")
    expect(fmtLoad({ bookedCount: 1, openMin: 45, hasShift: true })).toBe("1 booked · 45m open")
    expect(fmtLoad({ bookedCount: 1, openMin: 120, hasShift: true })).toBe("1 booked · 2h open")
  })
})
