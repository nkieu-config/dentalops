import { PX_PER_MIN, snapCeil } from "./geometry"

export const DRAG_THRESHOLD_PX = 4

const MINUTE = 60_000
const SLOT_MS = 15 * MINUTE
const MIN_DURATION_MIN = 15
const MAX_DURATION_MIN = 480

const pxToMs = (px: number): number => (px / PX_PER_MIN) * MINUTE

const snapRound = (ms: number): number => Math.round(ms / SLOT_MS) * SLOT_MS

export const exceedsThreshold = (
  anchorX: number,
  anchorY: number,
  x: number,
  y: number
): boolean => Math.hypot(x - anchorX, y - anchorY) >= DRAG_THRESHOLD_PX

export interface MovePlanInput {
  anchorY: number
  currentY: number
  anchorColumn: number
  currentColumn: number
  startMs: number
}

export const planMove = ({
  anchorY,
  currentY,
  anchorColumn,
  currentColumn,
  startMs
}: MovePlanInput): { startMs: number; columnDelta: number } => ({
  startMs: startMs + snapRound(pxToMs(currentY - anchorY)),
  columnDelta: currentColumn - anchorColumn
})

export interface ResizePlanInput {
  anchorY: number
  currentY: number
  startMs: number
  endMs: number
}

export const planResize = ({
  anchorY,
  currentY,
  startMs,
  endMs
}: ResizePlanInput): { durationMin: number } => {
  const draggedEnd = snapCeil(endMs + pxToMs(currentY - anchorY))
  const minutes = Math.round((draggedEnd - startMs) / MINUTE)
  return { durationMin: Math.min(Math.max(minutes, MIN_DURATION_MIN), MAX_DURATION_MIN) }
}

export const columnAtX = (x: number, columnLefts: readonly number[]): number => {
  let index = 0
  for (let i = 0; i < columnLefts.length; i += 1) {
    const left = columnLefts[i]
    if (left !== undefined && x >= left) index = i
  }
  return index
}
