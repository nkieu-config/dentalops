# DentalOps

[![CI](https://github.com/nkieu-config/dentalops/actions/workflows/ci.yml/badge.svg)](https://github.com/nkieu-config/dentalops/actions/workflows/ci.yml)

Multi-tenant appointment and roster scheduling for dental clinics — double-booking prevented at the database level, not in application code.

**Live:** https://trydentalops.vercel.app · **API health:** https://dentalops-api.onrender.com/api/v1/health

> **Status: Week 0 of 8.** The walking skeleton is deployed — every layer of the stack is wired end to end and green in CI, but the product features are not built yet. Follow the design doc below to see where this is going.

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
| [W0 plan](docs/superpowers/plans/w0-foundation.md) | Task-by-task implementation plan for the foundation |

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
corepack enable
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
```

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
