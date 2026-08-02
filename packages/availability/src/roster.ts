import { Interval, normalize, overlaps, subtract } from "./interval"

export type Severity = "block" | "warn"

export interface Violation {
  rule: string
  severity: Severity
  staffId: string
  detail: string
  appointmentIds?: string[]
}

export interface RosterShift {
  id: string
  start: number
  end: number
}

export interface RosterAppointment {
  id: string
  start: number
  end: number
}

export interface RosterStaff {
  staffId: string
  shifts: RosterShift[]
  appointments: RosterAppointment[]
}

export interface RosterInput {
  staff: RosterStaff[]
  maxWeeklyMinutes?: number
  minRestMinutes?: number
}

const MINUTE = 60_000
const DAY = 86_400_000
const WEEK = 7 * DAY
const BANGKOK_OFFSET_MS = 420 * MINUTE
const DEFAULT_MAX_WEEKLY_MINUTES = 2880
const DEFAULT_MIN_REST_MINUTES = 660

const SEVERITY_RANK: Record<Severity, number> = { block: 0, warn: 1 }

interface Anchored {
  at: number
  violation: Violation
}

const weekStartOf = (instant: number): number => {
  const dayIndex = Math.floor((instant + BANGKOK_OFFSET_MS) / DAY)
  const weekday = (((dayIndex + 4) % 7) + 7) % 7
  return (dayIndex - ((weekday + 6) % 7)) * DAY - BANGKOK_OFFSET_MS
}

const weekLabel = (weekStart: number): string =>
  new Date(weekStart + BANGKOK_OFFSET_MS).toISOString().slice(0, 10)

const outsideShift = (staff: RosterStaff, covered: Interval[]): Anchored[] => {
  const offending = staff.appointments.filter((a) => subtract([a], covered).length > 0)
  if (offending.length === 0) return []
  const noun = offending.length === 1 ? "appointment falls" : "appointments fall"
  return [
    {
      at: Math.min(...offending.map((a) => a.start)),
      violation: {
        rule: "appointment_outside_shift",
        severity: "block",
        staffId: staff.staffId,
        detail: `${offending.length} confirmed ${noun} outside the rostered shifts`,
        appointmentIds: offending.map((a) => a.id)
      }
    }
  ]
}

const overlappingShifts = (staff: RosterStaff): Anchored[] => {
  const sorted = [...staff.shifts].sort((a, b) => a.start - b.start)
  const found: Anchored[] = []
  for (const [index, earlier] of sorted.entries()) {
    for (const later of sorted.slice(index + 1)) {
      if (!overlaps(earlier, later)) continue
      found.push({
        at: later.start,
        violation: {
          rule: "overlapping_shifts",
          severity: "block",
          staffId: staff.staffId,
          detail: `Shifts ${earlier.id} and ${later.id} overlap`
        }
      })
    }
  }
  return found
}

const weeklyHours = (
  staff: RosterStaff,
  covered: Interval[],
  maxWeeklyMinutes: number
): Anchored[] => {
  const perWeek = new Map<number, number>()
  for (const span of covered) {
    let cursor = span.start
    while (cursor < span.end) {
      const weekStart = weekStartOf(cursor)
      const weekEnd = weekStart + WEEK
      perWeek.set(weekStart, (perWeek.get(weekStart) ?? 0) + (Math.min(span.end, weekEnd) - cursor))
      cursor = weekEnd
    }
  }
  return [...perWeek.entries()]
    .filter(([, worked]) => worked / MINUTE > maxWeeklyMinutes)
    .map(([weekStart, worked]) => ({
      at: weekStart,
      violation: {
        rule: "weekly_hours_exceeded",
        severity: "warn",
        staffId: staff.staffId,
        detail: `${worked / MINUTE} minutes rostered in the week of ${weekLabel(weekStart)}, over the ${maxWeeklyMinutes} minute limit`
      }
    }))
}

const insufficientRest = (
  staff: RosterStaff,
  covered: Interval[],
  minRestMinutes: number
): Anchored[] => {
  const found: Anchored[] = []
  for (const [index, span] of covered.entries()) {
    const next = covered[index + 1]
    if (!next) continue
    const restMinutes = (next.start - span.end) / MINUTE
    if (restMinutes >= minRestMinutes) continue
    found.push({
      at: span.end,
      violation: {
        rule: "insufficient_rest",
        severity: "warn",
        staffId: staff.staffId,
        detail: `${restMinutes} minutes of rest before the next shift, under the ${minRestMinutes} minute minimum`
      }
    })
  }
  return found
}

export const validateRoster = (input: RosterInput): Violation[] => {
  const maxWeeklyMinutes = input.maxWeeklyMinutes ?? DEFAULT_MAX_WEEKLY_MINUTES
  const minRestMinutes = input.minRestMinutes ?? DEFAULT_MIN_REST_MINUTES
  const found: Anchored[] = []
  for (const staff of input.staff) {
    if (staff.shifts.length === 0) continue
    const covered = normalize(staff.shifts)
    found.push(
      ...outsideShift(staff, covered),
      ...overlappingShifts(staff),
      ...weeklyHours(staff, covered, maxWeeklyMinutes),
      ...insufficientRest(staff, covered, minRestMinutes)
    )
  }
  return found
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.violation.severity] - SEVERITY_RANK[b.violation.severity] ||
        a.violation.staffId.localeCompare(b.violation.staffId) ||
        a.at - b.at
    )
    .map((anchored) => anchored.violation)
}
