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

## Reports

| File | What it is |
| --- | --- |
| `before.json` | Availability latency before any caching exists |
