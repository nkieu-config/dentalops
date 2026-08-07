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

## Three decisions I'd defend in an interview

- **The database is the final authority.** GiST exclusion constraints over `tstzrange` make conflicting claims unrepresentable. [Database design](docs/database.md).
- **One availability engine runs in browser and server.** Instant feedback and server authority share the same scheduling rules. [Availability design](docs/availability.md).
- **Tenant isolation is enforced, not remembered.** An `AsyncLocalStorage` context and Prisma extension inject tenant filters; an unclassified route fails the isolation test. [Security model](docs/security.md).

## Evidence

| Guarantee | Proof |
| --- | --- |
| Conflicting bookings cannot persist | [20 concurrent requests](apps/api/test/booking-race.spec.ts) produce one row and nineteen 409 responses. |
| Tenant routes cannot leak data | [Route discovery](apps/api/test/tenant-isolation.spec.ts) fails the build when a route is absent from the isolation registry. |
| A public booking reaches staff in realtime | [Two browser contexts](apps/web/e2e/public-booking.spec.ts) verify the timeline updates without reload. |
| Redis failure cannot break integrity | [Dead Redis](apps/api/test/booking-without-redis.spec.ts) still permits an end-to-end booking while conflicting patients cannot both win. |
| The production image survives contention | [60 patients, one slot](apps/api/scripts/load/booking-contention.js) produces exactly one booking in CI against Postgres, Redis, and MongoDB. |

The complete [testing evidence matrix](docs/testing.md) covers every headline guarantee, quality gate, and CI boundary.

## Measured, then optimised

I predicted that caching availability would improve p50/p95 latency by 2.5–3× because database round trips dominated. The measured result was **2.6×**: p50 **3.84 ms → 1.47 ms** and p95 **4.99 ms → 1.94 ms**. [Method, caveats, and reproduction](docs/benchmarks/README.md).

## Stack

React 19 + Vite · NestJS + Socket.IO + BullMQ · PostgreSQL 16 + Redis + MongoDB · pnpm workspaces + Turborepo · Vitest + Jest + Playwright · Docker + GitHub Actions

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
- [Benchmarks](docs/benchmarks/README.md) — availability and load-test method, results, and caveats.

## Limitations

- The product is intentionally single-timezone and currently operates in Asia/Bangkok; its fixed-offset implementation is unsuitable for daylight-saving regions.
- Payments, insurance claims, and clinical records are outside this scheduling-focused scope.
- Free-tier cold starts can delay the first request; audit logging degrades visibly when MongoDB is unavailable, while booking correctness remains intact.

## About

Built solo by [Natthachak (@nkieu-config)](https://github.com/nkieu-config): product design, schema, backend, frontend, automated tests, CI, and deployment. I learned to put correctness-critical rules in database constraints and build enforcement rather than developer memory.

📫 natthachak.config@gmail.com · [LinkedIn](https://www.linkedin.com/in/natthachak)
