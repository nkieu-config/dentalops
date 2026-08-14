import { openingHoursSchema, type OpeningHours } from "@dentalops/contracts"
import { DAY_MS, bkkDayStart } from "./geometry"

const MINUTE = 60_000
const HOUR = 3_600_000

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const

export interface OpenSpan {
  startsAt: string
  endsAt: string
}

export const readOpeningHours = (value: unknown): OpeningHours | undefined => {
  const parsed = openingHoursSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

const minutesFrom = (time: string): number => {
  const [hours, minutes] = time.split(":")
  return Number(hours) * HOUR + Number(minutes) * MINUTE
}

export const openingSpans = (hours: OpeningHours, isoDate: string): OpenSpan[] => {
  const dayStart = bkkDayStart(isoDate)
  const weekday = DAY_KEYS[new Date(dayStart + DAY_MS / 2).getUTCDay()]
  if (weekday === undefined) return []
  return hours[weekday].map(([opens, closes]) => ({
    startsAt: new Date(dayStart + minutesFrom(opens)).toISOString(),
    endsAt: new Date(dayStart + minutesFrom(closes)).toISOString(),
  }))
}
