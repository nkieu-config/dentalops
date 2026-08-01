# W3 Availability Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The pure-TypeScript availability engine as a zero-dependency shared package (interval arithmetic, resource-unit pools, slot computation, recurrence expansion) with property-based tests, exposed through `GET /availability`, plus the latency recorder that W8's benchmark story depends on.

**Architecture:** Three-layer correctness means the engine is layer two — it must *predict* what layer three (the EXCLUDE constraints) will accept, never contradict it. The core consequence: a slot is chair-feasible only if **one single chair is free for the whole window** (`∃ unit`), not if "some chair is free at every instant" — a claim lives on one chair, so max-overlap counting would report slots the booking API then rejects. The engine works on plain `{start, end}` epoch-millisecond intervals, half-open `[)` to match the DB's `'[)'` ranges, and knows nothing about Prisma, Nest, or timezones — Bangkok's fixed UTC+7 (no DST since 1920) enters recurrence expansion as a plain `utcOffsetMin` parameter, which is what lets the package stay dependency-free and run in the browser in W6.

**Tech Stack:** New package `@dentalops/availability` (runtime deps: none; dev: vitest, fast-check, @vitest/coverage-v8). API side reuses everything already in the repo.

## Global Constraints

- Node >= 22, pnpm 10; plain `pnpm` — never `corepack enable` (EACCES on this machine)
- Prisma pinned `^6`; **no new migrations in W3** — the schema already has everything this week needs
- TypeScript strict; **no comments in any code file**
- Conventional commits; **no trailers of any kind**
- Never read, print, or commit any `.env`
- `@dentalops/availability` must have **zero runtime dependencies** and must not import from `@prisma/client`, `@nestjs/*`, or `zod`
- All intervals are half-open `[start, end)` in epoch milliseconds — boundary-touching intervals do NOT overlap, matching the DB
- Chair feasibility is `∃ single unit free for the whole window` — never overlap counting
- Dentist window is `[s, s + duration)`; chair window is `[s, s + duration + buffer)`; equipment window is `[s, s + duration)` — exactly mirroring `pickResources` in `apps/api/src/appointments/appointments.service.ts`
- Every new route MUST be added to `REGISTRY` in `apps/api/test/tenant-isolation.spec.ts` in the same task that creates it (both new routes here are `"auth-only"`)
- After any `pnpm install`, run `pnpm --filter @dentalops/api db:generate` — pnpm 10 blocks Prisma's postinstall, so installing re-links `@prisma/client` as an empty stub and `pnpm typecheck` fails with `Property 'tenant' does not exist on type 'PrismaService'` in files you never touched
- Do not reformat files you are not changing
- Full pipeline (`pnpm lint && pnpm typecheck && pnpm test && pnpm build`) before every push; push to `origin main`; report CI conclusion

---

### Task 1: Package scaffold + interval arithmetic

**Files:**
- Create: `packages/availability/package.json`, `packages/availability/tsconfig.json`, `packages/availability/vitest.config.ts`, `packages/availability/src/interval.ts`, `packages/availability/src/index.ts`
- Test: `packages/availability/test/interval.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Interval { start: number; end: number }` (epoch ms, half-open), `overlaps(a, b): boolean`, `intersect(a, b): Interval | null`, `normalize(list: Interval[]): Interval[]` (drop empties, sort, merge touching/overlapping), `subtract(base: Interval[], holes: Interval[]): Interval[]`, `intersectLists(a: Interval[], b: Interval[]): Interval[]`. Tasks 2–5 build on these exact names.

- [ ] **Step 1: Scaffold the package**

`packages/availability/package.json`:

```json
{
  "name": "@dentalops/availability",
  "version": "0.0.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "fast-check": "^4.0.0",
    "@vitest/coverage-v8": "^3.0.0"
  }
}
```

`packages/availability/tsconfig.json`:

```json
{
  "extends": "../config/tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "declaration": true,
    "outDir": "dist"
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/availability/tsconfig.build.json` — the build must emit `dist/index.js` because `package.json` `main` points there and Task 6 resolves the package through it. A single tsconfig whose `include` spans `src`, `test` and a root file makes tsc infer the package root as `rootDir`, emitting `dist/src/index.js` and shipping compiled tests — with exit code 0, so nothing looks wrong until the api cannot resolve the import. Same split as `apps/api`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "src"
  },
  "include": ["src"]
}
```

`packages/availability/vitest.config.ts` (coverage gate arrives in Task 5; config now so `pnpm test` works from day one):

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"]
  }
})
```

Run: `pnpm install`
Expected: lockfile gains the three dev deps; no runtime deps added.

- [ ] **Step 2: Write the failing tests**

`packages/availability/test/interval.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { intersect, intersectLists, normalize, overlaps, subtract } from "../src/interval"

const iv = (start: number, end: number) => ({ start, end })

describe("overlaps", () => {
  it("detects a plain overlap", () => {
    expect(overlaps(iv(0, 10), iv(5, 15))).toBe(true)
  })
  it("boundary touch is not an overlap (half-open)", () => {
    expect(overlaps(iv(0, 10), iv(10, 20))).toBe(false)
  })
  it("containment is an overlap", () => {
    expect(overlaps(iv(0, 100), iv(40, 60))).toBe(true)
  })
})

describe("intersect", () => {
  it("returns the common part", () => {
    expect(intersect(iv(0, 10), iv(5, 15))).toEqual(iv(5, 10))
  })
  it("returns null when disjoint or only touching", () => {
    expect(intersect(iv(0, 10), iv(10, 20))).toBeNull()
    expect(intersect(iv(0, 10), iv(20, 30))).toBeNull()
  })
})

describe("normalize", () => {
  it("drops empty and inverted intervals", () => {
    expect(normalize([iv(5, 5), iv(9, 3)])).toEqual([])
  })
  it("sorts and merges overlapping and touching intervals", () => {
    expect(normalize([iv(20, 30), iv(0, 10), iv(10, 15), iv(14, 22)])).toEqual([iv(0, 30)])
  })
  it("keeps genuinely separate intervals apart", () => {
    expect(normalize([iv(0, 10), iv(11, 20)])).toEqual([iv(0, 10), iv(11, 20)])
  })
})

describe("subtract", () => {
  it("cuts a hole in the middle", () => {
    expect(subtract([iv(0, 100)], [iv(40, 60)])).toEqual([iv(0, 40), iv(60, 100)])
  })
  it("boundary-touching holes remove nothing", () => {
    expect(subtract([iv(10, 20)], [iv(0, 10), iv(20, 30)])).toEqual([iv(10, 20)])
  })
  it("a covering hole removes everything", () => {
    expect(subtract([iv(10, 20)], [iv(0, 30)])).toEqual([])
  })
  it("handles multiple bases and multiple unsorted holes", () => {
    expect(subtract([iv(0, 10), iv(20, 30)], [iv(25, 26), iv(2, 4)])).toEqual([
      iv(0, 2),
      iv(4, 10),
      iv(20, 25),
      iv(26, 30)
    ])
  })
})

describe("intersectLists", () => {
  it("returns pairwise common parts, normalized", () => {
    expect(intersectLists([iv(0, 10), iv(20, 30)], [iv(5, 25)])).toEqual([iv(5, 10), iv(20, 25)])
  })
  it("returns empty for disjoint lists", () => {
    expect(intersectLists([iv(0, 10)], [iv(10, 20)])).toEqual([])
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @dentalops/availability test`
Expected: FAIL — module `../src/interval` not found.

- [ ] **Step 4: Implement**

`packages/availability/src/interval.ts`:

```ts
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
```

`packages/availability/src/index.ts`:

```ts
export * from "./interval"
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @dentalops/availability test`
Expected: PASS, all interval tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/availability pnpm-lock.yaml
git commit -m "feat(availability): package scaffold and interval arithmetic"
```

---

### Task 2: Resource unit pools

**Files:**
- Create: `packages/availability/src/pool.ts`
- Modify: `packages/availability/src/index.ts`
- Test: `packages/availability/test/pool.test.ts`

**Interfaces:**
- Consumes: `Interval`, `overlaps`, `normalize` from Task 1.
- Produces: `ResourceUnit { id: string; busy: Interval[] }`, `unitFree(unit: ResourceUnit, window: Interval): boolean`, `hasFreeUnit(units: ResourceUnit[], window: Interval): boolean`. Task 3's slot computation calls `hasFreeUnit` for chairs and each equipment pool.

- [ ] **Step 1: Write the failing tests**

`packages/availability/test/pool.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { hasFreeUnit, unitFree } from "../src/pool"

const iv = (start: number, end: number) => ({ start, end })

describe("unitFree", () => {
  it("free when nothing overlaps the window", () => {
    expect(unitFree({ id: "c1", busy: [iv(0, 10)] }, iv(10, 20))).toBe(true)
  })
  it("busy when any claim overlaps", () => {
    expect(unitFree({ id: "c1", busy: [iv(0, 11)] }, iv(10, 20))).toBe(false)
  })
})

describe("hasFreeUnit", () => {
  it("true when at least one unit is free for the whole window", () => {
    const units = [
      { id: "c1", busy: [iv(0, 30)] },
      { id: "c2", busy: [iv(40, 50)] }
    ]
    expect(hasFreeUnit(units, iv(0, 30))).toBe(true)
  })
  it("two partially free units cannot cover one window between them", () => {
    const units = [
      { id: "c1", busy: [iv(30, 60)] },
      { id: "c2", busy: [iv(0, 30)] }
    ]
    expect(hasFreeUnit(units, iv(0, 60))).toBe(false)
  })
  it("false for an empty pool", () => {
    expect(hasFreeUnit([], iv(0, 10))).toBe(false)
  })
})
```

The second `hasFreeUnit` test is the load-bearing one: at every instant of `[0, 60)` *some* chair is free, yet no single chair covers the window — overlap counting would say yes, the booking API would say no. This test pins the `∃ unit` semantics.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dentalops/availability test`
Expected: FAIL — module `../src/pool` not found.

- [ ] **Step 3: Implement**

`packages/availability/src/pool.ts`:

```ts
import { Interval, normalize, overlaps } from "./interval"

export interface ResourceUnit {
  id: string
  busy: Interval[]
}

export const unitFree = (unit: ResourceUnit, window: Interval): boolean =>
  !normalize(unit.busy).some((b) => overlaps(b, window))

export const hasFreeUnit = (units: ResourceUnit[], window: Interval): boolean =>
  units.some((u) => unitFree(u, window))
```

Append to `packages/availability/src/index.ts`:

```ts
export * from "./pool"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @dentalops/availability test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/availability
git commit -m "feat(availability): resource unit pools with whole-window semantics"
```

---

### Task 3: Slot computation

**Files:**
- Create: `packages/availability/src/slots.ts`
- Modify: `packages/availability/src/index.ts`
- Test: `packages/availability/test/slots.test.ts`

**Interfaces:**
- Consumes: `Interval`, `intersect`, `subtract` (Task 1), `ResourceUnit`, `hasFreeUnit` (Task 2).
- Produces:

```ts
interface StaffCalendar { staffId: string; shifts: Interval[]; busy: Interval[] }
interface SlotRequest {
  window: Interval
  stepMin: number
  durationMin: number
  bufferMin: number
  staff: StaffCalendar[]
  chairs: ResourceUnit[]
  equipmentPools: ResourceUnit[][]
}
interface Slot { staffId: string; start: number; end: number }
computeSlots(req: SlotRequest): Slot[]
```

`busy` is the union of confirmed appointments and time blocks — the caller concatenates them. `equipmentPools` holds one pool per required equipment type (empty array when the service needs none). Task 6's API service builds `SlotRequest` from Prisma rows; W6's browser engine will build it from fetched JSON — same function both sides.

- [ ] **Step 1: Write the failing tests**

`packages/availability/test/slots.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { computeSlots } from "../src/slots"

const M = 60_000
const H = 60 * M
const iv = (start: number, end: number) => ({ start, end })

const base = {
  window: iv(0, 8 * H),
  stepMin: 15,
  durationMin: 60,
  bufferMin: 10,
  chairs: [{ id: "c1", busy: [] }],
  equipmentPools: [] as { id: string; busy: { start: number; end: number }[] }[][]
}

describe("computeSlots", () => {
  it("an empty calendar yields every grid start that fits the shift", () => {
    const slots = computeSlots({
      ...base,
      staff: [{ staffId: "d1", shifts: [iv(0, 8 * H)], busy: [] }]
    })
    expect(slots).toHaveLength(29)
    expect(slots[0]).toEqual({ staffId: "d1", start: 0, end: H })
    expect(slots[slots.length - 1]).toEqual({ staffId: "d1", start: 7 * H, end: 8 * H })
    expect(slots.every((s) => s.start % (15 * M) === 0)).toBe(true)
  })

  it("aligns the first slot up to the 15-minute grid", () => {
    const slots = computeSlots({
      ...base,
      staff: [{ staffId: "d1", shifts: [iv(7 * M, 8 * H)], busy: [] }]
    })
    expect(slots[0]!.start).toBe(15 * M)
  })

  it("subtracts busy time with half-open boundaries", () => {
    const slots = computeSlots({
      ...base,
      staff: [{ staffId: "d1", shifts: [iv(0, 8 * H)], busy: [iv(H, 2 * H)] }]
    })
    const starts = slots.map((s) => s.start)
    expect(starts).toContain(0)
    expect(starts).not.toContain(15 * M)
    expect(starts).not.toContain(H)
    expect(starts).toContain(2 * H)
    expect(slots).toHaveLength(1 + 21)
  })

  it("blocks a slot when no single chair covers the buffered window", () => {
    const slots = computeSlots({
      ...base,
      staff: [{ staffId: "d1", shifts: [iv(0, 2 * H)], busy: [] }],
      chairs: [
        { id: "c1", busy: [iv(0, 30 * M), iv(60 * M, 90 * M)] },
        { id: "c2", busy: [iv(30 * M, 60 * M), iv(90 * M, 2 * H)] }
      ]
    })
    expect(slots).toHaveLength(0)
  })

  it("the chair window includes the buffer, the dentist window does not", () => {
    const slots = computeSlots({
      ...base,
      window: iv(0, 2 * H),
      staff: [{ staffId: "d1", shifts: [iv(0, 2 * H)], busy: [] }],
      chairs: [{ id: "c1", busy: [iv(65 * M, 2 * H)] }]
    })
    const starts = slots.map((s) => s.start)
    expect(starts).not.toContain(0)
  })

  it("requires a free unit in every equipment pool for the unbuffered window", () => {
    const slots = computeSlots({
      ...base,
      window: iv(0, 2 * H),
      staff: [{ staffId: "d1", shifts: [iv(0, 2 * H)], busy: [] }],
      equipmentPools: [[{ id: "x1", busy: [iv(0, H)] }]]
    })
    const starts = slots.map((s) => s.start)
    expect(starts).not.toContain(45 * M)
    expect(starts).toContain(H)
  })

  it("a shift entirely outside the window yields nothing", () => {
    const slots = computeSlots({
      ...base,
      window: iv(0, 2 * H),
      staff: [{ staffId: "d1", shifts: [iv(3 * H, 5 * H)], busy: [] }]
    })
    expect(slots).toHaveLength(0)
  })

  it("clips shifts to the query window and sorts across staff", () => {
    const slots = computeSlots({
      ...base,
      window: iv(H, 3 * H),
      staff: [
        { staffId: "d2", shifts: [iv(0, 8 * H)], busy: [] },
        { staffId: "d1", shifts: [iv(0, 8 * H)], busy: [] }
      ]
    })
    expect(slots[0]!.start).toBe(H)
    expect(slots[0]!.staffId).toBe("d1")
    expect(slots[1]!.staffId).toBe("d2")
    expect(slots[slots.length - 1]!.start).toBe(2 * H)
  })
})
```

The two chair busy-sets above are disjoint and their union is exactly the shift `[0, 2H)`, so at every instant precisely one chair is free — overlap counting would call all 5 grid starts bookable while `∃ unit` correctly returns none, since every 70-minute chair window straddles a handover. That gap between the two answers is the whole point of the rule.

Expectation notes baked into the tests: with a 60-min duration and 10-min buffer against a single free chair, start `0` needs the chair through `70 min` — a chair busy from `65 min` blocks it (buffer test). The equipment window is only 60 min, so equipment busy `[0, 1H)` frees start `1H` exactly (half-open).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dentalops/availability test`
Expected: FAIL — module `../src/slots` not found.

- [ ] **Step 3: Implement**

`packages/availability/src/slots.ts`:

```ts
import { Interval, intersect, subtract } from "./interval"
import { ResourceUnit, hasFreeUnit } from "./pool"

export interface StaffCalendar {
  staffId: string
  shifts: Interval[]
  busy: Interval[]
}

export interface SlotRequest {
  window: Interval
  stepMin: number
  durationMin: number
  bufferMin: number
  staff: StaffCalendar[]
  chairs: ResourceUnit[]
  equipmentPools: ResourceUnit[][]
}

export interface Slot {
  staffId: string
  start: number
  end: number
}

const MINUTE = 60_000

export const computeSlots = (req: SlotRequest): Slot[] => {
  const step = req.stepMin * MINUTE
  const duration = req.durationMin * MINUTE
  const buffer = req.bufferMin * MINUTE
  const slots: Slot[] = []
  for (const person of req.staff) {
    const onShift = person.shifts
      .map((s) => intersect(s, req.window))
      .filter((s): s is Interval => s !== null)
    for (const free of subtract(onShift, person.busy)) {
      const firstStart = Math.ceil(free.start / step) * step
      for (let start = firstStart; start + duration <= free.end; start += step) {
        const serviceWindow = { start, end: start + duration }
        const chairWindow = { start, end: start + duration + buffer }
        if (!hasFreeUnit(req.chairs, chairWindow)) continue
        if (!req.equipmentPools.every((pool) => hasFreeUnit(pool, serviceWindow))) continue
        slots.push({ staffId: person.staffId, start, end: serviceWindow.end })
      }
    }
  }
  return slots.sort((a, b) => a.start - b.start || a.staffId.localeCompare(b.staffId))
}
```

Append to `packages/availability/src/index.ts`:

```ts
export * from "./slots"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @dentalops/availability test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/availability
git commit -m "feat(availability): grid slot computation over staff and resource pools"
```

---

### Task 4: Recurrence expansion

**Files:**
- Create: `packages/availability/src/recurrence.ts`
- Modify: `packages/availability/src/index.ts`
- Test: `packages/availability/test/recurrence.test.ts`

**Interfaces:**
- Consumes: `Interval` from Task 1.
- Produces:

```ts
interface RecurrenceRule {
  freq: "weekly" | "monthly_date"
  interval: number
  byWeekday: number[]
  timeStartMin: number
  durationMin: number
  startsOn: string
  endsOn?: string
  count?: number
}
expandRecurrence(rule: RecurrenceRule, window: Interval, utcOffsetMin?: number): Interval[]
```

Locked semantics (W7's series API and nightly horizon job consume these — do not change them silently):
- **Weekday convention: `0 = Sunday … 6 = Saturday`**, evaluated in local time. The DB `by_weekday int[]` columns follow this same convention from W7 on.
- Weeks are anchored to the **Monday of the week containing `startsOn`**; `interval: 2` means every second week from that anchor.
- `monthly_date` uses `startsOn`'s day-of-month; months lacking that date (31st in Feb) are **skipped and do not consume `count`** — `count` counts occurrences that actually exist.
- `count` counts from the series start, not from the query window: occurrences before the window still consume it.
- `endsOn` is inclusive as a local calendar date.
- `startsOn` / `endsOn` are `YYYY-MM-DD` local dates; `timeStartMin` is minutes after local midnight; `utcOffsetMin` defaults to `420` (Asia/Bangkok, fixed offset — deliberately not a tz database; documented limitation for DST zones).
- Returned occurrences are those overlapping `window`, as absolute UTC intervals.

- [ ] **Step 1: Write the failing tests**

`packages/availability/test/recurrence.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { expandRecurrence } from "../src/recurrence"

const utc = (iso: string) => Date.parse(iso)
const wideWindow = { start: utc("2026-01-01T00:00:00Z"), end: utc("2027-01-01T00:00:00Z") }

describe("weekly", () => {
  const monWed = {
    freq: "weekly" as const,
    interval: 1,
    byWeekday: [1, 3],
    timeStartMin: 9 * 60,
    durationMin: 8 * 60,
    startsOn: "2026-08-03"
  }

  it("expands mon/wed at 09:00 Bangkok as 02:00 UTC", () => {
    const out = expandRecurrence(monWed, {
      start: utc("2026-08-03T00:00:00Z"),
      end: utc("2026-08-10T00:00:00Z")
    })
    expect(out).toEqual([
      { start: utc("2026-08-03T02:00:00Z"), end: utc("2026-08-03T10:00:00Z") },
      { start: utc("2026-08-05T02:00:00Z"), end: utc("2026-08-05T10:00:00Z") }
    ])
  })

  it("interval 2 skips the in-between week from the Monday anchor", () => {
    const out = expandRecurrence(
      { ...monWed, interval: 2, byWeekday: [1] },
      { start: utc("2026-08-03T00:00:00Z"), end: utc("2026-08-31T00:00:00Z") }
    )
    expect(out.map((o) => new Date(o.start).toISOString().slice(0, 10))).toEqual([
      "2026-08-03",
      "2026-08-17"
    ])
  })

  it("count is consumed by occurrences before the window", () => {
    const out = expandRecurrence({ ...monWed, byWeekday: [1], count: 3 }, {
      start: utc("2026-08-15T00:00:00Z"),
      end: utc("2026-09-30T00:00:00Z")
    })
    expect(out.map((o) => new Date(o.start).toISOString().slice(0, 10))).toEqual(["2026-08-17"])
  })

  it("endsOn is inclusive as a local date", () => {
    const out = expandRecurrence({ ...monWed, byWeekday: [1], endsOn: "2026-08-17" }, wideWindow)
    expect(out).toHaveLength(3)
  })

  it("a duration crossing local midnight stays a single interval", () => {
    const out = expandRecurrence(
      { ...monWed, byWeekday: [1], timeStartMin: 23 * 60 + 30, durationMin: 90, count: 1 },
      wideWindow
    )
    expect(out).toEqual([
      { start: utc("2026-08-03T16:30:00Z"), end: utc("2026-08-03T18:00:00Z") }
    ])
  })

  it("an occurrence straddling the window edge is included", () => {
    const out = expandRecurrence({ ...monWed, byWeekday: [1], count: 1 }, {
      start: utc("2026-08-03T09:59:00Z"),
      end: utc("2026-08-04T00:00:00Z")
    })
    expect(out).toHaveLength(1)
  })
})

describe("monthly_date", () => {
  it("skips short months without consuming count", () => {
    const out = expandRecurrence(
      {
        freq: "monthly_date",
        interval: 1,
        byWeekday: [],
        timeStartMin: 10 * 60,
        durationMin: 60,
        startsOn: "2026-01-31",
        count: 3
      },
      wideWindow
    )
    expect(out.map((o) => new Date(o.start).toISOString().slice(0, 10))).toEqual([
      "2026-01-31",
      "2026-03-31",
      "2026-05-31"
    ])
  })

  it("stops at an inclusive endsOn", () => {
    const out = expandRecurrence(
      {
        freq: "monthly_date",
        interval: 1,
        byWeekday: [],
        timeStartMin: 10 * 60,
        durationMin: 60,
        startsOn: "2026-01-15",
        endsOn: "2026-03-15"
      },
      wideWindow
    )
    expect(out.map((o) => new Date(o.start).toISOString().slice(0, 10))).toEqual([
      "2026-01-15",
      "2026-02-15",
      "2026-03-15"
    ])
  })

  it("respects the month interval", () => {
    const out = expandRecurrence(
      {
        freq: "monthly_date",
        interval: 3,
        byWeekday: [],
        timeStartMin: 10 * 60,
        durationMin: 60,
        startsOn: "2026-01-15",
        count: 3
      },
      wideWindow
    )
    expect(out.map((o) => new Date(o.start).toISOString().slice(0, 10))).toEqual([
      "2026-01-15",
      "2026-04-15",
      "2026-07-15"
    ])
  })
})
```

Date facts used above: 2026-08-03 is a Monday; Bangkok 09:00 = 02:00 UTC; Bangkok 23:30 = 16:30 UTC same date for that Monday.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dentalops/availability test`
Expected: FAIL — module `../src/recurrence` not found.

- [ ] **Step 3: Implement**

`packages/availability/src/recurrence.ts`:

```ts
import { Interval } from "./interval"

export interface RecurrenceRule {
  freq: "weekly" | "monthly_date"
  interval: number
  byWeekday: number[]
  timeStartMin: number
  durationMin: number
  startsOn: string
  endsOn?: string
  count?: number
}

const MINUTE = 60_000
const DAY = 86_400_000
const BANGKOK_OFFSET_MIN = 420

const localDayIndex = (isoDate: string): number => Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / DAY)

const weekdayOfDayIndex = (dayIndex: number): number => (((dayIndex + 4) % 7) + 7) % 7

const occurrenceAt = (
  dayIndex: number,
  rule: RecurrenceRule,
  offsetMs: number
): Interval => {
  const start = dayIndex * DAY - offsetMs + rule.timeStartMin * MINUTE
  return { start, end: start + rule.durationMin * MINUTE }
}

export const expandRecurrence = (
  rule: RecurrenceRule,
  window: Interval,
  utcOffsetMin: number = BANGKOK_OFFSET_MIN
): Interval[] => {
  const offsetMs = utcOffsetMin * MINUTE
  const startDay = localDayIndex(rule.startsOn)
  const lastDay = rule.endsOn ? localDayIndex(rule.endsOn) : Number.POSITIVE_INFINITY
  const maxCount = rule.count ?? Number.POSITIVE_INFINITY
  const out: Interval[] = []
  let made = 0

  if (rule.freq === "weekly") {
    const mondayAnchor = startDay - ((weekdayOfDayIndex(startDay) + 6) % 7)
    for (let day = startDay; day <= lastDay && made < maxCount; day++) {
      const occ = occurrenceAt(day, rule, offsetMs)
      if (occ.start >= window.end) break
      const weekIndex = Math.floor((day - mondayAnchor) / 7)
      if (weekIndex % rule.interval !== 0) continue
      if (!rule.byWeekday.includes(weekdayOfDayIndex(day))) continue
      made++
      if (occ.end > window.start) out.push(occ)
    }
    return out
  }

  const [y0, m0, d0] = rule.startsOn.split("-").map(Number) as [number, number, number]
  for (let k = 0; made < maxCount; k += rule.interval) {
    const monthIndex = m0 - 1 + k
    const year = y0 + Math.floor(monthIndex / 12)
    const month = monthIndex % 12
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    const probeDay = Math.floor(Date.UTC(year, month, Math.min(d0, daysInMonth)) / DAY)
    const probe = occurrenceAt(probeDay, rule, offsetMs)
    if (probe.start >= window.end) break
    if (probeDay > lastDay) break
    if (d0 > daysInMonth) continue
    made++
    if (probe.end > window.start) out.push(probe)
  }
  return out
}
```

Append to `packages/availability/src/index.ts`:

```ts
export * from "./recurrence"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @dentalops/availability test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/availability
git commit -m "feat(availability): recurrence expansion with fixed-offset local time"
```

---

### Task 5: Property-based tests + coverage gate

**Files:**
- Modify: `packages/availability/vitest.config.ts`
- Test: `packages/availability/test/properties.test.ts`
- Check: root `.gitignore` covers `coverage/` (add the line if absent)

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: the package's headline evidence — the algebraic partition law and the "reported free ⇒ actually bookable" invariant — plus a 100% coverage gate that CI enforces from now on.

- [ ] **Step 1: Write the property tests**

`packages/availability/test/properties.test.ts`:

```ts
import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { Interval, intersectLists, normalize, overlaps, subtract } from "../src/interval"
import { hasFreeUnit } from "../src/pool"
import { computeSlots } from "../src/slots"
import { expandRecurrence } from "../src/recurrence"

const M = 60_000

const arbInterval = fc
  .tuple(fc.integer({ min: 0, max: 400 }), fc.integer({ min: 1, max: 100 }))
  .map(([a, len]) => ({ start: a * M, end: (a + len) * M }))

const arbIntervalList = fc.array(arbInterval, { maxLength: 12 })

const measure = (list: Interval[]): number =>
  normalize(list).reduce((sum, i) => sum + (i.end - i.start), 0)

describe("interval algebra", () => {
  it("subtract and intersect partition the base: |A\\B| + |A∩B| = |A|", () => {
    fc.assert(
      fc.property(arbIntervalList, arbIntervalList, (a, b) => {
        expect(measure(subtract(a, b)) + measure(intersectLists(a, b))).toBe(measure(a))
      })
    )
  })

  it("subtract never overlaps a hole", () => {
    fc.assert(
      fc.property(arbIntervalList, arbIntervalList, (a, b) => {
        for (const piece of subtract(a, b)) {
          for (const hole of b) {
            expect(overlaps(piece, hole)).toBe(false)
          }
        }
      })
    )
  })

  it("normalize is idempotent and produces sorted disjoint intervals", () => {
    fc.assert(
      fc.property(arbIntervalList, (a) => {
        const once = normalize(a)
        expect(normalize(once)).toEqual(once)
        for (let i = 1; i < once.length; i++) {
          expect(once[i]!.start).toBeGreaterThan(once[i - 1]!.end)
        }
      })
    )
  })
})

describe("slot honesty", () => {
  const arbUnit = (name: string) =>
    fc
      .tuple(fc.integer({ min: 0, max: 9 }), arbIntervalList)
      .map(([n, busy]) => ({ id: `${name}${n}`, busy }))

  it("every reported slot lies in a shift, avoids busy, sits on the grid, and has a chair", () => {
    fc.assert(
      fc.property(
        arbIntervalList,
        arbIntervalList,
        fc.array(arbUnit("c"), { minLength: 1, maxLength: 3 }),
        fc.integer({ min: 1, max: 8 }).map((n) => n * 15),
        fc.integer({ min: 0, max: 2 }).map((n) => n * 5),
        (shifts, busy, chairs, durationMin, bufferMin) => {
          const window = { start: 0, end: 500 * M }
          const slots = computeSlots({
            window,
            stepMin: 15,
            durationMin,
            bufferMin,
            staff: [{ staffId: "d1", shifts, busy }],
            chairs,
            equipmentPools: []
          })
          for (const slot of slots) {
            expect(slot.end - slot.start).toBe(durationMin * M)
            expect(slot.start % (15 * M)).toBe(0)
            expect(
              normalize(shifts).some((s) => s.start <= slot.start && slot.end <= s.end)
            ).toBe(true)
            for (const b of busy) {
              expect(overlaps(slot, b)).toBe(false)
            }
            expect(
              hasFreeUnit(chairs, { start: slot.start, end: slot.end + bufferMin * M })
            ).toBe(true)
          }
        }
      )
    )
  })
})

describe("recurrence laws", () => {
  const arbWeeklyRule = fc.record({
    freq: fc.constant("weekly" as const),
    interval: fc.integer({ min: 1, max: 3 }),
    byWeekday: fc.uniqueArray(fc.integer({ min: 0, max: 6 }), { minLength: 1, maxLength: 4 }),
    timeStartMin: fc.integer({ min: 0, max: 95 }).map((n) => n * 15),
    durationMin: fc.integer({ min: 1, max: 32 }).map((n) => n * 15),
    startsOn: fc.integer({ min: 0, max: 364 }).map((d) =>
      new Date(Date.parse("2026-01-01T00:00:00Z") + d * 86_400_000).toISOString().slice(0, 10)
    ),
    count: fc.integer({ min: 1, max: 20 })
  })

  it("every occurrence falls on an allowed local weekday and count bounds the total", () => {
    fc.assert(
      fc.property(arbWeeklyRule, (rule) => {
        const window = { start: Date.parse("2026-01-01T00:00:00Z"), end: Date.parse("2028-01-01T00:00:00Z") }
        const out = expandRecurrence(rule, window)
        expect(out.length).toBeLessThanOrEqual(rule.count)
        for (const occ of out) {
          const localDay = Math.floor((occ.start + 420 * 60_000 - rule.timeStartMin * 60_000) / 86_400_000)
          expect(rule.byWeekday).toContain((((localDay + 4) % 7) + 7) % 7)
        }
      })
    )
  })
})
```

- [ ] **Step 2: Run and confirm the properties pass**

Run: `pnpm --filter @dentalops/availability test`
Expected: PASS. If a property fails, fast-check prints a shrunk counterexample — fix the engine, never weaken the property.

- [ ] **Step 3: Turn on the coverage gate**

Replace `packages/availability/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["src/**"],
      thresholds: { lines: 100, functions: 100, statements: 100, branches: 100 }
    }
  }
})
```

Run: `pnpm --filter @dentalops/availability test`
Expected: PASS with a coverage table showing 100/100/100/100 on `src/**`. If a branch is uncovered, add the missing unit test — do not lower a threshold without flagging it in the task report.

Check root `.gitignore` contains a `coverage/` line; append it if missing.

Two gaps the planned tests do not reach, so expect to add these: `src/index.ts` is inside `include: ["src/**"]` and needs a barrel test asserting the 9 exported names; and `recurrence.ts`'s `if (probe.start >= window.end) break` never fires while every monthly test is bounded by `count` or `endsOn` — add a `monthly_date` rule with neither, which is the guard that stops an unbounded rule looping forever.

- [ ] **Step 4: Commit**

```bash
git add packages/availability .gitignore
git commit -m "test(availability): property-based laws and full coverage gate"
```

---

### Task 6: Contracts + GET /availability + integration spec

**Files:**
- Create: `packages/contracts/src/availability.ts`, `apps/api/src/availability/availability.module.ts`, `apps/api/src/availability/availability.controller.ts`, `apps/api/src/availability/availability.service.ts`, `apps/api/src/availability/dto/query-availability.dto.ts`
- Modify: `packages/contracts/src/index.ts`, `apps/api/package.json` (add `"@dentalops/availability": "workspace:*"` to dependencies), `apps/api/src/app.module.ts`, `apps/api/test/tenant-isolation.spec.ts`
- Test: `apps/api/test/availability.spec.ts`

**Interfaces:**
- Consumes: `computeSlots`, `Interval`, `ResourceUnit` from the package; `prisma.scoped`; `AppException`; `createTestApp` / `expectStatus` helpers.
- Produces: `GET /availability?serviceId&branchId&from&to[&dentistId]` → `{ slots: [{ dentistId, startsAt, endsAt }] }` (ISO strings, sorted by start then dentist), any authenticated role. Error codes: `400 INVALID_RANGE`, `400 RANGE_TOO_LARGE` (> 31 days), `404 NOT_FOUND` (service). Contracts export `availabilitySlotSchema`, `availabilityResponseSchema`. W6's public availability route will reuse `AvailabilityService.slots` unchanged.

- [ ] **Step 1: Contracts schema**

`packages/contracts/src/availability.ts`:

```ts
import { z } from "zod"

export const availabilitySlotSchema = z.object({
  dentistId: z.uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime()
})

export const availabilityResponseSchema = z.object({
  slots: z.array(availabilitySlotSchema)
})

export type AvailabilitySlot = z.infer<typeof availabilitySlotSchema>
export type AvailabilityResponse = z.infer<typeof availabilityResponseSchema>
```

Add to `packages/contracts/src/index.ts`:

```ts
export * from "./availability"
```

(zod is `^4` in this repo — `z.uuid()` / `z.iso.datetime()` are the v4 forms.)

- [ ] **Step 2: DTO**

`apps/api/src/availability/dto/query-availability.dto.ts`:

```ts
import { IsISO8601, IsOptional, IsUUID } from "class-validator"

export class QueryAvailabilityDto {
  @IsUUID()
  serviceId!: string

  @IsUUID()
  branchId!: string

  @IsISO8601()
  from!: string

  @IsISO8601()
  to!: string

  @IsOptional()
  @IsUUID()
  dentistId?: string
}
```

- [ ] **Step 3: Service**

`apps/api/src/availability/availability.service.ts`:

```ts
import { Injectable } from "@nestjs/common"
import { Interval, ResourceUnit, computeSlots } from "@dentalops/availability"
import { AppException } from "../common/app.exception"
import { PrismaService } from "../prisma/prisma.service"
import { QueryAvailabilityDto } from "./dto/query-availability.dto"

const MINUTE = 60_000
const MAX_RANGE_MS = 31 * 24 * 60 * MINUTE

const toInterval = (row: { startsAt: Date; endsAt: Date }): Interval => ({
  start: row.startsAt.getTime(),
  end: row.endsAt.getTime()
})

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async slots(q: QueryAvailabilityDto) {
    const from = Date.parse(q.from)
    const to = Date.parse(q.to)
    if (to <= from) throw new AppException(400, "INVALID_RANGE", "to must be after from")
    if (to - from > MAX_RANGE_MS) {
      throw new AppException(400, "RANGE_TOO_LARGE", "Window must be 31 days or less")
    }

    const service = await this.prisma.scoped.service.findUnique({
      where: { id: q.serviceId },
      include: { requirements: true }
    })
    if (!service) throw new AppException(404, "NOT_FOUND", "Service not found")

    const dentists = await this.prisma.scoped.user.findMany({
      where: { role: "dentist", isActive: true, ...(q.dentistId ? { id: q.dentistId } : {}) }
    })
    const dentistIds = dentists.map((d) => d.id)
    const fromDate = new Date(from)
    const toDate = new Date(to)
    const chairHorizon = new Date(to + service.bufferMin * MINUTE)

    const [shifts, blocks, appointments, chairs, equipmentUnits] = await Promise.all([
      this.prisma.scoped.shift.findMany({
        where: {
          branchId: q.branchId,
          staffId: { in: dentistIds },
          startsAt: { lt: toDate },
          endsAt: { gt: fromDate }
        }
      }),
      this.prisma.scoped.timeBlock.findMany({
        where: {
          OR: [{ staffId: { in: dentistIds } }, { staffId: null, branchId: q.branchId }],
          startsAt: { lt: toDate },
          endsAt: { gt: fromDate }
        }
      }),
      this.prisma.scoped.appointment.findMany({
        where: {
          dentistId: { in: dentistIds },
          status: "confirmed",
          startsAt: { lt: toDate },
          endsAt: { gt: fromDate }
        }
      }),
      this.prisma.scoped.resource.findMany({
        where: { branchId: q.branchId, type: "chair", isActive: true },
        include: {
          claims: {
            where: { status: "active", startsAt: { lt: chairHorizon }, endsAt: { gt: fromDate } }
          }
        }
      }),
      this.prisma.scoped.resource.findMany({
        where: {
          branchId: q.branchId,
          type: "equipment",
          isActive: true,
          equipmentTypeId: { in: service.requirements.map((r) => r.equipmentTypeId) }
        },
        include: {
          claims: {
            where: { status: "active", startsAt: { lt: toDate }, endsAt: { gt: fromDate } }
          }
        }
      })
    ])

    const toUnit = (r: { id: string; claims: { startsAt: Date; endsAt: Date }[] }): ResourceUnit => ({
      id: r.id,
      busy: r.claims.map(toInterval)
    })

    const slots = computeSlots({
      window: { start: from, end: to },
      stepMin: 15,
      durationMin: service.durationMin,
      bufferMin: service.bufferMin,
      staff: dentists.map((d) => ({
        staffId: d.id,
        shifts: shifts.filter((s) => s.staffId === d.id).map(toInterval),
        busy: [
          ...appointments.filter((a) => a.dentistId === d.id).map(toInterval),
          ...blocks.filter((b) => b.staffId === d.id || b.staffId === null).map(toInterval)
        ]
      })),
      chairs: chairs.map(toUnit),
      equipmentPools: service.requirements.map((req) =>
        equipmentUnits.filter((u) => u.equipmentTypeId === req.equipmentTypeId).map(toUnit)
      )
    })

    return {
      slots: slots.map((s) => ({
        dentistId: s.staffId,
        startsAt: new Date(s.start).toISOString(),
        endsAt: new Date(s.end).toISOString()
      }))
    }
  }
}
```

- [ ] **Step 4: Controller + module + wiring**

`apps/api/src/availability/availability.controller.ts`:

```ts
import { Controller, Get, Query } from "@nestjs/common"
import { AvailabilityService } from "./availability.service"
import { QueryAvailabilityDto } from "./dto/query-availability.dto"

@Controller("availability")
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get()
  slots(@Query() query: QueryAvailabilityDto) {
    return this.availability.slots(query)
  }
}
```

`apps/api/src/availability/availability.module.ts`:

```ts
import { Module } from "@nestjs/common"
import { AvailabilityController } from "./availability.controller"
import { AvailabilityService } from "./availability.service"

@Module({
  controllers: [AvailabilityController],
  providers: [AvailabilityService]
})
export class AvailabilityModule {}
```

Add `AvailabilityModule` to the `imports` array in `apps/api/src/app.module.ts`. Add to `apps/api/package.json` dependencies: `"@dentalops/availability": "workspace:*"`, then `pnpm install`, then `pnpm --filter @dentalops/availability build` (jest resolves the package through `dist`; turbo handles this in CI via `dependsOn: ["^build"]`, the manual build is for local runs).

Add to `REGISTRY` in `apps/api/test/tenant-isolation.spec.ts`:

```ts
  "GET /availability": "auth-only",
```

- [ ] **Step 5: Integration spec**

`apps/api/test/availability.spec.ts`:

```ts
import { INestApplication } from "@nestjs/common"
import request from "supertest"
import type { Server } from "node:http"
import { availabilityResponseSchema } from "@dentalops/contracts"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

describe("availability", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let ownerToken: string
  let tenantId: string
  let branchId: string
  let serviceId: string
  let patientId: string
  const dentistIds: string[] = []
  const slug = `avail-test-${Date.now()}`

  const day1 = (h: number, m = 0) => new Date(Date.UTC(2027, 2, 1, h, m)).toISOString()
  const day2 = (h: number, m = 0) => new Date(Date.UTC(2027, 2, 2, h, m)).toISOString()

  const getSlots = async (from: string, to: string, dentistId?: string) => {
    const res = await request(server)
      .get("/availability")
      .set("Authorization", `Bearer ${ownerToken}`)
      .query({ serviceId, branchId, from, to, ...(dentistId ? { dentistId } : {}) })
    expectStatus(res, 200)
    return availabilityResponseSchema.parse(res.body).slots
  }

  const book = (dentistId: string, startsAt: string) =>
    request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ serviceId, dentistId, patientId, branchId, startsAt })

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)

    const signup = await request(server).post("/auth/signup").send({
      clinicName: "Availability Test Clinic",
      slug,
      email: "owner@availtest.local",
      password: "s3cure-pass",
      name: "Owner"
    })
    expectStatus(signup, 200)
    ownerToken = signup.body.accessToken

    const tenant = await prisma.tenant.findUnique({ where: { slug } })
    tenantId = tenant!.id
    const branch = await prisma.branch.findFirst({ where: { tenantId } })
    branchId = branch!.id

    const service = await prisma.service.create({
      data: { tenantId, name: "Avail Probe", durationMin: 60, bufferMin: 10 }
    })
    serviceId = service.id

    const patient = await prisma.patient.create({
      data: { tenantId, name: "Avail Patient", phone: "0899999999", email: "p@availtest.local" }
    })
    patientId = patient.id

    for (const n of [1, 2, 3, 4]) {
      const dentist = await prisma.user.create({
        data: {
          tenantId,
          email: `dentist${n}@availtest.local`,
          passwordHash: "x",
          name: `Dr. Avail ${n}`,
          role: "dentist"
        }
      })
      dentistIds.push(dentist.id)
      await prisma.shift.create({
        data: {
          tenantId,
          staffId: dentist.id,
          branchId,
          startsAt: new Date(day2(2)),
          endsAt: new Date(day2(10))
        }
      })
    }
    await prisma.shift.create({
      data: {
        tenantId,
        staffId: dentistIds[0]!,
        branchId,
        startsAt: new Date(day1(2)),
        endsAt: new Date(day1(10))
      }
    })
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } })
    await app.close()
  })

  it("an empty day yields the full 15-minute grid inside the shift", async () => {
    const slots = await getSlots(day1(0), day1(12), dentistIds[0])
    expect(slots).toHaveLength(29)
    expect(slots[0]!.startsAt).toBe(day1(2))
    expect(slots[slots.length - 1]!.startsAt).toBe(day1(9))
  })

  it("a booked appointment removes exactly the overlapping starts", async () => {
    const booked = await book(dentistIds[0]!, day1(3))
    expectStatus(booked, 201)
    const slots = await getSlots(day1(0), day1(12), dentistIds[0])
    const starts = slots.map((s) => s.startsAt)
    expect(slots).toHaveLength(22)
    expect(starts).toContain(day1(2))
    expect(starts).not.toContain(day1(2, 15))
    expect(starts).not.toContain(day1(3))
    expect(starts).not.toContain(day1(3, 45))
    expect(starts).toContain(day1(4))
  })

  it("three occupied chairs block a fourth dentist who is himself free", async () => {
    for (const d of dentistIds.slice(0, 3)) {
      expectStatus(await book(d, day2(5)), 201)
    }
    const slots = await getSlots(day2(0), day2(12), dentistIds[3])
    const starts = slots.map((s) => s.startsAt)
    expect(starts).toContain(day2(3, 45))
    expect(starts).not.toContain(day2(4))
    expect(starts).not.toContain(day2(5))
    expect(starts).not.toContain(day2(6))
    expect(starts).toContain(day2(6, 15))
  })

  it("a personal time block is subtracted", async () => {
    await prisma.timeBlock.create({
      data: {
        tenantId,
        staffId: dentistIds[3],
        reason: "leave",
        startsAt: new Date(day2(8)),
        endsAt: new Date(day2(9))
      }
    })
    const slots = await getSlots(day2(0), day2(12), dentistIds[3])
    const starts = slots.map((s) => s.startsAt)
    expect(starts).toContain(day2(7))
    expect(starts).not.toContain(day2(7, 15))
    expect(starts).not.toContain(day2(8, 45))
    expect(starts).toContain(day2(9))
  })

  it("a branch-wide block with no staffId hits every dentist", async () => {
    await prisma.timeBlock.create({
      data: {
        tenantId,
        branchId,
        reason: "closed",
        startsAt: new Date(day2(9)),
        endsAt: new Date(day2(10))
      }
    })
    const slots = await getSlots(day2(0), day2(12))
    const blockStart = Date.parse(day2(9))
    const blockEnd = Date.parse(day2(10))
    expect(slots.length).toBeGreaterThan(0)
    expect(
      slots.every(
        (s) => Date.parse(s.endsAt) <= blockStart || Date.parse(s.startsAt) >= blockEnd
      )
    ).toBe(true)
  })

  it("rejects an inverted range and a range over 31 days", async () => {
    const inverted = await request(server)
      .get("/availability")
      .set("Authorization", `Bearer ${ownerToken}`)
      .query({ serviceId, branchId, from: day1(12), to: day1(0) })
    expect(inverted.status).toBe(400)
    const huge = await request(server)
      .get("/availability")
      .set("Authorization", `Bearer ${ownerToken}`)
      .query({
        serviceId,
        branchId,
        from: day1(0),
        to: new Date(Date.UTC(2027, 3, 2)).toISOString()
      })
    expect(huge.status).toBe(400)
    expect(huge.body.errorCode).toBe("RANGE_TOO_LARGE")
  })

  it("an unknown service returns 404", async () => {
    const res = await request(server)
      .get("/availability")
      .set("Authorization", `Bearer ${ownerToken}`)
      .query({
        serviceId: "00000000-0000-4000-8000-000000000000",
        branchId,
        from: day1(0),
        to: day1(12)
      })
    expect(res.status).toBe(404)
  })

  describe("round-trip against the demo seed", () => {
    let demoToken: string
    let demoBranchId: string
    let demoServiceId: string
    let demoPatientId: string

    beforeAll(async () => {
      const demo = await request(server).post("/auth/demo-login").send({ role: "owner" })
      expectStatus(demo, 200)
      demoToken = demo.body.accessToken
      const tenant = await prisma.tenant.findUnique({ where: { slug: "demo-clinic" } })
      const branch = await prisma.branch.findFirst({ where: { tenantId: tenant!.id } })
      demoBranchId = branch!.id
      const withEquipment = await prisma.service.findFirst({
        where: { tenantId: tenant!.id, requirements: { some: {} } }
      })
      const anyService = withEquipment ?? (await prisma.service.findFirst({ where: { tenantId: tenant!.id } }))
      demoServiceId = anyService!.id
      const patient = await prisma.patient.findFirst({ where: { tenantId: tenant!.id } })
      demoPatientId = patient!.id
    })

    it("every sampled reported slot is actually bookable", async () => {
      const from = new Date(Date.now() + 24 * 3600_000).toISOString()
      const to = new Date(Date.now() + 72 * 3600_000).toISOString()
      const res = await request(server)
        .get("/availability")
        .set("Authorization", `Bearer ${demoToken}`)
        .query({ serviceId: demoServiceId, branchId: demoBranchId, from, to })
      expectStatus(res, 200)
      const slots = availabilityResponseSchema.parse(res.body).slots
      expect(slots.length).toBeGreaterThan(0)
      const samples = [
        slots[0]!,
        slots[Math.floor(slots.length / 2)]!,
        slots[slots.length - 1]!
      ]
      for (const slot of samples) {
        const booked = await request(server)
          .post("/appointments")
          .set("Authorization", `Bearer ${demoToken}`)
          .send({
            serviceId: demoServiceId,
            dentistId: slot.dentistId,
            patientId: demoPatientId,
            branchId: demoBranchId,
            startsAt: slot.startsAt
          })
        expectStatus(booked, 201)
      }
      const after = await request(server)
        .get("/availability")
        .set("Authorization", `Bearer ${demoToken}`)
        .query({ serviceId: demoServiceId, branchId: demoBranchId, from, to })
      expectStatus(after, 200)
      const remaining = availabilityResponseSchema.parse(after.body).slots
      for (const slot of samples) {
        expect(
          remaining.some((r) => r.dentistId === slot.dentistId && r.startsAt === slot.startsAt)
        ).toBe(false)
      }
    })
  })
})
```

Note on the middle sample: booking the first sample may invalidate later reported slots for the *same dentist and overlapping time*. Samples at first/middle/last of a 48-hour window are far apart in practice; if this ever flakes, the fix is to filter samples to pairwise non-overlapping `(dentistId, time)` before booking — flag it in the report if you need to do that.

- [ ] **Step 6: Run the suite**

Run: `pnpm --filter @dentalops/contracts build && pnpm --filter @dentalops/availability build && cd apps/api && pnpm test`
Expected: PASS — 16 suites (new `availability.spec.ts` included), tenant-isolation's route-discovery test passes because the registry gained the new route.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts packages/availability apps/api pnpm-lock.yaml
git commit -m "feat(api): availability endpoint backed by the shared engine"
```

---

### Task 7: Latency recording + internal endpoint + docs

**Files:**
- Create: `apps/api/src/common/latency.registry.ts`, `apps/api/src/common/latency.interceptor.ts`, `apps/api/src/common/latency.controller.ts`, `docs/availability.md`
- Modify: `apps/api/src/app.module.ts`, `apps/api/test/tenant-isolation.spec.ts`
- Test: `apps/api/test/latency.spec.ts`

**Interfaces:**
- Consumes: `RolesGuard` + `@Roles("owner")`, the global guard chain, `createTestApp`.
- Produces: every request's duration recorded per `METHOD /route/pattern` into an in-memory ring (last 512 per route, process-lifetime total count); `GET /internal/latency` (owner only) → `{ routes: [{ route, count, p50, p95, p99, max }] }` sorted by count desc. W8's benchmark reads these numbers before and after adding the Redis cache — this is the "before" recorder, so it ships now, not in W8.

- [ ] **Step 1: Registry**

`apps/api/src/common/latency.registry.ts`:

```ts
import { Injectable } from "@nestjs/common"

const RING_SIZE = 512

interface RouteStats {
  samples: number[]
  cursor: number
  count: number
}

const percentile = (sorted: number[], p: number): number =>
  sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0

@Injectable()
export class LatencyRegistry {
  private readonly routes = new Map<string, RouteStats>()

  record(route: string, ms: number) {
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

  summary() {
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
```

- [ ] **Step 2: Interceptor + controller**

`apps/api/src/common/latency.interceptor.ts`:

```ts
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common"
import type { Request } from "express"
import { Observable } from "rxjs"
import { finalize } from "rxjs/operators"
import { LatencyRegistry } from "./latency.registry"

@Injectable()
export class LatencyInterceptor implements NestInterceptor {
  constructor(private readonly registry: LatencyRegistry) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>()
    const route = `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}`
    const startedAt = performance.now()
    return next.handle().pipe(
      finalize(() => this.registry.record(route, performance.now() - startedAt))
    )
  }
}
```

`apps/api/src/common/latency.controller.ts`:

```ts
import { Controller, Get } from "@nestjs/common"
import { Roles } from "../auth/roles.decorator"
import { LatencyRegistry } from "./latency.registry"

@Controller("internal")
export class LatencyController {
  constructor(private readonly registry: LatencyRegistry) {}

  @Get("latency")
  @Roles("owner")
  latency() {
    return this.registry.summary()
  }
}
```

Wire into `apps/api/src/app.module.ts`: add `LatencyController` to `controllers`, and to `providers` add `LatencyRegistry` and `{ provide: APP_INTERCEPTOR, useClass: LatencyInterceptor }` (import `APP_INTERCEPTOR` from `@nestjs/core`). Check the exact import path/decorator name for `Roles` against `apps/api/src/auth` before writing the controller — mirror how existing controllers use it.

Add to `REGISTRY` in `apps/api/test/tenant-isolation.spec.ts`:

```ts
  "GET /internal/latency": "auth-only",
```

- [ ] **Step 3: Spec**

`apps/api/test/latency.spec.ts`:

```ts
import { INestApplication } from "@nestjs/common"
import request from "supertest"
import type { Server } from "node:http"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

describe("latency recording", () => {
  let app: INestApplication
  let server: Server
  let ownerToken: string
  let dentistToken: string

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    const owner = await request(server).post("/auth/demo-login").send({ role: "owner" })
    expectStatus(owner, 200)
    ownerToken = owner.body.accessToken
    const dentist = await request(server).post("/auth/demo-login").send({ role: "dentist" })
    expectStatus(dentist, 200)
    dentistToken = dentist.body.accessToken
  })

  afterAll(async () => {
    await app.close()
  })

  it("records per-route percentiles observable by the owner", async () => {
    for (let i = 0; i < 5; i++) {
      await request(server).get("/health").expect(200)
    }
    const res = await request(server)
      .get("/internal/latency")
      .set("Authorization", `Bearer ${ownerToken}`)
    expectStatus(res, 200)
    const health = (res.body.routes as Array<{ route: string; count: number; p50: number; p95: number }>).find(
      (r) => r.route.endsWith("/health")
    )
    expect(health).toBeDefined()
    expect(health!.count).toBeGreaterThanOrEqual(5)
    expect(health!.p50).toBeGreaterThanOrEqual(0)
    expect(health!.p95).toBeGreaterThanOrEqual(health!.p50)
  })

  it("is owner-only", async () => {
    await request(server)
      .get("/internal/latency")
      .set("Authorization", `Bearer ${dentistToken}`)
      .expect(403)
    await request(server).get("/internal/latency").expect(401)
  })
})
```

- [ ] **Step 4: Write `docs/availability.md`**

````markdown
# Availability

## Where the engine sits

Three layers answer "is this slot free?", and lower layers never trust upper ones:

1. **Client engine** (W6) — the same `@dentalops/availability` package running in the
   browser, for instant slot browsing.
2. **Server engine** — `GET /availability` runs `computeSlots` over Postgres rows.
   This is the authority the UI books against.
3. **EXCLUDE constraints** — the referee. If the engine is ever wrong, the booking
   transaction fails with 409 instead of double-booking.

`availability.spec.ts` closes the loop: it samples slots the API reports against the
431-appointment demo seed and books each one — a reported slot that the referee
rejects fails the suite.

## What a slot requires

A start time `s` (on the 15-minute grid) for a service of `duration` + `buffer`:

| Actor | Window | Rule |
|---|---|---|
| Dentist | `[s, s + duration)` | inside a shift, overlapping no confirmed appointment and no time block |
| Chair | `[s, s + duration + buffer)` | **one single chair** free for the whole window |
| Equipment | `[s, s + duration)` | per required type, one single unit free |

The chair outlives the appointment by `buffer` (cleaning), the dentist does not —
identical to the claim rows the booking API writes.

## Why "one single chair", not chair-counting

Chair 1 free 9:00–9:30 and chair 2 free 9:30–10:00 means *some* chair is free at
every instant of 9:00–10:00 — but an appointment lives on one chair, so the slot is
not bookable. Counting free chairs per instant (max-overlap) would report slots the
booking API then rejects with `RESOURCE_UNAVAILABLE`. The engine therefore asks
`∃ unit: free for the whole window`, mirroring `pickResources`. The unit test
"two partially free units cannot cover one window between them" pins this.

## Intervals

Half-open `[start, end)` epoch milliseconds everywhere — the same convention as the
database's `tstzrange(..., '[)')`. Back-to-back never conflicts, in the engine and
in the constraints, for the same reason.

## Time

The package is timezone-free: it computes on absolute epoch intervals. Recurrence
expansion is the one place local wall time exists, and it takes a fixed
`utcOffsetMin` (default 420 = Asia/Bangkok, which has had no DST since 1920).
A DST-observing deployment would need a real tz library — a documented,
deliberate simplification for a single-timezone product.

Recurrence semantics: weekdays are `0 = Sunday … 6 = Saturday` local; weeks anchor
on the Monday of the week containing `startsOn`; `monthly_date` skips months
without the date (Jan 31 → no Feb occurrence) without consuming `count`;
`count` counts from the series start; `endsOn` is inclusive.

## The API

`GET /availability?serviceId&branchId&from&to[&dentistId]` (any staff role) returns
`{ slots: [{ dentistId, startsAt, endsAt }] }`, sorted. Ranges over 31 days return
`400 RANGE_TOO_LARGE` — the public W6 route reuses this service, so the cap exists
before the endpoint is ever exposed unauthenticated. Time blocks with no `staffId`
are branch-wide closures and subtract from every dentist.

## Measured, then optimized

Every request's duration lands in an in-memory ring (last 512 per route);
`GET /internal/latency` (owner-only) reports p50/p95/p99/max per route. Availability
is computed live — no cache — until W8 measures it under the seeded load and adds
Redis caching with event-driven invalidation, quoting these numbers before and
after. Optimizing first would destroy the benchmark story.
````

- [ ] **Step 5: Full pipeline, push, CI**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all green — api suite now 17 suites (availability + latency added), availability package 100% coverage.

```bash
git add apps/api docs/availability.md
git commit -m "feat(api): per-route latency recording behind an owner-only endpoint"
git push origin main
```

Watch CI to conclusion and report the result.

---

## W3 exit criteria

- [ ] `@dentalops/availability` builds with zero runtime dependencies and 100% coverage enforced in CI
- [ ] The partition law `|A\B| + |A∩B| = |A|` and slot-honesty properties pass under fast-check
- [ ] The `∃ single unit` chair rule is pinned by a unit test and proven over HTTP by the 3-chairs/4-dentists spec
- [ ] Every sampled slot reported against the 431-appointment demo seed books with 201
- [ ] Time blocks (personal and branch-wide) subtract from availability
- [ ] Ranges over 31 days rejected with `RANGE_TOO_LARGE`
- [ ] Recurrence expansion semantics locked and documented for W7
- [ ] `GET /internal/latency` reports per-route p50/p95/p99 and is owner-only
- [ ] Both new routes classified in the isolation registry; CI green throughout
