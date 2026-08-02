# W8 Measure → Optimize → Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn "it feels fast" into a number, then earn the number back. Benchmark `GET /availability` against a heavier seed, add a Redis cache with event-driven invalidation, re-benchmark, and commit both runs plus a generated chart. Then the polish that makes the project presentable: automated accessibility gates, Lighthouse ≥ 90 on the public booking page, a demo-reset job, a Sentry review, and a README a stranger can read in three minutes.

**Architecture:** The order is the point — the benchmark exists *before* the cache, because a before/after with a committed methodology is the strongest single artifact in this repo and it is unobtainable once you have optimised first. The cache design avoids the two traps that make cache invalidation infamous here: keys are versioned rather than pattern-deleted (`availver:{tenant}:{branch}:{date}` is `INCR`ed on any change, and the version is part of the cache key, so invalidation is O(1) with no `SCAN` and stale entries expire on their own), and **holds are never cached** — the cached value is the base availability from `AvailabilityService`, with live holds subtracted after the read, so a five-minute hold can never be frozen into a five-minute-stale answer.

**Tech Stack:** `@axe-core/playwright` (free) for automated a11y. Charts are generated SVG from committed JSON — no charting library, no new runtime dependency.

## Global Constraints

- Node >= 22, pnpm 10; plain `pnpm` — never `corepack enable` (EACCES on this machine)
- **After any `pnpm install`, run `pnpm --filter @dentalops/api db:generate`**
- TypeScript strict; **no comments in any code file**; `@typescript-eslint/no-unused-vars` is `error`
- Conventional commits; **no trailers of any kind**
- Never read, print, or commit any `.env`
- **No migrations**, unless Task 1's heavier seed genuinely needs one — it should not
- **Do not optimise before Task 2 is committed.** Task 2's numbers are the "before"; producing them after a cache exists is worthless and cannot be redone
- Cache keys MUST include `tenantId`. A cache is a new place for a tenant leak, and every existing isolation guarantee has to survive it
- Never cache a response that had `exceptHoldId` applied, and never cache held-slot subtraction
- `prisma.scoped` throws without tenant context; the demo-reset job runs outside a request, so it establishes context itself with an `async` callback and the query `await`ed inside (the lazy-`PrismaPromise` trap)
- Verify with `set -e`; never pipe a pipeline command into `grep` — grep's exit code masks the failure
- Full pipeline (`pnpm lint && pnpm typecheck && pnpm exec turbo run test --force && pnpm build && pnpm --filter @dentalops/web e2e`) before every push

---

### Task 1: A heavier seed and a reproducible benchmark harness

**Files:**
- Create: `apps/api/scripts/benchmark.ts`, `docs/benchmarks/README.md`
- Modify: `apps/api/prisma/seed.ts`, `apps/api/package.json` (`"benchmark"` script), `apps/api/test/seed.spec.ts`

**Interfaces:**
- Produces: `pnpm --filter @dentalops/api benchmark` → runs a fixed workload against a running API and writes `docs/benchmarks/<label>.json` with `{ label, seededAt, appointments, runs, route, p50, p95, p99, max, mean }`.

The seed grows from 431 to **1,200+ appointments** (widen the horizon from ±30 to ±60 days and add a third branch's worth of load) while staying deterministic and fast — the same `createMany`-in-memory approach that kept it at 0.7s. `seed.spec.ts`'s thresholds move with it.

The harness must be honest, and each of these is a way benchmarks lie:
- **Warm up first** (discard the first N requests) — otherwise you are measuring Prisma's connection pool, not the query
- **Fixed workload, fixed seed** — the same dates, branches and services every run, so before/after is comparable
- **Report percentiles, not a mean alone** — a mean hides the tail that users feel
- **Record the row count** in the output, so a future reader can tell whether the two runs were even measuring the same thing
- **Run against the built API** (`node dist/main.js`), never `nest start --watch`

`docs/benchmarks/README.md` states the methodology, the machine, and how to reproduce — a number without a method is an anecdote.

- [ ] **Step 1:** grow the seed, update `seed.spec.ts`, confirm the seed still runs in the low seconds and `pnpm test` still passes.
- [ ] **Step 2:** write the harness, run it against the built API, commit `docs/benchmarks/before.json`.
- [ ] **Step 3: Commit**

```bash
git add apps/api docs/benchmarks
git commit -m "feat(api): heavier demo seed and a reproducible availability benchmark"
```

---

### Task 2: Record the "before" — and read it honestly

**Files:**
- Modify: `docs/benchmarks/README.md`

- [ ] Run the benchmark three times and keep the median run as `before.json`. Record all three in the README so the variance is visible.
- [ ] Also capture `GET /internal/latency` after the run — the W3 interceptor has been recording p50/p95/p99 per route in production shape all along, and it should broadly agree with the harness. **If it disagrees materially, say so and find out why before continuing** — one of the two is measuring the wrong thing, and finding out which is worth more than the cache.
- [ ] Write a short "what we expected" paragraph *before* implementing the cache: which part of the request you believe dominates (query time, `computeSlots`, serialisation) and why. Being wrong here in public is fine and interesting; deciding afterwards is not.

- [ ] **Commit:** `docs: record availability latency before caching`

---

### Task 3: Redis availability cache with versioned invalidation

**Files:**
- Create: `apps/api/src/availability/availability.cache.ts`
- Modify: `apps/api/src/availability/availability.service.ts`, `apps/api/src/appointments/appointments.service.ts`, `apps/api/src/shifts/shifts.service.ts`, `apps/api/src/roster/time-blocks.service.ts`
- Test: `apps/api/test/availability-cache.spec.ts`

**Interfaces:**
- Produces:

```ts
AvailabilityCache.read(key: AvailKey): Promise<Slot[] | null>
AvailabilityCache.write(key: AvailKey, slots: Slot[]): Promise<void>
AvailabilityCache.invalidate(tenantId: string, branchId: string, dates: string[]): Promise<void>
```

Key shape: `avail:{tenantId}:{branchId}:{serviceId}:{dentistId ?? "any"}:{date}:v{version}`, where `version` comes from `availver:{tenantId}:{branchId}:{date}` (default 0). TTL 10 minutes as a backstop, so a missed invalidation self-heals rather than serving a wrong answer forever.

`invalidate` is a single `INCR` per affected date. It is called after commit from: appointment create / reschedule / status change / series writes, shift create / delete / series materialization, and time-block create / delete. **Every one of those call sites is a place a stale answer can be born** — enumerate them in the task report and make sure each is covered by a test.

Correctness rules the tests must pin:
1. A second identical request is served from cache (assert by counting DB queries or by a spy on `computeSlots`, not by timing).
2. Booking an appointment makes the very next availability request reflect it — **this is the invalidation test and it is the one that matters**.
3. A held slot is still subtracted correctly on a cache hit (holds are applied after the read, so a hold created *after* the cache entry must still remove the slot).
4. A request carrying `exceptHoldId` is never served a cached value that had a different `exceptHoldId` — the simplest correct rule is to key the cache on base availability only and apply *all* hold logic after the read.
5. Tenant A's cache entry is never served to tenant B (construct the key collision deliberately and prove it cannot happen).
6. With Redis unavailable the endpoint still answers correctly, just slower — a cache must never be a new way for the product to fail. Test it by pointing the cache at a dead connection or by making `read` throw.

- [ ] **Commit:** `feat(api): redis availability cache with versioned invalidation`

---

### Task 4: Re-benchmark and publish the comparison

**Files:**
- Create: `apps/api/scripts/chart.ts`, `docs/benchmarks/after.json`, `docs/benchmarks/comparison.svg`
- Modify: `docs/benchmarks/README.md`, `README.md`

- [ ] Run the identical workload three times, keep the median as `after.json`.
- [ ] `chart.ts` reads both JSON files and writes a plain SVG bar chart (p50 / p95 / p99, before vs after) — hand-written SVG strings, no chart library. It must be legible in both GitHub light and dark themes, so use `currentColor` for text and axes rather than hard-coded black.
- [ ] Write the comparison up in `docs/benchmarks/README.md`: the numbers, the ratio, **and the honest caveats** — cache hit rate under real traffic is unknown, the win is smaller for a cold cache, and the first request after any booking pays full price by design.
- [ ] If the improvement is unimpressive, **say so and explain why** rather than reframing it. A benchmark that reports a modest gain with a correct method is a better artifact than a dramatic one with a broken method.

- [ ] **Commit:** `docs: availability latency after caching, with the comparison chart`

---

### Task 5: Accessibility gates

**Files:**
- Create: `apps/web/e2e/a11y.spec.ts`
- Modify: `apps/web/package.json`, `docs/design-system/MASTER.md` (tick §7's checklist against reality)

**Interfaces:**
- Produces: an automated axe pass over the landing page, the public booking wizard (each step), the staff timeline, and the roster editor, at 390px and 1440px, failing on any `serious` or `critical` violation.

Axe catches roughly a third of real accessibility problems, so the spec also asserts the things MASTER §7 promises that axe cannot see:
- every appointment card and slot chip is reachable by keyboard and shows a visible focus ring
- the timeline is fully operable with the keyboard (the W5 work — assert it end to end here, not just in jsdom)
- no status is conveyed by colour alone (assert the icon or text is present for each status)
- touch targets ≥ 44px at 390px

Fix what it finds. **Report every violation found and what you did about it** — "no violations" on the first run is more likely to mean the scan is misconfigured than that the app is perfect, so prove the scan can fail by temporarily removing a label and watching it go red.

- [ ] **Commit:** `test(e2e): automated accessibility gates on the flagship screens`

---

### Task 6: Lighthouse on the public booking page

**Files:**
- Create: `apps/web/lighthouserc.json`, `docs/benchmarks/lighthouse.md`
- Modify: `.github/workflows/ci.yml`

- [ ] Run Lighthouse (mobile preset) against `/book/demo-clinic` on the built preview. Target ≥ 90 for Performance, Accessibility, Best Practices, SEO.
- [ ] Record the starting scores **before** fixing anything, then the scores after. The likely wins are the ones the design already committed to: font `display: swap`, no layout shift from the slot grid, and code-splitting the staff app away from the public route (the bundle is currently one chunk and the public page does not need the timeline).
- [ ] Wire it into CI as a non-blocking job first; make it blocking only once it is comfortably green, and say which you chose.

- [ ] **Commit:** `perf(web): split the public route from the staff bundle and record lighthouse`

---

### Task 7: Demo reset job

**Files:**
- Create: `apps/api/src/demo/demo.queue.ts`, `demo.processor.ts`, `demo.module.ts`
- Test: `apps/api/test/demo-reset.spec.ts`

- [ ] A BullMQ repeatable job every 6 hours that reseeds **only** the demo tenant. Guard it hard: refuse to run unless the tenant slug is exactly `demo-clinic`, and never touch a tenant that is not it. A reset job that can delete a real tenant is a catastrophe waiting for a typo — test that guard explicitly.
- [ ] Reuse the existing seed logic rather than duplicating it.
- [ ] The staff UI already shows the demo banner; extend it to say when the next reset is due.

- [ ] **Commit:** `feat(api): scheduled demo tenant reset`

---

### Task 8: Sentry review and error-path polish

- [ ] Review the Sentry issue list from the whole build. Fix what is real; for what is not, add the filter and say why.
- [ ] Confirm the four failure paths a visitor can actually hit degrade well: API cold-start (Render free), Redis unavailable, a 409 on booking, and an expired manage link. Each must produce a human sentence and a way forward, never a raw error.
- [ ] Confirm no PII reaches Sentry — patient names and phone numbers must not appear in breadcrumbs or request bodies.

- [ ] **Commit:** `fix: error-path polish and sentry noise reduction`

---

### Task 9: The README, and the close

**Files:**
- Modify: `README.md`, `docs/superpowers/plans/w8-measure-optimize-polish.md`

The README is the artifact most readers will judge this by. It should let someone decide in three minutes whether to keep reading:

- [ ] What the product is and the one hard problem it solves, above the fold
- [ ] The live links, and the demo credentials path (the three "Try as…" buttons)
- [ ] **The evidence table** — each headline claim with the named test that proves it: double-booking impossible (`booking-race.spec.ts`), deadlock-free lock ordering (`deadlock.spec.ts`), tenant isolation on every route (`tenant-isolation.spec.ts`), the engine never lies (`availability.spec.ts`'s round-trip), series report-everything-insert-nothing (`series-conflict.spec.ts`), phone-to-desk realtime (`public-booking.spec.ts`)
- [ ] The benchmark chart, inline
- [ ] Architecture decisions worth defending, each with the alternative that was rejected — link the design doc rather than repeating it
- [ ] Honest limitations: single timezone, no payments, free-tier cold starts, audit log not built, what a v2 would do differently
- [ ] Sync this plan with execution findings; final pipeline; push; watch CI; report

- [ ] **Commit:** `docs: readme with the evidence table and benchmark results`

---

## W8 exit criteria

- [ ] `before.json` was committed **before** any cache code existed, and the method is written down well enough to reproduce
- [ ] The availability cache is correct under the six rules in Task 3, including tenant isolation and Redis being down
- [ ] Booking an appointment invalidates the affected day immediately — proven by a test, not by inspection
- [ ] `after.json` and the generated chart are committed, with caveats stated rather than buried
- [ ] Automated a11y gates pass on the flagship screens at 390px and 1440px, and the scan is proven able to fail
- [ ] Lighthouse mobile ≥ 90 on `/book/demo-clinic` across all four categories, with before/after recorded
- [ ] The demo tenant resets on a schedule and provably cannot touch any other tenant
- [ ] No PII in Sentry; every visitor-reachable failure path gives a human sentence and a way forward
- [ ] README carries the evidence table, the chart, and honest limitations
- [ ] All three Playwright journeys still green; CI green; seed still deterministic at its new size
