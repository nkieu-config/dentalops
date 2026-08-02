# DentalOps

[![CI](https://github.com/nkieu-config/dentalops/actions/workflows/ci.yml/badge.svg)](https://github.com/nkieu-config/dentalops/actions/workflows/ci.yml)

Multi-tenant appointment and roster scheduling for dental clinics — double-booking prevented at the database level, not in application code.

**Live:** https://trydentalops.vercel.app · **API health:** https://dentalops-api.onrender.com/api/v1/health

> **Status: Week 6 of 8.** Staff scheduling and public booking are live. Patients book from a phone with no account; the slot is held in Redis for five minutes and the booking appears on the front-desk timeline over Socket.IO without a reload. Remaining: recurrence and rostering (W7), then measurement and optimisation (W8).

## What this is

A scheduling system for dental clinics where a single appointment must simultaneously claim a dentist, a chair, and any equipment the procedure needs. If any one of them is busy, the booking cannot exist. Getting that right under concurrent load — patients booking online while the front desk drags appointments around — is the engineering problem this project is built around.

Three things carry the weight:

- **A shared availability engine.** A zero-dependency TypeScript package that computes free time by intersecting shifts, opening hours, existing appointments, blocks, and live holds. It runs in the browser for instant UI feedback and on the server as the authority.
- **Correctness in three layers.** Client engine for speed, server engine for authority, and PostgreSQL `EXCLUDE USING GIST` constraints over `tstzrange` as the last line — so a double-booking is not merely unlikely, it is unrepresentable.
- **A timeline built from scratch.** No calendar library. Drag-and-drop with optimistic updates, conflict rollback, virtualization, and keyboard operation, adapting its interaction model down to 375px.

## Documentation

| Document | Contents |
|---|---|
| [Design](docs/superpowers/specs/dentalops-design.md) | Scope, architecture decisions and rejected alternatives, data model, API surface, UX flows, testing strategy, 8-week plan |
| [Design system](docs/design-system/MASTER.md) | Tokens, breakpoint map, wireframes for the three flagship screens |
| [Booking](docs/booking.md) | How a booking happens, lock ordering, status semantics, idempotency, and the public hold lifecycle |
| [Availability](docs/availability.md) | The three correctness layers, what a slot requires, and why chairs are matched per-unit |
| [Rostering](docs/rostering.md) | The validation rules, why validation is a dry run, series edit scopes, savepoints, and the nightly horizon job |
| [Plans](docs/superpowers/plans/) | Task-by-task implementation plans, W0 through W8 |

## Stack

| Layer | Choice |
|---|---|
| Web | React 19, Vite, TanStack Query, Tailwind CSS, shadcn/ui |
| API | NestJS on Express, Socket.IO, BullMQ |
| Shared | Zero-dependency TypeScript packages for availability and contracts (Zod) |
| Data | PostgreSQL 16 (source of truth), MongoDB (audit log), Redis (holds, cache, queues) |
| Tooling | pnpm workspaces, Turborepo, Vitest, Jest + Supertest, Playwright, GitHub Actions |
| Hosting | Vercel, Render, Neon, MongoDB Atlas, Upstash, Sentry — all free tier, $0/month |

## Development

```bash
pnpm install
docker compose up -d      # postgres 16, mongodb 7, redis 7
cp .env.example .env      # then fill in the connection strings
pnpm dev
```

Web on http://localhost:5173 · API on http://localhost:3001/api/v1/health

```bash
pnpm lint        # eslint across the workspace
pnpm typecheck   # tsc --noEmit in every package
pnpm test        # vitest (web, packages) + jest (api)
pnpm build       # turbo build, respecting the dependency graph
pnpm --filter @dentalops/web e2e   # playwright, all three journeys
```

Two Playwright journeys run on every push, with no retries:

- **J1 — phone to desk.** Two browser contexts in one test: a 390px phone books
  through the public wizard while a desktop context sits logged in on the staff
  timeline. The assertion is that the appointment appears on the desk **without a
  reload**, so a passing run means Socket.IO actually delivered.
- **J2 — drag to reschedule.** A staff drag moves an appointment optimistically,
  and a second drag onto a slot someone else has taken rolls back to where it
  came from.

### Email costs nothing and is still real

`MailTransport` is an interface with two implementations chosen at construction:
`SmtpTransport` when `SMTP_URL` is set, and a structured logging transport
otherwise. Only that last hop is pluggable — the BullMQ queue, the retry policy
(3 attempts, exponential backoff) and the in-process worker are the real thing
either way, and they are exercised by the test suite and by every local booking.
`docker compose` also brings up mailpit, so local development can see actual
rendered mail at http://localhost:8026 without a paid provider or an account.

## Layout

```
apps/web              React 19 + Vite — staff app and public booking
apps/api              NestJS — REST, WebSocket gateway, background workers
packages/availability  Zero-dependency scheduling engine (shared browser/server)
packages/contracts     Zod schemas and types shared across web and api
packages/config        Shared tsconfig and lint configuration
```

## License

MIT
