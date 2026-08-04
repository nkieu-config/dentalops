# Load tests

The benchmark in this directory measures one request at a time. These measure
what happens when many arrive at once. Scripts live in
`apps/api/scripts/load/`, run with [k6](https://grafana.com/docs/k6/latest/).

Both run against a **local** stack. The deployed API sits on a Render free
instance with a tenth of a CPU in front of a Redis that is currently over its
monthly command quota; a load test there would measure the host's throttling
and a degraded code path, not the application.

The contention run is a CI gate: the `docker` job builds the production image,
starts it against real Postgres, Redis and MongoDB, and drives k6 through it,
so the claim below fails the build if it stops being true. The read script
stays manual — see why at the end.

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

`availability-read.js` — a constant arrival rate against `GET /availability`
for 30 seconds.

| Arrival rate | p50 | p95 | Failed |
|---|---|---|---|
| 40 /s | 10.5 ms | 14.5 ms | 0 |
| 150 /s | 4.2 ms | 6.1 ms | 0 |
| 400 /s | 3.6 ms | 6.4 ms | 0 |

**Latency falls as load rises**, which is the opposite of what a saturating
system does, and the reason is worth stating plainly: the availability cache
added in W8 warms up. At 40/s a larger share of requests arrive cold and pay
for a live computation; at 400/s almost every one is a cache hit.

That makes this a weaker test than intended. It was written to check whether
capping the Prisma pool at 5 connections — the connection audit found Prisma
sizing itself from the container's *host* cpu count, 21 connections for an
instance allocated 0.1 of one — had turned thrift into a queue. It does not
answer that, because at this rate the read path barely reaches Postgres at all.

What does answer it is the contention test above: 60 simultaneous writes, each
one a transaction taking row locks, through a pool of 5, with no failures. The
pool is not the constraint at this scale.

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
