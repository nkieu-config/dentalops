import { Interval, intersect, subtract } from "./interval"
import { ResourceUnit, hasFreeUnit } from "./pool"

export interface StaffCalendar {
  staffId: string
  shifts: Interval[]
  busy: Interval[]
}

export interface SlotRequest {
  window: Interval
  stepMin: number
  durationMin: number
  bufferMin: number
  staff: StaffCalendar[]
  chairs: ResourceUnit[]
  equipmentPools: ResourceUnit[][]
}

export interface Slot {
  staffId: string
  start: number
  end: number
}

const MINUTE = 60_000

export const computeSlots = (req: SlotRequest): Slot[] => {
  const step = req.stepMin * MINUTE
  const duration = req.durationMin * MINUTE
  const buffer = req.bufferMin * MINUTE
  const slots: Slot[] = []
  for (const person of req.staff) {
    const onShift = person.shifts
      .map((s) => intersect(s, req.window))
      .filter((s): s is Interval => s !== null)
    for (const free of subtract(onShift, person.busy)) {
      const firstStart = Math.ceil(free.start / step) * step
      for (let start = firstStart; start + duration <= free.end; start += step) {
        const serviceWindow = { start, end: start + duration }
        const chairWindow = { start, end: start + duration + buffer }
        if (!hasFreeUnit(req.chairs, chairWindow)) continue
        if (!req.equipmentPools.every((pool) => hasFreeUnit(pool, serviceWindow))) continue
        slots.push({ staffId: person.staffId, start, end: serviceWindow.end })
      }
    }
  }
  return slots.sort((a, b) => a.start - b.start || a.staffId.localeCompare(b.staffId))
}
