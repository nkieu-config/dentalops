# Availability

## Where the engine sits

Three layers answer "is this slot free?", and lower layers never trust upper ones:

1. **Client engine** (W6) — the same `@dentalops/availability` package running in the
   browser, for instant slot browsing.
2. **Server engine** — `GET /availability` runs `computeSlots` over Postgres rows.
   This is the authority the UI books against.
3. **EXCLUDE constraints** — the referee. If the engine is ever wrong, the booking
   transaction fails with 409 instead of double-booking.

`availability.spec.ts` closes the loop: it samples slots the API reports against the
431-appointment demo seed and books each one — a reported slot that the referee
rejects fails the suite.

## What a slot requires

A start time `s` (on the 15-minute grid) for a service of `duration` + `buffer`:

| Actor | Window | Rule |
|---|---|---|
| Dentist | `[s, s + duration)` | inside a shift, overlapping no confirmed appointment and no time block |
| Chair | `[s, s + duration + buffer)` | **one single chair** free for the whole window |
| Equipment | `[s, s + duration)` | per required type, one single unit free |

The chair outlives the appointment by `buffer` (cleaning), the dentist does not —
identical to the claim rows the booking API writes.

## Why "one single chair", not chair-counting

Chair 1 free 9:00–9:30 and chair 2 free 9:30–10:00 means *some* chair is free at
every instant of 9:00–10:00 — but an appointment lives on one chair, so the slot is
not bookable. Counting free chairs per instant (max-overlap) would report slots the
booking API then rejects with `RESOURCE_UNAVAILABLE`. The engine therefore asks
`∃ unit: free for the whole window`, mirroring `pickResources`. The unit test
"two partially free units cannot cover one window between them" pins this.

## Intervals

Half-open `[start, end)` epoch milliseconds everywhere — the same convention as the
database's `tstzrange(..., '[)')`. Back-to-back never conflicts, in the engine and
in the constraints, for the same reason.

## Time

The package is timezone-free: it computes on absolute epoch intervals. Recurrence
expansion is the one place local wall time exists, and it takes a fixed
`utcOffsetMin` (default 420 = Asia/Bangkok, which has had no DST since 1920).
A DST-observing deployment would need a real tz library — a documented,
deliberate simplification for a single-timezone product.

Recurrence semantics: weekdays are `0 = Sunday … 6 = Saturday` local; weeks anchor
on the Monday of the week containing `startsOn`; `monthly_date` skips months
without the date (Jan 31 → no Feb occurrence) without consuming `count`;
`count` counts from the series start; `endsOn` is inclusive.

## The API

`GET /availability?serviceId&branchId&from&to[&dentistId]` (any staff role) returns
`{ slots: [{ dentistId, startsAt, endsAt }] }`, sorted. Ranges over 31 days return
`400 RANGE_TOO_LARGE` — the public W6 route reuses this service, so the cap exists
before the endpoint is ever exposed unauthenticated. Time blocks with no `staffId`
are branch-wide closures and subtract from every dentist.

## Measured, then optimized

Every request's duration lands in an in-memory ring (last 512 per route);
`GET /internal/latency` (owner-only) reports p50/p95/p99/max per route. Availability
is computed live — no cache — until W8 measures it under the seeded load and adds
Redis caching with event-driven invalidation, quoting these numbers before and
after. Optimizing first would destroy the benchmark story.

Routes are keyed by the matched Express pattern (`GET /patients/:id`), not the
concrete URL, so ids never explode the map. The recorder is a global
`APP_INTERCEPTOR` using `finalize`, so a request that throws is still timed and
still counted. Interceptors run *after* the guard chain, so requests rejected by
`JwtAuthGuard` (401) or `RolesGuard` (403) never reach a handler and are therefore
not recorded — the ring measures handler work, which is what the W8 comparison
needs. The ring is per-process and resets on restart; nothing is persisted.
