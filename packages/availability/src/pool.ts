import { Interval, normalize, overlaps } from "./interval"

export interface ResourceUnit {
  id: string
  busy: Interval[]
}

export const unitFree = (unit: ResourceUnit, window: Interval): boolean =>
  !normalize(unit.busy).some((b) => overlaps(b, window))

export const hasFreeUnit = (units: ResourceUnit[], window: Interval): boolean =>
  units.some((u) => unitFree(u, window))
