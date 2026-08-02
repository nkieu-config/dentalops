# Lighthouse — public booking page

Target: **≥ 90 in all four categories** on the mobile preset, for `/book/demo-clinic` — the page a
patient actually lands on, on a phone, over a throttled connection.

```bash
pnpm build
WEB_ORIGIN=http://localhost:4173 node apps/api/dist/main.js &
pnpm --filter @dentalops/web exec vite preview --port 4173 --strictPort &
npx lighthouse@12 http://localhost:4173/book/demo-clinic --quiet \
  --chrome-flags="--headless=new" --output=html --output-path=./lighthouse.html
```

`WEB_ORIGIN` matters: without it the API rejects the preview origin, every fetch fails CORS, and you
end up scoring a broken page. That happened on the first run here and the numbers were meaningless.

## Before and after

| | before | after | target |
|---|---|---|---|
| Performance | 94 | **93** | ≥ 90 |
| Accessibility | 100 | **100** | ≥ 90 |
| Best practices | 96 | **100** | ≥ 90 |
| SEO | 82 | **100** | ≥ 90 |

## What was actually wrong, and what fixing it taught

**SEO 82 → 100.** Two flat misses: no `<meta name="description">` and no `robots.txt`. Both added.
`robots.txt` disallows `/app/`, `/dev/` and `/manage/` — the staff app and signed manage links have
no business in an index.

**Best practices 96 → 100.** A single console error, which turned out to be a 404 on `/favicon.ico`.
Added an inline SVG favicon. Worth noting that a missing favicon is scored the same as a real
JavaScript exception; the audit measures "errors in console", not "serious errors in console".

**Performance: the code-split made it worse before it made it better.** The obvious move was to lazy
load routes so the public page stops shipping the staff timeline. Doing that to *every* route took
performance **94 → 89** — below target. The bytes saved were vendor code shared by both apps anyway,
while the split added a render-blocking round trip (`index.js` → `booking-page.js` → `slot-step.js`)
that a throttled mobile connection pays for in latency, not bandwidth.

The fix was to split asymmetrically: **the public routes stay eager, only the staff app is lazy.**
A patient hits `/book` cold and must render immediately; a staff member is already past a login
screen and can absorb a chunk fetch. Back to 93–94, and the staff timeline, roster editor and dev
gallery are no longer in the patient's critical path.

This is the whole reason to measure rather than assume. "Code-splitting improves performance" is
true in general and was false here, and only a number could tell the difference.

## Why this is not a CI gate

Lighthouse needs a real Chrome and its performance score is machine- and load-sensitive; the same
build scored 89, 93 and 94 across this session depending on what else was running. A non-blocking CI
job that nobody reads is theatre, and a blocking one would fail for reasons unrelated to the commit.

What *is* blocking in CI is `apps/web/e2e/a11y.spec.ts` — axe at 390px and 1440px, failing on any
serious or critical violation. That catches the regressions that matter and is deterministic. The
Lighthouse numbers above are a point-in-time measurement with a reproduction command, not a gate.
