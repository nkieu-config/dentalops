import {
  appointmentSchema,
  rosterValidationSchema,
  shiftSchema,
  type DraftShift,
  type Shift,
  type Violation
} from "@dentalops/contracts"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { z } from "zod"
import { api } from "../../lib/api"
import { DAY_MS, bkkDate, bkkDayStart, bkkShiftDate, fmtTime } from "../timeline/lib/geometry"

export const WEEK_DAYS = 7
export const VALIDATE_DEBOUNCE_MS = 250

const weekdayFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok",
  weekday: "short",
  day: "numeric"
})

export const bkkWeekStart = (isoDate: string): string => {
  const weekday = new Date(bkkDayStart(isoDate) + DAY_MS / 2).getUTCDay()
  return bkkShiftDate(isoDate, -((weekday + 6) % 7))
}

export const fmtWeekday = (isoDate: string): string =>
  weekdayFmt.format(new Date(bkkDayStart(isoDate) + DAY_MS / 2))

export interface ShiftForm {
  shiftId?: string
  staffId: string
  date: string
  start: string
  end: string
}

export const shiftFormInterval = (form: ShiftForm): { startsAt: string; endsAt: string } | null => {
  if (!form.staffId || !form.date || !form.start || !form.end) return null
  const startsAt = Date.parse(`${form.date}T${form.start}:00+07:00`)
  const endsAt = Date.parse(`${form.date}T${form.end}:00+07:00`)
  if (Number.isNaN(startsAt) || Number.isNaN(endsAt) || endsAt <= startsAt) return null
  return { startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() }
}

export const shiftToForm = (shift: Shift): ShiftForm => ({
  shiftId: shift.id,
  staffId: shift.staffId,
  date: bkkDate(Date.parse(shift.startsAt)),
  start: fmtTime(Date.parse(shift.startsAt)),
  end: fmtTime(Date.parse(shift.endsAt))
})

export const weekDates = (weekStart: string): string[] =>
  Array.from({ length: WEEK_DAYS }, (_, index) => bkkShiftDate(weekStart, index))

export const weekWindow = (weekStart: string) => ({
  from: new Date(bkkDayStart(weekStart)).toISOString(),
  to: new Date(bkkDayStart(weekStart) + WEEK_DAYS * DAY_MS).toISOString()
})

export const toDraftShift = (shift: Shift): DraftShift => ({
  id: shift.id,
  staffId: shift.staffId,
  startsAt: shift.startsAt,
  endsAt: shift.endsAt
})

export const draftForStaff = (
  shifts: Shift[],
  staffId: string,
  edited: DraftShift | null,
  replacedId?: string
): DraftShift[] => {
  const kept = shifts
    .filter((shift) => shift.staffId === staffId && shift.id !== replacedId)
    .map(toDraftShift)
  return edited ? [...kept, edited] : kept
}

export interface ValidateRequest {
  branchId: string
  from: string
  to: string
  draftShifts: DraftShift[]
}

export const weekShiftsKey = (branchId: string | undefined, weekStart: string) =>
  ["roster-shifts", branchId, weekStart] as const

export const useWeekShifts = (branchId: string | undefined, weekStart: string) =>
  useQuery({
    queryKey: weekShiftsKey(branchId, weekStart),
    enabled: branchId !== undefined,
    queryFn: () =>
      api("/shifts", z.array(shiftSchema), { query: { branchId, ...weekWindow(weekStart) } })
  })

export const useWeekAppointments = (branchId: string | undefined, weekStart: string) =>
  useQuery({
    queryKey: ["roster-appointments", branchId, weekStart],
    enabled: branchId !== undefined,
    queryFn: () =>
      api("/appointments", z.array(appointmentSchema), {
        query: { branchId, ...weekWindow(weekStart) }
      })
  })

export const useDebounced = <T,>(value: T, delayMs: number): T => {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return settled
}

export interface RosterValidationState {
  violations: Violation[]
  blocking: Violation[]
  isSettling: boolean
}

export const useRosterValidation = (request: ValidateRequest | null): RosterValidationState => {
  const settled = useDebounced(request, VALIDATE_DEBOUNCE_MS)
  const query = useQuery({
    queryKey: ["roster-validate", settled],
    enabled: settled !== null,
    queryFn: () =>
      api("/roster/validate", rosterValidationSchema, { method: "POST", body: settled })
  })
  const violations = query.data?.violations ?? []
  return {
    violations,
    blocking: violations.filter((violation) => violation.severity === "block"),
    isSettling: settled !== request || query.isFetching
  }
}
