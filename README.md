# DentalOps

[![CI](https://github.com/nkieu-config/dentalops/actions/workflows/ci.yml/badge.svg)](https://github.com/nkieu-config/dentalops/actions/workflows/ci.yml)
[![Try the demo](https://img.shields.io/badge/demo-try%20it-2563EB?logo=vercel&logoColor=white)](https://trydentalops.vercel.app)

![React 19](https://img.shields.io/badge/React_19-149ECA?logo=react&logoColor=white)
![NestJS 11](https://img.shields.io/badge/NestJS_11-E0234E?logo=nestjs&logoColor=white)
![PostgreSQL 16](https://img.shields.io/badge/PostgreSQL_16-4169E1?logo=postgresql&logoColor=white)
![Redis 7](https://img.shields.io/badge/Redis_7-DC382D?logo=redis&logoColor=white)
![MongoDB 7](https://img.shields.io/badge/MongoDB_7-47A248?logo=mongodb&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript_strict-3178C6?logo=typescript&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)

**A multi-tenant dental scheduling system, built solo.** It prevents a dentist, chair, or required procedure resource from being double-booked by making conflicting bookings impossible in PostgreSQL.

**Live demo:** https://trydentalops.vercel.app · **API health:** https://dentalops-api.onrender.com/api/v1/health

## Product tour

DentalOps keeps the front desk schedule and patient booking flow in one calm command center. Every screenshot below is regenerated from the running app by `pnpm --filter @dentalops/web e2e:readme` against a clock-pinned demo seed, so refreshing them after a UI change is one command rather than a screenshot session. All names and appointments are synthetic.

<p align="center">
  <img src="docs/assets/readme/timeline-desktop.png" alt="DentalOps timeline showing four dentist columns of appointments for one branch on one day, each column headed by its booked and free hours" width="100%" />
</p>

<p align="center"><em>Timeline — one branch, one day, four dentists. Each column header carries its own booked-versus-free load.</em></p>

<p align="center">
  <img src="docs/assets/readme/conflict-desktop.png" alt="The DentalOps timeline after an appointment was dragged onto a taken slot: a red toast names the appointment that blocked the move, and the dragged card has returned to its original time" width="100%" />
</p>

<p align="center"><em>The guarantee, on screen — a drag onto a taken slot is refused by the database, the optimistic move rolls back, and the toast names the appointment that blocked it.</em></p>

<p align="center">
  <img src="docs/assets/readme/roster-violations-desktop.png" alt="DentalOps roster for a week with a review queue panel listing one blocking coverage issue and one rest-period warning" width="100%" />
</p>

<p align="center"><em>Roster — the review queue separates coverage that blocks bookings from coverage that is merely worth checking.</em></p>

<table>
  <tr>
    <td width="78%" valign="middle"><img src="docs/assets/readme/chairs-desktop-dark.png" alt="The same DentalOps day in dark theme, with columns grouped by chair instead of by dentist" width="100%" /></td>
    <td width="22%" valign="middle"><img src="docs/assets/readme/public-booking-mobile.png" alt="DentalOps public mobile booking flow showing branch and service choices with durations" width="100%" /></td>
  </tr>
  <tr>
    <td align="center"><em>The same day by chair — the second resource axis, in the dark theme.</em></td>
    <td align="center"><em>Public booking — the patient path, on a phone.</em></td>
  </tr>
</table>

## Try it in 60 seconds

1. Open the [live demo](https://trydentalops.vercel.app) and select **Try as Owner** — no signup.
2. Drag an appointment onto a taken slot and watch the optimistic update roll back.
3. On a phone, open [public booking](https://trydentalops.vercel.app/book/demo-clinic), book a slot, then watch it reach the desktop timeline without a reload.

> [!NOTE]
> The demo uses free-tier hosting. Its first API request after inactivity can take about a minute, and the seeded clinic resets every six hours.

## The problem and the design

A dental appointment claims more than time: it needs a dentist, a chair, and sometimes equipment, while patients can book online at the same time staff are rescheduling at the desk. I built DentalOps to make a conflicting appointment impossible to persist, rather than merely unlikely.

1. A shared TypeScript availability engine gives the browser instant feedback from opening hours, shifts, appointments, blocks, and holds.
2. The NestJS API recomputes availability authoritatively and claims all required resources in one transaction.
3. PostgreSQL range exclusion constraints reject any remaining race; the successful booking then reaches staff through Socket.IO.

```mermaid
flowchart LR
  Patient["Public booking"] --> API["NestJS API"]
  Staff["Staff workspace"] --> API
  API --> Rules["Shared availability rules"]
  Rules --> Postgres[("PostgreSQL constraints")]
  API --> Redis[("Redis cache")]
  API --> Realtime["Socket.IO events"]
  Realtime --> Staff
```

## Decisions I'd defend in an interview

- **The database is the final authority.** GiST exclusion constraints over `tstzrange` make conflicting claims unrepresentable. [Database design](docs/database.md).
- **One availability engine runs in browser and server.** Instant feedback and server authority share the same scheduling rules. [Availability design](docs/availability.md).
- **Tenant isolation is enforced, not remembered.** An `AsyncLocalStorage` context and Prisma extension inject tenant filters; an unclassified route fails the isolation test. [Security model](docs/security.md).
- **The audit log cannot take a booking down with it.** It gets its own store rather than a table beside the bookings it records: writes are fire-and-forget, a 30-day TTL expires them, and reads walk `_id` backwards so paging never sorts. [Architecture](docs/architecture.md).

## Evidence

| Guarantee | Proof |
| --- | --- |
| Conflicting bookings cannot persist | [20 concurrent requests](apps/api/test/booking-race.spec.ts) produce one row and nineteen 409 responses. |
| Tenant routes cannot leak data | [Route discovery](apps/api/test/tenant-isolation.spec.ts) fails the build when a route is absent from the isolation registry. |
| A public booking reaches staff in realtime | [Two browser contexts](apps/web/e2e/public-booking.spec.ts) verify the timeline updates without reload. |
| Redis failure cannot break integrity | [Dead Redis](apps/api/test/booking-without-redis.spec.ts) still permits an end-to-end booking while conflicting patients cannot both win. |
| The production image survives contention | [60 patients, one slot](apps/api/scripts/load/booking-contention.js) produces exactly one booking in CI against Postgres, Redis, and MongoDB. |
| Audit failure cannot break a booking | [Dead MongoDB](apps/api/test/booking-without-mongo.spec.ts) still confirms a booking and rejects its duplicate; [audit tests](apps/api/test/audit.spec.ts) add a 30-day expiry, cursor paging that never sorts, and an owner-only tenant boundary. |

The complete [testing evidence matrix](docs/testing.md) covers every headline guarantee, quality gate, and CI boundary.

## Measured, then optimised

I predicted that caching availability would improve p50/p95 latency by 2.5–3× because database round trips dominated. The measured result was **2.6×**: p50 **3.84 ms → 1.47 ms** and p95 **4.99 ms → 1.94 ms**. [Method, caveats, and reproduction](docs/benchmarks/latency.md).

## Stack

| Layer | Stack | Why it matters |
| --- | --- | --- |
| **Frontend** | React 19, Vite, TanStack Query, Tailwind CSS | Public booking and staff scheduling stay responsive, and the timeline re-renders from realtime events without a reload. |
| **Backend** | NestJS 11, Prisma, Socket.IO, BullMQ | Clear domain boundaries, an authoritative booking flow, realtime events, and asynchronous work. |
| **Scheduling data** | PostgreSQL 16, GiST exclusion constraints | The source of truth: conflicting claims for time and resources cannot persist. |
| **Coordination** | Redis 7 | Slot holds, the availability cache, BullMQ queues, and idempotency keys. |
| **Audit trail** | MongoDB 7 | Append-only events with an open payload shape, expired by a TTL index and read by cursor. |
| **Quality & delivery** | Vitest, Jest, Playwright, Docker, GitHub Actions | Evidence runs from shared scheduling rules to browser journeys and production-image contention. |

## Quick start

Requires Node 22, pnpm 10, and Docker.

```bash
pnpm setup
pnpm demo:seed
pnpm dev
```

The web app starts at http://localhost:5173, health is at http://localhost:3001/api/v1/health, and local Swagger is at http://localhost:3001/api/docs. Daily infrastructure commands, reset safety, and local email inspection are in [development notes](docs/development.md).

## Further reading

- [Architecture](docs/architecture.md) — system boundaries, data ownership, resilience, and deployment.
- [Testing](docs/testing.md) — full evidence matrix, browser journeys, and CI gates.
- [Booking](docs/booking.md) — locking, holds, idempotency, and recovery.
- [Security](docs/security.md) — authentication, token boundaries, protected fields, and tenant isolation.
- [Rostering](docs/rostering.md) — shift validation rules, series edits, and the nightly horizon job.
- [Design system](docs/design-system.md) — tokens, the appointment colour scale, breakpoints, and the component inventory.
- [Benchmarks](docs/benchmarks/latency.md) — availability and load-test method, results, and caveats.

## Limitations

- The product is intentionally single-timezone and currently operates in Asia/Bangkok; its fixed-offset implementation is unsuitable for daylight-saving regions.
- Payments, insurance claims, and clinical records are outside this scheduling-focused scope.
- Free-tier cold starts can delay the first request; audit logging degrades visibly when MongoDB is unavailable, while booking correctness remains intact.

## About

Built solo by [Natthachak (@nkieu-config)](https://github.com/nkieu-config): product design, schema, backend, frontend, automated tests, CI, and deployment. I learned to put correctness-critical rules in database constraints and build-time enforcement rather than in developer memory.

📫 natthachak.config@gmail.com · [LinkedIn](https://www.linkedin.com/in/natthachak)
