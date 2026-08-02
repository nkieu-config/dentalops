# W7 Recurrence + Rostering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recurring appointments that report every conflicting occurrence before inserting a single row; recurring shifts kept materialized over a rolling 90-day horizon by a nightly job; a roster validation engine whose flagship rule is "these confirmed appointments fall outside the shift you just shrank"; and a roster editor that validates live while you drag. Playwright J3 proves edit → violation → resolve.

**Architecture:** No new recurrence maths — `expandRecurrence` shipped in W3 with 100% coverage and locked semantics (weekday `0 = Sunday`, weeks anchored to the Monday of `startsOn`, `monthly_date` skips absent days without consuming `count`, `endsOn` inclusive, fixed `utcOffsetMin = 420`). W7 is the week that *consumes* it, which is what makes the riskiest week survivable. The one genuinely new database technique is **savepoints**: a series must report *all* conflicting occurrences yet insert nothing, and a Postgres transaction is poisoned by the first constraint violation — so each occurrence is attempted inside `SAVEPOINT`/`ROLLBACK TO SAVEPOINT`, letting the EXCLUDE constraint judge every occurrence individually before the whole transaction rolls back. The validation engine is a pure function over intervals in `@dentalops/availability`, so `POST /roster/validate` is a thin data-gathering shell and the rules are unit-testable without a database.

**Tech Stack:** Nothing new. BullMQ (already in from W6) gains a repeatable job; `@dentalops/availability` gains a rules module.

## Global Constraints

- Node >= 22, pnpm 10; plain `pnpm` — never `corepack enable` (EACCES on this machine)
- **After any `pnpm install`, run `pnpm --filter @dentalops/api db:generate`**
- TypeScript strict; **no comments in any code file**; `@typescript-eslint/no-unused-vars` is `error`
- Conventional commits; **no trailers of any kind**
- Never read, print, or commit any `.env`
- **No migrations.** `ShiftSeries`, `AppointmentSeries`, `TimeBlock`, `Shift.seriesId`, `Shift.detached`, `Appointment.seriesId`, `Appointment.detached` all shipped in W1a and are unused so far — this week fills them in
- Every new route goes into `REGISTRY` in `apps/api/test/tenant-isolation.spec.ts` in the same task that creates it
- `@dentalops/availability` keeps **zero runtime dependencies** and its **100% coverage gate**; anything added there needs tests to match
- **Do not touch `expandRecurrence`'s semantics.** They are a published contract with passing property tests. If a caller needs something different, convert at the call site
- `prisma.scoped` throws without tenant context — the nightly job runs outside a request, so it must establish context itself, and **the callback must be `async` with the query `await`ed inside it** (`PrismaPromise` is lazy; this trap has bitten twice already)
- No hard-coded colors or spacing outside `apps/web/src/app.css`; MASTER §3 status treatments and `color-not-only` apply to shift blocks and violations
- Verify with `set -e` and never pipe a pipeline command into `grep` — grep's exit code masks the failure
- Full pipeline (`pnpm lint && pnpm typecheck && pnpm exec turbo run test --force && pnpm build && pnpm --filter @dentalops/web e2e`) before every push; push to `origin main`; report CI conclusion

## Contingency (pre-declared in the design doc, restated here)

If the week compresses: **Task 7 (drag editing in the roster grid) is the cut** — fall back to the list-based editor from Task 6 with the validation engine fully intact. "This and following" (Task 4) may slip to early W8. Never cut Tasks 2, 3 or 5 — the conflict report, the horizon job and the validation engine are the week's substance.

---

### Task 1: Roster validation rules — pure functions

**Files:**
- Create: `packages/availability/src/roster.ts`
- Modify: `packages/availability/src/index.ts`
- Test: `packages/availability/test/roster.test.ts`

**Interfaces:**
- Consumes: `Interval`, `overlaps`, `normalize`, `subtract` from the existing package.
- Produces:

```ts
type Severity = "block" | "warn"
interface Violation { rule: string; severity: Severity; staffId: string; detail: string; appointmentIds?: string[] }
interface RosterInput {
  staff: Array<{
    staffId: string
    shifts: Array<{ id: string; start: number; end: number }>
    appointments: Array<{ id: string; start: number; end: number }>
  }>
  maxWeeklyMinutes?: number
  minRestMinutes?: number
}
validateRoster(input: RosterInput): Violation[]
```

Rules, in the order they must be returned (severity-major, then staffId, then start):

| rule | severity | meaning |
|---|---|---|
| `appointment_outside_shift` | block | a confirmed appointment not fully covered by any of that staff member's shifts — **the flagship rule**; carries every offending `appointmentIds` |
| `overlapping_shifts` | block | two shifts for the same staff member overlap (half-open, so touching is fine) |
| `weekly_hours_exceeded` | warn | total shift minutes in any Mon–Sun window > `maxWeeklyMinutes` (default 2880 = 48h) |
| `insufficient_rest` | warn | gap between consecutive shifts < `minRestMinutes` (default 660 = 11h) |

Semantics to pin with tests, because each is a place a naive implementation goes wrong:
- "Fully covered" means covered by the **union** of that staff member's shifts, so an appointment spanning two back-to-back shifts is fine. Use `subtract([appointment], shifts).length === 0`, not a single-shift containment check.
- Half-open everywhere: a shift `[09:00, 17:00)` covers an appointment ending exactly at 17:00, and two shifts touching at 17:00 do not overlap.
- Rest is measured between the **normalized** shifts, so an overlap does not also produce a bogus negative rest warning.
- Weekly windows are Mon–Sun in Bangkok local time; a staff member with no shifts produces no violations at all (not a zero-hours warning).

- [ ] **Step 1: Write the failing tests, run them, see them fail, then implement.** Include: an appointment straddling two back-to-back shifts (no violation), an appointment 15 minutes past the shift end (one violation naming that appointment), two appointments outside one shift (a single violation carrying both ids), touching shifts (no overlap), a 50-hour week (warn), a 9-hour turnaround (warn), and empty input (no violations).

- [ ] **Step 2:** Coverage must stay at 100% for the package — add the unit cases the gate demands rather than lowering it.

- [ ] **Step 3: Commit**

```bash
git add packages/availability
git commit -m "feat(availability): roster validation rules as pure functions"
```

---

### Task 2: Appointment series with a complete conflict report

**Files:**
- Create: `apps/api/src/appointments/series.service.ts`, `dto/create-series.dto.ts`
- Modify: `apps/api/src/appointments/appointments.controller.ts`, `appointments.module.ts`, `apps/api/test/tenant-isolation.spec.ts`
- Test: `apps/api/test/series-conflict.spec.ts`

**Interfaces:**
- Consumes: `expandRecurrence`, `AppointmentsService.create`'s window/claim logic (reuse `pickResources` — do **not** duplicate it).
- Produces: `POST /appointments/series` (roles owner + receptionist), body `{ serviceId, dentistId, patientId, branchId, startsAt, freq, interval, byWeekday, count }` → `201 { seriesId, appointments: [...] }` on success, or `409 SERIES_CONFLICT` with `details: { conflicts: [{ startsAt, reason }] }` and **zero rows inserted** on any conflict.

The savepoint mechanism, which is the point of this task:

```ts
return this.prisma.scoped.$transaction(async (tx) => {
  const conflicts: Array<{ startsAt: string; reason: string }> = []
  const created: string[] = []
  for (const [index, occurrence] of occurrences.entries()) {
    await tx.$executeRawUnsafe(`SAVEPOINT occ_${index}`)
    try {
      // insert appointment + claims for this occurrence
      created.push(id)
      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT occ_${index}`)
    } catch (e) {
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT occ_${index}`)
      conflicts.push({ startsAt: occurrence.start.toISOString(), reason: classify(e) })
    }
  }
  if (conflicts.length > 0) {
    throw new AppException(409, "SERIES_CONFLICT", "Some occurrences conflict", { conflicts })
  }
  return created
})
```

Why savepoints rather than a pre-check: a Postgres transaction is aborted by the *first* constraint violation and rejects every subsequent statement, so without savepoints the report can only ever name one occurrence. And a pre-check query would be a race window — the point of this project is that the constraint is the referee, so each occurrence must actually be *attempted*. Throwing at the end rolls the whole transaction back, which is what makes "reports everything, inserts nothing" true.

`occ_${index}` is interpolated into raw SQL, so `index` must be a number from `entries()` and nothing else — never interpolate anything user-supplied into a savepoint name. Types erase at runtime, so `index.toFixed(0)` is what actually guarantees the fragment is `[0-9]+`.

Verified during execution: Prisma's interactive transaction passes savepoint statements straight through (the tenant extension only intercepts `$allModels`). Without savepoints the failure is not a weak report but a 500 — the occurrence *after* the first conflict dies with SQLSTATE `25P02` "current transaction is aborted", which is not an `AppException` and so escapes before any report is emitted.

Two hazards this endpoint must guard, neither of which `expandRecurrence` protects against because `count` rather than a window is the bound: `interval: 0` and an empty `byWeekday` both never increment `made`, so the expansion never terminates. Guard them in the DTO (`@Min(1) @Max(12)` on interval, `@ArrayNotEmpty()` on byWeekday, `@Min(2) @Max(52)` on count) rather than in the loop.

Known limit, worth stating rather than hiding: a Postgres **deadlock** (`40P01`) aborts the whole transaction, not just the subtransaction, so `ROLLBACK TO SAVEPOINT` cannot recover from one. What keeps that from happening is reusing `lockDentist` and `pickResources` — the series must take the same per-dentist `FOR UPDATE` lock and sorted resource-lock order as the single-create path, or it silently opts out of the protocol `deadlock.spec.ts` guards.

- [ ] **Step 1: Write the failing spec first.** Cases:
1. a 12-occurrence weekly series inserts 12 appointments, all sharing one `seriesId`, each with its resource claims
2. **the headline:** a 24-occurrence series that conflicts at #17 returns 409 with exactly that occurrence in `details.conflicts`, and nothing was inserted. Note the `AppointmentSeries` row is created *inside* the transaction (otherwise a failed series leaves an orphan), so on a 409 there is no `seriesId` to count by — assert instead that the dentist's appointment count is unchanged, that `appointment.count({ where: { seriesId: { not: null } } })` is 0, and that `appointmentSeries.count()` is unchanged
3. a series conflicting at #3 *and* #17 reports **both** (this is the case that fails without savepoints — verify it does by trying it without them first, and report what you saw)
4. `count` is honoured and matches `expandRecurrence`'s contract (occurrences before the window still consume it)
5. the series is tenant-scoped: another tenant's token cannot read it

- [ ] **Step 2: Verify the savepoint approach works through Prisma before building on it.** `$executeRawUnsafe` inside an interactive transaction is the assumption; if Prisma's transaction wrapper interferes, diagnose and report rather than silently switching to a pre-check.

- [ ] **Step 3: Commit**

```bash
git add apps/api
git commit -m "feat(api): appointment series with savepoint-scoped conflict reporting"
```

---

### Task 3: Shift series + the nightly horizon job

**Files:**
- Create: `apps/api/src/shifts/shift-series.service.ts`, `dto/create-shift-series.dto.ts`, `apps/api/src/roster/horizon.queue.ts`, `horizon.processor.ts`
- Modify: `apps/api/src/shifts/shifts.controller.ts` + `shifts.module.ts`, `apps/api/src/mail/mail.redis.ts` (reuse the connection provider or add a sibling), `apps/api/test/tenant-isolation.spec.ts`
- Test: `apps/api/test/shift-series.spec.ts`, `apps/api/test/horizon.spec.ts`

**Interfaces:**
- Produces: `POST /shifts/series` (owner) → materializes the series across `today − 0 … today + 90` and returns `{ seriesId, created, skipped }`; `PATCH /shift-series/:id` (owner) with `{ scope: "following" | "all", ... }`; `DELETE /shift-series/:id?scope=following|all`. A BullMQ **repeatable** job (`horizon`, cron `0 18 * * *` UTC = 01:00 Bangkok) that tops every open-ended series back up to 90 days.

Rules that make this safe to run every night:
- **Idempotent by construction:** before inserting an occurrence, skip it if a shift with that `seriesId` and `startsAt` already exists. Re-running the job must produce `created: 0` on an untouched series — assert that.
- **Never resurrect a deleted occurrence:** a `detached` shift that was deleted must stay deleted. Track this by only materializing forward from `max(startsAt)` of the series' existing shifts (or `startsOn` when there are none), never backfilling gaps.
- **Conflicts are skipped, not fatal:** a materialization that hits `no_staff_double_shift` increments `skipped` and continues. A nightly job must not die because one clinic double-booked a dentist.
- **BullMQ v6 removed `repeat` from `Queue.add`** — use `queue.upsertJobScheduler(id, { pattern, tz }, { name, opts })`. `tz: "UTC"` is **required**, not decorative: BullMQ resolves a cron in the process's local zone, and this machine is Asia/Bangkok, so omitting it fires the job seven hours early.
- **Clamp the anchor to the start of today.** "Materialize forward from `max(startsAt)`, or `startsOn` when there are none" resurrects history for a series whose shifts are all in the past or were all deleted; `max(anchor, startOfBangkokToday)` is strictly stronger.
- **A `detached` date is an exception.** Skip any local date already carrying a detached shift for that series, or `scope: "all"` leaves a duplicate beside the user's exception.
- `timeStart` is stored as a `"HH:MM"` local string; convert to `timeStartMin` for `expandRecurrence` at the call site — do not change the package.
- The job establishes tenant context per tenant, `async`, with the query `await`ed inside `tenantContext.run` (the lazy-`PrismaPromise` trap).

- [ ] **Step 1: Spec first.** `shift-series.spec.ts`: creating a Mon/Wed/Fri series materializes the right weekdays at the right UTC times over 90 days; `scope: "all"` re-materializes non-detached rows; `scope: "following"` closes the old series at the boundary and opens a new one, leaving past shifts untouched. `horizon.spec.ts`: running the processor twice creates zero the second time; a series whose latest shift is 30 days out gets topped back to 90; a conflicting occurrence is counted in `skipped` and does not abort the run.

- [ ] **Step 2: Commit**

```bash
git add apps/api
git commit -m "feat(api): shift series with an idempotent nightly horizon job"
```

---

### Task 4: Series edit scopes for appointments — this / following / all

**Files:**
- Create: `apps/api/src/appointments/dto/edit-series.dto.ts`
- Modify: `apps/api/src/appointments/series.service.ts`, `appointments.controller.ts`, `apps/api/test/tenant-isolation.spec.ts`
- Test: `apps/api/test/series-scope.spec.ts`

**Interfaces:**
- Produces: `PATCH /series/:id` with `{ scope: "this" | "following" | "all", fromAppointmentId, startsAt?, dentistId?, durationMin? }`.

Semantics — Google Calendar's, which is what the design doc committed to:
- **`this`** — edit only `fromAppointmentId` and set `detached = true` on it, so later `all` edits skip it. Reuses `AppointmentsService.reschedule` (version + conflict identity come free).
- **`following`** — split the series: the occurrences from `fromAppointmentId` onward leave the old series and join a **new** `AppointmentSeries` carrying the edited rule. Past occurrences keep the old `seriesId` and are untouched.
- **`all`** — apply to every non-`detached` occurrence in the series.

Both `following` and `all` are multi-row edits and therefore need the **same savepoint discipline as Task 2**: report every conflicting occurrence, change nothing. Factor that loop out of Task 2 into a shared private helper rather than writing it twice.

- [ ] **Step 1: Spec first.** A 10-occurrence series: `this` on #4 moves only #4 and marks it detached; a subsequent `all` leaves #4 where the user put it; `following` from #6 leaves #1–5 on the old series, puts #6–10 on a new one, and the old series' rule is closed at the boundary; a `following` edit that conflicts at #8 reports it and moves nothing.

- [ ] **Step 2: Commit**

```bash
git add apps/api
git commit -m "feat(api): this, following and all edit scopes for appointment series"
```

---

### Task 5: POST /roster/validate + time blocks

**Files:**
- Create: `apps/api/src/roster/roster.module.ts`, `roster.controller.ts`, `roster.service.ts`, `dto/validate-roster.dto.ts`, `apps/api/src/roster/time-blocks.controller.ts` + `time-blocks.service.ts`, `dto/create-time-block.dto.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/test/tenant-isolation.spec.ts`
- Test: `apps/api/test/roster-validate.spec.ts`

**Interfaces:**
- Consumes: `validateRoster` from Task 1.
- Produces:
  - `POST /roster/validate` (owner) body `{ branchId, from, to, draftShifts: [{ id?, staffId, startsAt, endsAt }] }` → `{ violations: Violation[] }`. **Dry run — writes nothing.** `draftShifts` *replace* the persisted shifts for the staff they mention within `[from, to)`, so the UI can ask "what breaks if I do this?" while dragging.
  - `GET|POST|DELETE /time-blocks` (owner) — the breaks/leave rows the availability engine already subtracts (W3 wired them in; nothing has been able to create one until now).

- [ ] **Step 1: Spec first.** The flagship case gets its own test: a dentist with a 09:00–17:00 shift and three confirmed appointments, of which two run past 15:00; validating a draft that shrinks the shift to 09:00–15:00 returns one `appointment_outside_shift` violation naming exactly those two appointment ids. Plus: a draft that fixes a violation returns none; validate writes nothing (assert shift and appointment counts are unchanged afterwards); non-owner roles get 403; another tenant's shifts never appear in the result. Add a time-block test proving a created block removes slots from `GET /availability` (closing the loop W3 left open).

- [ ] **Step 2: Commit**

```bash
git add apps/api
git commit -m "feat(api): roster validation dry-run endpoint and time blocks"
```

---

### Task 6: Roster editor — week grid, violations panel, list fallback

**Files:**
- Create: `apps/web/src/features/roster/roster-page.tsx`, `hooks.ts`, `shift-block.tsx`, `violation-list.tsx`, `shift-dialog.tsx`, `roster-list.tsx`
- Modify: `apps/web/src/routes.tsx`, `packages/contracts/src/roster.ts` + `index.ts`
- Test: `violation-list.test.tsx`, `roster-page.test.tsx`

**Interfaces:**
- Produces: route `/app/roster` (owner only). Week × staff grid at `≥1024` with the violations panel docked right (320px) per MASTER §5.4; a 3-day window at `768–1023`; a per-staff list at `<768` with violations in a bottom sheet. `<ShiftBlock>` and `<ViolationList>` are the two domain components MASTER §6 still lists as missing.

This task ships **create/edit/delete via a dialog**, not drag — so the week is demoable and validated even if Task 7 is cut. Editing a shift in the dialog fires a debounced (250ms) `POST /roster/validate` with the draft and renders the result live; blocking violations disable **Save**; each blocking violation links to the affected appointments on the timeline (`/app/timeline?d=…&b=…`).

Found during execution: there was no way to *edit* a shift. The API had `POST /shifts` and `DELETE /shifts/:id` and nothing between them, so the dialog's Save on an existing shift was DELETE-then-POST — which loses the shift outright if the POST then fails (`no_staff_double_shift`, a dropped connection), and the user's row is simply gone. `PATCH /shifts/:id` was added mid-week for this (`1c80efa`, with the isolation-registry entry and `shifts.spec.ts` cases); it also sets `detached: true`, which makes a hand-edited occurrence an exception the nightly job and `scope: "all"` both leave alone. Task 7's drag reuses the same endpoint.

- [ ] **Step 1: TDD `ViolationList`** — clean / warnings only / blocking / mixed, per MASTER §6; blocking uses `--destructive` with an icon, warnings `--warning` with an icon, never colour alone.
- [ ] **Step 2: The page**, with tests for: the grid renders a week of shifts per staff member; editing in the dialog posts a validate request with the draft (not the saved shifts); a blocking violation disables Save; resolving it re-enables Save; `<768` renders the list, not the grid.
- [ ] **Step 3: Commit**

```bash
git add apps/web packages/contracts
git commit -m "feat(web): roster editor with live validation and violation panel"
```

---

### Task 7: Drag editing in the roster grid — **the cut point**

**Files:**
- Modify: `apps/web/src/features/roster/roster-page.tsx`, `shift-block.tsx`
- Test: `roster-drag.test.tsx`

Reuse `use-drag-move.ts` and `lib/drag-plan.ts` from W5 rather than writing new pointer code — a shift block and an appointment card have the same geometry problem. Dragging updates the draft and re-validates; dropping saves only when nothing blocks.

**If the week is running short, stop here and ship Task 6's dialog editor.** Say so explicitly in the task report rather than half-landing it.

Shipped as **move between days only — no resize**, and the commit says so (`feat(web): drag to move shifts between days with live validation`). The premise that "a shift block and an appointment card have the same geometry problem" turned out to be wrong: the timeline is continuous (y = minutes), while the roster grid is **categorical** — rows are staff, columns are days, and a block states its hours as text rather than as a height. There is no time axis to snap a pixel delta against, so `planMove`/`planResize`'s pixel→minute maths has nothing to compute and resize has no gesture to express. Only `columnAtX` was genuinely reusable. What *was* shared is the pointer lifecycle (threshold, capture, Escape, click-vs-drag): it was extracted out of `use-drag-move.ts` into `use-pointer-drag.ts` and both features now use it, rather than forking a second copy of the same bug surface. Times are still edited in the dialog, which is where a categorical grid should put them.

Known limitation, recorded rather than hidden: **there is no vertical drag** — a shift cannot be moved to a different staff member — because `PATCH /shifts/:id` accepts only `startsAt`/`endsAt`. Widening it to `staffId` is an API change, which this week's constraints forbid, so reassignment stays delete-plus-add.

- [ ] Commit: `feat(web): drag to move shifts between days with live validation`

---

### Task 8: Recurring UI + Playwright J3

**Files:**
- Create: `apps/web/src/features/timeline/series-dialog.tsx`, `apps/web/e2e/roster-violation.spec.ts`
- Modify: `apps/web/src/features/timeline/appointment-drawer.tsx`, `create-drawer.tsx`, `apps/web/e2e/helpers.ts`

**Interfaces:**
- Produces: a "Repeat" section in the create drawer (weekly, every N, weekdays, count) that posts to `/appointments/series` and renders `409 SERIES_CONFLICT` as a per-occurrence list rather than a toast; a ⟳ badge on recurring cards opening the this/following/all dialog; J3 — **roster edit → violation → resolve**.

J3 must be deterministic the same way J1 and J2 are: pick a rostered dentist on the target Monday via the existing helpers, `clearColumn`, book two appointments through the API at known times, then drive the roster UI to shrink the shift past them and assert the blocking violation names both. Resolve by restoring the shift and assert Save re-enables. No retries.

Refined during execution: J3 targets the **Tuesday**, not the Monday, and excludes the first branch. Playwright runs the journeys in parallel workers against one seeded database, so "the rostered dentist on the next Monday at the first branch" is the same dentist J1 and J2 are already booking and dragging — J3 would then delete or shrink a shift underneath them, and all three would flake for reasons that have nothing to do with the code. `findRosteredDentist(..., dayAfter(weekStart, 1), { excludeBranchId })` plus `clearRosterViolations` gives J3 a disjoint slice of the seed, which is what buys "no retries".

- [ ] Commit: `test(e2e): playwright J3 roster violation and resolution` (shipped as `feat(web): recurring appointment UI and playwright J3 roster violation journey`, since the recurring drawer and the journey landed together)

---

### Task 9: Gallery, docs, pipeline, push

- [ ] Add `ShiftBlock` (saved / dragging / recurring / conflicting) and `ViolationList` (all four states) to `/dev/ui` — this completes MASTER §6's inventory; update the placeholder line to say nothing is outstanding.
- [ ] `docs/rostering.md`: the validation rules and their severities, the this/following/all semantics, why series conflicts use savepoints, and how the horizon job stays idempotent.
- [ ] Sync this plan with execution findings.
- [ ] Full pipeline including all three journeys, push, watch CI, report.

Execution note: `ViolationList` renders a `<Link>` to the timeline, so the gallery is the first `/dev/ui` entry that needs router context — `dev-ui-page.test.tsx` now mounts the page inside a `MemoryRouter`. The eight `ShiftBlock` / `ViolationList` fixtures reuse the existing gallery dentists so `staffName` resolves to real names rather than "Unknown staff", which is what makes the blocking card read like the panel does in the product.

---

## W7 exit criteria

- [ ] A 24-occurrence series conflicting at #17 returns every conflict and inserts **zero** rows (savepoint-proven)
- [ ] A series conflicting at two occurrences reports **both** — the case that fails without savepoints
- [ ] Shift series materialize over a 90-day horizon; the nightly job is idempotent (second run creates 0) and survives a conflicting occurrence
- [ ] `this` / `following` / `all` behave as Google Calendar does, and `detached` occurrences survive a later `all`
- [ ] `POST /roster/validate` writes nothing and returns the flagship violation naming the exact appointments left outside a shrunken shift
- [ ] Time blocks can be created and immediately remove slots from `GET /availability`
- [ ] Roster editor validates live and refuses to save while a blocking violation stands, at all three breakpoints
- [ ] Playwright J3 passes 3× locally and in CI, with no retries
- [ ] `@dentalops/availability` still has zero runtime dependencies and 100% coverage
- [ ] Every new route in the isolation registry; no migrations; CI green with all three journeys

### Where those criteria actually stand

Written at the end of Task 9, before the push. Totals: api 28 suites / 163 tests, web 30 files / 201 tests, availability 7 files / 60 tests at 100%, contracts 3, e2e 3 journeys.

Satisfied, with the test that proves it:

- the #17 conflict and the zero insert — `series-conflict.spec.ts` "reports the single conflicting occurrence of a 24 week series and inserts nothing"
- two conflicts reported, the savepoint case — same file, "reports both conflicting occurrences, not just the first"
- horizon: `horizon.spec.ts` tops a 30-day series back to 90 and creates 0 on a second run, keeps a deleted mid-series occurrence deleted, and counts a `no_staff_double_shift` occurrence as `skipped` while finishing the run
- this / following / all and detachment — `series-scope.spec.ts`, including "a later all leaves the detached occurrence where the user put it"; the shift-side equivalent is `shift-series.spec.ts` "scope all re-materialises non-detached rows and leaves a detached one alone"
- the flagship dry run — `roster-validate.spec.ts` "shrinking a 09:00-17:00 shift to 09:00-15:00 names exactly the two appointments left outside" plus "is a dry run — no row is written, updated or deleted"
- time blocks closing the W3 loop — `roster-validate.spec.ts` "a personal block removes exactly the overlapping starts and returns them when deleted"
- `@dentalops/availability` — still no `dependencies` key, coverage gate still 100/100/100/100 and met
- registry and migrations — all ten new routes are in `REGISTRY`, and `git diff` over `apps/api/prisma` since the plan commit is empty

Partly satisfied, stated rather than rounded up:

- **"Roster editor … at all three breakpoints."** The *layout* is proven at all three (`lg` grid with the docked panel, `md` 3-day window, `sm` list plus bottom sheet). "Validates live and refuses to save while a blocking violation stands" is asserted at `lg` (dialog Save disables and re-enables) and at `sm` (the sheet shows the blocking group and the toolbar counts it); no test clicks Save at `md`. The dialog is rendered outside the responsive branch, so the behaviour is structurally identical — but structural identity is an argument, not a test.
- **"J3 passes 3× locally and in CI."** Three consecutive clean local runs of the whole suite, `retries: 0` in the Playwright config. CI is unverified from here: this session was asked not to push.
