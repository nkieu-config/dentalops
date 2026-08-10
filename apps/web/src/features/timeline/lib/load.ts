import type { Appointment, Shift } from "@dentalops/contracts"

const MINUTE = 60_000

export interface ColumnLoad {
  bookedCount: number
  openMin: number
  hasShift: boolean
}

export const dentistLoad = (
  staffId: string,
  shifts: Shift[],
  appointments: Appointment[]
): ColumnLoad => {
  const ownShifts = shifts.filter((shift) => shift.staffId === staffId)
  const shiftMin = ownShifts.reduce(
    (sum, shift) => sum + (Date.parse(shift.endsAt) - Date.parse(shift.startsAt)) / MINUTE,
    0
  )
  const booked = appointments.filter(
    (a) => a.dentistId === staffId && a.status !== "cancelled"
  )
  const bookedMin = booked.reduce(
    (sum, a) => sum + (Date.parse(a.endsAt) - Date.parse(a.startsAt)) / MINUTE,
    0
  )
  return {
    bookedCount: booked.length,
    openMin: Math.max(0, Math.round(shiftMin - bookedMin)),
    hasShift: ownShifts.length > 0
  }
}

export const fmtLoad = (load: ColumnLoad): string => {
  if (!load.hasShift) return load.bookedCount > 0 ? `${load.bookedCount} booked` : "Off today"
  if (load.openMin <= 0) return `${load.bookedCount} booked · full`
  const hours = Math.floor(load.openMin / 60)
  const mins = load.openMin % 60
  const openLabel = hours > 0 ? `${hours}h${mins > 0 ? ` ${mins}m` : ""}` : `${mins}m`
  return `${load.bookedCount} booked · ${openLabel} open`
}
