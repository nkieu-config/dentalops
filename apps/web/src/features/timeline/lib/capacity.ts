import { normalize, subtract, type Interval } from "@dentalops/availability"
import type { Appointment } from "@dentalops/contracts"

const MINUTE = 60_000

export interface ColumnLoad {
  booked: number
  bookedMin: number
  rosteredMin: number
  freeMin: number
}

interface TimeSpan {
  startsAt: string
  endsAt: string
}

const spanOf = (row: TimeSpan): Interval => ({
  start: Date.parse(row.startsAt),
  end: Date.parse(row.endsAt),
})

const totalMinutes = (list: Interval[]): number =>
  Math.round(list.reduce((sum, span) => sum + (span.end - span.start), 0) / MINUTE)

export const columnLoad = (
  appointments: readonly Appointment[],
  available: readonly TimeSpan[],
): ColumnLoad => {
  const claimed = appointments.filter((appointment) => appointment.status !== "cancelled")
  const rostered = normalize(available.map(spanOf))
  const rosteredMin = totalMinutes(rostered)
  if (rosteredMin === 0) {
    return {
      booked: claimed.length,
      bookedMin: totalMinutes(normalize(claimed.map(spanOf))),
      rosteredMin: 0,
      freeMin: 0,
    }
  }
  const freeMin = totalMinutes(subtract(rostered, claimed.map(spanOf)))
  return {
    booked: claimed.length,
    bookedMin: rosteredMin - freeMin,
    rosteredMin,
    freeMin,
  }
}

export const fmtDurationShort = (minutes: number): string => {
  if (minutes <= 0) return "0m"
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}m`
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

export const describeLoad = (load: ColumnLoad, unavailableLabel: string): string => {
  const booked = `${load.booked} booked`
  if (load.rosteredMin === 0) return load.booked === 0 ? unavailableLabel : `${unavailableLabel} · ${booked}`
  if (load.freeMin === 0) return `${booked} · no gaps`
  return `${booked} · ${fmtDurationShort(load.freeMin)} free`
}
