export type Viewport = "sm" | "md" | "lg"

const WIDTHS: Record<Viewport, number> = { sm: 375, md: 768, lg: 1440 }

const DEFAULT_VIEWPORT: Viewport = "lg"

const listeners = new Set<() => void>()

let width = WIDTHS[DEFAULT_VIEWPORT]

export const setViewport = (mode: Viewport): void => {
  width = WIDTHS[mode]
  for (const listener of [...listeners]) listener()
}

export const resetViewport = (): void => setViewport(DEFAULT_VIEWPORT)

export const subscribeViewport = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const CLAUSE = /\((min|max)-width:\s*(\d+(?:\.\d+)?)px\)/g

export const matchesViewport = (query: string): boolean => {
  const clauses = [...query.matchAll(CLAUSE)]
  if (clauses.length === 0) return false
  return clauses.every((clause) => {
    const bound = Number(clause[2])
    return clause[1] === "min" ? width >= bound : width <= bound
  })
}
