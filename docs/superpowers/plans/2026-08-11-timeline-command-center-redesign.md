# Timeline Command Center Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a readable, responsive Timeline command center with a precise Day grid, a chronological Week board, durable viewport sizing, accessible mobile controls, and complete scheduling states.

**Architecture:** `TimelinePage` remains the coordinator for data, URL state, mutations, and overlays. `TimeGrid` becomes Day-only, a new `WeeklyAgendaBoard` owns Week rendering, and `AgendaView` remains the mobile Day surface. App shell provides available height through flex layout; Timeline components consume it without viewport arithmetic.

**Tech Stack:** React 19, TypeScript, React Router, TanStack Query, Radix UI, Tailwind CSS v4, Vitest, Testing Library, Playwright

## Global Constraints

- Preserve existing appointment, recurrence, conflict, permission, realtime, and offline behavior.
- Preserve the rounded two-layer Day/Week and Dentists/Chairs segmented controls.
- Do not add MUI, Ant Design, another UI library, gradients, glass effects, or new scheduling API endpoints.
- Do not add booked-count or open-hours summary copy.
- Keep touch targets at least 44px by 44px at 320px width.
- Keep branch, date, view, column grouping, hidden columns, and mobile dentist filter URL-addressable.
- Use existing semantic tokens and Radix/shared primitives.
- Do not stage unrelated dirty-worktree changes. Review each patch before any commit.
- Do not add code comments.

---

### Task 1: App shell height contract

**Files:**
- Modify: `apps/web/src/components/shell/app-shell.tsx`
- Modify: `apps/web/src/components/shell/app-shell.test.tsx`
- Modify: `apps/web/src/features/timeline/timeline-page.tsx`
- Modify: `apps/web/src/features/timeline/timeline-responsive.test.tsx`

**Interfaces:**
- Consumes: existing `AppShell`, `Outlet`, fixed mobile navigation, and `TimelinePage`
- Produces: `main` as a `flex min-h-0 flex-1 flex-col` region and Timeline as a `min-h-0 flex-1 flex-col` child without viewport `calc()`

- [ ] **Step 1: Write failing shell and Timeline layout tests**

```tsx
expect(screen.getByRole("main")).toHaveClass("flex", "min-h-0", "flex-1", "flex-col")
expect(screen.getByTestId("timeline-page")).toHaveClass("min-h-0", "flex-1")
expect(screen.getByTestId("timeline-page").className).not.toContain("100dvh")
expect(screen.getByTestId("timeline-page").className).not.toContain("spacing-topbar")
```

- [ ] **Step 2: Run RED verification**

Run: `cd apps/web && ./node_modules/.bin/vitest run src/components/shell/app-shell.test.tsx src/features/timeline/timeline-responsive.test.tsx`

Expected: FAIL because `main` is not a flex column and Timeline still contains viewport height calculations.

- [ ] **Step 3: Implement the flex-owned height contract**

```tsx
<main
  id="main"
  className="flex min-h-0 min-w-0 flex-1 flex-col pb-[calc(var(--spacing-bottomnav)+env(safe-area-inset-bottom))] md:pb-0"
>
  <Outlet />
</main>
```

```tsx
<div data-testid="timeline-page" className="flex min-h-0 flex-1 flex-col">
```

- [ ] **Step 4: Run GREEN verification**

Run: `cd apps/web && ./node_modules/.bin/vitest run src/components/shell/app-shell.test.tsx src/features/timeline/timeline-responsive.test.tsx`

Expected: PASS with no body-height assertion relying on a topbar token.

- [ ] **Step 5: Review and checkpoint**

Run: `git diff --check -- apps/web/src/components/shell/app-shell.tsx apps/web/src/components/shell/app-shell.test.tsx apps/web/src/features/timeline/timeline-page.tsx apps/web/src/features/timeline/timeline-responsive.test.tsx`

Commit only isolated Task 1 hunks with message `fix(web): align timeline height with the floating shell` when the index contains no unrelated changes.

---

### Task 2: Chronological Week agenda board

**Files:**
- Create: `apps/web/src/features/timeline/weekly-agenda-board.tsx`
- Create: `apps/web/src/features/timeline/weekly-agenda-board.test.tsx`
- Modify: `apps/web/src/features/timeline/timeline-page.tsx`
- Modify: `apps/web/src/features/timeline/timeline-page.test.tsx`
- Modify: `apps/web/src/features/timeline/timeline-responsive.test.tsx`

**Interfaces:**
- Consumes: `Appointment[]`, `StaffMember[]`, week-start date, `onOpen(appointment)`, `fmtTime`, `fmtWeekdayShort`, and `weekDates`
- Produces: `WeeklyAgendaBoard` with readable day columns and appointment buttons; Week no longer uses `TimeGrid` or `layoutByDay`

- [ ] **Step 1: Write failing board tests**

```tsx
render(
  <WeeklyAgendaBoard
    weekStart="2026-08-10"
    appointments={[first, parallel, later]}
    dentists={[dentistA, dentistB]}
    onOpen={onOpen}
  />
)

expect(screen.getAllByTestId(/week-day-/)).toHaveLength(7)
expect(screen.getByTestId("week-day-2026-08-11")).toHaveTextContent("Tue")
expect(screen.getByTestId(`week-appt-${first.id}`)).toHaveTextContent("09:00")
expect(screen.getByTestId(`week-appt-${first.id}`)).toHaveTextContent(first.patient.name)
expect(screen.getByTestId(`week-appt-${first.id}`)).toHaveTextContent(dentistA.name)
expect(screen.getByTestId(`week-appt-${parallel.id}`)).toHaveClass("min-h-11")
```

Add tests that parallel appointments remain separate full-width rows, sorting is chronological, today is identified, empty days remain present, long text truncates, and click calls `onOpen`.

- [ ] **Step 2: Run RED verification**

Run: `cd apps/web && ./node_modules/.bin/vitest run src/features/timeline/weekly-agenda-board.test.tsx`

Expected: FAIL because `WeeklyAgendaBoard` does not exist.

- [ ] **Step 3: Implement the board**

```tsx
interface WeeklyAgendaBoardProps {
  weekStart: string
  appointments: Appointment[]
  dentists: StaffMember[]
  onOpen: (appointment: Appointment) => void
}

export const WeeklyAgendaBoard = ({ weekStart, appointments, dentists, onOpen }: WeeklyAgendaBoardProps) => {
  const dates = weekDates(weekStart)
  const dentistNames = new Map(dentists.map((dentist) => [dentist.id, dentist.name]))
  return (
    <section aria-label="Weekly appointment overview" className="min-h-0 flex-1 overflow-auto p-2 sm:p-3">
      <div className="grid min-w-[70rem] grid-cols-7 gap-2" data-testid="weekly-agenda-board">
        {dates.map((date) => {
          const rows = appointments
            .filter((appointment) => bkkDate(Date.parse(appointment.startsAt)) === date)
            .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
          return <WeeklyAgendaDay key={date} date={date} appointments={rows} dentistNames={dentistNames} onOpen={onOpen} />
        })}
      </div>
    </section>
  )
}
```

Each `WeeklyAgendaDay` uses `content-visibility: auto`, a sticky date header, and compact appointment buttons with time, patient, dentist, service, and accessible status text.

- [ ] **Step 4: Replace Week TimeGrid rendering**

```tsx
{mode === "sm" ? (
  <AgendaView ... />
) : view === "week" ? (
  <WeeklyAgendaBoard
    weekStart={weekStart}
    appointments={appointmentData}
    dentists={allDentists}
    onOpen={setSelected}
  />
) : (
  <TimeGrid ... />
)}
```

Remove Week-only lane, column-date, and compact-card branches from the Day grid path.

- [ ] **Step 5: Run GREEN verification**

Run: `cd apps/web && ./node_modules/.bin/vitest run src/features/timeline/weekly-agenda-board.test.tsx src/features/timeline/timeline-page.test.tsx src/features/timeline/timeline-responsive.test.tsx`

Expected: PASS; Week renders the board and Day retains TimeGrid.

- [ ] **Step 6: Review and checkpoint**

Run: `git diff --check -- apps/web/src/features/timeline`

Commit isolated Task 2 hunks with message `feat(web): replace the dense week grid with an agenda board`.

---

### Task 3: Timeline command surface and 320px touch targets

**Files:**
- Modify: `apps/web/src/features/timeline/timeline-toolbar.tsx`
- Create: `apps/web/src/features/timeline/timeline-toolbar.test.tsx`
- Modify: `apps/web/src/features/timeline/timeline-responsive.test.tsx`
- Modify: `apps/web/src/features/timeline/timeline-page.tsx`

**Interfaces:**
- Consumes: existing branch selector, DatePicker, segmented controls, search, and primary action
- Produces: inset two-row command surface with title `Timeline` and non-shrinking date controls

- [ ] **Step 1: Write failing hierarchy and responsive tests**

```tsx
expect(screen.getByRole("heading", { level: 1, name: "Timeline" })).toBeVisible()
expect(screen.getByTestId("timeline-command-surface")).toHaveClass("rounded-hero")
expect(screen.getByLabelText("Previous day")).toHaveClass("shrink-0", "min-h-11", "min-w-11")
expect(screen.getByLabelText("Next day")).toHaveClass("shrink-0", "min-h-11", "min-w-11")
```

At small viewport, assert the date row uses a fixed grid contract and does not expose Day/Week or Dentist/Chair controls.

- [ ] **Step 2: Run RED verification**

Run: `cd apps/web && ./node_modules/.bin/vitest run src/features/timeline/timeline-toolbar.test.tsx src/features/timeline/timeline-responsive.test.tsx`

Expected: FAIL for the old `Schedule` heading, flat header, and shrinking icon controls.

- [ ] **Step 3: Implement the local command surface**

```tsx
<header className="shrink-0 p-2 pb-0 sm:p-3 sm:pb-0">
  <div data-testid="timeline-command-surface" className="overflow-hidden rounded-hero border border-border bg-card shadow-xs">
    <div className="flex min-h-14 items-center gap-3 px-3 py-2 sm:px-4">
      <h1 className="text-section-title font-bold tracking-tight">Timeline</h1>
      {branchControl}
      <div className="ml-auto shrink-0">{primaryAction}</div>
    </div>
    <div className="grid grid-cols-[auto_2.75rem_minmax(0,1fr)_2.75rem_auto] items-center gap-1 border-t border-border/60 px-3 py-2 sm:flex sm:gap-2 sm:px-4">
      {dateControls}
      {viewAndSearchControls}
    </div>
  </div>
</header>
```

Desktop retains the two segmented controls. Mobile uses the fixed date grid, icon search, compact date label, and 44px minimum controls.

- [ ] **Step 4: Run GREEN verification**

Run: `cd apps/web && ./node_modules/.bin/vitest run src/features/timeline/timeline-toolbar.test.tsx src/features/timeline/timeline-responsive.test.tsx src/features/timeline/timeline-page.test.tsx`

Expected: PASS.

- [ ] **Step 5: Review and checkpoint**

Commit isolated Task 3 hunks with message `feat(web): compose the timeline command surface`.

---

### Task 4: Day grid operational context

**Files:**
- Modify: `apps/web/src/features/timeline/time-grid.tsx`
- Modify: `apps/web/src/features/timeline/time-grid.test.tsx`
- Modify: `apps/web/src/features/timeline/timeline-page.tsx`
- Modify: `apps/web/src/app.css`

**Interfaces:**
- Consumes: Day-only columns, shifts, appointments, `useNow`, and semantic Timeline tokens
- Produces: dynamic initial scroll, calm current-time token, inset canvas, proximity snapping, and optional off-shift shading

- [ ] **Step 1: Write failing TimeGrid tests**

Add `initialScrollMinutes` and `showOffShift` contracts:

```tsx
expect(scrollTo).toHaveBeenCalledWith({ top: 12 * 64 - 16 })
expect(screen.getByText("09:17")).toHaveClass("bg-timeline-current-time", "text-timeline-current-time-foreground")
expect(screen.getByTestId("timegrid-scroll")).toHaveClass("p-2", "sm:p-3")
expect(screen.getByTestId("timegrid-scroll")).toHaveClass("snap-proximity")
```

Add a test proving `showOffShift={false}` renders no off-shift blocks.

- [ ] **Step 2: Run RED verification**

Run: `cd apps/web && ./node_modules/.bin/vitest run src/features/timeline/time-grid.test.tsx src/features/timeline/timeline-responsive.test.tsx`

Expected: FAIL for missing props and old styling.

- [ ] **Step 3: Implement useful initial scroll calculation**

Add a pure tested helper in `lib/geometry.ts`:

```ts
export const initialTimelineMinute = (date: string, now: number, shifts: Shift[]): number => {
  const currentMinute = date === bkkToday() ? Math.floor((now - bkkDayStart(date)) / 60_000) - 60 : Number.NaN
  const earliestShift = shifts.length === 0 ? Number.NaN : Math.min(...shifts.map((shift) => Math.floor((Date.parse(shift.startsAt) - bkkDayStart(date)) / 60_000) - 60))
  const target = Number.isFinite(currentMinute) ? currentMinute : Number.isFinite(earliestShift) ? earliestShift : 480
  return Math.max(0, Math.min(23 * 60, target))
}
```

Use the result in TimeGrid and rerun it when `date`, view identity, or resolved shifts change.

- [ ] **Step 4: Implement canvas and token refinements**

- Add inset padding around the schedule shell.
- Replace destructive current-time classes with semantic current-time tokens.
- Change mandatory snapping to proximity.
- Suppress off-shift shading when shift data failed.
- Keep labels only for blocks at least 64px tall.

- [ ] **Step 5: Run GREEN verification**

Run: `cd apps/web && ./node_modules/.bin/vitest run src/features/timeline/lib/geometry.test.ts src/features/timeline/time-grid.test.tsx src/features/timeline/timeline-responsive.test.tsx`

Expected: PASS.

- [ ] **Step 6: Review and checkpoint**

Commit isolated Task 4 hunks with message `fix(web): clarify the day timeline canvas`.

---

### Task 5: Appointment card density and interaction feedback

**Files:**
- Modify: `apps/web/src/features/timeline/appointment-card.tsx`
- Modify: `apps/web/src/features/timeline/appointment-card.test.tsx`
- Modify: `apps/web/src/features/timeline/timeline-page.tsx`

**Interfaces:**
- Consumes: appointment duration, statuses, drag preview, move and resize handlers
- Produces: compact, medium, and full density; stationary hover; larger resize hit target; preview time label

- [ ] **Step 1: Write failing density tests**

```tsx
expect(shortCard).toHaveAttribute("data-density", "compact")
expect(mediumCard).toHaveAttribute("data-density", "medium")
expect(longCard).toHaveAttribute("data-density", "full")
expect(card.className).not.toContain("hover:-translate-y")
expect(screen.getByTestId(`resize-${appointment.id}`)).toHaveClass("h-4")
expect(screen.getByTestId("drag-preview")).toHaveTextContent("09:00–10:00")
```

- [ ] **Step 2: Run RED verification**

Run: `cd apps/web && ./node_modules/.bin/vitest run src/features/timeline/appointment-card.test.tsx`

Expected: FAIL for missing medium density, hover translation, and small resize target.

- [ ] **Step 3: Implement density rules**

```ts
const density = contentDensity === "compact" || height < 48
  ? "compact"
  : height < 72
    ? "medium"
    : "full"
```

Render service in medium density when space permits, retain all hidden details for accessible naming, remove vertical hover transform, and enlarge the resize pointer area without making the handle visually heavy.

- [ ] **Step 4: Run GREEN verification**

Run: `cd apps/web && ./node_modules/.bin/vitest run src/features/timeline/appointment-card.test.tsx src/features/timeline/timeline-page.test.tsx`

Expected: PASS.

- [ ] **Step 5: Review and checkpoint**

Commit isolated Task 5 hunks with message `fix(web): make timeline cards readable at every duration`.

---

### Task 6: Mobile Day agenda and URL-backed filtering

**Files:**
- Modify: `apps/web/src/features/timeline/agenda-view.tsx`
- Modify: `apps/web/src/features/timeline/agenda-view.test.tsx`
- Modify: `apps/web/src/features/timeline/timeline-page.tsx`
- Modify: `apps/web/src/features/timeline/timeline-responsive.test.tsx`

**Interfaces:**
- Consumes: `dentistFilter`, `onDentistFilterChange`, date, appointments, dentists, and `onOpen`
- Produces: sticky Day-agenda filter, URL parameter `df`, compact rows, and Earlier/Upcoming grouping for today

- [ ] **Step 1: Write failing controlled-filter and grouping tests**

```tsx
render(<AgendaView dentistFilter={anong.id} onDentistFilterChange={onFilter} {...baseProps} />)
expect(screen.getByLabelText("Dentist")).toHaveTextContent("Dr. Anong")
await chooseDentist("Dr. Boon")
expect(onFilter).toHaveBeenCalledWith(boon.id)
expect(screen.getByTestId("agenda-filter-bar")).toHaveClass("sticky", "top-0")
expect(screen.getByTestId(`agenda-${early.id}`)).toHaveClass("min-h-16")
```

In the page test, assert selecting a dentist writes `df=<id>` and selecting All dentists removes it.

- [ ] **Step 2: Run RED verification**

Run: `cd apps/web && ./node_modules/.bin/vitest run src/features/timeline/agenda-view.test.tsx src/features/timeline/timeline-responsive.test.tsx`

Expected: FAIL because AgendaView owns local filter state and rows use the old spacing.

- [ ] **Step 3: Implement controlled URL state**

```ts
const DENTIST_FILTER_PARAM = "df"
const dentistFilter = params.get(DENTIST_FILTER_PARAM) ?? "all"

const setDentistFilter = (value: string) => {
  const merged = new URLSearchParams(params)
  if (value === "all") merged.delete(DENTIST_FILTER_PARAM)
  else merged.set(DENTIST_FILTER_PARAM, value)
  setParams(merged)
}
```

Make AgendaView controlled, add the sticky filter bar, compact row hierarchy, and visible status copy where icons are ambiguous.

- [ ] **Step 4: Run GREEN verification**

Run: `cd apps/web && ./node_modules/.bin/vitest run src/features/timeline/agenda-view.test.tsx src/features/timeline/timeline-responsive.test.tsx`

Expected: PASS.

- [ ] **Step 5: Review and checkpoint**

Commit isolated Task 6 hunks with message `feat(web): make the mobile agenda compact and shareable`.

---

### Task 7: Appointment and create sheet composition

**Files:**
- Modify: `apps/web/src/features/timeline/appointment-drawer.tsx`
- Modify: `apps/web/src/features/timeline/appointment-drawer.test.tsx`
- Modify: `apps/web/src/features/timeline/create-drawer.tsx`
- Modify: `apps/web/src/features/timeline/create-drawer.test.tsx`
- Modify: `apps/web/src/components/ui/sheet.tsx`
- Modify: `apps/web/src/components/ui/sheet.test.tsx`

**Interfaces:**
- Consumes: shared Sheet, appointment capabilities, patient query, existing form state
- Produces: adaptive mobile detail sheet, responsive form fields, initial patient prompt or five-row recent list, and resolved-only summary

- [ ] **Step 1: Write failing AppointmentDrawer tests**

Assert a completed read-only appointment requests an adaptive mobile treatment, long metadata uses `min-w-0 break-words`, and actionable appointments retain the working right/full-height surface.

```tsx
expect(screen.getByRole("dialog")).toHaveAttribute("data-sheet-layout", "adaptive")
expect(screen.getByTestId("appointment-meta")).toHaveClass("min-w-0")
```

- [ ] **Step 2: Write failing CreateDrawer tests**

```tsx
expect(screen.getByTestId("create-primary-fields")).toHaveClass("max-[359px]:grid-cols-1")
expect(screen.getAllByRole("button", { name: /\d{10}/ })).toHaveLength(5)
expect(screen.queryByText("Choose a service with Choose a dentist")).not.toBeInTheDocument()
expect(screen.getByTestId("create-missing-fields")).toHaveTextContent("Choose a service and patient")
```

- [ ] **Step 3: Run RED verification**

Run: `cd apps/web && ./node_modules/.bin/vitest run src/components/ui/sheet.test.tsx src/features/timeline/appointment-drawer.test.tsx src/features/timeline/create-drawer.test.tsx`

Expected: FAIL for missing adaptive layout, responsive grid contract, patient limit, and field guidance.

- [ ] **Step 4: Extend Sheet without adding a second overlay primitive**

Add `mobileLayout?: "full" | "adaptive"` to Sheet. Adaptive uses a bottom-aligned, rounded mobile surface with a safe maximum height and retains the existing right sheet from `sm` upward. Keep focus management, overscroll containment, safe areas, footer behavior, and Escape closing.

- [ ] **Step 5: Refine AppointmentDrawer and CreateDrawer**

- Choose adaptive layout only for read-only appointment details.
- Keep full working layout for Move, recurrence, and status actions.
- Make metadata resilient to long content.
- Stack dentist and time below 360px.
- Limit the unqueried patient list to five records; show all matching records after a query.
- Render the summary only from resolved service, dentist, time, repeat, and patient values.
- Add concise missing-field guidance linked to the disabled action.

- [ ] **Step 6: Run GREEN verification**

Run: `cd apps/web && ./node_modules/.bin/vitest run src/components/ui/sheet.test.tsx src/features/timeline/appointment-drawer.test.tsx src/features/timeline/create-drawer.test.tsx`

Expected: PASS.

- [ ] **Step 7: Review and checkpoint**

Commit isolated Task 7 hunks with message `fix(web): refine timeline appointment sheets`.

---

### Task 8: Complete loading, empty, and partial-error states

**Files:**
- Modify: `apps/web/src/features/timeline/timeline-page.tsx`
- Modify: `apps/web/src/features/timeline/timeline-page.test.tsx`
- Modify: `apps/web/src/features/timeline/time-grid.tsx`
- Modify: `apps/web/src/features/timeline/agenda-view.tsx`
- Modify: `apps/web/src/features/timeline/weekly-agenda-board.tsx`

**Interfaces:**
- Consumes: pending/error flags for branches, dentists, chairs, appointments, and shifts
- Produces: state-specific skeletons, callouts, empty states, and `showOffShift` safety behavior

- [ ] **Step 1: Write failing state tests**

Add focused tests for:

```tsx
expect(screen.getByTestId("timeline-loading")).toContainElement(screen.getByTestId("timeline-toolbar-skeleton"))
expect(screen.getByTestId("appointments-loading")).toBeInTheDocument()
expect(screen.getByText("Shift coverage could not be loaded")).toBeInTheDocument()
expect(screen.queryAllByTestId("offshift")).toHaveLength(0)
expect(screen.getByText("No chairs at this branch")).toBeInTheDocument()
expect(screen.getByText("No appointments this week")).toBeInTheDocument()
```

- [ ] **Step 2: Run RED verification**

Run: `cd apps/web && ./node_modules/.bin/vitest run src/features/timeline/timeline-page.test.tsx src/features/timeline/time-grid.test.tsx src/features/timeline/agenda-view.test.tsx src/features/timeline/weekly-agenda-board.test.tsx`

Expected: FAIL for the missing state-specific surfaces.

- [ ] **Step 3: Implement explicit state mapping**

```ts
const directoryPending = branches.isPending || dentists.isPending || chairsPending
const schedulePending = activeAppointments.isPending || activeShifts.isPending
const shiftsUnavailable = activeShifts.isError
const emptyChairs = view === "day" && columnMode === "chair" && !chairsPending && allChairs.length === 0
```

Render a structural loading skeleton, retain controls during schedule loading, show partial-data callouts, pass `showOffShift={!shiftsUnavailable}`, and render specific branch, dentist, chair, appointment, and filtered-empty states.

- [ ] **Step 4: Run GREEN verification**

Run: `cd apps/web && ./node_modules/.bin/vitest run src/features/timeline/timeline-page.test.tsx src/features/timeline/time-grid.test.tsx src/features/timeline/agenda-view.test.tsx src/features/timeline/weekly-agenda-board.test.tsx`

Expected: PASS.

- [ ] **Step 5: Review and checkpoint**

Commit isolated Task 8 hunks with message `fix(web): complete timeline schedule states`.

---

### Task 9: System verification and visual regression

**Files:**
- Modify when verified: `apps/web/e2e/visual.spec.ts`
- Modify when verified: `apps/web/e2e/a11y.spec.ts`
- Update when services are available: Timeline visual snapshots in `apps/web/e2e/visual.spec.ts-snapshots/`

**Interfaces:**
- Consumes: completed Tasks 1–8
- Produces: regression evidence across behavior, accessibility, build, contrast, and responsive visuals

- [ ] **Step 1: Run focused Timeline suite**

Run: `cd apps/web && ./node_modules/.bin/vitest run src/features/timeline src/components/shell/app-shell.test.tsx src/components/ui/sheet.test.tsx`

Expected: all focused tests pass without new warnings.

- [ ] **Step 2: Run full web verification**

Run: `cd apps/web && ./node_modules/.bin/vitest run`

Run: `cd apps/web && ./node_modules/.bin/tsc --noEmit -p tsconfig.json`

Run: `cd apps/web && ./node_modules/.bin/vite build`

Run: `cd apps/web && node scripts/verify-contrast.mjs`

Run: `git diff --check`

Expected: Vitest, TypeScript, build, contrast, and whitespace verification pass. Existing bundle-size warnings must be reported separately and not misrepresented as failures.

- [ ] **Step 3: Run browser and visual verification when local services are available**

Inspect 320px, 375px, 768px, 1024px, 1280px, and 1440px in light and dark themes. Verify Day, Week, Chairs, mobile filter, dense cards, empty states, appointment detail, and create flow. Confirm no body overflow, clipped focus rings, unreadable Week lanes, or touch targets below 44px.

Run: `pnpm --filter @dentalops/web e2e:a11y`

Run: `pnpm --filter @dentalops/web e2e:visual`

Expected: pass when PostgreSQL, Redis, MongoDB, API, and seeded demo services are available. If services are unavailable, record the exact environmental blocker and do not claim live visual success.

- [ ] **Step 4: Final patch review**

Run: `git diff --stat`

Run: `git status --short`

Confirm the final patch contains only approved Timeline redesign work plus explicitly identified pre-existing user changes.

- [ ] **Step 5: Final checkpoint**

Commit isolated verification changes with message `test(web): cover the timeline command center redesign` only when the index is clean of unrelated work.
