import type { Shift } from "@dentalops/contracts"
import { useRef, type PointerEvent as ReactPointerEvent } from "react"
import { columnAtX } from "../timeline/lib/drag-plan"
import { DAY_MS } from "../timeline/lib/geometry"
import { usePointerDrag } from "../timeline/use-pointer-drag"

export interface ShiftDraft {
  shiftId: string
  staffId: string
  startsAt: string
  endsAt: string
}

interface ShiftDragOptions {
  dates: readonly string[]
  columnLefts: () => readonly number[]
  isBusy: (shiftId: string) => boolean
  onDrop: (draft: ShiftDraft) => void
}

interface ActiveShiftDrag {
  shift: Shift
  anchorColumn: number
  homeColumn: number
  columnLefts: readonly number[]
}

const clamp = (value: number, max: number): number => Math.min(Math.max(value, 0), max)

const shifted = (iso: string, days: number): string =>
  new Date(Date.parse(iso) + days * DAY_MS).toISOString()

export const useShiftDrag = ({ dates, columnLefts, isBusy, onDrop }: ShiftDragOptions) => {
  const latest = useRef({ dates, onDrop })
  latest.current = { dates, onDrop }

  const project = (drag: ActiveShiftDrag, x: number): ShiftDraft => {
    const columnDelta = columnAtX(x, drag.columnLefts) - drag.anchorColumn
    const target = clamp(drag.homeColumn + columnDelta, latest.current.dates.length - 1)
    const days = target - drag.homeColumn
    return {
      shiftId: drag.shift.id,
      staffId: drag.shift.staffId,
      startsAt: shifted(drag.shift.startsAt, days),
      endsAt: shifted(drag.shift.endsAt, days)
    }
  }

  const commit = (drag: ActiveShiftDrag, target: ShiftDraft) => {
    if (target.startsAt === drag.shift.startsAt) return
    latest.current.onDrop(target)
  }

  const pointer = usePointerDrag<ActiveShiftDrag, ShiftDraft>({ project, commit })

  return {
    preview: pointer.preview,
    consumeDrag: pointer.consumeDrag,
    startMove:
      (shift: Shift, date: string) =>
      (e: ReactPointerEvent<Element>) => {
        const x = e.clientX
        pointer.begin(e, () => {
          if (isBusy(shift.id)) return null
          const lefts = columnLefts()
          const homeColumn = dates.indexOf(date)
          return {
            shift,
            anchorColumn: columnAtX(x, lefts),
            homeColumn: homeColumn < 0 ? 0 : homeColumn,
            columnLefts: lefts
          }
        })
      }
  }
}
