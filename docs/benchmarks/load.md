# Load tests

[latency.md](latency.md) measures one request at a time. These measure what happens when many
arrive at once. Scripts live in `apps/api/scripts/load/`, run with
[k6](https://grafana.com/docs/k6/latest/), against a **local** stack — the deployed API sits on a
Render free instance with a Redis currently over its monthly quota, so a load test there would
measure host throttling, not the application.

Both are CI gates: the `docker` job builds the production image, starts it against real Postgres,
Redis and MongoDB, and drives k6 through it, so these numbers fail the build if they stop being
true.

```bash
docker compose up -d
pnpm --filter @dentalops/api build
node apps/api/dist/main.js &

k6 run apps/api/scripts/load/booking-contention.js
k6 run apps/api/scripts/load/availability-read.js
```

## Sixty patients, one slot

`booking-contention.js` — 60 virtual users, one iteration each, every one booking the **same**
slot at the same moment.

| | |
|---|---|
| Appointments created | **1** |
| `409 SLOT_CONFLICT` | **59** |
| Unexpected statuses | **0** |
| Failed requests | 0 of 64 |
| p95 latency under contention | 132 ms |

`apps/api/test/booking-race.spec.ts` already proves this with 20 concurrent requests inside one
Node process; this drives 60 over real HTTP against the production image, and
`EXCLUDE USING GIST` still lets exactly one through.

## Sustained reads

`availability-read.js` — 40 requests/second against `GET /availability`, run twice: 30s of the
same day-aligned window (warm), then 30s of windows nobody has asked for before (cold).

| Window | p50 | p95 | p99 | Failed |
|---|---|---|---|---|
| Warm — cache hit | 4.9 ms | 7.5 ms | 14.4 ms | 0 of 1201 |
| Cold — cache miss | 6.3 ms | 9.0 ms | 20.7 ms | 0 of 1201 |

An earlier version of this script built its window from `Date.now()`, so every request asked for a
window one millisecond off the last one — every request missed, and the "cache warmed up at higher
arrival rates" reading was measuring JIT/pool warm-up, not the cache. Rewritten, the warm scenario
leaves one Redis key per run instead of one per iteration.

Measured properly, the cache is worth ~1.4 ms at p50 and ~6 ms at p99 on demo-sized data — real,
but small, because the cold path is already fast (five reads in one `Promise.all`, small demo
tenant). The number to watch is cold p99: what a user sees on the first request after a booking
invalidates the day.

## What the contention test found

A review flagged resource claims being inserted one row at a time inside the booking transaction —
cheap on an idle system, but the transaction holds row locks while 59 other transactions queue
behind it. Replacing the loop with a single `createMany`:

| | p95 across runs | median |
|---|---|---|
| One `create` per claim | 194, 218, 231, 277, 299 ms | 231 ms |
| One `createMany` | 111, 116, 136 ms | **116 ms** |

Twice as fast under 60-way contention, invisible on an uncontended request — which is why it took
a load test to see at all.
