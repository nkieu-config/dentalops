import type { Appointment } from "@dentalops/contracts"
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { columnAtX, exceedsThreshold, planMove, planResize } from "./lib/drag-plan"

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
  anchorX: number
  anchorY: number
  anchorColumn: number
  homeColumn: number
  columnLefts: readonly number[]
  startMs: number
  endMs: number
  moved: boolean
}

const clamp = (value: number, max: number): number => Math.min(Math.max(value, 0), max)

export const useDragMove = ({ dentistIds, columnLefts, isBusy, onDrop }: DragMoveOptions) => {
  const [preview, setPreview] = useState<DragPreview | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const active = useRef<ActiveDrag | null>(null)
  const previewRef = useRef<DragPreview | null>(null)
  const dragged = useRef(false)
  const latest = useRef({ dentistIds, onDrop })
  latest.current = { dentistIds, onDrop }

  const begin = (mode: DragMode, appointment: Appointment, e: ReactPointerEvent<Element>) => {
    dragged.current = false
    if (e.button !== 0 || isBusy(appointment.id)) return
    const lefts = columnLefts()
    const homeColumn = dentistIds.indexOf(appointment.dentistId)
    active.current = {
      id: appointment.id,
      version: appointment.version,
      dentistId: appointment.dentistId,
      mode,
      anchorX: e.clientX,
      anchorY: e.clientY,
      anchorColumn: columnAtX(e.clientX, lefts),
      homeColumn: homeColumn < 0 ? 0 : homeColumn,
      columnLefts: lefts,
      startMs: Date.parse(appointment.startsAt),
      endMs: Date.parse(appointment.endsAt),
      moved: false
    }
    setDragId(appointment.id)
  }

  useEffect(() => {
    if (dragId === null) return

    const clear = () => {
      active.current = null
      previewRef.current = null
      setPreview(null)
      setDragId(null)
    }

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

    const onPointerMove = (e: PointerEvent) => {
      const drag = active.current
      if (!drag) return
      if (!drag.moved && !exceedsThreshold(drag.anchorX, drag.anchorY, e.clientX, e.clientY)) return
      drag.moved = true
      dragged.current = true
      const next = project(drag, e.clientX, e.clientY)
      previewRef.current = next
      setPreview(next)
    }

    const onPointerUp = () => {
      const drag = active.current
      const target = previewRef.current
      clear()
      if (!drag || !drag.moved || !target) return
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

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") clear()
    }

    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    window.addEventListener("pointercancel", clear)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
      window.removeEventListener("pointercancel", clear)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [dragId])

  return {
    preview,
    startMove: (appointment: Appointment) => (e: ReactPointerEvent<Element>) =>
      begin("move", appointment, e),
    startResize: (appointment: Appointment) => (e: ReactPointerEvent<Element>) => {
      e.stopPropagation()
      begin("resize", appointment, e)
    },
    consumeDrag: () => {
      const value = dragged.current
      dragged.current = false
      return value
    }
  }
}
