import { Interval } from "./interval"

export interface RecurrenceRule {
  freq: "weekly" | "monthly_date"
  interval: number
  byWeekday: number[]
  timeStartMin: number
  durationMin: number
  startsOn: string
  endsOn?: string
  count?: number
}

const MINUTE = 60_000
const DAY = 86_400_000
const BANGKOK_OFFSET_MIN = 420

const localDayIndex = (isoDate: string): number =>
  Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / DAY)

const weekdayOfDayIndex = (dayIndex: number): number => (((dayIndex + 4) % 7) + 7) % 7

const occurrenceAt = (dayIndex: number, rule: RecurrenceRule, offsetMs: number): Interval => {
  const start = dayIndex * DAY - offsetMs + rule.timeStartMin * MINUTE
  return { start, end: start + rule.durationMin * MINUTE }
}

export const expandRecurrence = (
  rule: RecurrenceRule,
  window: Interval,
  utcOffsetMin: number = BANGKOK_OFFSET_MIN
): Interval[] => {
  const offsetMs = utcOffsetMin * MINUTE
  const startDay = localDayIndex(rule.startsOn)
  const lastDay = rule.endsOn ? localDayIndex(rule.endsOn) : Number.POSITIVE_INFINITY
  const maxCount = rule.count ?? Number.POSITIVE_INFINITY
  const out: Interval[] = []
  let made = 0

  if (rule.freq === "weekly") {
    const mondayAnchor = startDay - ((weekdayOfDayIndex(startDay) + 6) % 7)
    for (let day = startDay; day <= lastDay && made < maxCount; day++) {
      const occ = occurrenceAt(day, rule, offsetMs)
      if (occ.start >= window.end) break
      const weekIndex = Math.floor((day - mondayAnchor) / 7)
      if (weekIndex % rule.interval !== 0) continue
      if (!rule.byWeekday.includes(weekdayOfDayIndex(day))) continue
      made++
      if (occ.end > window.start) out.push(occ)
    }
    return out
  }

  const [y0, m0, d0] = rule.startsOn.split("-").map(Number) as [number, number, number]
  for (let k = 0; made < maxCount; k += rule.interval) {
    const monthIndex = m0 - 1 + k
    const year = y0 + Math.floor(monthIndex / 12)
    const month = monthIndex % 12
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    const probeDay = Math.floor(Date.UTC(year, month, Math.min(d0, daysInMonth)) / DAY)
    const probe = occurrenceAt(probeDay, rule, offsetMs)
    if (probe.start >= window.end) break
    if (probeDay > lastDay) break
    if (d0 > daysInMonth) continue
    made++
    if (probe.end > window.start) out.push(probe)
  }
  return out
}
