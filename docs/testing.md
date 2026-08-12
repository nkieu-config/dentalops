# Testing and quality

DentalOps treats tests as evidence for specific guarantees, not as a generic coverage target. Unit tests exercise shared rules and UI behavior; API integration tests run against real Postgres, Redis, and MongoDB; browser tests exercise the deployed interaction boundary; and CI runs a contention test through the production Docker image.

## Evidence matrix

| Guarantee | Evidence |
| --- | --- |
| Double-booking is unrepresentable, not merely unlikely | [booking-race.spec.ts](../apps/api/test/booking-race.spec.ts) sends 20 concurrent bookings for one slot and expects exactly one row plus nineteen 409 responses. |
| Concurrent reschedules cannot deadlock | [deadlock.spec.ts](../apps/api/test/deadlock.spec.ts) hammers opposite-order claims over a shared resource pool. |
| No route leaks across tenants | [tenant-isolation.spec.ts](../apps/api/test/tenant-isolation.spec.ts) discovers routes from the router and fails when a route is not classified. |
| The availability engine does not advertise an unbookable slot | [availability.spec.ts](../apps/api/test/availability.spec.ts) books returned slots through the real API. |
| A recurring series reports every conflict and inserts nothing | [series-conflict.spec.ts](../apps/api/test/series-conflict.spec.ts) checks savepoint conflict reporting and full rollback. |
| Shrinking a shift names the appointments it strands | [roster-validate.spec.ts](../apps/api/test/roster-validate.spec.ts) performs a dry run that returns exact appointment ids without writing. |
| A phone booking reaches the front desk | [public-booking.spec.ts](../apps/web/e2e/public-booking.spec.ts) uses two browser contexts and asserts no timeline reload. |
| Holds are a courtesy, not the authority | [public-booking.spec.ts](../apps/api/test/public-booking.spec.ts) lets staff win the race and verifies patient recovery. |
| Redis outage costs the courtesy, not the booking | [booking-without-redis.spec.ts](../apps/api/test/booking-without-redis.spec.ts) books end to end against dead Redis and prevents two racing patients from both winning. |
| The cache cannot serve stale availability | [availability-cache.spec.ts](../apps/api/test/availability-cache.spec.ts) covers invalidation, tenant isolation, and Redis-down behavior. |
| Demo reset cannot touch a real tenant | [demo-reset.spec.ts](../apps/api/test/demo-reset.spec.ts) mutation-tests the reset guard. |
| Keyboard users can bypass navigation and retain visible focus | [a11y.spec.ts](../apps/web/e2e/a11y.spec.ts) checks two WCAG 2.2 behaviors axe cannot infer. |
| No serious accessibility regression reaches CI | [a11y.spec.ts](../apps/web/e2e/a11y.spec.ts) runs axe at 390px and 1440px. |
| A password hash cannot leave the database by accident | [staff.spec.ts](../apps/api/test/staff.spec.ts) proves the Prisma omission boundary. |
| Patient data is scrubbed before Sentry reporting | [sentry-scrub.spec.ts](../apps/api/test/sentry-scrub.spec.ts) covers bodies, queries, headers, and nested payloads. |
| A dentist cannot read or mutate another dentist's schedule | [dentist-scope.spec.ts](../apps/api/test/dentist-scope.spec.ts) tests list filtering and NOT_YOUR_APPOINTMENT refusal. |
| Sixty patients racing for one slot yield one booking | [booking-contention.js](../apps/api/scripts/load/booking-contention.js) is a CI gate against the production image and real dependencies. |
| A patient manage link cannot act as staff | [token-scope.spec.ts](../apps/api/test/token-scope.spec.ts) rejects each token purpose in the wrong authentication boundary. |
| Audit failure cannot break a booking | [audit.spec.ts](../apps/api/test/audit.spec.ts) covers write path, TTL, tenant scope, and cursor behavior. |
| A new clinic can reach its first booked appointment | [signup-journey.spec.ts](../apps/api/test/signup-journey.spec.ts) performs signup, staffing, rostering, booking, and dentist login over HTTP. |

## Test layers

- **Shared packages and web UI:** Vitest validates availability rules, contracts, components, state transitions, and source-driven contrast checks.
- **API:** Jest and Supertest use real Postgres, Redis, and MongoDB services rather than database mocks.
- **Browser:** Playwright runs the user journeys below and an axe accessibility sweep.
- **Production boundary:** Docker builds the API image, starts it against real dependencies, and k6 drives booking contention and warm and cold availability reads.

The repository deliberately avoids a README test-count claim because test totals change whenever behavior is added. The CI badge is the current quality signal; this document states what that quality gate proves.

## Browser journeys

1. **Phone to desk:** a 390px patient booking appears in a desktop staff timeline through Socket.IO without reload.
2. **Drag to reschedule:** a staff drag updates optimistically; a conflicting second drag rolls back to the original appointment.
3. **Roster violation:** shortening a shift past confirmed appointments returns a blocking violation and keeps Save disabled.

## CI gates

On pull requests and pushes to main, [CI](../.github/workflows/ci.yml) runs the README workflow check, Prisma generation and migrations, lint, typecheck, tests, build, seeded Playwright e2e, and uploads browser traces after a failure.

A Docker job builds the production image, starts it with Postgres, Redis, and MongoDB, verifies health and audit connectivity, and runs two k6 load gates: the 60-patient contention test and a sustained availability read that measures the cache warm and cold separately.

Visual regression is intentionally conditional. The visual job starts only after Linux baseline snapshots exist; a [manual refresh workflow](../.github/workflows/visual-baseline.yml) creates a reviewable baseline-update pull request. Until Linux baselines are present, the preflight reports visual regression as unavailable rather than presenting a non-gate as a quality gate.

## Performance and accessibility

[Availability benchmarks](benchmarks/latency.md) record prediction, method, results, and caveats. The [load-test report](benchmarks/load.md) documents contention and sustained-read behavior.

Lighthouse is measured rather than gated because scores vary by machine and load. Deterministic accessibility gates are axe at desktop and mobile widths, keyboard/focus checks axe cannot determine, and a source-driven contrast verifier. [Lighthouse notes](benchmarks/lighthouse.md) document the mobile booking-page measurements.
