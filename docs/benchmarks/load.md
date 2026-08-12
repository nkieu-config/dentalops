# Load tests

[latency.md](latency.md) measures one request at a time. These measure
what happens when many arrive at once. Scripts live in
`apps/api/scripts/load/`, run with [k6](https://grafana.com/docs/k6/latest/).

Both run against a **local** stack. The deployed API sits on a Render free
instance with a tenth of a CPU in front of a Redis that is currently over its
monthly command quota; a load test there would measure the host's throttling
and a degraded code path, not the application.

Both are CI gates: the `docker` job builds the production image, starts it
against real Postgres, Redis and MongoDB, and drives k6 through it, so the
claims below fail the build if they stop being true.

```bash
docker compose up -d
pnpm --filter @dentalops/api build
node apps/api/dist/main.js &

k6 run apps/api/scripts/load/booking-contention.js
k6 run apps/api/scripts/load/availability-read.js
```

## Sixty patients, one slot

`booking-contention.js` — 60 virtual users, one iteration each, every one of
them booking the **same** slot at the same moment.

| | |
|---|---|
| Appointments created | **1** |
| `409 SLOT_CONFLICT` | **59** |
| Unexpected statuses | **0** |
| Failed requests | 0 of 64 |
| p95 latency under contention | 132 ms |

This is the project's headline claim measured from outside the process.
`apps/api/test/appointments.spec.ts` already proves it with 20 concurrent
requests inside one Node process; this drives 60 over real HTTP and the
Postgres `EXCLUDE USING GIST` constraint still lets exactly one through. The
thresholds encode it — `appointments_created` must be greater than zero and
less than two, so the test fails both if nobody books and if two people do.

## Sustained reads

`availability-read.js` — 40 requests a second against `GET /availability`, run
twice: 30 seconds asking for the same day-aligned window, then 30 seconds each
asking for a window nobody has asked for before.

| Window | p50 | p95 | p99 | Failed |
|---|---|---|---|---|
| Warm — cache hit | 4.9 ms | 7.5 ms | 14.4 ms | 0 of 1201 |
| Cold — cache miss | 6.3 ms | 9.0 ms | 20.7 ms | 0 of 1201 |

The two scenarios exist because the earlier version of this script could not
tell them apart, and its numbers were read the wrong way round. It built its
window from `Date.now()`, and the cache entry key ends in the exact ISO
timestamps of `from` and `to` — so every request asked for a window one
millisecond off the last one and **every request missed**. Counting the keys
the run leaves in Redis shows it plainly: 1201 iterations used to leave 1201
entries behind. The rewritten warm scenario leaves one.

So the old reading — that latency fell at higher arrival rates because the
cache was warming up — was not what happened. Rate cannot warm a cache whose
key changes every millisecond; at 400/s the gain came from requests that
happened to land in the same millisecond as another, plus the usual JIT and
pool warm-up. The cache was doing nothing in that test at any rate.

Measured properly, the cache is worth about 1.4 ms at p50 and 6 ms at p99 on
demo-sized data — real, but small, because the cold path is already fast: the
availability engine issues its five reads in one `Promise.all` and the demo
tenant is small. The number to watch is the cold p99, since that is what a user
sees on the first request after any booking invalidates the day.

This still does not answer the question the script was originally written for —
whether capping the Prisma pool at 5 connections turned thrift into a queue.
The read path is too cheap to saturate a pool at this rate. What does answer it
is the contention test above: 60 simultaneous writes, each a transaction taking
row locks, through a pool of 5, with no failures. The pool is not the
constraint at this scale.

## What the contention test then found

A NestJS review flagged the resource claims being inserted one row at a time
inside the booking transaction. One or two extra round trips is nothing on an
idle system — but these happen while the transaction holds row locks, and 59
other transactions are queued behind them. Replacing the loop with a single
`createMany` was worth measuring rather than assuming.

| | p95 across runs | median |
|---|---|---|
| One `create` per claim | 194, 218, 231, 277, 299 ms | 231 ms |
| One `createMany` | 111, 116, 136 ms | **116 ms** |

Twice as fast under 60-way contention, and the two ranges do not overlap. The
same change is invisible on an uncontended request, which is why it took a load
test to see it at all.
