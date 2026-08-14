import type { Shift } from "@dentalops/contracts"

export const PX_PER_MIN = 16 / 15
export const DAY_MS = 86_400_000
const MINUTE = 60_000

export const bkkDayStart = (isoDate: string): number => Date.parse(`${isoDate}T00:00:00+07:00`)

const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" })
const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})
const dayFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
})
const scheduleDayFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok",
  weekday: "short",
  day: "numeric",
  month: "short",
})
const compactDayFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
})
const weekdayShortFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok",
  weekday: "short",
})

export const bkkDate = (ms: number): string => dateFmt.format(new Date(ms))

export const bkkToday = (): string => bkkDate(Date.now())

export const MINUTES_PER_DAY = 1440

const WINDOW_PAD_MIN = 60
const MIN_WINDOW_MIN = 8 * 60
const DEFAULT_WINDOW: TimelineWindow = { startMin: 8 * 60, endMin: 20 * 60 }

export interface TimelineWindow {
  startMin: number
  endMin: number
}

export const FULL_DAY_WINDOW: TimelineWindow = { startMin: 0, endMin: MINUTES_PER_DAY }

interface TimeSpan {
  startsAt: string
  endsAt: string
}

const spanMinutes = (span: TimeSpan): { start: number; end: number } => {
  const startMs = Date.parse(span.startsAt)
  const ownDayStart = bkkDayStart(bkkDate(startMs))
  const start = (startMs - ownDayStart) / MINUTE
  return { start, end: start + (Date.parse(span.endsAt) - startMs) / MINUTE }
}

export const timelineWindow = (
  shifts: readonly TimeSpan[],
  appointments: readonly TimeSpan[],
): TimelineWindow => {
  let earliest = Number.POSITIVE_INFINITY
  let latest = Number.NEGATIVE_INFINITY

  for (const shift of shifts) {
    const { start, end } = spanMinutes(shift)
    earliest = Math.min(earliest, start - WINDOW_PAD_MIN)
    latest = Math.max(latest, end + WINDOW_PAD_MIN)
  }
  for (const appointment of appointments) {
    const { start, end } = spanMinutes(appointment)
    earliest = Math.min(earliest, start)
    latest = Math.max(latest, end)
  }
  if (!Number.isFinite(earliest) || !Number.isFinite(latest)) return DEFAULT_WINDOW

  let startMin = Math.max(0, Math.floor(earliest / 60) * 60)
  let endMin = Math.min(MINUTES_PER_DAY, Math.ceil(latest / 60) * 60)
  while (endMin - startMin < MIN_WINDOW_MIN) {
    if (endMin < MINUTES_PER_DAY) endMin += 60
    else if (startMin > 0) startMin -= 60
    else break
  }
  return { startMin, endMin }
}

export const initialTimelineMinute = (date: string, now: number, shifts: Shift[]): number => {
  const currentMinute =
    date === bkkDate(now) ? Math.floor((now - bkkDayStart(date)) / MINUTE) - 60 : Number.NaN
  const earliestShift =
    shifts.length === 0
      ? Number.NaN
      : Math.min(
          ...shifts.map(
            (shift) => Math.floor((Date.parse(shift.startsAt) - bkkDayStart(date)) / MINUTE) - 60,
          ),
        )
  const target = Number.isFinite(currentMinute)
    ? currentMinute
    : Number.isFinite(earliestShift)
      ? earliestShift
      : 480
  return Math.max(0, Math.min(23 * 60, target))
}

export const bkkShiftDate = (isoDate: string, days: number): string =>
  dateFmt.format(new Date(bkkDayStart(isoDate) + days * DAY_MS + DAY_MS / 2))

export const WEEK_DAYS = 7

export const bkkWeekStart = (isoDate: string): string => {
  const weekday = new Date(bkkDayStart(isoDate) + DAY_MS / 2).getUTCDay()
  return bkkShiftDate(isoDate, -((weekday + 6) % 7))
}

export const weekDates = (weekStart: string): string[] =>
  Array.from({ length: WEEK_DAYS }, (_, index) => bkkShiftDate(weekStart, index))

export const msToY = (ms: number, dayStart: number): number =>
  ((ms - dayStart) / MINUTE) * PX_PER_MIN

export const yToMs = (y: number, dayStart: number): number =>
  dayStart + Math.round(y / PX_PER_MIN) * MINUTE

export const snapFloor = (ms: number, stepMin = 15): number =>
  Math.floor(ms / (stepMin * MINUTE)) * stepMin * MINUTE

export const snapCeil = (ms: number, stepMin = 15): number =>
  Math.ceil(ms / (stepMin * MINUTE)) * stepMin * MINUTE

export const fmtTime = (ms: number): string => timeFmt.format(new Date(ms))

export const fmtDay = (isoDate: string): string =>
  dayFmt.format(new Date(bkkDayStart(isoDate) + DAY_MS / 2))

export const fmtScheduleDay = (isoDate: string): string =>
  scheduleDayFmt.format(new Date(bkkDayStart(isoDate) + DAY_MS / 2))

export const fmtCompactDay = (isoDate: string): string =>
  compactDayFmt.format(new Date(bkkDayStart(isoDate) + DAY_MS / 2))

export const fmtWeekdayShort = (isoDate: string): string =>
  weekdayShortFmt.format(new Date(bkkDayStart(isoDate) + DAY_MS / 2))
