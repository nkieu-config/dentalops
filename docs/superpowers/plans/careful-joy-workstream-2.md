# Careful Joy Workstream 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the public entry, authentication, booking, confirmation and manage-booking journeys around the Careful Joy visual system while preserving every existing API and scheduling contract.

**Architecture:** Public composition is introduced through focused presentational components under `components/public`, while Landing, auth and booking features retain ownership of their current request, validation and navigation behaviour. `react-day-picker` is wrapped behind one tokenised `BookingCalendar` component; no vendor classes reach feature pages. The existing wizard reducer, hold lifecycle and manage-booking hooks remain the only workflow state owners.

**Tech Stack:** React 19, TypeScript, React Router 8, TanStack Query, Tailwind CSS v4, CVA, Radix AlertDialog, Motion, react-day-picker, Vitest, Testing Library, MSW and Playwright.

## Global Constraints

- Preserve `Plus Jakarta Sans Variable`, semantic Sea Glass tokens and the 4px spacing rhythm; do not add page-specific colour literals.
- Preserve route paths, authentication payloads, booking reducer transitions, hold/release behaviour, error codes and manage-token contracts.
- Public layouts are touch-first at 0–767px, retain 44px targets and use visible focus states; desktop composition enhances rather than hides actions.
- Use `react-day-picker` only through a DentalOps wrapper, with token classes and Bangkok date values (`YYYY-MM-DD`).
- Do not add Rive, calendar export, forgotten password or a second signup API request in this workstream.
- Render local recovery actions when demo/API access fails; never imply that a failed action succeeded.
- Every task starts red, ends green, refreshes only intentional visual snapshots and uses filenames without dates.

---

### Task 1: Public composition and landing hierarchy

**Files:**
- Create: `apps/web/src/components/public/public-shell.tsx`
- Create: `apps/web/src/components/public/public-shell.test.tsx`
- Create: `apps/web/src/components/public/clinic-day-story.tsx`
- Modify: `apps/web/src/components/shell/public-header.tsx`
- Modify: `apps/web/src/pages/landing-page.tsx`
- Modify: `apps/web/src/pages/landing-page.test.tsx`

**Consumes:** `Button`, `Card`, `StatusCallout`, `PublicHeader`, demo-login mutation and existing `/login` and `/signup` routes.

**Produces:** `PublicShell` with an optional public action region, `ClinicDayStory` for factual capability proof and a landing page that makes product entry primary while retaining explained role exploration.

- [ ] **Step 1: Write failing public-shell and landing tests**

```tsx
expect(screen.getByRole("link", { name: "Explore the demo" })).toHaveAttribute("href", "#demo-day")
expect(screen.getByRole("link", { name: "Create your clinic" })).toHaveAttribute("href", "/signup")
expect(screen.getByRole("heading", { name: "A calmer clinic day starts here." })).toBeVisible()
expect(screen.getByRole("region", { name: "Step into a clinic day" })).toBeVisible()
expect(screen.getByText("Team availability")).toBeVisible()
```

- [ ] **Step 2: Run the focused tests and confirm the missing hierarchy fails**

Run: `pnpm --filter @dentalops/web exec vitest run src/components/public/public-shell.test.tsx src/pages/landing-page.test.tsx`

Expected: FAIL because `PublicShell`, the Explore link and the named demo region do not exist.

- [ ] **Step 3: Implement the public shell and landing composition**

```tsx
export const PublicShell = ({ children, actions }: PublicShellProps) => (
  <div className="flex min-h-dvh flex-col bg-background">
    <PublicHeader actions={actions} />
    {children}
  </div>
)
```

```tsx
<section id="demo-day" aria-labelledby="demo-day-title">
  <h2 id="demo-day-title">Step into a clinic day</h2>
  {roles.map((role) => <Button key={role.role} onClick={() => demoLogin.mutate(role.role)} />)}
</section>
```

- [ ] **Step 4: Re-run focused tests and verify demo recovery remains reachable**

Run: `pnpm --filter @dentalops/web exec vitest run src/components/public/public-shell.test.tsx src/pages/landing-page.test.tsx`

Expected: PASS, including the existing unavailable-demo recovery test.

- [ ] **Step 5: Commit the independently reviewable landing change**

```bash
git add apps/web/src/components/public apps/web/src/components/shell/public-header.tsx apps/web/src/pages/landing-page.tsx apps/web/src/pages/landing-page.test.tsx
git commit -m "feat(web): compose careful joy landing"
```

### Task 2: Calm sign-in and password visibility

**Files:**
- Create: `apps/web/src/features/auth/password-field.tsx`
- Create: `apps/web/src/features/auth/password-field.test.tsx`
- Modify: `apps/web/src/features/auth/auth-form.tsx`
- Modify: `apps/web/src/features/auth/login-page.tsx`
- Modify: `apps/web/src/features/auth/login-page.test.tsx`

**Consumes:** `PublicShell`, `useAuthForm`, `Field`, `FieldInput`, session persistence and the existing login schema.

**Produces:** A shared, labelled password visibility control and a login context surface that does not change form labels, request payload or failure privacy.

- [ ] **Step 1: Write failing password and login-context tests**

```tsx
expect(screen.getByRole("button", { name: "Show password" })).toBeVisible()
await user.click(screen.getByRole("button", { name: "Show password" }))
expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text")
expect(screen.getByText("Welcome back to your clinic")).toBeVisible()
```

- [ ] **Step 2: Run the focused auth tests and confirm failure**

Run: `pnpm --filter @dentalops/web exec vitest run src/features/auth/password-field.test.tsx src/features/auth/login-page.test.tsx`

Expected: FAIL because no visibility control or new context copy is rendered.

- [ ] **Step 3: Implement `PasswordField` and compose it into login**

```tsx
export const PasswordField = ({ label, value, onChange, autoComplete, error }: PasswordFieldProps) => {
  const [visible, setVisible] = useState(false)
  return <Field id="password" label={label} error={error}>{(aria) => <FieldInput {...aria} type={visible ? "text" : "password"} value={value} onChange={onChange} autoComplete={autoComplete} />}</Field>
}
```

```tsx
<AuthCard title="Welcome back to your clinic" subtitle="Your schedule and team are where you left them.">
  <form>{/* existing fields and submit behaviour */}</form>
</AuthCard>
```

- [ ] **Step 4: Re-run focused tests and preserve the current login request assertion**

Run: `pnpm --filter @dentalops/web exec vitest run src/features/auth/password-field.test.tsx src/features/auth/login-page.test.tsx`

Expected: PASS, including the exact `{ clinicSlug, email, password }` request body test.

- [ ] **Step 5: Commit the sign-in composition**

```bash
git add apps/web/src/features/auth/password-field.tsx apps/web/src/features/auth/password-field.test.tsx apps/web/src/features/auth/auth-form.tsx apps/web/src/features/auth/login-page.tsx apps/web/src/features/auth/login-page.test.tsx
git commit -m "feat(web): refine clinic sign in"
```

### Task 3: Staged signup and ready-to-start completion

**Files:**
- Create: `apps/web/src/features/auth/signup-progress.tsx`
- Create: `apps/web/src/features/auth/signup-progress.test.tsx`
- Modify: `apps/web/src/features/auth/signup-page.tsx`
- Modify: `apps/web/src/features/auth/signup-page.test.tsx`

**Consumes:** `toSlug`, `useAuthForm`, `PasswordField`, signup schema and the current `/auth/signup` request.

**Produces:** Two accessible visual sections—clinic identity then owner access—with live public-path preview and a post-success ready moment that still navigates to `/app/timeline` once the existing request succeeds.

- [ ] **Step 1: Write failing signup staging tests**

```tsx
expect(screen.getByText("1. Clinic identity")).toBeVisible()
expect(screen.getByText("2. Owner access")).toBeVisible()
expect(screen.getByLabelText("Public booking URL")).toHaveValue(expect.stringContaining("/book/bright-smile-dental"))
expect(recorded.signups[0]).toEqual({ clinicName, slug, name, email, password })
```

- [ ] **Step 2: Run the focused signup tests and confirm failure**

Run: `pnpm --filter @dentalops/web exec vitest run src/features/auth/signup-progress.test.tsx src/features/auth/signup-page.test.tsx`

Expected: FAIL because progress labels and the read-only booking URL preview are absent.

- [ ] **Step 3: Implement semantic signup progress and preview without splitting submission**

```tsx
<SignupProgress current="identity" />
<Field id="slug" label="Clinic URL" hint={SLUG_GUIDANCE}>{/* existing editable slug */}</Field>
<output aria-label="Public booking URL">{`${window.location.origin}/book/${form.values.slug}`}</output>
<SignupProgress current="owner" />
```

- [ ] **Step 4: Re-run signup tests, including `SLUG_TAKEN`, storage failure and exact API body**

Run: `pnpm --filter @dentalops/web exec vitest run src/features/auth/signup-progress.test.tsx src/features/auth/signup-page.test.tsx`

Expected: PASS with one signup request only.

- [ ] **Step 5: Commit the signup sequence**

```bash
git add apps/web/src/features/auth/signup-progress.tsx apps/web/src/features/auth/signup-progress.test.tsx apps/web/src/features/auth/signup-page.tsx apps/web/src/features/auth/signup-page.test.tsx
git commit -m "feat(web): stage clinic setup"
```

### Task 4: Booking clinic context, named stepper and time selection

**Files:**
- Create: `apps/web/src/features/booking/booking-stepper.tsx`
- Create: `apps/web/src/features/booking/booking-stepper.test.tsx`
- Create: `apps/web/src/features/booking/booking-calendar.tsx`
- Create: `apps/web/src/features/booking/booking-calendar.test.tsx`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/web/src/features/booking/booking-page.tsx`
- Modify: `apps/web/src/components/slot-picker.tsx`
- Modify: `apps/web/src/features/booking/steps/slot-step.tsx`
- Modify: `apps/web/src/features/booking/booking-page.test.tsx`

**Consumes:** current wizard reducer, public clinic query, `bkkDate` utilities and public availability query.

**Produces:** Tokenised named booking steps, clinic identity strip, one wrapped date picker and Morning/Afternoon/Evening slot groups without changing availability/hold input values.

- [ ] **Step 1: Write failing stepper, calendar and slot-period tests**

```tsx
expect(screen.getByRole("navigation", { name: "Booking progress" })).toHaveTextContent("Choose service")
expect(screen.getByRole("heading", { name: "Bright Smile Dental booking" })).toBeVisible()
expect(screen.getByRole("grid", { name: "Choose appointment date" })).toBeVisible()
expect(screen.getByTestId("group-evening")).toBeVisible()
```

- [ ] **Step 2: Run focused booking tests and confirm the missing public composition fails**

Run: `pnpm --filter @dentalops/web exec vitest run src/features/booking/booking-stepper.test.tsx src/features/booking/booking-calendar.test.tsx src/features/booking/booking-page.test.tsx`

Expected: FAIL because the progress bar has no named navigation, no calendar wrapper exists and evening slots are grouped with afternoon.

- [ ] **Step 3: Add `react-day-picker` and implement the wrapped calendar**

```bash
pnpm --filter @dentalops/web add react-day-picker
```

```tsx
export const BookingCalendar = ({ value, onChange }: BookingCalendarProps) => (
  <DayPicker mode="single" selected={parseBkkDate(value)} onSelect={(day) => day && onChange(formatBkkDate(day))} aria-label="Choose appointment date" />
)
```

- [ ] **Step 4: Compose the new context without changing the reducer contracts**

```tsx
<BookingStepper current={state.step} steps={STEP_ORDER} />
<SlotStep date={state.date} calendar={<BookingCalendar value={state.date} onChange={onDateChange} />} />
```

```tsx
const periodFor = (startsAt: string) => {
  const hour = Number(fmtTime(Date.parse(startsAt)).slice(0, 2))
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"
}
```

- [ ] **Step 5: Re-run booking tests and verify requests are unchanged**

Run: `pnpm --filter @dentalops/web exec vitest run src/features/booking/booking-stepper.test.tsx src/features/booking/booking-calendar.test.tsx src/features/booking/booking-page.test.tsx`

Expected: PASS, including existing availability query and held-slot request assertions.

- [ ] **Step 6: Commit the booking selection surface**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/components/slot-picker.tsx apps/web/src/features/booking
git commit -m "feat(web): clarify public booking selection"
```

### Task 5: Confirmation recap and manage-booking safety hierarchy

**Files:**
- Create: `apps/web/src/features/booking/manage-actions.tsx`
- Create: `apps/web/src/features/booking/manage-actions.test.tsx`
- Create: `apps/web/src/features/booking/booking-recap.tsx`
- Create: `apps/web/src/features/booking/booking-recap.test.tsx`
- Modify: `apps/web/src/features/booking/steps/details-step.tsx`
- Modify: `apps/web/src/features/booking/steps/confirmed-step.tsx`
- Modify: `apps/web/src/features/booking/booking-summary.tsx`
- Modify: `apps/web/src/features/booking/manage-page.tsx`
- Modify: `apps/web/src/features/booking/manage-page.test.tsx`

**Consumes:** current held-slot countdown, wizard IDs plus public clinic data, booking summary, `AlertDialog`, cancel/reschedule mutations and manage-token data.

**Produces:** `BookingRecap`, which derives selected branch, service, dentist and held time from wizard state plus public clinic data before confirmation; an explicit confirmation action; a visit-overview-first manage page; reschedule-first actions; and a safety-first cancellation dialog with `Keep appointment` first in keyboard and visual order.

- [ ] **Step 1: Write failing confirmation and manage safety tests**

```tsx
expect(screen.getByRole("region", { name: "Appointment recap" })).toBeVisible()
expect(screen.getByRole("button", { name: "Confirm appointment" })).toBeVisible()
expect(screen.getByRole("heading", { name: "Your upcoming visit" })).toBeVisible()
expect(within(dialog).getAllByRole("button").map((button) => button.textContent)).toEqual([
  "Keep appointment",
  "Cancel booking"
])
```

- [ ] **Step 2: Run focused confirmation/manage tests and confirm the hierarchy fails**

Run: `pnpm --filter @dentalops/web exec vitest run src/features/booking/booking-page.test.tsx src/features/booking/manage-actions.test.tsx src/features/booking/manage-page.test.tsx`

Expected: FAIL because recap landmarks, exact confirmation copy and safe cancellation action ordering are missing.

- [ ] **Step 3: Implement recap and reusable manage actions**

```tsx
<BookingRecap
  branch={clinic.branches.find((branch) => branch.id === state.branchId)}
  service={clinic.services.find((service) => service.id === state.serviceId)}
  dentist={clinic.dentists.find((dentist) => dentist.id === state.hold?.dentistId)}
  startsAt={state.hold.startsAt}
/>
```

```tsx
<AlertDialogFooter>
  <AlertDialogCancel asChild><Button variant="secondary">Keep appointment</Button></AlertDialogCancel>
  <AlertDialogAction asChild><Button variant="destructive">Cancel booking</Button></AlertDialogAction>
</AlertDialogFooter>
```

- [ ] **Step 4: Preserve recovery behaviour in the new composition**

Run: `pnpm --filter @dentalops/web exec vitest run src/features/booking/booking-page.test.tsx src/features/booking/manage-actions.test.tsx src/features/booking/manage-page.test.tsx`

Expected: PASS for cancelled, forged-token, expired hold and slot-conflict journeys as well as the new action order.

- [ ] **Step 5: Commit confirmation and management changes**

```bash
git add apps/web/src/features/booking/steps/details-step.tsx apps/web/src/features/booking/steps/confirmed-step.tsx apps/web/src/features/booking/booking-summary.tsx apps/web/src/features/booking/booking-recap.tsx apps/web/src/features/booking/booking-recap.test.tsx apps/web/src/features/booking/manage-actions.tsx apps/web/src/features/booking/manage-actions.test.tsx apps/web/src/features/booking/manage-page.tsx apps/web/src/features/booking/manage-page.test.tsx
git commit -m "feat(web): clarify booking follow through"
```

### Task 6: Public journey browser, accessibility and visual evidence

**Files:**
- Modify: `apps/web/e2e/public-booking.spec.ts`
- Modify: `apps/web/e2e/a11y.spec.ts`
- Modify: `apps/web/e2e/visual.spec.ts`
- Modify: `apps/web/e2e/screens.ts`
- Update: `apps/web/e2e/visual.spec.ts-snapshots/*-darwin.png`
- Update via workflow: `apps/web/e2e/visual.spec.ts-snapshots/*-linux.png`

**Consumes:** completed public page contracts and deterministic demo seed.

**Produces:** Browser proof for public booking recovery/manage cancellation safety, accessibility coverage for all public entry states and intentionally reviewed visual snapshots in both local and Linux CI environments.

- [ ] **Step 1: Add failing browser assertions for the public safety journeys**

```ts
await expect(page.getByRole("navigation", { name: "Booking progress" })).toBeVisible()
await expect(page.getByRole("region", { name: "Appointment recap" })).toBeVisible()
await page.getByRole("button", { name: "Cancel booking" }).click()
await expect(page.getByRole("button", { name: "Keep appointment" })).toBeFocused()
```

- [ ] **Step 2: Run the focused functional/a11y specs before updating snapshots**

Run: `pnpm --filter @dentalops/web e2e -- --grep "public|booking|manage"`

Expected: FAIL until the new public landmarks and manage confirmation order are implemented.

- [ ] **Step 3: Extend screenshot coverage for explicit booking/manage states**

```ts
await page.goto(`/book/demo-clinic`)
await expect(page.getByRole("heading", { name: /booking/i })).toBeVisible()
await expect(page).toHaveScreenshot("booking-public.png", { animations: "disabled" })
```

- [ ] **Step 4: Run the full public validation matrix**

Run: `pnpm --filter @dentalops/web verify:contrast && pnpm --filter @dentalops/web lint && pnpm --filter @dentalops/web typecheck && pnpm --filter @dentalops/web test && pnpm --filter @dentalops/web build && pnpm --filter @dentalops/web e2e && pnpm --filter @dentalops/web e2e:visual:update && pnpm --filter @dentalops/web e2e:visual`

Expected: all commands exit 0; snapshot changes are limited to public-flow intentional diffs.

- [ ] **Step 5: Commit reviewed evidence and publish the branch**

```bash
git add apps/web/e2e apps/web/e2e/visual.spec.ts-snapshots
git commit -m "test(web): cover careful joy public journey"
git push -u origin workstream/2-public-entry
```

## Self-review

- Spec coverage: Tasks 1–5 map landing, login/signup, booking, confirmation and manage-booking requirements directly; Task 6 supplies functional, accessibility and visual proof.
- Scope: No API contract, staff workspace, password recovery, calendar export or Rive scene is introduced. Signup remains one API request.
- Risk controls: Hold/release and reducer tests remain part of Task 4–5; each destructive cancellation assertion verifies no mutation occurs before confirmation.
- Visual gate: Darwin snapshots are reviewed locally; Linux snapshots are generated through the existing `Refresh visual baselines` workflow and must pass the enabled CI `visual` job.
