# DentalOps

[![CI](https://github.com/nkieu-config/dentalops/actions/workflows/ci.yml/badge.svg)](https://github.com/nkieu-config/dentalops/actions/workflows/ci.yml)

![React 19](https://img.shields.io/badge/React_19-149ECA?logo=react&logoColor=white)
![NestJS 11](https://img.shields.io/badge/NestJS_11-E0234E?logo=nestjs&logoColor=white)
![PostgreSQL 16](https://img.shields.io/badge/PostgreSQL_16-4169E1?logo=postgresql&logoColor=white)
![Redis 7](https://img.shields.io/badge/Redis_7-DC382D?logo=redis&logoColor=white)
![MongoDB 7](https://img.shields.io/badge/MongoDB_7-47A248?logo=mongodb&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript_strict-3178C6?logo=typescript&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)

**A multi-tenant dental scheduling system, built solo.** Patients book online while staff book at the desk, so the same dentist, chair, or equipment can be claimed twice for one slot. PostgreSQL exclusion constraints make that overlap impossible to store, not just unlikely.

**Live demo:** https://trydentalops.vercel.app

## Screenshots

<p align="center">
  <img src="docs/assets/readme/timeline-desktop.png" alt="DentalOps timeline showing four dentist columns of appointments for one branch on one day, each column headed by its booked and free hours" width="100%" />
</p>

<p align="center"><em>Timeline — one branch, one day, four dentists.</em></p>

<p align="center">
  <img src="docs/assets/readme/conflict-desktop.png" alt="The DentalOps timeline after an appointment was dragged onto a taken slot: a red toast names the appointment that blocked the move, and the dragged card has returned to its original time" width="100%" />
</p>

<p align="center"><em>A drag onto a taken slot: the database refuses it, the move rolls back, and the toast names the conflict.</em></p>

<p align="center">
  <img src="docs/assets/readme/roster-violations-desktop.png" alt="DentalOps roster for a week with a review queue panel listing one blocking coverage issue and one rest-period warning" width="100%" />
</p>

<p align="center"><em>Roster — the review queue separates coverage that blocks a booking from coverage that is only worth checking.</em></p>

<table>
  <tr>
    <td width="78%" valign="middle"><img src="docs/assets/readme/chairs-desktop-dark.png" alt="The same DentalOps day in dark theme, with columns grouped by chair instead of by dentist" width="100%" /></td>
    <td width="22%" valign="middle"><img src="docs/assets/readme/public-booking-mobile.png" alt="DentalOps public mobile booking flow showing branch and service choices with durations" width="100%" /></td>
  </tr>
  <tr>
    <td align="center"><em>The same day, by chair — dark theme.</em></td>
    <td align="center"><em>Public booking, on a phone.</em></td>
  </tr>
</table>

## Try it in 60 seconds

1. Open the [live demo](https://trydentalops.vercel.app) and select **Try as Owner** — no signup.
2. Drag an appointment onto a taken slot and watch the optimistic update roll back.
3. On a phone, open [public booking](https://trydentalops.vercel.app/book/demo-clinic), book a slot, then watch it reach the desktop timeline without a reload.

> [!NOTE]
> Free-tier hosting: the first API request after inactivity can take about a minute, and the demo clinic resets every six hours.

## How it works

```mermaid
flowchart LR
  Patient["Public booking"] --> Web["Browser"]
  Staff["Staff workspace"] --> Web
  Web -. "instant feedback" .-> Rules["Shared availability rules"]
  Web --> API["NestJS API"]
  API -->|"authoritative"| Rules
  API --> Postgres[("PostgreSQL constraints")]
  API --> Redis[("Redis cache")]
  API -. "Socket.IO" .-> Web
```

- **The database is the final authority.** One transaction claims every resource an appointment needs, and application code can't forget a rule that lives in a GiST constraint. [Database design](docs/database.md).
- **One availability engine runs in browser and server.** Instant feedback and server authority share the same scheduling rules. [Scheduling engine](docs/scheduling-engine.md).
- **Tenant isolation is enforced, not remembered.** An `AsyncLocalStorage` context and Prisma extension inject tenant filters; an unclassified route fails the isolation test. [Security model](docs/security.md).
- **The audit log can't take a booking down with it.** It lives in its own store rather than a table beside the bookings it records, and its writes are fire-and-forget. [Architecture](docs/architecture.md).

## Evidence

| Guarantee | Proof |
| --- | --- |
| Conflicting bookings cannot persist | [20 concurrent requests](apps/api/test/booking-race.spec.ts) produce one booking and nineteen 409s; four dentists racing for three chairs leave three winners on distinct chairs. [60 patients, one slot](apps/api/scripts/load/booking-contention.js) produce exactly one booking against the production image in CI. |
| Tenant routes cannot leak data | [Route discovery](apps/api/test/tenant-isolation.spec.ts) fails the build when a route is missing from the isolation registry, and a cross-tenant id returns 404 rather than the 403 that would confirm the row exists. |
| A public booking reaches staff in realtime | [Two browser contexts](apps/web/e2e/public-booking.spec.ts) confirm the timeline updates without reload. |
| Correctness survives a dead Redis | [With Redis unreachable](apps/api/test/booking-without-redis.spec.ts) a hold stops being a lock and becomes a signed token, so two patients can hold one slot, and PostgreSQL still lets exactly one of them book it. |
| A cache hit answers 2.6× faster | Predicted 2.5–3×, measured **2.6×** — p50 3.84 ms → 1.47 ms, p95 4.99 ms → 1.94 ms on all-hit traffic. [Method and caveats](docs/benchmarks/latency.md). |

The complete [testing evidence matrix](docs/testing.md) covers every headline guarantee, quality gate, and CI boundary.

## Tech stack

| Layer | Stack |
| --- | --- |
| **Frontend** | React 19, Vite, TanStack Query, Tailwind CSS |
| **Backend** | NestJS 11, Prisma, Socket.IO, BullMQ |
| **Scheduling data** | PostgreSQL 16 with GiST exclusion constraints |
| **Coordination** | Redis 7 — slot holds, availability cache, queues, idempotency keys |
| **Audit trail** | MongoDB 7 — append-only events behind a TTL index |
| **Quality & delivery** | Vitest, Jest, Playwright, Docker, GitHub Actions |

## Run it locally

Requires Node 22, pnpm 10, and Docker.

```bash
pnpm setup
pnpm demo:seed
pnpm dev
```

The web app starts at http://localhost:5173, health is at http://localhost:3001/api/v1/health (the deployed API answers the same route at [dentalops-api.onrender.com](https://dentalops-api.onrender.com/api/v1/health)), and local Swagger is at http://localhost:3001/api/docs. Daily infrastructure commands, reset safety, and local email inspection are in [setup notes](docs/setup.md).

## Documentation

- [Architecture](docs/architecture.md) — boundaries, data ownership, and the one rule that decides which layer may say a booking exists.
- [Booking](docs/booking.md) — transactions, lock ordering, and why a receptionist may take a slot a patient is still holding.
- [Security](docs/security.md) — tokens, tenant isolation, and a privilege escalation this project found in its own code and fixed.
- [Latency](docs/benchmarks/latency.md) — the prediction recorded before the cache was built, the method, and the caveats.
- [Load tests](docs/benchmarks/load.md) — sixty patients racing for one slot, and a cache benchmark that missed every request until it was rewritten.

## Limitations

- Single-timezone by design (Asia/Bangkok); the fixed-offset implementation is unsuitable for daylight-saving regions.
- Payments, insurance claims, and clinical records are out of scope.
- When MongoDB is unavailable the activity log stops recording and says so; bookings are unaffected.
- The hosted demo logs confirmation emails rather than sending them; the manage link is reachable from the booking confirmation screen.

## License

MIT — see [LICENSE](LICENSE).
