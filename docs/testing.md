# Testing and quality

Tests are evidence for specific guarantees, not a coverage target. Unit tests exercise shared
rules and UI behavior; API integration tests run against real Postgres, Redis, and MongoDB;
browser tests exercise the deployed interaction boundary; CI runs a contention test through the
production Docker image.

## Evidence matrix

| Guarantee | Evidence |
| --- | --- |
| Double-booking is unrepresentable, not merely unlikely | [booking-race.spec.ts](../apps/api/test/booking-race.spec.ts): 20 concurrent bookings for one slot, exactly one row plus nineteen 409s. |
| Concurrent reschedules cannot deadlock | [deadlock.spec.ts](../apps/api/test/deadlock.spec.ts) hammers opposite-order claims over a shared resource pool. |
| No route leaks across tenants | [tenant-isolation.spec.ts](../apps/api/test/tenant-isolation.spec.ts) discovers routes from the router and fails when one is unclassified. |
| The availability engine never advertises an unbookable slot | [availability.spec.ts](../apps/api/test/availability.spec.ts) books every returned slot through the real API. |
| A recurring series reports every conflict and inserts nothing | [series-conflict.spec.ts](../apps/api/test/series-conflict.spec.ts) checks savepoint reporting and full rollback. |
| Shrinking a shift names the appointments it strands | [roster-validate.spec.ts](../apps/api/test/roster-validate.spec.ts) dry-runs and returns exact appointment ids without writing. |
| A phone booking reaches the front desk | [public-booking.spec.ts](../apps/web/e2e/public-booking.spec.ts) uses two browser contexts and asserts no timeline reload. |
| Holds are a courtesy, not the authority | [public-booking.spec.ts](../apps/api/test/public-booking.spec.ts) lets staff win the race and verifies patient recovery. |
| Redis outage costs the courtesy, not the booking | [booking-without-redis.spec.ts](../apps/api/test/booking-without-redis.spec.ts) books end to end against dead Redis. |
| The cache cannot serve stale availability | [availability-cache.spec.ts](../apps/api/test/availability-cache.spec.ts) covers invalidation, tenant isolation, and Redis-down behavior. |
| Demo reset cannot touch a real tenant | [demo-reset.spec.ts](../apps/api/test/demo-reset.spec.ts) mutation-tests the reset guard. |
| Keyboard users can bypass navigation and retain visible focus | [a11y.spec.ts](../apps/web/e2e/a11y.spec.ts) checks two WCAG 2.2 behaviors axe cannot infer. |
| No serious accessibility regression reaches CI | [a11y.spec.ts](../apps/web/e2e/a11y.spec.ts) runs axe at 390px and 1440px. |
| A password hash cannot leave the database by accident | [staff.spec.ts](../apps/api/test/staff.spec.ts) proves the Prisma omission boundary. |
| Patient data is scrubbed before Sentry reporting | [sentry-scrub.spec.ts](../apps/api/test/sentry-scrub.spec.ts) covers bodies, queries, headers, nested payloads. |
| A dentist cannot read or mutate another dentist's schedule | [dentist-scope.spec.ts](../apps/api/test/dentist-scope.spec.ts) tests list filtering and the refusal. |
| Sixty patients racing for one slot yield one booking | [booking-contention.js](../apps/api/scripts/load/booking-contention.js) — a CI gate against the production image and real dependencies. |
| A patient manage link cannot act as staff | [token-scope.spec.ts](../apps/api/test/token-scope.spec.ts) rejects each token purpose in the wrong boundary. |
| Audit failure cannot break a booking | [booking-without-mongo.spec.ts](../apps/api/test/booking-without-mongo.spec.ts) books and rejects a duplicate with the audit log down. |
| A new clinic can reach its first booked appointment | [signup-journey.spec.ts](../apps/api/test/signup-journey.spec.ts) — signup, staffing, rostering, booking, dentist login over HTTP. |

## CI gates

On pull requests and pushes to main, [CI](../.github/workflows/ci.yml) runs lint, typecheck, Prisma
migrations, tests, build, and seeded Playwright e2e. A separate Docker job builds the production
image, starts it against real Postgres/Redis/MongoDB, verifies health and audit connectivity, and
runs two k6 gates: 60-patient contention and a sustained availability read.

Visual regression starts only after Linux baseline snapshots exist; a manual workflow refreshes
them. The README screenshots come from the same harness — `pnpm --filter @dentalops/web e2e:readme`
seeds the demo tenant at a pinned instant and drives the real UI; the conflict screenshot is a
rejected drag, not a mock — the suite fails if the database accepts the move.

## Performance and accessibility

[Availability benchmarks](benchmarks/latency.md) record prediction, method, results, and caveats.
[Load tests](benchmarks/load.md) cover contention and sustained-read behavior. The deterministic
accessibility gate is `a11y.spec.ts` — axe at desktop and mobile widths, keyboard and focus checks,
and a source-driven contrast verifier.
