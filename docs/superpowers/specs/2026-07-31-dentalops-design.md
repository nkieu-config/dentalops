# DentalOps — Design Document

**Date:** 2026-07-31
**Status:** Approved
**Working title:** DentalOps (rename allowed later)

Multi-tenant appointment & roster management for dental clinics. Portfolio flagship project for a junior full-stack (frontend-leaning) developer targeting the Bangkok job market.

---

## 1. Goals & Non-Goals

### Project goals (in priority order)

1. **Stand out from other juniors** — depth that survives a 40-minute technical interview, not a CRUD clone.
2. **Frontend-lean or balanced FE/BE weight** — target FE 45 / BE 40 / Shared+Infra 15. React strength must be visible.
3. **AI-era proof** — the hard parts are system-level decisions (constraint placement, recurrence storage, cache invalidation), not file-level code. README documents an AI-assisted workflow with tests/constraints as verification.
4. **Stack matches Bangkok JDs** — React, Node, Express (via NestJS), NestJS, PostgreSQL, MongoDB, Redis, Docker: all used with a defensible reason, none bolted on.
5. **Zero budget** — every service on a permanent free tier.

### Product summary

Clinics manage staff shifts (rostering with a validation engine) and take appointments that claim multiple resources simultaneously (dentist + dental chair + equipment). Patients book as guests through a public page. Conflict prevention is three-layered (client engine → server engine → DB exclusion constraint). Recurring series are supported for both appointments and shifts. Staff screens update in realtime.

### Non-goals (explicitly out of scope)

- Real payments, medical records / HIS features, drugs, insurance
- Patient accounts/login (guest flow only), SMS/OTP
- Multi-timezone support (fixed Asia/Bangkok; stored as UTC)
- i18n (UI is English; message strings isolated in constants for later i18n)
- Native mobile apps, chat, reviews, loyalty programs, BI reporting
- Full onboarding wizard (minimal signup + rich seeded demo tenant instead)

---

## 2. Users & Roles

| Role | Capabilities |
|---|---|
| **Patient** (guest, no account) | View slots → hold → book → view/reschedule/cancel via signed link in email |
| **Receptionist** | Full appointment management on timeline, book on behalf of phone-in patients |
| **Dentist** | View own schedule, set appointment status (completed / no-show) |
| **Owner/Admin** | Everything + shifts, branches, services, staff, clinic settings |

Multi-tenancy: minimal self-serve signup (clinic name + email + password → empty tenant with defaults) plus a **seeded demo tenant** (2 branches, 8 dentists incl. part-time, 500+ appointments, ortho series) with one-click **"Try as Receptionist / Dentist / Owner"** demo login.

---

## 3. Architecture

### Monorepo

```
dentalops/
├── apps/
│   ├── web/          React 19 + Vite — staff app + public booking (separate route groups)
│   └── api/          NestJS — REST + WebSocket gateway + BullMQ workers (single process)
├── packages/
│   ├── availability/ Pure TS, zero-dependency — interval arithmetic, recurrence
│   │                 expansion, slot computation. Runs in browser AND server.
│   ├── contracts/    Zod schemas + TS types shared by web/api (DTOs, event payloads)
│   └── config/       Shared eslint/tsconfig/prettier
├── docker-compose.yml   Postgres 16 + MongoDB + Redis for dev
└── .github/workflows/   CI: lint → typecheck → test → build → e2e → deploy
```

Tooling: pnpm workspaces + Turborepo. TypeScript strict everywhere.

### Deploy topology (zero budget)

```
Vercel (web) ──HTTPS──► Render free (api + workers, one process)
                          ├─► Neon Postgres (source of truth)
                          ├─► MongoDB Atlas M0 (audit logs)
                          └─► Upstash Redis (holds, cache, idempotency, BullMQ)
```

Accepted trade-off: Render free cold start (~1 min), mitigated with UptimeRobot ping. Documented as a deliberate cost decision.

### System principles

1. **Three-layer correctness:** client engine (fast UX) → server engine (authority) → DB exclusion constraint (last line). Lower layers never trust upper layers.
2. **All times stored UTC (`timestamptz`); rendered as Asia/Bangkok at the edge.** Single timezone product.
3. **Tenant isolation at the query layer** — enforced by a Prisma client extension injecting tenant scope from request context; proven by an automated cross-tenant test over every route.
4. **Measure before optimizing** — every optimization ships with before/after numbers.

### Key architecture decisions (alternatives considered)

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| Recurrence storage | **Hybrid: rule + materialized occurrences.** Appointment series (always finite) materialize fully at creation. Shift series (open-ended) keep a rolling 90-day horizon maintained by a nightly BullMQ job. Google-Calendar edit semantics: this / this-and-following (series split) / all. | (a) Rule-only with on-the-fly expansion — virtual occurrences can't be protected by EXCLUDE constraints. (b) Full materialization — impossible for open-ended shifts. | Every real row is constraint-protected; infinite recurrence still works; BullMQ gets a legitimate scheduled-job use. |
| Availability computation | **Compute live first, measure, then add Redis cache with event-driven invalidation in W8.** Latency recorded from W3 via NestJS interceptor. | Precomputed slot table (a second data-sync problem); caching from day one (optimizing before measuring). | Produces a genuine before/after benchmark — the strongest single artifact in the portfolio. |
| Patient identity | **Guest + stateless signed token** (appointment id + expiry) for manage links. | Patient accounts (duplicate auth system, ~1 week, no new depth); OTP (costs money, fake OTP looks fake). | Lightest, realistic, and its components (email queue, signed URLs) are already in the plan. |
| Multi-resource claim | **`resource_claims` child table, one row per physical resource, with its own EXCLUDE constraint.** `during` denormalized from the appointment (kept in sync in one transaction). | Resource arrays on the appointment row (EXCLUDE needs one row per resource). | Per-resource protection; multiple equipment units = separate rows, so "capacity" emerges from unit selection with no separate counting mechanism. |
| Holds | **Redis only, TTL 5 min** (`hold:{uuid}` + per-resource index). Availability subtracts confirmed appointments (Postgres) and live holds (Redis). | Postgres `held_until` column + cleanup job. | TTL is native; a clean, defensible Redis use. Postgres variant noted as the simpler alternative in interviews. |

---

## 4. Data Model

### PostgreSQL (source of truth)

```
tenants ─┬─ branches (opening_hours jsonb per weekday)
         ├─ users (staff: owner | receptionist | dentist)
         ├─ patients (created from guest bookings; matched by phone+email per tenant)
         ├─ services ── service_equipment_requirements ── equipment_types
         ├─ resources (type: chair | equipment; belongs to branch)
         ├─ shift_series ── shifts (materialized, rolling 90-day horizon)
         ├─ time_blocks (one-off blocks: lunch, leave)
         └─ appointment_series ── appointments ── resource_claims
```

Every table carries `tenant_id`.

#### appointments

```sql
id, tenant_id, branch_id, series_id NULL, service_id, dentist_id, patient_id,
during tstzrange, status appointment_status, version int, detached bool,
created_by, created_at, updated_at

CONSTRAINT no_dentist_overlap EXCLUDE USING GIST
  (dentist_id WITH =, during WITH &&) WHERE (status = 'confirmed')
```

`status`: confirmed | completed | cancelled | no_show. `version` powers optimistic concurrency on edits (stale PATCH → 409). `detached` marks occurrences edited away from their series rule.

#### resource_claims

```sql
id, tenant_id, appointment_id, resource_id, during tstzrange, status claim_status

CONSTRAINT no_resource_overlap EXCLUDE USING GIST
  (resource_id WITH =, during WITH &&) WHERE (status = 'active')
```

- `during` is denormalized; rescheduling updates parent + children in one transaction with **consistent lock ordering** (documented and tested — the deadlock story).
- Multiple units of the same equipment type are separate resource rows; booking assigns a free unit.

#### shifts / shift_series / time_blocks

```sql
shifts: CONSTRAINT no_staff_double_shift EXCLUDE USING GIST
  (staff_id WITH =, during WITH &&)
```

Prevents cross-branch self-overlap automatically. Breaks/leave are `time_blocks` (subtracted by the availability engine), not embedded in shifts.

#### Recurrence rule columns (custom subset, both series tables)

`freq (weekly | monthly_date)`, `interval`, `by_weekday int[]`, `time_start`, `duration_min`, `starts_on`, `ends_on | count`.

Exceptions are edits on materialized rows (`detached` flag). "This and following" closes the old series at a boundary and opens a new one (series split).

#### Prisma specifics

`tstzrange` via `Unsupported("tstzrange")`; `btree_gist` extension and all three EXCLUDE constraints in hand-written migration SQL. Tenant scoping via Prisma client extension. Postgres RLS is a stretch goal (defense in depth), not in the 8 weeks.

### MongoDB — single collection

```
audit_logs: { tenant_id, actor: {type, id, name}, action, entity: {type, id},
              before, after, at, request_id }
```

Written by a NestJS interceptor after successful mutations. Index `(tenant_id, at desc)`. Capped at 2 days of build effort: write path + simple activity feed, no fancy query UI. The Mongo rationale (append-only, write-heavy, flexible schema, no joins) is the talking point.

### Redis

| Key space | Purpose | TTL |
|---|---|---|
| `hold:{uuid}` + per-resource index | Slot holds during public booking | 5 min |
| `idem:{key}` | Idempotency-Key responses | 24 h |
| `avail:{branch}:{service}:{date}` | Availability cache (added in W8 only, after benchmarking) | event-invalidated |
| BullMQ queues | Confirmation emails, nightly shift-horizon job, demo reset (every 6 h) | — |

---

## 5. API Surface

Conventions: REST under `/api/v1`; full Swagger annotations; cursor pagination (`?cursor=&limit=`); single error contract `{ statusCode, errorCode, message, details?, requestId }` with machine-readable `errorCode` (`SLOT_CONFLICT`, `HOLD_EXPIRED`, …); `Idempotency-Key` header on critical mutations.

### Public (no auth, aggressively rate-limited)

```
GET  /public/:clinicSlug                      clinic, branches, services
GET  /public/:clinicSlug/availability         ?serviceId&branchId&from&to → daily slots
POST /public/:clinicSlug/holds                → { holdId, expiresAt }
POST /public/:clinicSlug/appointments         confirm (requires holdId + patient info)
GET  /public/manage/:token                    view booking via signed link
POST /public/manage/:token/cancel
POST /public/manage/:token/reschedule         goes through a fresh hold
```

### Auth (staff)

```
POST /auth/signup      minimal tenant creation
POST /auth/login       → short-lived access JWT + refresh (httpOnly cookie)
POST /auth/refresh
POST /auth/demo-login  { role } → demo tenant session
```

### Appointments (staff, tenant-scoped automatically)

```
GET    /appointments               ?branchId&from&to&dentistId (timeline query)
POST   /appointments               staff booking — no hold required (deliberate privilege)
POST   /appointments/series        creation reports per-occurrence conflicts before commit
PATCH  /appointments/:id           reschedule/edit; carries version → 409 when stale
PATCH  /appointments/:id/status    completed | no_show | cancelled
PATCH  /series/:id                 scope = this | following | all
```

Reschedule conflict contract: `409 + errorCode: SLOT_CONFLICT + details.conflictingAppointmentId` — consumed by the FE rollback UX.

### Roster (admin)

```
GET/POST/PATCH  /shifts, /shifts/series, /shift-series/:id
POST            /roster/validate     dry-run: draft shifts → violations
                                     [{ rule, severity: block | warn, detail }]
GET/POST/DELETE /time-blocks
```

`POST /roster/validate` is deliberately a separate dry-run endpoint so the UI can validate live while dragging. Violations include the flagship case: confirmed appointments falling outside an edited shift.

### Admin/settings (capped CRUD)

`/branches /services /equipment-types /resources /staff /patients` + `GET /audit-logs` (Mongo, cursor).

### WebSocket (Socket.IO, namespace `/realtime`, JWT at handshake)

Rooms per `tenant:branch`. Server events: `appointment.created|updated|cancelled`, `shift.changed` — emitted **after commit only**. FE performs targeted TanStack Query invalidation.

### Authorization

Guard chain: `JwtGuard → TenantScopeGuard → RolesGuard`. Dentists see only their own schedule and may only update their own appointment statuses (service-layer policy, tested per role).

---

## 6. UX — Screens, Flows, Responsive

### Screen inventory (11 screens, deliberately few)

```
Public                                Staff
├─ Landing + demo login buttons       ├─ Timeline            ← flagship 1
├─ Booking wizard (4 steps)           ← flagship 2
├─ Manage booking (signed link)       ├─ Roster editor       ← flagship 3
                                      ├─ Appointment drawer (side panel)
                                      ├─ Patients list + detail
                                      ├─ Settings (branches/services/resources/staff)
                                      ├─ Activity feed (simple)
                                      └─ Login / Signup
```

Design effort concentrates on the three flagship screens; the rest assemble from shadcn/ui.

### Flow 1 — Patient booking (mobile-first)

Service+branch → dentist (or "any dentist" → server assigns lowest-utilization) → calendar+slots → **selecting a slot POSTs a hold immediately** → patient details → confirm → email.

- **Hold countdown** banner driven by server `expiresAt` (never a local timer). Expiry returns to slot selection with a polite explanation.
- **Two-layer slot grid:** client-side engine answers instantly while browsing; server confirms on selection; if beaten to the slot, the grid updates in place and suggests the nearest free slot.

### Flow 2 — Receptionist timeline (the screen people remember)

Columns = dentists (switchable to chairs), rows = 15-min snap, shift shading (off-shift = unbookable). Interactions: drag-to-create (opens drawer pre-filled), drag-to-move and resize with **optimistic apply → on 409 snap back + toast naming the conflicting appointment + highlight**, click → drawer (status actions), series badge ⟳ → edit dialog (this / this & following / all). Other users' bookings **fade in via realtime within ~1 s** — the core demo moment: book on a phone, watch it appear on the desk screen.

Performance spec: virtualized time axis, 1,000+ appointments at 60 fps, full keyboard navigation (focus moves between appointments, Enter opens drawer, arrows move slot).

### Flow 3 — Roster editor

Week × staff grid, drag to create shifts, recurring shifts as translucent bars ⟳. While dragging: debounced `POST /roster/validate` → live violations panel (🔴 block / 🟡 warn). Flagship case: shrinking a shift with confirmed appointments → 🔴 "3 appointments fall outside this shift" + list + jump-links to the timeline.

### Flow 4 — Demo entry (most important for the portfolio)

Landing → three "Try as …" buttons → straight into the seeded timeline. Persistent demo-mode banner + reset button; data reseeded every 6 h by a BullMQ repeatable job.

### Designed states

Skeletons matching real layout; 409 errors explain the conflict while 5xx apologize and offer retry; empty states point to the first action; offline banner disables mutations.

### 6.1 Layout & responsive strategy

Two apps, opposite defaults:

| | Public (patients) | Staff app |
|---|---|---|
| Primary device | Mobile (Thai patients book on phones) | Desktop (front desk), but usable to 375 px |
| Approach | True mobile-first; desktop = centered `max-w-md` | Desktop-first, fully functional on mobile |

Standard Tailwind breakpoints (`sm 640 / md 768 / lg 1024 / xl 1280`).

**App shell (staff):** `lg+` sidebar (collapsible to icon rail) + topbar; `md` icon rail; `<md` bottom navigation (Timeline / Roster / Patients / Settings). Shell is a single CSS Grid; pages are shell-agnostic.

**Timeline adapts its interaction model, not just its width:**

| Breakpoint | Layout | Interaction |
|---|---|---|
| `lg+` | All columns (virtualize when dentists > 10) | Full drag create/move/resize |
| `md` | 2–3 columns, horizontal scroll-snap, sticky time gutter, column picker | Drag preserved |
| `<md` | Single dentist (swipe/segmented) or agenda list view | **No touch drag** (conflicts with scroll): tap → drawer → "Move" → slot picker (same component as the public page — deliberate reuse) |

Roster editor follows the same recipe (week grid → per-staff day list).

**Scale, both senses:**
1. *Data scale* — two-axis virtualization; branch filter is always the default scope; cursor pagination everywhere.
2. *Design scale* — four-layer component hierarchy: tokens (Tailwind theme) → primitives (shadcn/ui) → domain components (AppointmentCard, TimeGrid, SlotPicker, ViolationList, CountdownBanner; props-driven, no global-state awareness) → screens. Iron rule: no hard-coded colors/spacing outside tokens. Internal `/dev/ui` gallery route shows every domain component in every state (Storybook is a post-W8 stretch).

Responsive specs: no page-body horizontal scroll at any breakpoint; touch targets ≥ 44 px; Lighthouse mobile ≥ 90. Timeline is built responsive from W4 — never retrofitted.

---

## 7. Testing & Quality Gates

Philosophy: tests are **evidence, not ritual**. No repo-wide coverage threshold; every headline invariant has a named test cited in the README.

### packages/availability — Vitest, ~100% coverage

Unit tests over all interval operations and recurrence expansion (edges: touching boundaries, zero-length, midnight-crossing, holidays; series split loses/duplicates nothing). **Property-based tests (fast-check):** e.g. `subtract(A,B) ∪ (A∩B) = A`; any slot reported free must overlap no input appointment.

### apps/api — Jest + Supertest against real Postgres in Docker (no DB mocks)

| File | Proves |
|---|---|
| `booking-race.spec.ts` | 20 concurrent bookings for one slot → 1 success, 19 × 409, one row (with and without holds) |
| `deadlock.spec.ts` | Two concurrent reschedules claiming resources in opposite order → no deadlock (lock ordering) |
| `tenant-isolation.spec.ts` | Every route × foreign-tenant token → 404 (route list iterated automatically) |
| `roster-validate.spec.ts` | Every rule × block/warn incl. shrunken-shift-orphans case |
| `series-conflict.spec.ts` | 24-occurrence series conflicting at #17 → correct report, zero rows inserted |
| `hold-expiry.spec.ts` | Expired hold frees the slot; confirming with it → `HOLD_EXPIRED` |
| `idempotency.spec.ts` | Repeated POST with same key → same response, no duplicate |

### apps/web — Vitest + RTL + MSW

Only complex logic: timeline coordinate math / snap / overlap-layout (extracted as pure functions — deliberate design pressure), optimistic 409 rollback, recurring dialog payloads, booking-wizard reducer (incl. mid-flow hold expiry).

### E2E — Playwright (from W5, on every PR)

Exactly three journeys: (1) patient books → appears on staff timeline (two browser contexts = realtime tested), (2) drag-reschedule incl. beaten-to-slot rollback, (3) roster edit → violation → resolve.

### CI gates (GitHub Actions; branch protection on)

```
PR:    lint → typecheck → unit → integration (dockerized services) → build → e2e
main:  all of the above + deploy (Vercel/Render) + smoke /health
extra: manual benchmark job → results committed to repo
```

Deliberately not tested (and documented as such): framework behavior, full-page snapshots, coverage quotas.

---

## 8. Eight-Week Plan

Rhythm rule: **every week ends with a deployed, demoable increment.**

| Week | Focus | Delivered |
|---|---|---|
| **W0** (3–4 days, hard timebox) | 🏗️ Foundation | Turborepo, docker-compose, full CI, walking-skeleton deploy on real URLs, Sentry, contracts skeleton |
| **W1** | 🔩 Correctness base | Full schema + raw-SQL migrations (btree_gist, EXCLUDE ×3), auth + demo-login, Prisma tenant extension, `tenant-isolation.spec`, one-off shifts. Double-booking already impossible |
| **W2** | 🔩 Booking hardened | Appointments + resource_claims API, staff booking, series conflict report, `booking-race` / `deadlock` / `idempotency` specs, seed v1 |
| **W3** | 🧠 Availability engine | Whole shared package + property tests, `GET /availability`, latency interceptor starts recording |
| **W4** | 🎨 Timeline part 1 (protected — no BE spillover) | Shell, TimeGrid + virtualization, shift shading, click/drag-create + drawer, demo login UI, `/dev/ui` |
| **W5** | 🎨 Timeline part 2 (protected) | Drag/resize + optimistic 409 rollback, all three responsive modes, keyboard nav, Playwright J2 |
| **W6** | 🎨🔩 Public booking + realtime | Wizard, Redis holds + countdown, confirm + BullMQ email + signed manage links, Socket.IO both ends, Playwright J1 — the phone-to-desk demo moment |
| **W7** | 🔩🎨 Recurrence + rostering (riskiest week) | Appointment series + this/following/all dialog, shift series + nightly horizon job, validation engine, roster editor (reuses TimeGrid), Playwright J3 |
| **W8** | 📊 Measure → optimize → polish (~70% FE) | Benchmark on 500+ seeded appointments → Redis cache + invalidation → re-benchmark → charts in repo; a11y + Lighthouse ≥ 90; flagship polish; demo reset job; big README; Sentry review |

**W7 contingency (pre-declared):** series split ("this & following") may slip to early W8; roster editor may fall back to list-based (no drag) with the validation engine intact.

**Cut order if time compresses:** stretch goals → BE periphery (audit feed UI, settings breadth) → screen count (dentist view = read-only timeline) → *never*: the five BE core stories or the timeline component.

Weight check: FE ≈ 3.4 wk / BE ≈ 2.8 / Shared ≈ 1 / Infra ≈ 0.8 → **FE 45 / BE 40 / other 15**.

### Definition of Done

**System**
- [ ] Live URL; demo login → timeline within 5 s including cold start
- [ ] All 7 signature specs + 3 Playwright journeys green in CI
- [ ] Before/after benchmark numbers + charts committed
- [ ] Lighthouse mobile ≥ 90 (public), no horizontal body scroll at any breakpoint, timeline fully keyboard-operable
- [ ] No unhandled Sentry errors during the final week

**Portfolio**
- [ ] README: problem → decisions (with rejected alternatives) → numbers → links to signature tests → "How I built this" (AI workflow + verification)
- [ ] ARCHITECTURE.md + diagram; `pnpm dev` boots everything from scratch
- [ ] Two CV bullet variants written (FE-led / BE-led)

### Stretch (post-W8 only)

Auto-assign rostering (greedy + local search over the same availability engine), Vue 3 admin dashboard, Postgres RLS, Storybook, i18n, extract TimeGrid as a headless npm package, Terraform + LocalStack for the AWS story.

Parallel tracks outside this plan (start alongside W0): OSS contributions ~1 h/day targeting 5+ merged PRs; one article per two weeks harvested from weekly devlog notes.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| W0 infra yak-shaving | Hard 4-day timebox; cut and move on |
| W7 overload | Pre-declared contingency; roster editor reuses TimeGrid |
| Timeline scope creep | Performance/a11y specs are the finish line, not "feels done" |
| Render cold start hurting demos | UptimeRobot ping + 5-s DoD budget includes it |
| BE debugging eating FE polish (the classic failure) | W4/W5 protected; W8 declared ~70% FE in advance |
| Demo data trashed by visitors | 6-hourly reseed job + reset button |
