import { RefObject, useEffect, useState } from "react"

export interface EdgeOverflow {
  start: boolean
  end: boolean
}

const NONE: EdgeOverflow = { start: false, end: false }

export const useHorizontalOverflow = (ref: RefObject<HTMLElement | null>): EdgeOverflow => {
  const [edges, setEdges] = useState<EdgeOverflow>(NONE)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let frame = 0
    const measure = () => {
      frame = 0
      const remaining = el.scrollWidth - el.clientWidth - el.scrollLeft
      setEdges((current) => {
        const start = el.scrollLeft > 1
        const end = remaining > 1
        return current.start === start && current.end === end ? current : { start, end }
      })
    }
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure)
    }
    measure()
    el.addEventListener("scroll", schedule, { passive: true })
    const observer = new ResizeObserver(schedule)
    observer.observe(el)
    for (const child of Array.from(el.children)) observer.observe(child)
    return () => {
      el.removeEventListener("scroll", schedule)
      observer.disconnect()
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [ref])

  return edges
}
