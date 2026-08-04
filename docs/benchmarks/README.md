# Availability benchmarks

`GET /api/v1/availability` is the hot path of this product: the staff timeline calls it on every
date change, and the public booking wizard calls it on every step. This directory holds the numbers,
the method that produced them, and enough detail that someone else can get the same numbers on their
own machine — a number without a method is an anecdote.

## What is measured

One fixed workload of authenticated `GET /api/v1/availability` requests, issued sequentially against
a **built** API (`node dist/main.js`), against the committed demo seed. Latency is wall-clock at the
client, from just before `fetch` to just after the whole response body has been read.

## Why the method looks like this

Each of these is a way a benchmark can quietly lie.

- **Warm up first.** The first requests measure Prisma's connection pool filling and V8 warming, not
  the query. The harness discards the first `BENCH_WARMUP` (32) requests plus one probe per shape.
- **Fixed workload, fixed seed.** The same branch, services, dentist and window sizes every run. The
  seed is deterministic (`mulberry32`, a single "today" anchor), so the rows are the same too.
- **Fixed weekday, not a fixed date.** The seed is anchored on the day it runs, so an absolute date
  is not reproducible. The workload anchors on **the next Tuesday (UTC)** instead, so a run on a
  Sunday and a run on a Thursday ask about a comparably busy week. Without this the `day` shape
  returns zero slots whenever the benchmark happens to run on a Sunday — the demo clinic is closed —
  and a quarter of the workload would be measuring an empty answer.
- **Never measure an empty answer.** The harness probes every shape once before timing anything and
  aborts if any of them returns zero slots.
- **Percentiles, not a mean alone.** A mean hides the tail users actually feel. The report carries
  p50/p95/p99/min/max/mean overall, and p50/p95/max per shape.
- **Record the row count.** `appointments` and `horizon` are in every report, so a reader can tell
  whether two runs were even measuring the same database.
- **Built API, not the dev server.** `nest start --watch` runs through a file watcher and an unbundled
  TypeScript pipeline; the numbers would not be the numbers anyone deploys.

## The workload

Four request shapes, cycled round-robin, `BENCH_RUNS / 4` samples each. Branch, dentist and service
are chosen deterministically: branches and dentists sorted by name, first one wins.

| Shape | Service | Window | Dentist filter | Why it is here |
| --- | --- | --- | --- | --- |
| `day` | Cleaning | Tue → Tue+1 | none | What the staff timeline asks for |
| `week` | Cleaning | Tue → Tue+7 | none | What the booking wizard asks for; the widest common case |
| `week-one-dentist` | Cleaning | Tue → Tue+7 | first dentist | The narrow-filter case: few staff, small response |
| `week-equipment` | Root canal | Tue → Tue+7 | none | The only service with an equipment requirement, so it exercises the extra query and the equipment pool inside `computeSlots` |

Concurrency is 1. This measures latency, not throughput — the tail of a single user's request, which
is what the UI shows.

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

The harness writes `docs/benchmarks/<label>.json`. It takes its base URL from the environment and
its credentials from `POST /auth/demo-login`; nothing is hard-coded and no secret is read from disk.

| Variable | Default | Meaning |
| --- | --- | --- |
| `BENCH_BASE_URL` | `http://localhost:3001` | API origin, without the `/api/v1` prefix |
| `BENCH_LABEL` | `before` | Report label, and the output filename |
| `BENCH_OUT` | `docs/benchmarks/<label>.json` | Explicit output path |
| `BENCH_RUNS` | `512` | Timed requests; must be a multiple of 4 |
| `BENCH_WARMUP` | `32` | Discarded requests before timing starts |
| `BENCH_ROLE` | `owner` | Demo role to log in as; `owner` is required for `/internal/latency` |
| `BENCH_TOKEN` | — | Skip `demo-login` and use this bearer token |

## The server-side cross-check

The W3 latency interceptor (`apps/api/src/common/latency.registry.ts`) has been recording p50/p95/p99
per route since week 3, into a **512-sample ring buffer**. The harness reads
`GET /internal/latency` immediately after the timed run and stores the availability row in the report
as `serverLatency`, so every report carries both a client-side and a server-side view of the same
requests.

Two details make that comparison exact rather than approximate:

- `BENCH_RUNS` defaults to **512, the ring size**. The probe and warm-up requests are pushed into the
  ring first and are evicted by the 512 timed requests, so at the moment the harness reads
  `/internal/latency` the ring holds exactly the timed samples and nothing else. (`count` in the
  response is cumulative and will be larger — 548 for a fresh process — but the percentiles are
  computed from the ring.)
- The harness uses **the same percentile function** as the registry
  (`sorted[ceil(p/100 * n) - 1]`, nearest-rank). Two different percentile definitions would produce a
  disagreement that means nothing.

The two will not be identical, and should not be: the interceptor's `finalize()` fires when the
handler's observable completes, which is *before* Nest serialises the result to JSON and writes it to
the socket. The client number includes serialisation, the response write, and the read back. The
client should therefore sit slightly *above* the server, by an amount that grows with response size.

## Machine

Every report records its own machine. The committed runs were produced on:

- Apple M4, 10 cores, 16 GB
- macOS (darwin 25.5.0), arm64
- Node v22.18.0
- Postgres 16 and Redis 7 in Docker on the same machine (`docker-compose.yml`)

Localhost, same-machine Postgres. Absolute numbers on a free-tier deploy with a network hop to a
managed database will be much larger; the *ratio* between two runs on the same machine is the part
that transfers.

## The "before" run — no cache exists yet

Recorded 2026-08-02 against commit `81f6796`, on the machine above, with the seed at
**1,373 appointments / 399 shifts / 120 patients** across a ±60 day horizon. There is no cache
anywhere in the codebase at this point; these are the honest cost of the endpoint as built.

Three consecutive runs against one freshly started `node dist/main.js` process, 512 timed requests
each. All milliseconds, client-side.

| Run | p50 | p95 | p99 | min | max | mean |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 3.809 | 5.647 | 8.474 | 2.531 | 23.103 | 4.075 |
| 2 | 3.498 | 4.733 | 5.694 | 2.518 | 6.423 | 3.636 |
| **3 (kept as `before.json`)** | **3.842** | **4.985** | **5.725** | **2.571** | **11.177** | **3.880** |

**Median chosen by p95**, which is the headline metric the before/after chart will turn on. Run 3 is
also the median on p99 and on the mean; on p50 the three runs sit within 0.34 ms of each other, so
p50 does not discriminate between them.

Run-to-run variance is modest at p50 (3.50–3.84 ms, a 10% spread) and much larger in the extreme
tail (max 6.4–23.1 ms). The max is a single sample and should be read as noise from the machine, not
as a property of the endpoint — that is exactly why the plan asks for three runs and for percentiles
rather than a mean.

Per-shape, from the kept run:

| Shape | Samples | Slots returned | Response | p50 | p95 | max |
| --- | --- | --- | --- | --- | --- | --- |
| `day` | 128 | 23 | 2.9 KB | 3.620 | 4.989 | 7.289 |
| `week` | 128 | 109 | 13.9 KB | 3.899 | 5.003 | 11.177 |
| `week-one-dentist` | 128 | 13 | 1.6 KB | 3.831 | 4.918 | 5.499 |
| `week-equipment` | 128 | 81 | 10.3 KB | 4.037 | 4.985 | 7.065 |

## Cross-check against `GET /internal/latency`

The same three runs, as the W3 interceptor saw them:

| Run | client p50 | server p50 | client p95 | server p95 | client p99 | server p99 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 3.809 | 2.901 | 5.647 | 4.608 | 8.474 | 7.136 |
| 2 | 3.498 | 2.564 | 4.733 | 3.786 | 5.694 | 4.521 |
| 3 | 3.842 | 3.011 | 4.985 | 4.018 | 5.725 | 4.658 |

```bash
curl -s "$BASE/api/v1/internal/latency" -H "Authorization: Bearer $OWNER_TOKEN"
```

**Verdict: they agree.** The server sits consistently **0.83–1.04 ms below** the client, in the
predicted direction, with no run in which the ordering flips. That is a fixed offset, not a
divergence — but "the direction is right" is not proof, so it was measured rather than assumed.

Four blocks of 512 requests each were run against routes of increasing cost and increasing response
size, comparing the client's number with the interceptor's for the same requests:

| Route | Response | client p50 | server p50 | gap |
| --- | --- | --- | --- | --- |
| `GET /auth/me` (no database work at all) | 137 B | 0.781 | 0.035 | 0.746 |
| `GET /branches` (one Prisma query) | 493 B | 1.337 | 0.631 | 0.705 |
| `GET /availability` (one dentist) | 1.6 KB | 2.982 | 2.172 | 0.810 |
| `GET /availability` (six dentists) | 13.9 KB | 3.914 | 3.116 | 0.798 |

The gap is **flat at ~0.75–0.81 ms across a 100× range of response size**. So it is not
serialisation, and it is not proportional to anything the handler does. It is the work that sits
outside the interceptor's window on both ends:

- Nest runs interceptors *after* middleware and guards. `RequestIdMiddleware`, `TenantContextMiddleware`
  (which verifies the JWT) and `JwtAuthGuard` (passport-jwt, which verifies it a second time) all
  finish before the timer starts.
- The interceptor's `finalize()` fires when the handler's observable completes — before Nest
  serialises to JSON and writes the socket, and obviously before the client reads the body back.

Neither number is wrong; they answer different questions. `/internal/latency` answers "how long did
my handler take", which is what you want when deciding what to optimise. The harness answers "how
long did the caller wait", which is what the user feels. **`before.json`'s headline numbers are the
client's**, because that is the number the cache has to move.

One caveat worth knowing before trusting `/internal/latency` in production: `count` is cumulative
since process start, but the percentiles are computed from a 512-sample ring. On a busy box those
percentiles describe only the most recent 512 requests to that route.

## What we expect the cache to do — written before any cache exists

The same four blocks decompose the request. A single Prisma round trip on this machine costs about
**0.6 ms** (`/branches`, which does exactly one). `AvailabilityService.slots` issues **seven
queries in three sequential waves**: `service.findUnique`, then `user.findMany`, then a `Promise.all`
of five (shifts, time blocks, appointments, chairs, equipment). Three waves at ~0.6–0.7 ms each is
~2 ms, and the measured server-side floor for the narrowest availability request is 2.17 ms. Those
agree closely enough that we are confident about where the time goes.

Widening the window from one day to seven — seven times the rows, seven times the 15-minute steps
`computeSlots` walks — costs only **0.28 ms** at p50 (3.620 → 3.899). Everything that scales with
the window is therefore a small minority of the request. Serialising a 13.9 KB response costs no
more than serialising 137 bytes, as the flat gap above shows.

So the prediction, on the record:

> **Database round-trip latency dominates, not `computeSlots` and not serialisation.** Of a ~3.9 ms
> `week` request we believe roughly 2.2 ms is the three sequential query waves, roughly 0.8 ms is
> middleware, JWT verification (twice) and loopback HTTP, and well under 0.5 ms is the slot
> computation and the JSON. The remainder scales with the *number of dentists* in the branch far more
> than with the length of the window.
>
> A cache that stores the computed slots therefore removes the ~2.2 ms of query waves and replaces it
> with one Redis round trip. We expect **p50 to land somewhere around 1.2–1.6 ms and p95 around
> 2 ms — a 2.5× to 3× improvement, not 10×** — because ~0.8 ms of auth and HTTP is untouchable by any
> cache, and Redis is not free either. If the result is dramatically better than 3×, the benchmark is
> probably measuring something other than what it claims.

Being wrong about this in public is fine. Deciding it afterwards would not be.

## Reports

| File | What it is |
| --- | --- |
| `before.json` | Availability latency before any caching exists — run 3 of 3, the median by p95 |

---

## After caching

Same harness, same workload, same seed, same machine, `node dist/main.js` — only the cache is new.

| Run | p50 | p95 | p99 | mean |
|---|---|---|---|---|
| 1 | 1.433 | 1.973 | 3.260 | 1.448 |
| 2 | 1.379 | 1.841 | 2.340 | 1.400 |
| **3 (kept as `after.json`)** | **1.468** | **1.938** | **2.325** | **1.498** |

Median chosen by p95, the same rule used for `before.json`.

### The comparison

![Availability latency before and after caching](comparison.svg)

| | before | after | ratio |
|---|---|---|---|
| p50 | 3.842 ms | 1.468 ms | **2.62×** |
| p95 | 4.985 ms | 1.938 ms | **2.57×** |
| p99 | 5.725 ms | 2.325 ms | **2.46×** |
| mean | 3.880 ms | 1.498 ms | 2.59× |
| server-side p50 | 3.011 ms | 0.752 ms | 4.00× |

### The prediction was right

We wrote down, before any cache existed, that DB round-trip latency dominated and that a cache
should therefore land **p50 around 1.2–1.6 ms, p95 around 2 ms, i.e. 2.5–3× — not 10×**, because
roughly 0.8 ms of auth and HTTP is untouchable and Redis adds a hop of its own.

Measured: p50 **1.468**, p95 **1.938**, ratio **2.6×**. All three inside the predicted band.

That agreement matters more than the speed-up. It means the model of where the time went was
correct, and it is why we can say what the cache did rather than merely that things got faster.
Server-side time fell 4× (3.011 → 0.752 ms) while client-side time fell 2.6×, which is exactly what
a fixed ~0.8 ms of auth and transport outside the interceptor predicts.

### Caveats, stated rather than buried

- **This is a 100% hit rate.** The harness replays four fixed shapes, so after warm-up every request
  hits. Real traffic will not; the honest reading is "a cache hit is 2.6× faster", not "the endpoint
  is 2.6× faster".
- **The first request after any write pays full price**, by design. A busy clinic booking constantly
  invalidates the days it is booking, so the days people are actually looking at are the days least
  likely to be cached. A read-heavy public booking page benefits most; the staff timeline least.
- **Local Redis over loopback.** Production uses Upstash over the network from Render, where the
  Redis hop costs more than it does here. The ratio will be smaller there, and we have not measured it.
- **Absolute numbers are small either way.** 3.8 ms was not a problem. This exercise was worth doing
  for the method and the invalidation correctness, not because users were waiting.
- **Cache correctness depends on every write going through a service that invalidates.** A direct
  database write produces a stale answer until the 10-minute TTL expires. `availability-cache.spec.ts`
  uses that property deliberately to prove a cache hit, and `availability.spec.ts` was changed to
  create time blocks through `POST /time-blocks` rather than Prisma for exactly this reason.

Concurrency is measured separately in [load.md](load.md): what the API does
when sixty patients reach for the same slot at once, and how the read path
behaves under a sustained arrival rate.

What the browser downloads before it can paint is measured in
[bundle.md](bundle.md).
