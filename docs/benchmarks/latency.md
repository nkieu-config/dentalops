# Availability latency

`GET /api/v1/availability` is the hot path: the staff timeline calls it on every date change, the
public booking wizard on every step. This records the numbers, the method, and enough detail to
reproduce them — a number without a method is an anecdote.

## What is measured

One fixed workload of authenticated `GET /api/v1/availability` requests, issued sequentially
against a **built** API (`node dist/main.js`) and the committed demo seed. Latency is wall-clock at
the client, from just before `fetch` to just after the body is read.

## Why the method looks like this

- **Warm up first.** The harness discards the first 32 requests plus one probe per shape — those
  measure Prisma's pool filling and V8 warming, not the query.
- **Fixed workload, fixed seed.** Same branch, services, dentist, window sizes, deterministic seed,
  every run.
- **Fixed weekday, not a fixed date.** The workload anchors on the next Tuesday (UTC), not an
  absolute date — otherwise a run on a Sunday (the demo clinic is closed) measures an empty answer
  for a quarter of the workload.
- **Never measure an empty answer.** Every shape is probed once before timing; the harness aborts
  if any returns zero slots.
- **Percentiles, not a mean alone.** A mean hides the tail users feel.
- **Record the row count**, so a reader can tell whether two runs measured the same database.
- **Built API, not the dev server** — `nest start --watch` runs an unbundled, watched pipeline;
  those are not the numbers anyone deploys.

## The workload

Four request shapes, cycled round-robin, 128 samples each:

| Shape | Service | Window | Dentist filter | Why it is here |
| --- | --- | --- | --- | --- |
| `day` | Cleaning | Tue → Tue+1 | none | What the staff timeline asks for |
| `week` | Cleaning | Tue → Tue+7 | none | What the booking wizard asks for; the widest common case |
| `week-one-dentist` | Cleaning | Tue → Tue+7 | first dentist | Narrow filter: few staff, small response |
| `week-equipment` | Root canal | Tue → Tue+7 | none | The only service needing equipment — exercises that query path |

Concurrency is 1: this measures one user's tail latency, which is what the UI shows.

## Reproducing

```bash
docker compose up -d postgres redis
pnpm install
pnpm --filter @dentalops/api db:generate
pnpm --filter @dentalops/api db:deploy
pnpm --filter @dentalops/api db:seed
pnpm --filter @dentalops/api build
pnpm --filter @dentalops/api start &          # node dist/main.js on :3001
pnpm --filter @dentalops/api benchmark
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `BENCH_BASE_URL` | `http://localhost:3001` | API origin |
| `BENCH_LABEL` | `before` | Report label and output filename |
| `BENCH_RUNS` | `512` | Timed requests; must be a multiple of 4 |
| `BENCH_WARMUP` | `32` | Discarded requests before timing |

## Server-side cross-check

A latency interceptor records p50/p95/p99 per route into a 512-sample ring buffer
(`GET /internal/latency`). `BENCH_RUNS` defaults to 512 — the ring size — so by the time the
harness reads it, the ring holds exactly the timed samples. The client sits consistently
**0.8–1.0 ms above** the server across a 100× range of response sizes, a flat gap that is neither
serialisation nor proportional to handler work: it is middleware, JWT verification (twice), and
loopback HTTP — work that happens outside the interceptor's timing window on both ends.
`before.json`'s headline numbers are the client's, because that is what the user feels.

## Machine

- Apple M4, 10 cores, 16 GB, macOS arm64, Node v22.18.0
- Postgres 16 and Redis 7 in Docker on the same machine

Localhost, same-machine Postgres. Absolute numbers on a networked deploy will be larger; the
*ratio* between two runs on the same machine is what transfers.

## Before — no cache exists yet

Recorded against commit `81f6796`, seed at 1,373 appointments / 399 shifts / 120 patients, ±60 day
horizon. Three runs, 512 timed requests each, median chosen by p95:

| Run | p50 | p95 | p99 | mean |
| --- | --- | --- | --- | --- |
| 1 | 3.809 | 5.647 | 8.474 | 4.075 |
| 2 | 3.498 | 4.733 | 5.694 | 3.636 |
| **3 (kept)** | **3.842** | **4.985** | **5.725** | **3.880** |

## What we expected the cache to do — written before any cache existed

A single Prisma round trip costs ~0.6 ms. `AvailabilityService.slots` issues seven queries in
three sequential waves — three waves at ~0.6–0.7 ms is ~2 ms, matching the measured server-side
floor of 2.17 ms for the narrowest request. Widening the window from one day to seven costs only
0.28 ms at p50, so window size is a minor factor; serialising 13.9 KB costs no more than 137 bytes.

> **Database round-trip latency dominates, not `computeSlots` or serialisation.** A cache that
> stores the computed slots removes the ~2.2 ms of query waves and replaces it with one Redis
> round trip. We expect **p50 around 1.2–1.6 ms, p95 around 2 ms — 2.5× to 3×, not 10×** — because
> ~0.8 ms of auth and HTTP is untouchable by any cache. If the result is dramatically better than
> 3×, the benchmark is probably measuring something other than what it claims.

Being wrong about this in public is fine. Deciding it afterwards would not be.

## After caching

Same harness, same workload, same seed, same machine — only the cache is new.

| Run | p50 | p95 | p99 | mean |
|---|---|---|---|---|
| 1 | 1.433 | 1.973 | 3.260 | 1.448 |
| 2 | 1.379 | 1.841 | 2.340 | 1.400 |
| **3 (kept)** | **1.468** | **1.938** | **2.325** | **1.498** |

![Availability latency before and after caching](comparison.svg)

| | before | after | ratio |
|---|---|---|---|
| p50 | 3.842 ms | 1.468 ms | **2.62×** |
| p95 | 4.985 ms | 1.938 ms | **2.57×** |
| p99 | 5.725 ms | 2.325 ms | **2.46×** |
| server-side p50 | 3.011 ms | 0.752 ms | 4.00× |

**The prediction was right.** Measured p50 1.468, p95 1.938, ratio 2.6× — all inside the predicted
band. Server-side time fell 4× while client-side fell 2.6×, exactly what a fixed ~0.8 ms of
untouchable auth/transport predicts. The agreement matters more than the speed-up: it means the
model of where the time went was correct.

## Caveats

- **This is a 100% hit rate.** After warm-up every request hits. The honest reading is "a cache
  hit is 2.6× faster," not "the endpoint is 2.6× faster."
- **The first request after any write pays full price.** A busy clinic invalidates the days it is
  booking, so the days people are actually looking at are the least likely to be cached.
- **Local Redis over loopback.** Production uses Upstash over the network; the ratio there will be
  smaller and has not been measured.
- **Absolute numbers are small either way.** 3.8 ms was not a problem. This was worth doing for the
  method and the invalidation correctness, not because users were waiting.
- **Cache correctness depends on every write invalidating.** A direct database write produces a
  stale answer until the 10-minute TTL expires; `availability-cache.spec.ts` proves the cache hit
  deliberately, using that property.

Concurrency is measured separately in [load.md](load.md).
