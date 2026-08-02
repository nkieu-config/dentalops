import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

interface Bench {
  label: string
  appointments: number
  p50: number
  p95: number
  p99: number
  mean: number
}

const METRICS = ["p50", "p95", "p99"] as const
type Metric = (typeof METRICS)[number]

const WIDTH = 720
const HEIGHT = 320
const PAD_LEFT = 56
const PAD_RIGHT = 24
const PAD_TOP = 56
const PAD_BOTTOM = 56
const GROUP_GAP = 28
const BAR_GAP = 10

const root = resolve(__dirname, "../../..")
const read = (name: string): Bench =>
  JSON.parse(readFileSync(resolve(root, "docs/benchmarks", name), "utf8")) as Bench

const before = read("before.json")
const after = read("after.json")

const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT
const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM
const groupWidth = (plotWidth - GROUP_GAP * (METRICS.length - 1)) / METRICS.length
const barWidth = (groupWidth - BAR_GAP) / 2

const peak = Math.max(...METRICS.map((m) => before[m]))
const ceiling = Math.ceil(peak)
const yOf = (value: number) => PAD_TOP + plotHeight - (value / ceiling) * plotHeight

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;")

const ticks = Array.from({ length: ceiling + 1 }, (_, i) => i)

const parts: string[] = []
parts.push(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" font-family="ui-sans-serif, system-ui, sans-serif" fill="currentColor" role="img" aria-label="Availability latency before and after caching">`
)
parts.push(
  `<text x="${PAD_LEFT}" y="26" font-size="15" font-weight="600">GET /availability latency — ${before.appointments.toLocaleString("en-US")} appointments</text>`
)
parts.push(
  `<text x="${PAD_LEFT}" y="44" font-size="12" opacity="0.7">milliseconds, lower is better · median of three runs · 512 timed requests each</text>`
)

for (const tick of ticks) {
  const y = yOf(tick)
  parts.push(
    `<line x1="${PAD_LEFT}" y1="${y}" x2="${WIDTH - PAD_RIGHT}" y2="${y}" stroke="currentColor" stroke-opacity="${tick === 0 ? 0.35 : 0.12}" stroke-width="1"/>`
  )
  parts.push(
    `<text x="${PAD_LEFT - 10}" y="${y + 4}" font-size="11" text-anchor="end" opacity="0.7">${tick}</text>`
  )
}

METRICS.forEach((metric: Metric, index) => {
  const groupX = PAD_LEFT + index * (groupWidth + GROUP_GAP)
  const bars = [
    { label: "before", value: before[metric], x: groupX, opacity: 0.35 },
    { label: "after", value: after[metric], x: groupX + barWidth + BAR_GAP, opacity: 0.9 }
  ]
  for (const bar of bars) {
    const y = yOf(bar.value)
    parts.push(
      `<rect x="${bar.x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${(PAD_TOP + plotHeight - y).toFixed(1)}" rx="3" fill="currentColor" fill-opacity="${bar.opacity}"/>`
    )
    parts.push(
      `<text x="${(bar.x + barWidth / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" font-size="11" text-anchor="middle" font-weight="600">${bar.value.toFixed(2)}</text>`
    )
  }
  const ratio = (before[metric] / after[metric]).toFixed(2)
  parts.push(
    `<text x="${(groupX + groupWidth / 2).toFixed(1)}" y="${HEIGHT - PAD_BOTTOM + 20}" font-size="13" text-anchor="middle" font-weight="600">${metric}</text>`
  )
  parts.push(
    `<text x="${(groupX + groupWidth / 2).toFixed(1)}" y="${HEIGHT - PAD_BOTTOM + 38}" font-size="11" text-anchor="middle" opacity="0.7">${ratio}× faster</text>`
  )
})

const legendY = 44
const legendX = WIDTH - PAD_RIGHT - 150
parts.push(
  `<rect x="${legendX}" y="${legendY - 9}" width="11" height="11" rx="2" fill="currentColor" fill-opacity="0.35"/>`
)
parts.push(`<text x="${legendX + 17}" y="${legendY}" font-size="11">${escape("before")}</text>`)
parts.push(
  `<rect x="${legendX + 72}" y="${legendY - 9}" width="11" height="11" rx="2" fill="currentColor" fill-opacity="0.9"/>`
)
parts.push(`<text x="${legendX + 89}" y="${legendY}" font-size="11">${escape("after")}</text>`)
parts.push("</svg>")

const out = resolve(root, "docs/benchmarks/comparison.svg")
writeFileSync(out, `${parts.join("\n")}\n`)
console.log(`wrote ${out}`)
for (const metric of METRICS) {
  console.log(`${metric}: ${before[metric]} -> ${after[metric]}`)
}
