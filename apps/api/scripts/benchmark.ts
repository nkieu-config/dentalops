import { mkdirSync, writeFileSync } from "node:fs"
import { arch, cpus, platform, release, totalmem } from "node:os"
import { isAbsolute, resolve } from "node:path"

const DAY_MS = 24 * 60 * 60 * 1000
const COUNT_HORIZON_DAYS = 70
const ANCHOR_WEEKDAY = 2

const BASE_URL = (process.env.BENCH_BASE_URL ?? "http://localhost:3001").replace(/\/+$/, "")
const API = `${BASE_URL}/api/v1`
const LABEL = process.env.BENCH_LABEL ?? "before"
const ROLE = process.env.BENCH_ROLE ?? "owner"
const WARMUP = Number(process.env.BENCH_WARMUP ?? 32)
const RUNS = Number(process.env.BENCH_RUNS ?? 512)
const OUT = process.env.BENCH_OUT
const DEFAULT_OUT_DIR = resolve(__dirname, "../../../docs/benchmarks")

const PLAIN_SERVICE = process.env.BENCH_SERVICE ?? "Cleaning"
const EQUIPMENT_SERVICE = process.env.BENCH_EQUIPMENT_SERVICE ?? "Root canal"

interface Named {
  id: string
  name: string
}

interface ServiceRow extends Named {
  durationMin: number
  bufferMin: number
}

interface AppointmentRow {
  startsAt: string
  createdAt: string
}

interface LatencyRow {
  route: string
  count: number
  p50: number
  p95: number
  p99: number
  max: number
}

interface Shape {
  name: string
  serviceId: string
  serviceName: string
  branchId: string
  dentistId?: string
  fromDay: number
  toDay: number
  url: string
}

interface Sample {
  shape: number
  ms: number
  bytes: number
  slots: number
}

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, index)] ?? 0
}

const round = (n: number) => Math.round(n * 1000) / 1000

const byName = (a: Named, b: Named) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status} ${await res.text()}`)
  return (await res.json()) as T
}

async function getJson<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${await res.text()}`)
  return (await res.json()) as T
}

function requireByName<T extends Named>(rows: T[], name: string, kind: string): T {
  const found = rows.find((r) => r.name === name)
  if (!found) {
    throw new Error(`${kind} "${name}" not found. Reseed with pnpm --filter @dentalops/api db:seed`)
  }
  return found
}

function buildShapes(branch: Named, dentist: Named, plain: ServiceRow, equipment: ServiceRow) {
  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const anchor = today + ((ANCHOR_WEEKDAY - new Date(today).getUTCDay() + 7) % 7) * DAY_MS
  const iso = (day: number) => new Date(anchor + day * DAY_MS).toISOString()

  const specs = [
    { name: "day", service: plain, fromDay: 0, toDay: 1, dentist: false },
    { name: "week", service: plain, fromDay: 0, toDay: 7, dentist: false },
    { name: "week-one-dentist", service: plain, fromDay: 0, toDay: 7, dentist: true },
    { name: "week-equipment", service: equipment, fromDay: 0, toDay: 7, dentist: false }
  ]

  const shapes: Shape[] = specs.map((spec) => {
    const params = new URLSearchParams({
      serviceId: spec.service.id,
      branchId: branch.id,
      from: iso(spec.fromDay),
      to: iso(spec.toDay)
    })
    if (spec.dentist) params.set("dentistId", dentist.id)
    return {
      name: spec.name,
      serviceId: spec.service.id,
      serviceName: spec.service.name,
      branchId: branch.id,
      dentistId: spec.dentist ? dentist.id : undefined,
      fromDay: spec.fromDay,
      toDay: spec.toDay,
      url: `${API}/availability?${params.toString()}`
    }
  })

  return { anchor: new Date(anchor).toISOString(), shapes }
}

async function timeOne(shape: Shape, index: number, token: string): Promise<Sample> {
  const startedAt = performance.now()
  const res = await fetch(shape.url, { headers: { authorization: `Bearer ${token}` } })
  const text = await res.text()
  const ms = performance.now() - startedAt

  if (res.status !== 200) throw new Error(`${shape.name} -> ${res.status} ${text}`)
  const body = JSON.parse(text) as { slots?: unknown }
  if (!Array.isArray(body.slots)) throw new Error(`${shape.name} returned no slots array`)
  return { shape: index, ms, bytes: Buffer.byteLength(text), slots: body.slots.length }
}

function summarise(samples: Sample[]) {
  const sorted = samples.map((s) => s.ms).sort((a, b) => a - b)
  const total = sorted.reduce((sum, ms) => sum + ms, 0)
  return {
    count: sorted.length,
    p50: round(percentile(sorted, 50)),
    p95: round(percentile(sorted, 95)),
    p99: round(percentile(sorted, 99)),
    min: round(sorted[0] ?? 0),
    max: round(sorted[sorted.length - 1] ?? 0),
    mean: round(total / Math.max(1, sorted.length))
  }
}

async function main() {
  if (RUNS % 4 !== 0) throw new Error("BENCH_RUNS must be a multiple of the 4 workload shapes")

  const token =
    process.env.BENCH_TOKEN ??
    (await postJson<{ accessToken: string }>("/auth/demo-login", { role: ROLE })).accessToken

  const [branches, services, dentists] = await Promise.all([
    getJson<Named[]>("/branches", token),
    getJson<ServiceRow[]>("/services", token),
    getJson<Named[]>("/staff?role=dentist", token)
  ])

  const branch = [...branches].sort(byName)[0]
  const dentist = [...dentists].sort(byName)[0]
  if (!branch || !dentist) throw new Error("Demo tenant has no branches or no dentists")
  const plain = requireByName([...services].sort(byName), PLAIN_SERVICE, "Service")
  const equipment = requireByName([...services].sort(byName), EQUIPMENT_SERVICE, "Service")

  const now = Date.now()
  const rows = await getJson<AppointmentRow[]>(
    `/appointments?from=${new Date(now - COUNT_HORIZON_DAYS * DAY_MS).toISOString()}&to=${new Date(
      now + COUNT_HORIZON_DAYS * DAY_MS
    ).toISOString()}`,
    token
  )
  if (rows.length === 0) throw new Error("No seeded appointments visible to the API")
  const startTimes = rows.map((r) => Date.parse(r.startsAt)).sort((a, b) => a - b)
  const seededAt = new Date(
    Math.max(...rows.map((r) => Date.parse(r.createdAt)))
  ).toISOString()

  const { anchor, shapes } = buildShapes(branch, dentist, plain, equipment)

  const probes: Sample[] = []
  for (const [index, shape] of shapes.entries()) {
    const probe = await timeOne(shape, index, token)
    if (probe.slots === 0) {
      throw new Error(
        `Workload shape "${shape.name}" returned 0 slots — the benchmark would be measuring an empty answer`
      )
    }
    probes.push(probe)
  }

  for (let i = 0; i < WARMUP; i++) {
    await timeOne(shapes[i % shapes.length] as Shape, i % shapes.length, token)
  }

  const samples: Sample[] = []
  for (let i = 0; i < RUNS; i++) {
    const index = i % shapes.length
    samples.push(await timeOne(shapes[index] as Shape, index, token))
  }

  const latency = await getJson<{ routes: LatencyRow[] }>("/internal/latency", token)
  const serverRoute = latency.routes.find((r) => r.route.endsWith("/availability"))

  const overall = summarise(samples)
  const byShape = shapes.map((shape, index) => {
    const own = samples.filter((s) => s.shape === index)
    const stats = summarise(own)
    return {
      name: shape.name,
      service: shape.serviceName,
      windowDays: shape.toDay - shape.fromDay,
      dentistFilter: shape.dentistId !== undefined,
      slots: probes[index]?.slots ?? 0,
      bytes: probes[index]?.bytes ?? 0,
      count: stats.count,
      p50: stats.p50,
      p95: stats.p95,
      max: stats.max
    }
  })

  const report = {
    label: LABEL,
    startedAt: new Date().toISOString(),
    seededAt,
    route: "GET /api/v1/availability",
    appointments: rows.length,
    horizon: {
      from: new Date(startTimes[0] as number).toISOString(),
      to: new Date(startTimes[startTimes.length - 1] as number).toISOString()
    },
    runs: overall.count,
    warmup: WARMUP,
    concurrency: 1,
    p50: overall.p50,
    p95: overall.p95,
    p99: overall.p99,
    min: overall.min,
    max: overall.max,
    mean: overall.mean,
    byShape,
    serverLatency: serverRoute
      ? {
          route: serverRoute.route,
          count: serverRoute.count,
          p50: round(serverRoute.p50),
          p95: round(serverRoute.p95),
          p99: round(serverRoute.p99),
          max: round(serverRoute.max)
        }
      : null,
    workload: {
      baseUrl: BASE_URL,
      anchorUtc: anchor,
      branch: branch.name,
      dentist: dentist.name,
      shapes: shapes.map((s) => ({
        name: s.name,
        service: s.serviceName,
        fromDay: s.fromDay,
        toDay: s.toDay,
        dentistFilter: s.dentistId !== undefined
      }))
    },
    machine: {
      node: process.version,
      platform: `${platform()} ${release()}`,
      arch: arch(),
      cpu: cpus()[0]?.model ?? "unknown",
      cores: cpus().length,
      memGb: Math.round(totalmem() / 1024 ** 3)
    }
  }

  const outPath = OUT
    ? isAbsolute(OUT)
      ? OUT
      : resolve(process.cwd(), OUT)
    : resolve(DEFAULT_OUT_DIR, `${LABEL}.json`)
  mkdirSync(resolve(outPath, ".."), { recursive: true })
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`)

  console.log(`label=${LABEL} appointments=${report.appointments} runs=${report.runs}`)
  console.log(
    `client p50=${report.p50}ms p95=${report.p95}ms p99=${report.p99}ms max=${report.max}ms mean=${report.mean}ms`
  )
  if (report.serverLatency) {
    const s = report.serverLatency
    console.log(`server p50=${s.p50}ms p95=${s.p95}ms p99=${s.p99}ms max=${s.max}ms n=${s.count}`)
  } else {
    console.log("server latency unavailable (needs an owner token)")
  }
  for (const shape of report.byShape) {
    console.log(
      `  ${shape.name.padEnd(18)} n=${shape.count} p50=${shape.p50}ms p95=${shape.p95}ms slots=${shape.slots} bytes=${shape.bytes}`
    )
  }
  console.log(`wrote ${outPath}`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
