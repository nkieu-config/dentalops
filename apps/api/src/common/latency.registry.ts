import { Injectable } from "@nestjs/common"

const RING_SIZE = 512

interface RouteStats {
  samples: number[]
  cursor: number
  count: number
}

export interface RouteLatency {
  route: string
  count: number
  p50: number
  p95: number
  p99: number
  max: number
}

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, index)] ?? 0
}

@Injectable()
export class LatencyRegistry {
  private readonly routes = new Map<string, RouteStats>()

  record(route: string, ms: number): void {
    let stats = this.routes.get(route)
    if (!stats) {
      stats = { samples: [], cursor: 0, count: 0 }
      this.routes.set(route, stats)
    }
    if (stats.samples.length < RING_SIZE) {
      stats.samples.push(ms)
    } else {
      stats.samples[stats.cursor] = ms
      stats.cursor = (stats.cursor + 1) % RING_SIZE
    }
    stats.count++
  }

  summary(): { routes: RouteLatency[] } {
    const routes = [...this.routes.entries()].map(([route, stats]) => {
      const sorted = [...stats.samples].sort((a, b) => a - b)
      return {
        route,
        count: stats.count,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
        max: sorted[sorted.length - 1] ?? 0
      }
    })
    return { routes: routes.sort((a, b) => b.count - a.count) }
  }
}
