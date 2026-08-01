export interface Interval {
  start: number
  end: number
}

export const overlaps = (a: Interval, b: Interval): boolean => a.start < b.end && b.start < a.end

export const intersect = (a: Interval, b: Interval): Interval | null => {
  const start = Math.max(a.start, b.start)
  const end = Math.min(a.end, b.end)
  return end > start ? { start, end } : null
}

export const normalize = (list: Interval[]): Interval[] => {
  const sorted = list
    .filter((i) => i.end > i.start)
    .map((i) => ({ ...i }))
    .sort((a, b) => a.start - b.start)
  const merged: Interval[] = []
  for (const current of sorted) {
    const last = merged[merged.length - 1]
    if (last && current.start <= last.end) {
      last.end = Math.max(last.end, current.end)
    } else {
      merged.push(current)
    }
  }
  return merged
}

export const subtract = (base: Interval[], holes: Interval[]): Interval[] => {
  const cuts = normalize(holes)
  const result: Interval[] = []
  for (const b of normalize(base)) {
    let cursor = b.start
    for (const h of cuts) {
      if (h.end <= cursor) continue
      if (h.start >= b.end) break
      if (h.start > cursor) result.push({ start: cursor, end: h.start })
      cursor = Math.max(cursor, h.end)
      if (cursor >= b.end) break
    }
    if (cursor < b.end) result.push({ start: cursor, end: b.end })
  }
  return result
}

export const intersectLists = (a: Interval[], b: Interval[]): Interval[] => {
  const out: Interval[] = []
  for (const x of normalize(a)) {
    for (const y of normalize(b)) {
      const common = intersect(x, y)
      if (common) out.push(common)
    }
  }
  return normalize(out)
}
