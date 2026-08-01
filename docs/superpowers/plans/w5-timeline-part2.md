# W5 Timeline Part 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The timeline becomes fully interactive: drag a card to move it, drag its bottom edge to resize, both applied optimistically with 409 snap-back that names and highlights the conflicting appointment; full keyboard operation (arrows, Shift+arrow nudge, Esc); a SlotPicker "Move" path that works without any gesture; all three responsive modes from MASTER §4; and the first Playwright journey (J2: drag-reschedule including beaten-to-slot rollback) running in CI.

**Architecture:** The optimistic layer is one hook — `useRescheduleAppointment` — that every input path (drag, resize, nudge, SlotPicker) funnels into, so rollback, conflict naming, version handling, and per-appointment serialization exist exactly once. The API contract the design promised (`409 SLOT_CONFLICT` with `details.conflictingAppointmentId`) was never actually built in W2, and reschedule cannot express a resize (it recomputes `endsAt` from the service duration, which would also silently undo a resize on the next move) — Task 1 closes both, the week's only BE work. Playwright J2 is made deterministic by construction: it books its own appointments through the public API into the part-time dentist's guaranteed-empty Monday column instead of guessing where the random seed left gaps.

**Tech Stack:** Existing stack + `@playwright/test` (chromium only in CI). No other new dependencies.

## Global Constraints

- Node >= 22, pnpm 10; plain `pnpm` — never `corepack enable` (EACCES on this machine)
- **After any `pnpm install`, run `pnpm --filter @dentalops/api db:generate`** — pnpm 10 blocks Prisma's postinstall; skipping this fails api typecheck with a stubbed client
- TypeScript strict; **no comments in any code file**; `@typescript-eslint/no-unused-vars` is `error`
- Conventional commits; **no trailers of any kind**
- Never read, print, or commit any `.env`
- **The only BE work allowed this week is Task 1.** No new routes (registry untouched), no migrations — `startsAt`/`endsAt` are already independent columns, resize is purely a service-layer change
- No hard-coded colors outside `apps/web/src/app.css`; token utilities or `var(--…)` only. Structural percentages in lane/drag math are geometry, not styling
- MASTER §2 elevation rule: `shadow-lg` on **the card being dragged only** — the single shadow allowed inside the grid
- Status/conflict treatments per MASTER §3: conflict = `--destructive` 2px ring + ⚠ icon, never color alone
- All times `tabular-nums`; `100dvh` only; touch targets ≥ 44px; body never scrolls horizontally
- jsdom stubs live in `apps/web/vitest.setup.ts` with `??=` (`ResizeObserver`, `scrollTo`, `PointerEvent`, `setPointerCapture` already exist; this week adds `matchMedia`) — never weaken production code for jsdom
- jsdom drops `background: var(--x)` shorthand — use `backgroundColor` where tests read fills
- Every optimistic path must be provably non-vacuous: where the plan says a test asserts rollback or serialization, mutation-test it (break the code, watch the test fail) and report that you did
- Full pipeline (`pnpm lint && pnpm typecheck && pnpm exec turbo run test --force && pnpm build`) before every push; push to `origin main`; report CI conclusion

---

### Task 1: Reschedule contract — resize, duration preservation, conflict identity

**Files:**
- Modify: `apps/api/src/appointments/dto/reschedule-appointment.dto.ts`, `apps/api/src/appointments/appointments.service.ts`
- Test: `apps/api/test/reschedule.spec.ts`, `apps/api/test/appointments.spec.ts`

**Interfaces:**
- Consumes: existing `withResourceRetry`, `AppException` (its `getResponse()` returns `{ message, errorCode, details }`).
- Produces: `PATCH /appointments/:id` additionally accepts `durationMin?` (int, 15–480). Omitting it preserves the appointment's **current** duration (`endsAt − startsAt`), not the service default. `409 SLOT_CONFLICT` from `POST /appointments` and `PATCH /appointments/:id` now carries `details: { constraint, conflictingAppointmentId? }` — the id of the confirmed appointment occupying the window. Shift conflicts (`no_staff_double_shift`) are unchanged.

- [ ] **Step 1: Write the failing specs**

Add to `apps/api/test/reschedule.spec.ts` (reuse the file's existing fixtures/tokens; adjust names to fit):

```ts
  it("resizes via durationMin and a later move preserves the resized duration", async () => {
    const created = await request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ serviceId, dentistId, patientId, branchId, startsAt: at(20, 2) })
    expectStatus(created, 201)
    const resized = await request(server)
      .patch(`/appointments/${created.body.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ version: created.body.version, durationMin: 90 })
    expectStatus(resized, 200)
    expect(Date.parse(resized.body.endsAt) - Date.parse(resized.body.startsAt)).toBe(90 * 60_000)
    const moved = await request(server)
      .patch(`/appointments/${created.body.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ version: resized.body.version, startsAt: at(20, 5) })
    expectStatus(moved, 200)
    expect(Date.parse(moved.body.endsAt) - Date.parse(moved.body.startsAt)).toBe(90 * 60_000)
  })

  it("a conflicting reschedule names the appointment it collided with", async () => {
    const blocker = await request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ serviceId, dentistId, patientId, branchId, startsAt: at(21, 2) })
    expectStatus(blocker, 201)
    const victim = await request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ serviceId, dentistId, patientId, branchId, startsAt: at(21, 6) })
    expectStatus(victim, 201)
    const res = await request(server)
      .patch(`/appointments/${victim.body.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ version: victim.body.version, startsAt: at(21, 2, 30) })
    expect(res.status).toBe(409)
    const parsed = apiErrorSchema.parse(res.body)
    expect(parsed.errorCode).toBe("SLOT_CONFLICT")
    expect((parsed.details as { conflictingAppointmentId?: string }).conflictingAppointmentId).toBe(
      blocker.body.id
    )
  })
```

(`at(day, h, m = 0)` — extend the file's existing `at` helper with an optional minutes argument if it lacks one. Pick unused days so no fixture collides. The conflict case assumes a **60-minute service**: `at(21, 2, 30)` only overlaps the 02:00 blocker if the service runs past 02:30 — check the spec's service fixture and create a dedicated 60-min service for these cases if the existing one is shorter.)

Add to the existing double-booking test in `apps/api/test/appointments.spec.ts`: after the `SLOT_CONFLICT` assertion, assert `details.conflictingAppointmentId` equals the first appointment's id.

Run: `cd apps/api && pnpm test -- reschedule` → the new cases FAIL (`endsAt` off by duration; `conflictingAppointmentId` undefined).

- [ ] **Step 2: DTO**

Add to `RescheduleAppointmentDto`:

```ts
  @ApiPropertyOptional({ minimum: 15, maximum: 480 })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(480)
  durationMin?: number
```

(import `Max` from class-validator.)

- [ ] **Step 3: Service**

In `appointments.service.ts`:

1. Add a private locator:

```ts
  private findDentistConflict(dentistId: string, startsAt: Date, endsAt: Date, excludeId?: string) {
    return this.prisma.scoped.appointment.findFirst({
      where: {
        dentistId,
        status: "confirmed",
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        ...(excludeId ? { id: { not: excludeId } } : {})
      },
      select: { id: true }
    })
  }

  private async withConflictIdentity<T>(
    fn: () => Promise<T>,
    locate: () => Promise<{ id: string } | null>
  ): Promise<T> {
    try {
      return await fn()
    } catch (e) {
      if (e instanceof AppException) {
        const body = e.getResponse() as { errorCode?: string; message?: string; details?: unknown }
        if (body.errorCode === "SLOT_CONFLICT") {
          const conflict = await locate()
          throw new AppException(409, "SLOT_CONFLICT", body.message ?? "Slot conflict", {
            ...(typeof body.details === "object" && body.details !== null ? body.details : {}),
            ...(conflict ? { conflictingAppointmentId: conflict.id } : {})
          })
        }
      }
      throw e
    }
  }
```

2. In `create`: wrap the existing `withResourceRetry` call —

```ts
    return this.withConflictIdentity(
      () => this.withResourceRetry(() => this.attemptCreate(dto, service.requirements, win)),
      () => this.findDentistConflict(dto.dentistId, win.startsAt, win.endsAt)
    )
```

3. In `reschedule`: the window is computed inside the transaction, so the locator recomputes it from the DB after the abort. Wrap the whole existing `withResourceRetry(...)` expression:

```ts
    return this.withConflictIdentity(
      () => this.withResourceRetry(() => /* the existing transaction */),
      async () => {
        const current = await this.prisma.scoped.appointment.findUnique({ where: { id } })
        if (!current) return null
        const startsAt = dto.startsAt ? new Date(dto.startsAt) : current.startsAt
        const durationMs = dto.durationMin
          ? dto.durationMin * 60_000
          : current.endsAt.getTime() - current.startsAt.getTime()
        return this.findDentistConflict(
          dto.dentistId ?? current.dentistId,
          startsAt,
          new Date(startsAt.getTime() + durationMs),
          id
        )
      }
    )
```

The `excludeId` matters: after the abort the victim's OLD row is still in place and may itself overlap the attempted window — without the exclusion the error would name the appointment as conflicting with itself.

4. Inside the reschedule transaction, replace the service-duration window with duration preservation:

```ts
        const durationMin =
          dto.durationMin ??
          Math.round((current.endsAt.getTime() - current.startsAt.getTime()) / 60_000)
        const win = {
          startsAt,
          endsAt: new Date(startsAt.getTime() + durationMin * 60_000),
          chairEndsAt: new Date(
            startsAt.getTime() + (durationMin + current.service.bufferMin) * 60_000
          )
        }
```

- [ ] **Step 4: Run the full api suite**

Run: `cd apps/api && pnpm test`
Expected: 18 suites pass, including the availability round-trip and deadlock/booking-race specs (the enrichment adds one read after a failed transaction — it must not change any success path). If `deadlock.spec` or `booking-race.spec` get slower or flaky, that is a real signal — report it, do not retry-until-green.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat(api): reschedule carries resize and names the conflicting appointment"
```

---

### Task 2: The optimistic reschedule hook

**Files:**
- Create: `apps/web/src/features/timeline/use-reschedule.ts`
- Modify: `packages/contracts/src/error.ts` (add `slotConflictDetailsSchema`), `packages/contracts/src/index.ts`
- Test: `apps/web/src/features/timeline/use-reschedule.test.tsx`

**Interfaces:**
- Consumes: `api`/`ApiError`, `appointmentSchema`, the day query key `["appointments", branchId, dayStart]`.
- Produces:

```ts
slotConflictDetailsSchema = z.object({ conflictingAppointmentId: z.uuid().optional() }).loose()

interface RescheduleInput { id: string; version: number; startsAt?: string; dentistId?: string; durationMin?: number }
useRescheduleAppointment(options: {
  queryKey: readonly unknown[]
  onConflict?: (conflictingAppointmentId: string | null) => void
}) → { reschedule(input: RescheduleInput): void; isBusy(id: string): boolean }
```

Behaviour contract (each bullet gets a test, and each test gets mutation-tested):
1. **Optimistic apply**: the cached appointment's `startsAt`/`endsAt`/`dentistId`/`version` update immediately; `endsAt` derives from `durationMin` when given, else the old duration.
2. **Rollback on error**: the exact prior cache snapshot is restored before any refetch.
3. **Conflict naming**: on `SLOT_CONFLICT`, parse `details` with `slotConflictDetailsSchema`; toast names the conflicting appointment by looking its id up in the cached day (patient + time), falling back to the API message; `onConflict(id)` fires so the page can highlight the card.
4. **Stale version**: on `STALE_VERSION`, toast "changed by someone else" and invalidate — the refetch shows reality.
5. **Per-appointment serialization**: `isBusy(id)` is true while that appointment has an in-flight mutation, and `reschedule()` for a busy id is a no-op. Concurrent mutations for two different appointments both proceed.

- [ ] **Step 1: Implement**

```ts
import { appointmentSchema, slotConflictDetailsSchema, type Appointment } from "@dentalops/contracts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRef } from "react"
import { toast } from "sonner"
import { api, ApiError } from "../../lib/api"
import { fmtTime } from "./lib/geometry"

export interface RescheduleInput {
  id: string
  version: number
  startsAt?: string
  dentistId?: string
  durationMin?: number
}

interface Options {
  queryKey: readonly unknown[]
  onConflict?: (conflictingAppointmentId: string | null) => void
}

const applyOptimistic = (list: Appointment[], input: RescheduleInput): Appointment[] =>
  list.map((a) => {
    if (a.id !== input.id) return a
    const startsAt = input.startsAt ?? a.startsAt
    const durationMs = input.durationMin
      ? input.durationMin * 60_000
      : Date.parse(a.endsAt) - Date.parse(a.startsAt)
    return {
      ...a,
      startsAt,
      endsAt: new Date(Date.parse(startsAt) + durationMs).toISOString(),
      dentistId: input.dentistId ?? a.dentistId,
      version: a.version + 1
    }
  })

export const useRescheduleAppointment = ({ queryKey, onConflict }: Options) => {
  const queryClient = useQueryClient()
  const busy = useRef(new Set<string>())

  const mutation = useMutation({
    mutationFn: (input: RescheduleInput) =>
      api(`/appointments/${input.id}`, appointmentSchema, {
        method: "PATCH",
        body: {
          version: input.version,
          ...(input.startsAt ? { startsAt: input.startsAt } : {}),
          ...(input.dentistId ? { dentistId: input.dentistId } : {}),
          ...(input.durationMin ? { durationMin: input.durationMin } : {})
        }
      }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<Appointment[]>(queryKey)
      if (previous) queryClient.setQueryData(queryKey, applyOptimistic(previous, input))
      return { previous }
    },
    onError: (error, input, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
      if (error instanceof ApiError && error.errorCode === "SLOT_CONFLICT") {
        const details = slotConflictDetailsSchema.safeParse(error.details)
        const conflictId = details.success ? (details.data.conflictingAppointmentId ?? null) : null
        const cached = queryClient.getQueryData<Appointment[]>(queryKey)
        const blocker = conflictId ? cached?.find((a) => a.id === conflictId) : undefined
        toast.error(
          blocker
            ? `Conflicts with ${blocker.patient.name} at ${fmtTime(Date.parse(blocker.startsAt))}`
            : error.message
        )
        onConflict?.(conflictId)
        return
      }
      if (error instanceof ApiError && error.errorCode === "STALE_VERSION") {
        toast.error("This appointment was changed by someone else — refreshed")
        void queryClient.invalidateQueries({ queryKey })
        return
      }
      toast.error(error instanceof ApiError ? error.message : "Could not move the appointment")
    },
    onSuccess: (updated) => {
      const cached = queryClient.getQueryData<Appointment[]>(queryKey)
      if (cached) {
        queryClient.setQueryData(
          queryKey,
          cached.map((a) => (a.id === updated.id ? updated : a))
        )
      }
    },
    onSettled: (_data, _error, input) => {
      busy.current.delete(input.id)
      void queryClient.invalidateQueries({ queryKey })
    }
  })

  return {
    reschedule: (input: RescheduleInput) => {
      if (busy.current.has(input.id)) return
      busy.current.add(input.id)
      mutation.mutate(input)
    },
    isBusy: (id: string) => busy.current.has(id)
  }
}
```

Add `slotConflictDetailsSchema` to contracts (`error.ts`), export it, rebuild contracts.

- [ ] **Step 2: Tests**

`use-reschedule.test.tsx` — a harness component that seeds the query cache with two fixture appointments, exposes buttons wired to `reschedule(...)`, and renders the cached list (id + startsAt + version) plus `<Toaster/>`. MSW cases:
1. delayed success → optimistic startsAt visible immediately, server value after settle
2. 409 SLOT_CONFLICT with `details.conflictingAppointmentId` of the second fixture → cache restored to the exact original, toast contains the second fixture's patient name, `onConflict` got the id
3. 409 STALE_VERSION → rollback + "changed by someone else" toast
4. serialization: two rapid `reschedule` calls for the same id while MSW delays → exactly one PATCH hits the server (count requests); two calls for different ids → two PATCHes

Mutation-test at least #2 (comment out the `setQueryData(context.previous)` line → test must fail) and #4 (remove the `busy` guard → test must fail). Report both.

- [ ] **Step 3: Commit**

```bash
git add apps/web packages/contracts
git commit -m "feat(web): optimistic reschedule hook with conflict naming and rollback"
```

---

### Task 3: Drag-move and resize on the grid

**Files:**
- Create: `apps/web/src/features/timeline/lib/drag-plan.ts`, `apps/web/src/features/timeline/use-drag-move.ts`
- Modify: `apps/web/src/features/timeline/appointment-card.tsx`, `time-grid.tsx`, `timeline-page.tsx`
- Test: `apps/web/src/features/timeline/lib/drag-plan.test.ts`, `apps/web/src/features/timeline/use-drag-move.test.tsx`

**Interfaces:**
- Consumes: geometry, `useRescheduleAppointment`, the card's existing button element.
- Produces:

```ts
dragPlan.ts:
  exceedsThreshold(anchorX: number, anchorY: number, x: number, y: number): boolean
  planMove({ anchorY, currentY, anchorColumn, currentColumn, startMs }): { startMs: number; columnDelta: number }
  planResize({ anchorY, currentY, startMs, endMs }): { durationMin: number }
  columnAtX(x: number, columnLefts: number[]): number
  DRAG_THRESHOLD_PX = 4
use-drag-move.ts:
  useDragMove({ dayStart, columnOf, onDrop, onPreview }) → per-card pointer handlers + active preview state
```

Semantics locked here:
- Move snaps the **delta** to 15-minute steps — **round-to-nearest, not floor**, so a card created off-grid keeps its offset rather than jumping. Floor is asymmetric on a signed delta: `snapFloor(-1px)` is −15 min while `snapFloor(+15px)` is 0, so the smallest drag past the threshold would jump a whole slot upward but nothing downward, contradicting "no effective change sends nothing" in one direction only.
- A pointer sequence under `DRAG_THRESHOLD_PX` total movement is a click — the existing `onClick` (details drawer) fires and no mutation happens.
- Cross-column drag changes dentist; `columnAtX` maps clientX to a column via the measured lefts array (clamped to valid range).
- Resize drags the bottom edge: `durationMin = clamp(round((snapCeil(currentEnd) − startMs) / 60_000), 15, 480)` — note the division, the difference is milliseconds; the 480 upper clamp keeps a long downward drag inside the DTO's validated range instead of guaranteeing a 400. Only `durationMin` is sent.
- While dragging: the source card renders at 40% opacity; a preview card renders at the target with `shadow-lg` and no other shadow exists in the grid; `Escape` cancels the drag (window keydown, only while active).
- Dropping with no effective change (same start, same column, same duration) sends nothing.
- `isBusy(id)` cards ignore new drags.

- [ ] **Step 1: TDD the pure planner**

`drag-plan.test.ts` first — cases: delta snapping (moving +37px → +30min at 16px/15min? No: 37px = 34.7min → snapped 30min — assert exact ms), negative deltas, threshold boundary (3px → `moved: false`, 5px → true), column clamping at both edges, resize minimum 15, resize snapping up. Run → FAIL → implement `drag-plan.ts` → PASS.

- [ ] **Step 2: The hook + wiring**

`useDragMove` holds one active drag (`{ id, mode: "move" | "resize", anchorY, anchorColumn, preview }`), attaches window `pointermove`/`pointerup`/`keydown` listeners only while active, and on drop calls `onDrop({ id, version, startsAt?, dentistId?, durationMin? })` which the page wires to `reschedule`. The card gains a resize handle:

```tsx
      <span
        data-testid={`resize-${appointment.id}`}
        onPointerDown={onResizeStart}
        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
      />
```

Card body's `onPointerDown` starts a potential move; click still opens the drawer when under threshold. Column lefts are measured from the column elements (`data-testid={col-…}`) via a ref map in `timeline-page.tsx`; pass `columnOf`/`columnLefts` down. The preview card reuses `AppointmentCard` visuals with a `preview` prop (`shadow-lg`, `pointer-events-none`).

Wire the highlight: `timeline-page.tsx` keeps `conflictId` state set by `onConflict`; the matching card gets MASTER's conflict treatment (`ring-2` in `--destructive` + ⚠ icon) for 2.5s then clears.

- [ ] **Step 3: Tests**

`use-drag-move.test.tsx` — harness with two columns and one fixture card wired through the real hook (jsdom PointerEvent stubs already exist; remember `clientY` maps 1:1):
1. down at y=576, move to 640, up → `onDrop` got `startsAt` +1h, no `durationMin`
2. down, move 3px, up → no `onDrop`; card's click handler fired
3. down on the resize handle at card bottom, move +32px, up → `onDrop` got `durationMin` = old + 30, no `startsAt`
4. down, move 64px, `Escape` → no `onDrop`, preview gone
5. cross-column: move with clientX into column 2's measured range → `onDrop` carries `dentistId` of column 2

Run web tests → PASS. Then run the whole pipeline.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): drag to move and resize with optimistic apply and conflict snap-back"
```

---

### Task 4: Keyboard operation

**Files:**
- Create: `apps/web/src/features/timeline/use-grid-keyboard.ts`
- Modify: `apps/web/src/features/timeline/appointment-card.tsx` (data attributes), `timeline-page.tsx` (wire + aria-live region)
- Test: `apps/web/src/features/timeline/use-grid-keyboard.test.tsx`

**Interfaces:**
- Consumes: the rendered cards (each already a `<button>`), `reschedule`, `isBusy`.
- Produces: one `onKeyDown` handler installed on the grid wrapper (event delegation — no per-card listeners):
  - `ArrowDown`/`ArrowUp`: focus the next/previous card **by start time within the same dentist column** (wraps: none — stops at ends)
  - `ArrowRight`/`ArrowLeft`: focus the card in the adjacent column whose start time is nearest the current card's
  - `Shift+ArrowDown`/`Shift+ArrowUp`: nudge the focused card ±15 minutes through `reschedule` (no-op while `isBusy`)
  - `Enter`: native button activation opens the drawer (no code needed — assert it still works)
  - All handled keys `preventDefault()` so the grid does not scroll underneath
- A visually-hidden `aria-live="polite"` region announcing outcomes ("Moved to 09:15", "Conflict — reverted", "Changed elsewhere — refreshed"), fed by the same hook via a callback from the page.

Implementation: cards carry `data-appt`, `data-dentist`, `data-starts`; the handler reads `document.activeElement`'s dataset, queries the grid wrapper for `[data-appt]`, sorts in memory, and calls `.focus()` on the target. No React state for focus — the DOM is the roving-focus source of truth.

- [ ] **Step 1: TDD**

`use-grid-keyboard.test.tsx` — harness rendering a 2-column × 3-card fixture grid through the real components:
1. focus card A (09:00, col 1), ArrowDown → focus moves to the 10:00 card in col 1
2. ArrowRight from 09:00 col 1 → focuses col 2's nearest-start card
3. Shift+ArrowDown → `reschedule` called with `startsAt` +15min and the card's version
4. Shift+ArrowDown while busy → no call
5. announcements: after a mocked success the live region contains "Moved to …"

Run → FAIL → implement → PASS.

- [ ] **Step 2: Commit**

```bash
git add apps/web
git commit -m "feat(web): keyboard navigation and slot nudging on the timeline"
```

---

### Task 5: SlotPicker and the gesture-free Move path

**Files:**
- Create: `apps/web/src/components/slot-picker.tsx` (shared home — the W6 public wizard imports from here)
- Modify: `apps/web/src/features/timeline/appointment-drawer.tsx`
- Test: `apps/web/src/components/slot-picker.test.tsx`, extend `apps/web/src/features/timeline/appointment-drawer.test.tsx`

**Interfaces:**
- Consumes: `GET /availability` (W3), `availabilityResponseSchema`, geometry helpers.
- Produces:

```tsx
<SlotPicker
  serviceId branchId dentistId date
  onPick={(startsAtIso: string) => void}
  onDateChange={(isoDate: string) => void}
/>
```

Renders ‹ date › nav, then the day's slots for that dentist grouped Morning (< 12:00 BKK) / Afternoon (≥ 12:00), as ≥44px `tabular-nums` chip buttons. States: loading skeleton; "No free slots this day" empty state; error state. **Unavailable slots are omitted, never greyed** (MASTER anti-pattern list). The drawer gains a "Move" section (visible for `confirmed` appointments to roles that may reschedule — reuse `useCanBook`) embedding the SlotPicker with the appointment's own `serviceId`/`dentistId`/branch/date; picking a slot calls the same `reschedule` with `{ startsAt }`.

Known limitation to encode in a comment-free way (assert it in a test so it is documented behaviour): the availability endpoint counts the appointment's **own** current occupancy as busy, so slots overlapping itself are absent. Moving to an adjacent non-overlapping slot works; a small shift into its own window requires drag or nudge. This is acceptable for W5 and noted in the task report — do not add an API parameter for it.

- [ ] **Step 1: TDD**

`slot-picker.test.tsx` with MSW on `/availability`:
1. groups slots into Morning/Afternoon by BKK wall clock (fixture: 02:30Z → Morning 09:30, 06:00Z → Afternoon 13:00)
2. clicking a chip calls `onPick` with the exact ISO string from the response
3. empty response → empty state text, zero buttons
4. date nav buttons call `onDateChange` with ±1 day (month boundary fixture)
5. every chip has `min-h` ≥ 44px class and `tabular-nums`

Drawer test additions: "Move" section renders the picker for a confirmed appointment; picking fires the reschedule PATCH (MSW asserts body `{ version, startsAt }`); a dentist-role session sees no Move section.

- [ ] **Step 2: Commit**

```bash
git add apps/web
git commit -m "feat(web): slot picker and gesture-free move path in the drawer"
```

---

### Task 6: Responsive — md scroll-snap + column picker, sm agenda

**Files:**
- Create: `apps/web/src/lib/use-media-query.ts`, `apps/web/src/features/timeline/agenda-view.tsx`, `apps/web/src/features/timeline/column-picker.tsx`
- Modify: `apps/web/src/app.css` (add `--spacing-col-md: 17rem` to `@theme inline`), `time-grid.tsx`, `timeline-page.tsx`, `apps/web/vitest.setup.ts` (matchMedia stub)
- Test: `apps/web/src/features/timeline/agenda-view.test.tsx`, `apps/web/src/features/timeline/timeline-responsive.test.tsx`

**Interfaces:**
- Consumes: everything existing; MASTER §4's per-screen table is the binding spec.
- Produces:
  - `useMediaQuery(query: string): boolean` (subscribes via `matchMedia` change events).
  - Mode selection in `timeline-page.tsx`: `sm` (<768) → `<AgendaView/>`; `md` (768–1023) → TimeGrid with snap + picker; `lg` (≥1024) → current behaviour.
  - **md**: grid scroll container gains `snap-x snap-mandatory`, columns `snap-start` and `md:max-lg:min-w-col-md`; time gutter stays sticky-left; a `<ColumnPicker/>` button in the toolbar opens a bottom Sheet of dentist checkboxes filtering visible columns (state in the page, default all). Drag stays enabled.
  - **sm**: `<AgendaView appointments dentists onOpen/>` — a flat list sorted by start: hue left border, time range `tabular-nums`, service, patient, dentist name, status icons; a now divider when viewing today; a dentist filter `<NativeSelect>` ("All dentists" + each); rows ≥44px; tap → the same details drawer, whose Move section (Task 5) is the only rescheduling path — **no drag handlers exist in this mode at all**.
  - jsdom `matchMedia` stub in `vitest.setup.ts` (`??=`): returns a minimal MediaQueryList whose `matches` is driven by a test-settable map; export a helper `setViewport(mode)` from `src/test/msw.ts` or a new `src/test/viewport.ts`.

- [ ] **Step 1: TDD**

`agenda-view.test.tsx`: sorted order across dentists; dentist filter narrows rows; status icons present (reuse fixtures); every row ≥44px class; tapping a row calls `onOpen` with the appointment.

`timeline-responsive.test.tsx`: with the viewport helper — sm renders AgendaView and **zero** `data-testid^="overlay-"` and zero resize handles in the DOM; md renders the grid with `snap-x` on the scroll container and the column picker button; unchecking a dentist in the picker removes that column; lg renders all columns without snap classes.

- [ ] **Step 2: Commit**

```bash
git add apps/web
git commit -m "feat(web): responsive timeline modes with agenda view and column picker"
```

---

### Task 7: Playwright J2 + CI

**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/drag-reschedule.spec.ts`, `apps/web/e2e/helpers.ts`
- Modify: `apps/web/package.json` (add `@playwright/test` devDep + `"e2e": "playwright test"`), `.github/workflows/ci.yml`, root `.gitignore` (`playwright-report/`, `test-results/`)

**Interfaces:**
- Consumes: the deployed-shape app (built web preview + real api + seeded db).
- Produces: J2 — *drag-reschedule including beaten-to-slot rollback* — deterministic by construction, running on every push/PR.

- [ ] **Step 1: Config**

`apps/web/playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure"
  },
  webServer: [
    {
      command: "pnpm --filter @dentalops/api start",
      url: "http://localhost:3001/api/v1/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { WEB_ORIGIN: "http://localhost:4173" }
    },
    {
      command: "pnpm --filter @dentalops/web preview -- --port 4173 --strictPort",
      url: "http://localhost:4173",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000
    }
  ]
})
```

(`webServer.env` merges into the inherited environment, so `DATABASE_URL` etc. flow from the CI job env / local shell. The api must be **built** and the web **built** before `playwright test` — CI runs it after `pnpm build`; locally the same.)

- [ ] **Step 2: The journey**

`apps/web/e2e/helpers.ts` — an API client over Playwright's `request` context: `demoLogin(request)` → token; `getJson`/`postJson` with the bearer header; `nextMonday()` computed in Asia/Bangkok (format with `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" })`, add days until weekday is Monday, always in the future so the seed's ±30-day window covers it).

`drag-reschedule.spec.ts` — the deterministic construction:

```ts
import { expect, test } from "@playwright/test"
import { apiUrl, demoLogin, findFreeDentist, getJson, nextMonday, postJson } from "./helpers"

test("J2: drag to reschedule, then a beaten-to-slot drag snaps back", async ({ page, request }) => {
  const token = await demoLogin(request)
  const monday = nextMonday()
  const dayStart = `${monday}T00:00:00+07:00`
  const branches = await getJson(request, token, "/branches")
  const branch = branches[0]
  const dentist = await findFreeDentist(request, token, branch.id, monday)
  const services = await getJson(request, token, "/services")
  const service = services.find((s: { durationMin: number }) => s.durationMin === 60) ?? services[0]
  const patients = await getJson(request, token, "/patients?limit=1")
  const patient = patients.items[0]

  const nineAm = new Date(Date.parse(dayStart) + 9 * 3_600_000).toISOString()
  const onePm = new Date(Date.parse(dayStart) + 13 * 3_600_000).toISOString()
  const source = await postJson(request, token, "/appointments", {
    serviceId: service.id,
    dentistId: dentist.id,
    patientId: patient.id,
    branchId: branch.id,
    startsAt: nineAm
  })

  await page.goto("/")
  await page.getByRole("button", { name: /Try as Owner/ }).click()
  await expect(page).toHaveURL(/\/app\/timeline/)
  await page.goto(`/app/timeline?d=${monday}&b=${branch.id}`)

  const card = page.getByTestId(`appt-${source.id}`)
  await expect(card).toBeVisible()
  await expect(card).toContainText("09:00")

  const box = (await card.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 8)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + 8 + 128, { steps: 12 })
  await page.mouse.up()
  await expect(card).toContainText("11:00")

  const blocker = await postJson(request, token, "/appointments", {
    serviceId: service.id,
    dentistId: dentist.id,
    patientId: patient.id,
    branchId: branch.id,
    startsAt: onePm
  })

  await page.goto(`/app/timeline?d=${monday}&b=${branch.id}`)
  await expect(page.getByTestId(`appt-${blocker.id}`)).toBeVisible()
  await expect(card).toContainText("11:00")

  const box2 = (await card.boundingBox())!
  await page.mouse.move(box2.x + box2.width / 2, box2.y + 8)
  await page.mouse.down()
  await page.mouse.move(box2.x + box2.width / 2, box2.y + 8 + 128, { steps: 12 })
  await page.mouse.up()

  await expect(page.getByText(new RegExp(`Conflicts with ${patient.name}`))).toBeVisible()
  await expect(card).toContainText("11:00")
})
```

The reload before the second drag is load-bearing, not cosmetic: the conflict toast names the blocker by looking it up in the FE's cached day, and the blocker was created through the API *after* the page fetched — without the reload the cache misses, the toast falls back to the raw API message, and both the name assertion and the highlight would test nothing.

`findFreeDentist`: `GET /staff?role=dentist` + `GET /shifts?branchId&from=<monday>&to=<tuesday>` → return a dentist with **no shift that day** (the seed's part-time patterns guarantee at least one on any given weekday). Their column is empty and fully hatched — nothing the random seed did can collide with 09:00/11:00/13:00 there. Booking off-shift is allowed by the API (roster validation is W7), which is what makes this self-contained.

Why the drags land exactly: cards start on the hour, the grid is 64px/hour, and the move planner snaps the **delta** — 128px = exactly +2h.

- [ ] **Step 3: CI**

Append to `.github/workflows/ci.yml` after the `pnpm build` step:

```yaml
      - run: pnpm --filter @dentalops/api db:seed
      - uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
      - run: pnpm --filter @dentalops/web exec playwright install --with-deps chromium
      - run: pnpm --filter @dentalops/web e2e
```

- [ ] **Step 4: Run locally, then commit**

Run: `pnpm build && pnpm --filter @dentalops/api db:seed && pnpm --filter @dentalops/web exec playwright install chromium && pnpm --filter @dentalops/web e2e`
Expected: 1 passed. Run it **three times** — it must pass every time; a deterministic journey that flakes is a bug to fix, not retry.

```bash
git add apps/web .github/workflows/ci.yml .gitignore pnpm-lock.yaml
git commit -m "test(e2e): playwright J2 drag-reschedule with beaten-to-slot rollback"
```

---

### Task 8: Gallery states, docs sync, pipeline, push

**Files:**
- Modify: `apps/web/src/pages/dev-ui-page.tsx` (+ its test), `docs/superpowers/plans/w5-timeline-part2.md` (sync findings)

- [ ] **Step 1: Gallery**

Add: a `dragging` card (preview styling, `shadow-lg`), a `conflict` card (destructive ring + ⚠), and a SlotPicker section rendering its states (loading / slots / none) from MSW-free static props — restructure SlotPicker only if needed so states are renderable without a server (e.g. accept optional `slotsOverride`; keep it minimal). Update the placeholder line: SlotPicker is now real; CountdownBanner remains W6; ViolationList/ShiftBlock remain W7. Extend `dev-ui-page.test.tsx` for the new states.

- [ ] **Step 2: Full pipeline + e2e + push**

Run: `pnpm lint && pnpm typecheck && pnpm exec turbo run test --force && pnpm build && pnpm --filter @dentalops/web e2e`
Expected: all green — api 18 suites (grown by Task 1's cases), web suite grown across Tasks 2–6, availability unchanged at 100%.

```bash
git add apps/web docs
git commit -m "feat(web): gallery states for drag, conflict, and slot picker"
git push origin main
```

Watch CI to conclusion (now including the Playwright step) and report the result. Note for the operator: production Vercel/Render redeploy automatically; the demo dataset resets on the Render deploy.

---

## W5 exit criteria

- [ ] Drag a card → moves optimistically; a conflicting drop snaps back, toasts "Conflicts with <patient> at <time>", and highlights the blocking card with the destructive ring + ⚠
- [ ] Drag the bottom edge → resize; a later move preserves the resized duration (API-proven)
- [ ] `PATCH /appointments/:id` 409 carries `details.conflictingAppointmentId`; create's double-booking 409 does too
- [ ] Rapid nudges cannot race themselves (per-appointment serialization, mutation-tested)
- [ ] Full keyboard path: arrows navigate, Shift+arrows nudge, Enter opens, Esc cancels a drag; outcomes announced via aria-live
- [ ] Drawer "Move" works with zero gestures via SlotPicker on real availability
- [ ] `<768`: agenda list, tap → drawer, **no drag handlers in the DOM**; `768–1023`: scroll-snap columns + column picker, drag intact; `≥1024`: unchanged full grid
- [ ] Playwright J2 passes 3× locally and in CI on chromium
- [ ] No shadow inside the grid except the dragged card; conflict never signalled by color alone
- [ ] CI green end-to-end; plan file synced with any findings
