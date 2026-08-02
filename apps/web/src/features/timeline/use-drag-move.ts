import type { Appointment } from "@dentalops/contracts"
import { useRef, type PointerEvent as ReactPointerEvent } from "react"
import { columnAtX, planMove, planResize } from "./lib/drag-plan"
import { usePointerDrag } from "./use-pointer-drag"

const MINUTE = 60_000

export type DragMode = "move" | "resize"

export interface DragPreview {
  id: string
  dentistId: string
  startMs: number
  endMs: number
}

export interface RescheduleDrop {
  id: string
  version: number
  startsAt?: string
  dentistId?: string
  durationMin?: number
}

interface DragMoveOptions {
  dentistIds: readonly string[]
  columnLefts: () => readonly number[]
  isBusy: (id: string) => boolean
  onDrop: (drop: RescheduleDrop) => void
}

interface ActiveDrag {
  id: string
  version: number
  dentistId: string
  mode: DragMode
  anchorY: number
  anchorColumn: number
  homeColumn: number
  columnLefts: readonly number[]
  startMs: number
  endMs: number
}

const clamp = (value: number, max: number): number => Math.min(Math.max(value, 0), max)

export const useDragMove = ({ dentistIds, columnLefts, isBusy, onDrop }: DragMoveOptions) => {
  const latest = useRef({ dentistIds, onDrop })
  latest.current = { dentistIds, onDrop }

  const project = (drag: ActiveDrag, x: number, y: number): DragPreview => {
    if (drag.mode === "resize") {
      const { durationMin } = planResize({
        anchorY: drag.anchorY,
        currentY: y,
        startMs: drag.startMs,
        endMs: drag.endMs
      })
      return {
        id: drag.id,
        dentistId: drag.dentistId,
        startMs: drag.startMs,
        endMs: drag.startMs + durationMin * MINUTE
      }
    }
    const { dentistIds: columns } = latest.current
    const { startMs, columnDelta } = planMove({
      anchorY: drag.anchorY,
      currentY: y,
      anchorColumn: drag.anchorColumn,
      currentColumn: columnAtX(x, drag.columnLefts),
      startMs: drag.startMs
    })
    const target = clamp(drag.homeColumn + columnDelta, columns.length - 1)
    return {
      id: drag.id,
      dentistId: columns[target] ?? drag.dentistId,
      startMs,
      endMs: startMs + (drag.endMs - drag.startMs)
    }
  }

  const commit = (drag: ActiveDrag, target: DragPreview) => {
    if (drag.mode === "resize") {
      const durationMin = Math.round((target.endMs - target.startMs) / MINUTE)
      if (durationMin === Math.round((drag.endMs - drag.startMs) / MINUTE)) return
      latest.current.onDrop({ id: drag.id, version: drag.version, durationMin })
      return
    }
    const timeChanged = target.startMs !== drag.startMs
    const columnChanged = target.dentistId !== drag.dentistId
    if (!timeChanged && !columnChanged) return
    latest.current.onDrop({
      id: drag.id,
      version: drag.version,
      ...(timeChanged ? { startsAt: new Date(target.startMs).toISOString() } : {}),
      ...(columnChanged ? { dentistId: target.dentistId } : {})
    })
  }

  const pointer = usePointerDrag<ActiveDrag, DragPreview>({ project, commit })

  const begin = (mode: DragMode, appointment: Appointment, e: ReactPointerEvent<Element>) => {
    const x = e.clientX
    const y = e.clientY
    pointer.begin(e, () => {
      if (isBusy(appointment.id)) return null
      const lefts = columnLefts()
      const homeColumn = dentistIds.indexOf(appointment.dentistId)
      return {
        id: appointment.id,
        version: appointment.version,
        dentistId: appointment.dentistId,
        mode,
        anchorY: y,
        anchorColumn: columnAtX(x, lefts),
        homeColumn: homeColumn < 0 ? 0 : homeColumn,
        columnLefts: lefts,
        startMs: Date.parse(appointment.startsAt),
        endMs: Date.parse(appointment.endsAt)
      }
    })
  }

  return {
    preview: pointer.preview,
    startMove: (appointment: Appointment) => (e: ReactPointerEvent<Element>) =>
      begin("move", appointment, e),
    startResize: (appointment: Appointment) => (e: ReactPointerEvent<Element>) => {
      e.stopPropagation()
      begin("resize", appointment, e)
    },
    consumeDrag: pointer.consumeDrag
  }
}
