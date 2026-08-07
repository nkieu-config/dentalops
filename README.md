# DentalOps

[![CI](https://github.com/nkieu-config/dentalops/actions/workflows/ci.yml/badge.svg)](https://github.com/nkieu-config/dentalops/actions/workflows/ci.yml)

Multi-tenant appointment and roster scheduling for dental clinics — double-booking prevented at the database level, not in application code.

**Live:** https://trydentalops.vercel.app · **API health:** https://dentalops-api.onrender.com/api/v1/health

> **Status: complete — eight build weeks shipped, a ninth that reconciled the spec with the system, a tenth that made the multi-tenancy reachable from a browser, an eleventh that replaced the visual identity, and a twelfth that completed Settings.** Staff scheduling, public booking, recurrence, rostering and owner-managed clinic settings are live. Open the demo, pick a role, and drag something.

## Try it in a minute

1. Open **https://trydentalops.vercel.app** and press **Try as Owner** — no signup.
   Free hosting sleeps; if the first press fails, wait a minute and press again.
2. Drag an appointment on the timeline. Drop it on a taken slot and watch it snap back.
3. Open **https://trydentalops.vercel.app/book/demo-clinic** on your phone, book a slot,
   and watch it appear on the desktop timeline **without a reload**.

The demo clinic rebuilds itself every six hours, so nothing you do there is permanent.

## What this is

A scheduling system for dental clinics where a single appointment must simultaneously claim a dentist, a chair, and any equipment the procedure needs. If any one of them is busy, the booking cannot exist. Getting that right under concurrent load — patients booking online while the front desk drags appointments around — is the engineering problem this project is built around.

Three things carry the weight:

- **A shared availability engine.** A zero-dependency TypeScript package that computes free time by intersecting shifts, opening hours, existing appointments, blocks, and live holds. It runs in the browser for instant UI feedback and on the server as the authority.
- **Correctness in three layers.** Client engine for speed, server engine for authority, and PostgreSQL `EXCLUDE USING GIST` constraints over `tstzrange` as the last line — so a double-booking is not merely unlikely, it is unrepresentable.
- **A timeline built from scratch.** No calendar library. Drag-and-drop with optimistic updates, conflict rollback, virtualization, and keyboard operation, adapting its interaction model down to 375px.

## Evidence

Every headline claim below is held up by a named test. If a claim stops being true, that test goes red.

| Claim | What proves it |
|---|---|
| Double-booking is unrepresentable, not merely unlikely | `apps/api/test/booking-race.spec.ts` — 20 concurrent bookings for one slot yield exactly one row and nineteen 409s |
| Concurrent reschedules cannot deadlock | `apps/api/test/deadlock.spec.ts` — opposite-order claims over a shared resource pool, hammered |
| No route leaks across tenants | `apps/api/test/tenant-isolation.spec.ts` — every route is discovered from the router and asserted; an undeclared route fails the build |
| The availability engine never lies | `apps/api/test/availability.spec.ts` — slots the engine reports are booked back through the real API and must all succeed |
| A recurring series reports every conflict and inserts nothing | `apps/api/test/series-conflict.spec.ts` — savepoints let the constraint judge each occurrence, then the whole transaction rolls back |
| Shrinking a shift names the appointments it strands | `apps/api/test/roster-validate.spec.ts` — a dry run that writes nothing and returns the exact appointment ids |
| A phone booking reaches the front desk over Socket.IO | `apps/web/e2e/public-booking.spec.ts` — two browser contexts, and the desk is never reloaded |
| Holds are a courtesy; the constraint is the authority | `apps/api/test/public-booking.spec.ts` — staff win the race, the patient's confirm gets 409 and the wizard recovers |
| A Redis outage costs the courtesy, not the booking | `apps/api/test/booking-without-redis.spec.ts` — the app runs against a dead Redis; a patient books end to end on a signed hold and two racing patients still cannot double-book |
| The cache cannot serve a stale answer | `apps/api/test/availability-cache.spec.ts` — six rules including tenant isolation and Redis being down |
| The demo reset cannot touch a real tenant | `apps/api/test/demo-reset.spec.ts` — the guard is mutation-tested |
| Keyboard users can skip the navigation, and a focused appointment is never hidden behind the sticky header | `apps/web/e2e/a11y.spec.ts` — two WCAG 2.2 criteria axe does not check, asserted in a real browser |
| No accessibility regressions | `apps/web/e2e/a11y.spec.ts` — axe at 390px and 1440px, failing on any serious or critical violation |
| A password hash cannot leave the database by accident | `apps/api/test/staff.spec.ts` — the Prisma client omits it globally, so a query has to ask for it by name; removing the omission turns the test red |
| No patient data reaches Sentry | `apps/api/test/sentry-scrub.spec.ts` — bodies, query strings, headers and nested payloads |
| A dentist cannot see or touch another dentist's schedule | `apps/api/test/dentist-scope.spec.ts` — the list filter and the `NOT_YOUR_APPOINTMENT` refusal, both mutation-tested |
| Sixty patients racing for one slot yield exactly one booking | `apps/api/scripts/load/booking-contention.js` — a CI job builds the production image, runs it against real Postgres, Redis and MongoDB, and drives 60 concurrent bookings of the same slot through it; the thresholds fail if nobody books and if two do. Numbers in [docs/benchmarks/load.md](docs/benchmarks/load.md) |
| A patient's manage link cannot act as staff | `apps/api/test/token-scope.spec.ts` — every token purpose is signed with its own derived key, so a manage or hold token is rejected as a bearer credential and a staff token is rejected as a manage link |
| An audit failure cannot break a booking | `apps/api/test/audit.spec.ts` — write path, 30-day TTL index, tenant scope, and a cursor that never repeats a row |
| A stranger's brand-new clinic can reach a booked appointment | `apps/api/test/signup-journey.spec.ts` — signup, hire a dentist, roster them, book the first free slot, and that dentist logs in to exactly one booking, all over HTTP |

## Measured, then optimised

![Availability latency before and after caching](docs/benchmarks/comparison.svg)

`GET /availability` against 1,373 seeded appointments, before and after a Redis cache with versioned
invalidation: **p50 3.84 ms → 1.47 ms, p95 4.99 ms → 1.94 ms (2.6×)**.

The number that matters more is that it was **predicted**. Before writing any cache, we recorded the
belief that DB round-trips dominated and that the win would therefore be 2.5–3×, not 10×, because
~0.8 ms of auth and HTTP is untouchable. All three measurements landed inside that band. Method,
caveats and the honest reading — a 100% cache-hit workload is not real traffic — are in
[docs/benchmarks/](docs/benchmarks/README.md).

## Documentation

| Document | Contents |
|---|---|
| [Design](docs/superpowers/specs/dentalops-design.md) | Scope, architecture decisions and rejected alternatives, data model, API surface, UX flows, testing strategy, 8-week plan |
| [Design system](docs/design-system/MASTER.md) | Tokens, breakpoint map, wireframes for the three flagship screens |
| [Booking](docs/booking.md) | How a booking happens, lock ordering, status semantics, idempotency, and the public hold lifecycle |
| [Availability](docs/availability.md) | The three correctness layers, what a slot requires, and why chairs are matched per-unit |
| [Rostering](docs/rostering.md) | The validation rules, why validation is a dry run, series edit scopes, savepoints, and the nightly horizon job |
| [Plans](docs/superpowers/plans/) | Task-by-task implementation plans, W0 through W10 |

## Stack

| Layer | Choice |
|---|---|
| Web | React 19, Vite, TanStack Query, Tailwind CSS, shadcn/ui |
| API | NestJS on Express, Socket.IO, BullMQ |
| Shared | Zero-dependency TypeScript packages for availability and contracts (Zod) |
| Data | PostgreSQL 16 (source of truth), Redis (holds, availability cache, idempotency, queues) |
| Audit | MongoDB 7 — the audit log is append-only, write-heavy, has a flexible per-action shape, and is never joined, so a document store fits it better than a table |
| Tooling | pnpm workspaces, Turborepo, Vitest, Jest + Supertest, Playwright, GitHub Actions |
| Packaging | Docker — a multi-stage image is what Render actually runs, and CI builds it and starts it against real Postgres, Redis and MongoDB on every push, so it cannot rot unnoticed |
| Hosting | Vercel, Render, Neon, Upstash, Sentry — all free tier, $0/month |

## Development

### First run

```bash
pnpm setup
pnpm demo:seed
pnpm dev
```

`pnpm setup` installs dependencies, creates `.env` only when it is absent, waits for Docker
infrastructure and applies Prisma migrations. `pnpm demo:seed` asks before recreating the demo tenant.

### Daily development

```bash
pnpm dev
```

This waits for Postgres, MongoDB and Redis in Docker, then starts NestJS on
http://localhost:3001/api/v1/health and Vite on http://localhost:5173. Ctrl-C stops only API and web;
Docker services keep their named volumes and continue running.

```bash
pnpm infra:up
pnpm infra:logs
pnpm infra:down
pnpm db:reset
```

`pnpm db:reset` deletes all local Prisma data and reseeds it after confirmation. It is never run by
`pnpm setup` or `pnpm dev`.

```bash
pnpm lint        # eslint across the workspace
pnpm typecheck   # tsc --noEmit in every package
pnpm test        # vitest (web, packages) + jest (api)
pnpm build       # turbo build, respecting the dependency graph
pnpm --filter @dentalops/web e2e   # playwright, all three journeys
```

`pnpm test` runs **667 tests across 92 files** — 263 Jest specs against real Postgres, Redis and
MongoDB in Docker, 337 Vitest tests in the web app, 60 in the availability engine and 7 in contracts.
`pnpm --filter @dentalops/web e2e` adds **21 Playwright checks**: the three journeys below plus the
accessibility sweep.

Three Playwright journeys plus an accessibility sweep run on every push, with no retries:

- **J1 — phone to desk.** Two browser contexts in one test: a 390px phone books
  through the public wizard while a desktop context sits logged in on the staff
  timeline. The assertion is that the appointment appears on the desk **without a
  reload**, so a passing run means Socket.IO actually delivered.
- **J2 — drag to reschedule.** A staff drag moves an appointment optimistically,
  and a second drag onto a slot someone else has taken rolls back to where it
  came from.
- **J3 — roster violation.** Shrinking a shift past its booked appointments
  produces a blocking violation naming them, and Save stays disabled until it is
  resolved.

### Email costs nothing and is still real

`MailTransport` is an interface with two implementations chosen at construction:
`SmtpTransport` when `SMTP_URL` is set, and a structured logging transport
otherwise. Only that last hop is pluggable — the BullMQ queue, the retry policy
(3 attempts, exponential backoff) and the in-process worker are the real thing
either way, and they are exercised by the test suite and by every local booking.
`docker compose` also brings up mailpit, so local development can see actual
rendered mail at http://localhost:8026 without a paid provider or an account.

## What this deliberately does not do

Worth saying plainly, because the gaps are choices rather than oversights:

- **One timezone by decision, a fixed offset by accident.** Single-timezone was a scope choice made
  before the build: everything is stored UTC and rendered Asia/Bangkok, and multi-timezone is listed
  as a non-goal. The implementation underneath is narrower than that choice. Recurrence expansion,
  the nightly shift horizon and the roster week all compute against a hard-coded
  `BANGKOK_OFFSET_MIN = 420` — `series.service.ts`, `shift-series.service.ts` and
  `packages/availability/{recurrence,roster}.ts` — because a timezone library was dropped early and
  never replaced, which left a fixed offset as the only arithmetic available. Thailand has never
  observed daylight saving, so the shortcut and the decision agree here and the tests stay green;
  they would not agree in a country that moves its clocks. Display is not the weak part — the web
  app formats through `Intl.DateTimeFormat` with `timeZone: "Asia/Bangkok"`, real tz data. Fixing it
  means carrying an IANA zone per tenant and replacing that constant at four call sites with a
  zone-aware conversion; `expandRecurrence` already takes `utcOffsetMin` as a parameter that every
  caller lets default, which is the seam to widen first.
- **No payments, no insurance, no clinical records.** This is scheduling.
- **All eleven designed screens shipped.** The design doc counts “Login / Signup” as one entry. Owners
  can now use Settings to edit clinic details, branches and opening hours, services, chairs and
  equipment, and colleague roles or active status. Receptionists see a clear owner-access explanation
  instead of unusable controls.
- **The admin API now has its edit half.** Owner-only writes cover clinic profile, branches, services,
  resources and staff; deactivation preserves scheduling history. Authenticated staff retain the
  tenant-scoped directory reads Timeline and Roster require, without credentials or email fields.
- **A dead Mongo costs about five seconds at boot.** If `MONGODB_URL` is set but points at an
  unreachable server, the driver spends its full 5 s server-selection timeout before the provider
  gives up, and only then does the audit log degrade to a no-op. The API still starts and bookings
  still work — but that wait is paid on every boot until the URL is fixed or removed. Because that
  degradation is deliberately silent, `GET /api/v1/health` reports `auditLog: "connected" | "disabled"`
  so a misconfigured deployment is visible without reading logs.

  The first production deploy hit exactly this, and the error was misleading enough to be worth
  recording: Atlas answered the TLS handshake with `SSL alert number 80` — `tlsv1 alert internal
  error`. Nothing was wrong with TLS. Atlas refuses a connection from an IP outside its Network
  Access list by aborting the handshake rather than by saying so, and the allowlist entry created
  during setup had been a temporary one, which expires after six hours. Render's free tier has no
  static outbound IP, so the entry has to be `0.0.0.0/0` and permanent; the security boundary is the
  database user's password. The client also connects once at boot, so widening the allowlist does
  nothing until the service restarts.
- **Free-tier cold starts.** The API sleeps after inactivity, so the first request of the day takes
  about a minute. Documented rather than hidden, because it is the cost of $0/month hosting.
- **Shifts drag between days, not between staff.** `PATCH /shifts/:id` accepts times, not a new
  owner; moving a shift to a different dentist is a dialog edit.
- **The timeline's chair columns are read-only.** Switching columns from dentists to chairs disables
  drag entirely: no endpoint moves an appointment between chairs, and a chair column has no dentist
  to build a new appointment from. A drag that silently reassigned the wrong thing would be worse
  than no drag.
- **Lighthouse is measured, not gated.** Mobile performance on the public booking page sits at 93–94
  with accessibility at 100 and CLS at 0.088. The blocking gate is axe, which is deterministic.

  The number used to read 95, and that was an artefact rather than an achievement. `app.css` asked for
  the family `"Inter"` while `@fontsource-variable/inter` registers `'Inter Variable'`; nothing matched,
  so from W4 to W10 the browser downloaded a font it never rendered and every visitor without Inter
  installed locally read `system-ui`. CSS font fallback is silent, so there was no warning anywhere.
  W11 swapped to Plus Jakarta Sans and, for the first time, the declared typeface is the one that
  paints — which costs one 27 KB `woff2` on a simulated slow connection. A test now derives both the
  imported package and the declared family from source and fails if they disagree.

- **Colour is checked by a script, not by a checklist.** `pnpm --filter @dentalops/web verify:contrast`
  parses `app.css` and measures all 92 foreground/background pairs across both themes — body text on
  every surface, every button label, every semantic chip, input borders against WCAG 1.4.11's 3:1, and
  card text and stripes against all six appointment hues. It runs inside `pnpm test`, so a palette edit
  that breaks a ratio fails CI. It reads the shipped stylesheet rather than holding its own copy,
  because a verifier with a duplicated table verifies the duplicate.

- **Screenshots gate eight screens; the timeline is review material.** `pnpm --filter @dentalops/web
  e2e:visual` re-seeds and compares nine screens at four widths in both themes at zero pixel tolerance.
  The timeline is excluded from that promise: `layoutLanes` breaks a tie between two appointments
  sharing a start and an end with `id.localeCompare`, and the seed mints fresh UUIDs, so lane order can
  flip between re-seeds. Real users are unaffected — ids are fixed within a database. The activity feed
  has no screenshot at all, because this suite opens the roster eight times per run and each visit
  appends the audit row it would then photograph.

  Visual baselines are generated on Ubuntu. Until the first Linux snapshot PR is merged, the `visual` job
  reports that the baseline is unavailable and is not a gate. Afterwards it is a blocking CI job. A
  maintainer can run **Refresh visual baselines** from the branch containing an intentional UI change; it commits
  only Linux snapshots back to that branch, which must be reviewed before merging.

What a v2 would change first: extract the timeline into a headless package, put Postgres RLS behind
the Prisma tenant extension as defence in depth, and replace the fixed UTC offset with a real
timezone database before selling to a second country.

## Layout

```
apps/web              React 19 + Vite — staff app and public booking
apps/api              NestJS — REST, WebSocket gateway, background workers
packages/availability  Zero-dependency scheduling engine (shared browser/server)
packages/contracts     Zod schemas and types shared across web and api
packages/config        Shared tsconfig and lint configuration
```

## License

MIT — see [LICENSE](LICENSE).
