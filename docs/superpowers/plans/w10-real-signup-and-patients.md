# W10 — Real Signup and Patients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the multi-tenancy that the API has always supported reachable from the browser — a stranger can create a clinic, add a dentist, roster them, and take a booking — and give the staff app the patients screen the design doc promised.

**Architecture:** No new infrastructure. One new API endpoint (`POST /staff`), one widened endpoint (`GET /patients/:id`), and five new screens in the existing React app. Forms are hand-rolled against Zod schemas from `@dentalops/contracts`; the repo has no form library and this week does not add one.

**Tech Stack:** NestJS 11, Prisma, PostgreSQL 16, React 19, TanStack Query, Zod v4, Vitest, Jest + Supertest, Playwright.

## Global Constraints

- No code comments. Well-named identifiers and clear structure carry the meaning.
- No `Co-Authored-By` or any AI-attribution trailer in commit messages.
- Never read, print, or commit `.env` contents.
- Cross-tenant denial is **404, never 403**. Within-tenant role denial is **403** with a machine-readable `errorCode`.
- Every new endpoint is registered in the isolation registry of `apps/api/test/tenant-isolation.spec.ts`. `REGISTRY` values are the string union `"public" | "auth-only" | "not-found" | "filtered"`, not objects.
- The repo is on **zod v4**: `z.uuid()`, `z.iso.datetime()`, `z.looseObject()`. Never `z.string().uuid()`.
- `prisma.patient.create` requires `email` (non-nullable). `POST /auth/login` requires `clinicSlug` as well as email and password.
- Jest reads its environment from `apps/api/.env`, not the repo root. New env vars must also be listed in `turbo.json`'s `test` task or CI cannot see them.
- Playwright reuses a running server and the API serves from `dist/`. Run `pnpm --filter @dentalops/api build` before any e2e run that touches new API code.
- Adding a field to a shared contract requires `pnpm --filter @dentalops/contracts build` before the API suite will see it.
- Run every gate **separately** with `--force`, echoing the exit code on its own line. Never pipe a gate into `grep` or `tail`; never chain with `&&`. Both have hidden red gates in this repo.

## Accessibility floor for every new screen

These are not suggestions; each has a test in the task that introduces it.

- A visible `<label>` per input, associated by `htmlFor`/`id`. Placeholder text is never the only label.
- Field errors render **below their field**, are referenced by `aria-describedby`, and the input carries `aria-invalid`. On a failed submit, focus moves to the first invalid field.
- Server errors that belong to a field land on that field, not in a toast. `409 SLUG_TAKEN` belongs on the slug input.
- Inputs declare `type` and `autoComplete` so mobile keyboards and password managers work: `email` → `type="email" autoComplete="email"`, password → `type="password" autoComplete="new-password"` on signup and `"current-password"` on login, phone → `type="tel" autoComplete="tel"`.
- The submit button disables while the request is in flight and says what it is doing.
- Touch targets are at least 44px tall on mobile; the existing `Input` is `h-9` (36px), so new form inputs use `h-11` on small screens.
- Every screen passes axe at 390px and 1440px with no serious or critical violations.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `apps/api/src/staff/staff.controller.ts` | `POST /staff` — create a colleague |
| `apps/api/src/staff/staff.service.ts` | Email uniqueness within the tenant, password hashing |
| `apps/api/src/staff/dto/create-staff.dto.ts` | Validation |
| `apps/api/src/staff/staff.module.ts` | Wiring |
| `apps/api/test/staff.spec.ts` | Role gate, duplicate email, tenant scope |
| `apps/api/test/signup-journey.spec.ts` | Signup → staff → shift → booking, over HTTP |
| `apps/web/src/features/auth/signup-page.tsx` | Create a clinic |
| `apps/web/src/features/auth/login-page.tsx` | Sign in to an existing clinic |
| `apps/web/src/features/auth/auth-form.tsx` | Shared field, error and layout primitives |
| `apps/web/src/features/auth/use-auth-form.ts` | Zod validation, field errors, submit state |
| `apps/web/src/features/auth/slug.ts` | Clinic name → URL slug |
| `apps/web/src/features/staff/staff-dialog.tsx` | Add a dentist or receptionist |
| `apps/web/src/features/patients/patients-page.tsx` | List, search, cursor paging |
| `apps/web/src/features/patients/patient-detail.tsx` | One patient and their appointments |
| Tests beside each of the above | |

**Modified:** `apps/api/src/patients/patients.service.ts`, `apps/api/src/app.module.ts`, `apps/api/test/mail.spec.ts`, `apps/api/test/tenant-isolation.spec.ts`, `packages/contracts/src/auth.ts`, `packages/contracts/src/directory.ts`, `packages/contracts/src/scheduling.ts`, `apps/web/src/routes.tsx`, `apps/web/src/pages/landing-page.tsx`, `apps/web/src/components/shell/app-shell.tsx`, `apps/web/src/features/timeline/timeline-page.tsx`, `apps/web/e2e/a11y.spec.ts`, `README.md`, `docs/superpowers/specs/dentalops-design.md`.

---

### Task 1: Stop `mail.spec.ts` failing on somebody else's leftovers

`apps/api/test/mail.spec.ts:222` asserts `prisma.appointment.findMany({ where: { patient: { phone: "0830000003" } } })` has length 1. The query is not scoped to a tenant, so any orphaned `mail-clinic-*` tenant — left behind whenever a run is interrupted before `afterAll` — makes it fail. CI never sees it because CI gets a fresh database. Doing this first means the rest of the week's runs are trustworthy.

**Files:**
- Modify: `apps/api/test/mail.spec.ts`

- [ ] **Step 1: Reproduce it**

Run the suite, kill it mid-run so `afterAll` never fires, then run `mail.spec.ts` alone:

```bash
pnpm --filter @dentalops/api exec jest test/mail.spec.ts
```

Expected: FAIL, `expected length 1, received 2` or higher. If it passes, no orphan exists yet — create one by inserting a second tenant with the same patient phone, confirm the failure, then continue.

- [ ] **Step 2: Scope the query to the tenant under test**

The spec already knows its own tenant. Replace the assertion:

```ts
    const stored = await prisma.appointment.findMany({
      where: { tenantId, patient: { phone: "0830000003" } }
    })
```

Read the spec's `beforeAll` for the exact variable holding the tenant id; if it only keeps a slug, look the id up once in `beforeAll` and store it.

- [ ] **Step 3: Prove the fix**

Leave the orphan in the database and run the spec again. Expected: PASS. Then delete the orphan:

```bash
pnpm --filter @dentalops/api exec prisma studio
```

or a one-off `deleteMany` on `mail-clinic-%` slugs. Confirm the spec still passes with a clean database too.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/mail.spec.ts
git commit -m "test(api): scope the mail assertion to its own tenant"
```

---

### Task 2: `POST /staff`

**Why this is in a plan about signup:** `AuthService.signup` (`apps/api/src/auth/auth.service.ts:51`) creates a tenant, one branch, three chairs, six services, and a single **owner**. It creates no dentist, and there is no endpoint to add one. Without this task, a real signup lands on a timeline with no columns, no way to roster anybody, and nothing bookable — a signup screen leading to a dead end is worse than no signup screen.

**Files:**
- Create: `apps/api/src/staff/staff.controller.ts`, `staff.service.ts`, `staff.module.ts`, `dto/create-staff.dto.ts`
- Modify: `apps/api/src/app.module.ts`, `packages/contracts/src/directory.ts`, `apps/api/test/tenant-isolation.spec.ts`
- Test: `apps/api/test/staff.spec.ts`

**Interfaces:**
- Produces: `POST /staff` accepting `{ name, email, password, role: "dentist" | "receptionist" }` and returning the same shape `GET /staff` already returns (`id`, `name`, `role`). Task 6's staff dialog and Task 7's journey test both consume it.

**Decisions:**
- **Owner only.** A receptionist cannot create colleagues. `@Roles("owner")`.
- **Role cannot be `owner`.** One owner per tenant is enough for this product, and letting a form mint owners is a privilege-escalation shape not worth having. The DTO restricts the union.
- **Duplicate email is `409 EMAIL_TAKEN`**, checked inside the same transaction as the insert so two concurrent requests cannot both pass the check. Email is compared lowercased, as `AuthService.login` looks it up lowercased.
- **The password is never echoed.** The response selects `id`, `name`, `role` only.

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/staff.spec.ts` covering: an owner creates a dentist and it appears in `GET /staff`; the created dentist can log in with the password given; a receptionist gets 403; a dentist gets 403; a duplicate email within the tenant gets `409 EMAIL_TAKEN`; the **same** email in a different tenant succeeds, proving the uniqueness is per-tenant; `role: "owner"` is rejected 400; the response body contains no `passwordHash`.

Model the setup on `apps/api/test/dentist-scope.spec.ts`, which already builds two tenants and logs in as several roles. Remember `POST /auth/login` needs `clinicSlug`.

- [ ] **Step 2: Run it, confirm 404**

```bash
pnpm --filter @dentalops/api exec jest test/staff.spec.ts
```

- [ ] **Step 3: The DTO**

Create `apps/api/src/staff/dto/create-staff.dto.ts`:

```ts
import { ApiProperty } from "@nestjs/swagger"
import { IsEmail, IsIn, IsString, MaxLength, MinLength } from "class-validator"

export class CreateStaffDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string

  @ApiProperty()
  @IsEmail()
  email!: string

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string

  @ApiProperty({ enum: ["dentist", "receptionist"] })
  @IsIn(["dentist", "receptionist"])
  role!: "dentist" | "receptionist"
}
```

- [ ] **Step 4: The service**

Create `apps/api/src/staff/staff.service.ts`:

```ts
import { Injectable } from "@nestjs/common"
import * as argon2 from "argon2"
import { AppException } from "../common/app.exception"
import { PrismaService } from "../prisma/prisma.service"
import { CreateStaffDto } from "./dto/create-staff.dto"

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateStaffDto) {
    const email = dto.email.toLowerCase()
    const passwordHash = await argon2.hash(dto.password)

    return this.prisma.scoped.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({ where: { email } })
      if (existing) {
        throw new AppException(409, "EMAIL_TAKEN", "Somebody in this clinic already uses that email")
      }
      return tx.user.create({
        data: { email, passwordHash, name: dto.name, role: dto.role },
        select: { id: true, name: true, role: true }
      })
    })
  }
}
```

`this.prisma.scoped` injects the tenant, so `findFirst` and `create` are already confined to the caller's clinic — that is what makes the same email legal in a different tenant.

- [ ] **Step 5: The controller and module**

```ts
import { Body, Controller, Post } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Roles } from "../auth/roles.decorator"
import { CreateStaffDto } from "./dto/create-staff.dto"
import { StaffService } from "./staff.service"

@ApiTags("staff")
@ApiBearerAuth()
@Controller("staff")
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Post()
  @Roles("owner")
  create(@Body() dto: CreateStaffDto) {
    return this.staff.create(dto)
  }
}
```

`StaffModule` provides both and is imported by `AppModule`. Note `GET /staff` already lives in `DirectoryController`; leaving the read there and putting the write here is fine, but say so in the module file's export list rather than duplicating the read.

- [ ] **Step 6: Contract and registry**

Add `staffMemberSchema` (`id`, `name`, `role`) and `createStaffSchema` to `packages/contracts/src/directory.ts` if a matching schema is not already there, then:

```bash
pnpm --filter @dentalops/contracts build
```

Register `"POST /staff": "auth-only"` in `apps/api/test/tenant-isolation.spec.ts`, matching how the neighbouring write routes are declared.

- [ ] **Step 7: Run the tests, mutation-test the role gate and the tenant scope**

Remove `@Roles("owner")` and confirm the two 403 cases go red. Replace `this.prisma.scoped` with `this.prisma` and confirm the "same email in a different tenant" case goes red. Restore both.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/staff apps/api/src/app.module.ts packages/contracts/src/directory.ts apps/api/test/staff.spec.ts apps/api/test/tenant-isolation.spec.ts
git commit -m "feat(api): let an owner add colleagues"
```

---

### Task 3: The shared form machinery

Two auth screens and a staff dialog need the same things: validate with a Zod schema, keep per-field errors, map a server `errorCode` onto a field, focus the first bad input. Write it once.

**Files:**
- Create: `apps/web/src/features/auth/use-auth-form.ts`, `auth-form.tsx`, `slug.ts`, and tests for each

**Interfaces:**
- Produces, consumed by Tasks 4, 5 and 6:
  ```ts
  export const useAuthForm: <T>(opts: {
    schema: ZodType<T>
    initial: Record<string, string>
    onSubmit: (values: T) => Promise<void>
    fieldForErrorCode?: (code: string) => string | null
  }) => {
    values: Record<string, string>
    errors: Record<string, string | undefined>
    set: (field: string, value: string) => void
    submit: (e: FormEvent) => void
    pending: boolean
    formError: string | null
  }

  export const Field: (props: {
    id: string
    label: string
    error?: string
    hint?: string
    children: (aria: { id: string; "aria-invalid": boolean; "aria-describedby": string | undefined }) => ReactNode
  }) => ReactElement

  export const toSlug: (clinicName: string) => string
  ```

- [ ] **Step 1: Write `slug.test.ts` first**

`toSlug` must satisfy the API's `/^[a-z0-9-]{3,40}$/`: lowercase, spaces and punctuation to single hyphens, no leading or trailing hyphen, truncated to 40, and Thai characters — which the clinic name may well contain — dropped rather than passed through. Assert that `toSlug("ยิ้มสวย ทันตคลินิก")` returns `""` so the caller knows to ask the user for a slug instead of submitting something the API will reject. That case is the one that matters: the seeded demo clinic has a Thai name.

- [ ] **Step 2: Implement `toSlug`, run the test**

- [ ] **Step 3: Write `use-auth-form.test.ts` first**

Cover: a Zod failure populates `errors` keyed by field path and does not call `onSubmit`; a successful parse calls `onSubmit` once with the parsed value; `pending` is true only while the promise is unsettled; an `ApiError` whose `errorCode` maps to a field lands there; an unmapped `ApiError` lands in `formError`; editing a field clears that field's error.

- [ ] **Step 4: Implement, run the test**

Use `ApiError` from `apps/web/src/lib/api.ts` for the error branch; do not invent a second error type.

- [ ] **Step 5: `Field`, with a test asserting the accessibility wiring**

The test must assert, via `getByLabelText`, that the label reaches the input, that `aria-invalid` is `true` only when an error is present, and that `aria-describedby` resolves to the error text — use `toHaveAccessibleDescription`, which resolves the reference, rather than reading the attribute string.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/auth
git commit -m "feat(web): form machinery for the auth screens"
```

---

### Task 4: Signup

**Files:**
- Create: `apps/web/src/features/auth/signup-page.tsx` + test
- Modify: `apps/web/src/routes.tsx`

**The slug problem, and how this screen solves it.** `POST /auth/signup` needs a `slug` matching `/^[a-z0-9-]{3,40}$/`, and "slug" means nothing to a dentist. The field is labelled **Clinic URL**, shown as `trydentalops.vercel.app/book/<slug>` so its purpose is visible, and prefilled from the clinic name via `toSlug` until the user edits it — after which it stops following. When `toSlug` returns `""`, which is what a Thai clinic name produces, the field stays empty with the hint "Latin letters, numbers and hyphens — this becomes your public booking link."

- [ ] **Step 1: Write the test first**

Cover: the URL field follows the clinic name until edited, then stops; submitting with a 6-character password shows the error under the password field and does not fire a request; a `409 SLUG_TAKEN` from the server puts its message under the Clinic URL field, not in a toast, and moves focus there; a success stores the session and navigates to `/app/timeline`; the submit button is disabled and reads "Creating your clinic…" while pending.

Use `msw` as `apps/web/src/features/booking/booking-page.test.tsx` does.

- [ ] **Step 2: Run it, confirm it fails**

- [ ] **Step 3: Build the screen**

Fields in this order: Clinic name, Clinic URL, Your name, Email, Password. Validate against a Zod schema that mirrors `SignupDto` exactly — 2–80 clinic name, slug regex, 1–80 name, email, 8–72 password. On success call `setSession(session)` **without** `{ demo: true }`, and remember the slug in `localStorage` under `dentalops.lastClinic` so Task 5 can prefill it.

- [ ] **Step 4: Route it**

`{ path: "/signup", element: <SignupPage /> }`, eagerly imported beside `BookingPage` — this is a first-impression screen and must not wait on a chunk.

- [ ] **Step 5: Run tests, commit**

```bash
git add apps/web/src/features/auth apps/web/src/routes.tsx
git commit -m "feat(web): create a clinic from the browser"
```

---

### Task 5: Login

**Files:**
- Create: `apps/web/src/features/auth/login-page.tsx` + test
- Modify: `apps/web/src/routes.tsx`

**The clinic slug problem.** `POST /auth/login` requires `clinicSlug`; nobody remembers one. Three mitigations, all testable: the field is prefilled from `localStorage.dentalops.lastClinic` when present; `?clinic=<slug>` in the URL overrides it, so a clinic can bookmark or share `/login?clinic=smile-dental`; and the field carries the hint "The clinic URL you chose at signup."

- [ ] **Step 1: Write the test first**

Cover: `?clinic=` prefills and beats `localStorage`; `localStorage` prefills when the query is absent; a 401 shows one message that does **not** reveal whether it was the email or the password that was wrong, and does not clear the typed email; a success stores the session and navigates to `/app/timeline`; the password input is `type="password"` with `autoComplete="current-password"`.

- [ ] **Step 2: Run it, confirm it fails**

- [ ] **Step 3: Build the screen, route it at `/login`, eagerly imported**

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/auth apps/web/src/routes.tsx
git commit -m "feat(web): sign in to an existing clinic"
```

---

### Task 6: Doors on the landing page, and a first run that goes somewhere

**Files:**
- Modify: `apps/web/src/pages/landing-page.tsx`, `apps/web/src/features/timeline/timeline-page.tsx`
- Create: `apps/web/src/features/staff/staff-dialog.tsx` + test

**Do not bury the demo.** The three "Try as …" buttons stay the primary call to action — they are how a recruiter sees the product in ten seconds. Sign in and Create a clinic go below them, visually secondary, in one line: "Already have a clinic? **Sign in** · **Create a clinic**".

**The first run.** A tenant fresh from signup has one branch, three chairs, six services, one owner, and **no dentists**. The timeline therefore has no columns. Today that renders as an empty grid, which reads as broken. It must instead say what to do and offer the doing: an `EmptyState` reading "No dentists yet — add your first colleague to start building a schedule" with a button opening `StaffDialog`, which posts to `POST /staff` and invalidates the dentists query. Show it only to owners; a receptionist on an empty clinic sees the same explanation without the button, because they cannot create staff.

- [ ] **Step 1: Write the tests first**

For the landing page: both links render and point at `/login` and `/signup`, and the three demo buttons are still present and still first in the accessibility tree.

For the timeline: with an empty dentist list and an owner session, the empty state and its button render; with a receptionist session the button does not; submitting the dialog posts `{ name, email, password, role }` and the dentists query refetches. For `StaffDialog`: a duplicate email returns `409 EMAIL_TAKEN` and the message lands under the email field.

- [ ] **Step 2: Run them, confirm they fail**

- [ ] **Step 3: Implement**

`StaffDialog` reuses `Sheet`, `Field` and `useAuthForm` — it is the same shape of form and must not grow a second implementation.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/landing-page.tsx apps/web/src/features/staff apps/web/src/features/timeline
git commit -m "feat(web): a signup that leads somewhere"
```

---

### Task 7: The journey, end to end

A test that fails if any link in the chain breaks — this is the task that proves W10's claim.

**Files:**
- Create: `apps/api/test/signup-journey.spec.ts`
- Modify: `apps/web/e2e/a11y.spec.ts`

- [ ] **Step 1: Write the API journey**

In one spec, over HTTP, with no direct Prisma writes except the final cleanup: sign up a new clinic → assert the session comes back with role `owner` → `POST /staff` a dentist → `GET /branches` and `GET /services` to pick ids the seed created → `POST /shifts` for that dentist tomorrow → `GET /availability` and assert at least one slot exists → `POST /appointments` into the first slot → assert 201 → `GET /appointments` and assert the booking is there. Finally, log in as the dentist created in step 3 and assert `GET /appointments` returns exactly that one booking, proving Task 1 of W9's scoping holds for a brand-new tenant too.

This is the test that would have caught the dead end this plan exists to fix: without `POST /staff` it cannot get past step 3.

- [ ] **Step 2: Run it, watch it pass, then mutation-test it**

Point the shift at the owner instead of the dentist and confirm the availability assertion goes red — otherwise the journey is not really checking that rostering drives availability.

- [ ] **Step 3: Add the new screens to the a11y sweep**

`/login` and `/signup` at 390px and 1440px, and the patients screen from Task 8 once it exists. Same blocking rule: serious and critical only.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/signup-journey.spec.ts apps/web/e2e/a11y.spec.ts
git commit -m "test: a new clinic can go from signup to a booked appointment"
```

---

### Task 8: Patients

**Files:**
- Modify: `apps/api/src/patients/patients.service.ts`, `packages/contracts/src/scheduling.ts`
- Create: `apps/web/src/features/patients/patients-page.tsx`, `patient-detail.tsx`, tests
- Modify: `apps/web/src/routes.tsx`, `apps/web/src/components/shell/app-shell.tsx`

**Widen `GET /patients/:id` first.** It currently returns the bare patient row (`patients.service.ts:58`), which makes a detail screen not worth opening. Include the patient's appointments — service name, dentist name, start, status — newest first, capped at 50. Add the fields to `patientSchema`'s detail variant in contracts as a separate `patientDetailSchema` rather than widening `patientSchema`, which the timeline embeds and must stay small.

**The list already supports what the screen needs:** `GET /patients?q=&cursor=&limit=` searches name and phone case-insensitively and pages on `(createdAt, id)`. Do not add a new query shape.

- [ ] **Step 1: Widen the endpoint, test first**

Assert the detail includes appointments ordered newest first, that the cap is 50, that a patient from another tenant is 404 not 403, and that `GET /patients` (the list) is unchanged in shape.

- [ ] **Step 2: The list screen**

Search box debounced 300 ms and reflected in the URL as `?q=`, so a search is shareable and survives a reload. `useInfiniteQuery` on `nextCursor` with a "Load more" button — not scroll-triggered loading, which is hostile to keyboard users. Rows are links to `/app/patients/:id`. Empty search results say so and offer to clear the search; an empty clinic says patients appear here once somebody books.

Follow `apps/web/src/features/activity/activity-page.tsx`, which already does query-with-cursor, skeletons, empty and error states — this screen is its sibling and should look like it.

- [ ] **Step 3: The detail screen**

Name, phone, email, and the appointment history as a list showing service, dentist, when, and status. Each past appointment links to the timeline on its day: `/app/timeline?d=<bkk date>&b=<branchId>`. Back link to the list preserving the search.

- [ ] **Step 4: Route and nav**

Replace the `OutOfScope` element at `routes.tsx` for `patients` with the real screen, add `{ path: "patients/:id" }`, and drop the `Users` import if it becomes unused. The nav item already exists and is visible to every role; leave it that way — `GET /patients` has no role gate, and both `POST` roles already match the existing `canBook`.

Delete the Patients entry from the README's "deliberately does not do" list; the Settings entry stays.

- [ ] **Step 5: Tests, then commit**

```bash
git add apps/api/src/patients packages/contracts/src/scheduling.ts apps/web/src/features/patients apps/web/src/routes.tsx apps/api/test
git commit -m "feat: the patients screen the design doc promised"
```

---

### Task 9: Reconcile and ship

- [ ] **Step 1: Documents**

- README: update the screen count from 7 to its new value, counted rather than assumed. Remove the Patients gap and the login gap from "What this deliberately does not do". Keep Settings, the read-only admin API — now with `POST /staff` and `POST /patients` as the exceptions — single timezone, cold starts, shifts not draggable between staff, Lighthouse not gated.
- Design doc: extend the "Reconciliation (W9)" section, or add a W10 sibling, recording that `POST /staff` was added because signup otherwise led nowhere, and that staff creation is capped at dentist and receptionist by design.
- Every count in the README must come from a run performed in this session.

- [ ] **Step 2: Gates, each run separately**

```bash
pnpm lint; echo "lint exit=$?"
pnpm turbo run typecheck --force; echo "typecheck exit=$?"
pnpm turbo run test --force; echo "test exit=$?"
pnpm turbo run build --force; echo "build exit=$?"
pnpm --filter @dentalops/api build; echo "api build exit=$?"
pnpm --filter @dentalops/web e2e; echo "e2e exit=$?"
```

- [ ] **Step 3: Push and watch**

```bash
git push origin main
gh run watch
```

- [ ] **Step 4: Production**

After Render redeploys, confirm `GET /api/v1/health` still reports `auditLog: "connected"`, then create a throwaway clinic on the live site and walk the journey once by hand. Report what you saw; do not claim it works without having done it.

---

## Exit criteria

1. A stranger can create a clinic at `/signup`, add a dentist, roster them, and book — without touching the database or the API directly.
2. `/login` works for the clinic they created, and the slug field is prefilled from their last signup or from `?clinic=`.
3. A dentist created through the UI logs in and sees only their own appointments.
4. The patients screen lists, searches and pages, and each patient shows their appointment history.
5. Both auth screens and the patients screen pass axe at 390px and 1440px.
6. `mail.spec.ts` passes with an orphaned tenant present in the database.
7. Every gate green, CI green, and no claim in the README that the system does not honour.
