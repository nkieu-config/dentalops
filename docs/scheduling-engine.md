# Scheduling engine

## Where it sits

Three layers answer "is this slot free?", and lower layers never trust upper ones:

1. **Client engine** — the same `@dentalops/availability` package running in the browser, for
   instant slot browsing.
2. **Server engine** — `GET /availability` runs `computeSlots` over Postgres rows. This is the
   authority the UI books against.
3. **EXCLUDE constraints** — the referee. If the engine is ever wrong, the booking transaction
   fails with 409 instead of double-booking.

`availability.spec.ts` closes the loop: it samples slots the API reports against the demo seed and
books each one — a reported slot the referee rejects fails the suite.

## What a slot requires

A start time `s` (15-minute grid) for a service of `duration` + `buffer`:

| Actor | Window | Rule |
|---|---|---|
| Dentist | `[s, s + duration)` | inside a shift, overlapping no confirmed appointment or time block |
| Chair | `[s, s + duration + buffer)` | one single chair free for the whole window |
| Equipment | `[s, s + duration)` | per required type, one single unit free |

Half-open `[start, end)` epoch milliseconds everywhere, matching the database's
`tstzrange(..., '[)')`. The chair outlives the appointment by `buffer` (cleaning); the dentist
does not — identical to the claim rows the booking API writes.

## Why "one single chair", not chair-counting

Chair 1 free 9:00–9:30 and chair 2 free 9:30–10:00 means *some* chair is free at every instant of
9:00–10:00 — but an appointment lives on one chair, so the slot is not bookable. Counting free
chairs per instant (max-overlap) would report slots the booking API then rejects with
`RESOURCE_UNAVAILABLE`. The engine asks `∃ unit: free for the whole window`, mirroring
`pickResources`.

## Time

Timezone-free: computes on absolute epoch intervals. Recurrence expansion is the one place local
wall time exists, using a fixed offset (Asia/Bangkok) — a documented, deliberate simplification
for a single-timezone product; a DST-observing deployment would need a real tz library.

## The API

`GET /availability?serviceId&branchId&from&to[&dentistId]` (any staff role) returns
`{ slots: [{ dentistId, startsAt, endsAt }] }`, sorted. Ranges over 31 days return `400
RANGE_TOO_LARGE` — the public booking route reuses this service, so the cap exists before the
endpoint is ever exposed unauthenticated. Time blocks with no `staffId` are branch-wide closures.

Latency is measured, not assumed: see [benchmarks](benchmarks/latency.md).
