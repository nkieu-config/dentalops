import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { exceedsThreshold } from "./lib/drag-plan"

interface PointerDragOptions<TDrag, TPreview> {
  project: (drag: TDrag, x: number, y: number) => TPreview
  commit: (drag: TDrag, preview: TPreview) => void
}

interface Anchored<TDrag> {
  drag: TDrag
  anchorX: number
  anchorY: number
  moved: boolean
}

export const usePointerDrag = <TDrag, TPreview>({
  project,
  commit
}: PointerDragOptions<TDrag, TPreview>) => {
  const [preview, setPreview] = useState<TPreview | null>(null)
  const [session, setSession] = useState<number | null>(null)
  const sessions = useRef(0)
  const active = useRef<Anchored<TDrag> | null>(null)
  const previewRef = useRef<TPreview | null>(null)
  const dragged = useRef(false)
  const latest = useRef({ project, commit })
  latest.current = { project, commit }

  const begin = (e: ReactPointerEvent<Element>, create: () => TDrag | null) => {
    dragged.current = false
    if (e.button !== 0) return
    const drag = create()
    if (drag === null) return
    active.current = { drag, anchorX: e.clientX, anchorY: e.clientY, moved: false }
    sessions.current += 1
    setSession(sessions.current)
  }

  useEffect(() => {
    if (session === null) return

    const clear = () => {
      active.current = null
      previewRef.current = null
      setPreview(null)
      setSession(null)
    }

    const onPointerMove = (e: PointerEvent) => {
      const current = active.current
      if (!current) return
      if (
        !current.moved &&
        !exceedsThreshold(current.anchorX, current.anchorY, e.clientX, e.clientY)
      ) {
        return
      }
      current.moved = true
      dragged.current = true
      const next = latest.current.project(current.drag, e.clientX, e.clientY)
      previewRef.current = next
      setPreview(next)
    }

    const onPointerUp = () => {
      const current = active.current
      const target = previewRef.current
      clear()
      if (!current || !current.moved || target === null) return
      latest.current.commit(current.drag, target)
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
  }, [session])

  return {
    preview,
    begin,
    consumeDrag: () => {
      const value = dragged.current
      dragged.current = false
      return value
    }
  }
}
