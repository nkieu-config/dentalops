# Bundle

Measured with `vite build`, raw bytes, on the production configuration.

## What ships eagerly, and why

`routes.tsx` splits asymmetrically: the public path — landing, login, signup,
the booking wizard, the manage page — is imported eagerly, while every staff
screen is lazy. That looks backwards until you remember what W8 measured:
splitting the public path made Lighthouse *worse*, 94 to 89, because the
waterfall cost more than the bytes saved. A patient on a phone gets one
request; a receptionist on a desk pays a chunk load they will not notice.

`socket.io-client` was checked against that split and is already correct — it
is reached only through `lib/realtime.ts`, which only the timeline imports, so
it lands in the timeline chunk rather than the entry.

## Sentry was the whole story

`main.tsx` imported `@sentry/react` statically. With no DSN configured the
import is dead code and Rollup removes it entirely, which is why the local
build never showed a cost and neither did any previous measurement. Set the
DSN — as a deployment does — and it is in the entry chunk, blocking first
paint.

| `main.tsx` | Entry chunk | Total | Chunks |
|---|---|---|---|
| `import * as Sentry` | **991.2 kB** | 1,128 kB | 18 |
| `await import("@sentry/react")` | **482.3 kB** | 1,524 kB | 19 |

The entry halves. The total grows by 396 kB, and that is not an accounting
error: once Sentry sits behind a dynamic boundary Rollup can no longer
tree-shake it against what the app actually calls, so the separate chunk
carries 904.6 kB where the fused one contributed about 509 kB.

So it is a trade, not a free win — 509 kB moved off the critical path, at the
cost of 396 kB more bytes overall, fetched after hydration. For a demo whose
first impression happens on a Thai mobile connection, blocking bytes are the
ones that count.

With no DSN set both forms produce a byte-identical 904.3 kB entry and 18
chunks, so the dynamic import is never the worse choice.

## Still open

Whether this matters in production depends on something not visible from the
repository: whether `VITE_SENTRY_DSN` is set on Vercel. If it is not, the
browser has never had error reporting and the entry has always been 904 kB for
other reasons.

Worth considering either way: the API reports to Sentry server-side, and that
is where this project's real incidents have surfaced — a MongoDB TLS handshake
failure, a Redis quota exhaustion. Browser-side reporting on a demo nobody is
paged for buys much less than 905 kB.
