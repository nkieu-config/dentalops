import { PointerEvent, useState } from "react"
import { exceedsThreshold } from "./lib/drag-plan"
import { snapCeil, snapFloor, yToMs } from "./lib/geometry"

export interface DragGhost {
  start: number
  end: number
}

interface DragAnchor {
  x: number
  y: number
  ms: number
}

interface DragCreateOptions {
  dayStart: number
  onSelect: (range: DragGhost) => void
}

const SLOT_MS = 15 * 60_000

export const useDragCreate = ({ dayStart, onSelect }: DragCreateOptions) => {
  const [anchor, setAnchor] = useState<DragAnchor | null>(null)
  const [ghost, setGhost] = useState<DragGhost | null>(null)

  const localY = (e: PointerEvent<HTMLDivElement>) =>
    e.clientY - e.currentTarget.getBoundingClientRect().top

  const rangeFrom = (anchorMs: number, currentMs: number): DragGhost => {
    const start = snapFloor(Math.min(anchorMs, currentMs))
    const end = Math.max(snapCeil(Math.max(anchorMs, currentMs)), start + SLOT_MS)
    return { start, end }
  }

  const overlayProps = {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
      const ms = yToMs(localY(e), dayStart)
      setAnchor({ x: e.clientX, y: e.clientY, ms })
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      if (anchor === null) return
      if (!exceedsThreshold(anchor.x, anchor.y, e.clientX, e.clientY)) return
      setGhost(rangeFrom(anchor.ms, yToMs(localY(e), dayStart)))
    },
    onPointerUp: () => {
      if (ghost) onSelect(ghost)
      setAnchor(null)
      setGhost(null)
    },
    onPointerCancel: () => {
      setAnchor(null)
      setGhost(null)
    }
  }

  return { overlayProps, ghost }
}
