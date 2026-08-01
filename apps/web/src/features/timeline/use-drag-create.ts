import { PointerEvent, useState } from "react"
import { snapCeil, snapFloor, yToMs } from "./lib/geometry"

export interface DragGhost {
  start: number
  end: number
}

interface DragCreateOptions {
  dayStart: number
  onSelect: (range: DragGhost) => void
}

const SLOT_MS = 15 * 60_000

export const useDragCreate = ({ dayStart, onSelect }: DragCreateOptions) => {
  const [anchor, setAnchor] = useState<number | null>(null)
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
      setAnchor(ms)
      setGhost(rangeFrom(ms, ms))
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      if (anchor === null) return
      setGhost(rangeFrom(anchor, yToMs(localY(e), dayStart)))
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
