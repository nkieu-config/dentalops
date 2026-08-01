import { RefObject, useEffect, useState } from "react"

export interface VisibleRange {
  top: number
  bottom: number
}

const OVERSCAN = 200

export const useVisibleRange = (ref: RefObject<HTMLElement | null>): VisibleRange => {
  const [range, setRange] = useState<VisibleRange>({ top: 0, bottom: 2000 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let frame = 0
    const measure = () => {
      frame = 0
      setRange({
        top: el.scrollTop - OVERSCAN,
        bottom: el.scrollTop + (el.clientHeight || 1600) + OVERSCAN
      })
    }
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure)
    }
    measure()
    el.addEventListener("scroll", schedule, { passive: true })
    const observer = new ResizeObserver(schedule)
    observer.observe(el)
    return () => {
      el.removeEventListener("scroll", schedule)
      observer.disconnect()
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [ref])

  return range
}
