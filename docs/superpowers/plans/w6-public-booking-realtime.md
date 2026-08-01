# W6 Public Booking + Realtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A patient books from their phone with no account — pick service, dentist, and slot; the slot is held in Redis for 5 minutes with a live countdown; confirming creates the appointment, queues a confirmation email, and returns a signed manage link for cancel/reschedule. The staff timeline shows the new appointment appear within a second, over Socket.IO. Playwright J1 drives both browsers and proves the phone-to-desk moment.

**Architecture:** Public routes carry no JWT, so tenant scope comes from `:clinicSlug` via a `PublicTenantMiddleware` that establishes the same `AsyncLocalStorage` context the authenticated path uses — which means `prisma.scoped` and the whole W3 `AvailabilityService` are reused unchanged rather than reimplemented without tenant safety. Holds are **slot keys**, not range queries: a hold owns `hold:{tenantId}:{dentistId}:{slotIndex}` for every 15-minute slot its window spans, acquired all-or-nothing by a Lua script, each with a 300s TTL. That makes conflicting holds impossible by construction, needs no cleanup job, and reduces "is this slot held?" to an `MGET` of computed keys. Holds are a courtesy layer, never an authority: the EXCLUDE constraints remain the referee, so a confirm can still lose with `409 SLOT_CONFLICT` and the wizard recovers by offering the nearest free slot. Realtime events are emitted **after commit only**, and the client reacts by invalidating the affected day's query rather than trusting the payload.

**Tech Stack:** `@nestjs/throttler` + `@nest-lab/throttler-storage-redis`, `bullmq`, `@nestjs/websockets` + `@nestjs/platform-socket.io` + `socket.io`, `socket.io-client` and `nanoid` on the web. No paid services.

## Global Constraints

- Node >= 22, pnpm 10; plain `pnpm` — never `corepack enable` (EACCES on this machine)
- **After any `pnpm install`, run `pnpm --filter @dentalops/api db:generate`** — pnpm 10 blocks Prisma's postinstall; skipping it fails api typecheck with a stubbed client
- TypeScript strict; **no comments in any code file**; `@typescript-eslint/no-unused-vars` is `error`
- Conventional commits; **no trailers of any kind**
- Never read, print, or commit any `.env`
- **One migration only** (Task 3, `patients.tenant_id + phone` unique index). Nothing else this week may add migrations
- Every new route goes into `REGISTRY` in `apps/api/test/tenant-isolation.spec.ts` in the same task that creates it — all `/public/*` routes are `"public"`
- **`prisma.scoped` throws without tenant context.** Public services must run inside `PublicTenantMiddleware`; never reach for the unscoped client to work around it
- **BullMQ requires its own ioredis connection with `maxRetriesPerRequest: null`** — the shared `REDIS` client is created with `maxRetriesPerRequest: 2` and BullMQ throws on it. Do not change the shared client; give the queue a separate connection
- Public pages are patient-facing: **body text ≥ 16px** (iOS auto-zoom), touch targets ≥ 44px, `tabular-nums` on every time
- MASTER anti-patterns are binding: unavailable slots are **omitted, never greyed**; skeletons not spinners; `100dvh` not `100vh`; no hard-coded colors outside `apps/web/src/app.css`
- The hold countdown is driven by the server's `expiresAt`, **never** a local timer seeded at mount
- No secrets in the repo; email transport falls back to a logging transport when SMTP is unconfigured
- Full pipeline (`pnpm lint && pnpm typecheck && pnpm exec turbo run test --force && pnpm build && pnpm --filter @dentalops/web e2e`) before every push; push to `origin main`; report CI conclusion

---

### Task 1: Public tenant context, throttling, and the clinic endpoint

**Files:**
- Create: `apps/api/src/public/public-tenant.middleware.ts`, `public.module.ts`, `public.controller.ts`, `public.service.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/test/tenant-isolation.spec.ts`
- Test: `apps/api/test/public-clinic.spec.ts`

**Interfaces:**
- Consumes: `prisma` (unscoped, **only** inside the middleware to resolve slug → tenantId), `tenantContext`, `Public()`.
- Produces: `PublicTenantMiddleware` bound to `public/:clinicSlug/*` — resolves the slug, 404s `CLINIC_NOT_FOUND` on miss, and runs the rest of the request inside `tenantContext.run({ tenantId, userId: "public", role: "public" }, next)`. `GET /public/:clinicSlug` → `{ id, name, slug, branches: [{id,name}], services: [{id,name,durationMin,colorIndex}] }` (active only). Global `ThrottlerGuard` at 60 req/min per IP with a Redis store, `@SkipThrottle()` on everything except `/public/*`.

- [ ] **Step 1: Dependencies**

Add to `apps/api`: `@nestjs/throttler`, `@nest-lab/throttler-storage-redis`. Run `pnpm install && pnpm --filter @dentalops/api db:generate`.

- [ ] **Step 2: Middleware**

```ts
import { Injectable, NestMiddleware } from "@nestjs/common"
import type { NextFunction, Request, Response } from "express"
import { AppException } from "../common/app.exception"
import { PrismaService } from "../prisma/prisma.service"
import { tenantContext } from "../tenant/tenant-context"

@Injectable()
export class PublicTenantMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const slug = req.params.clinicSlug ?? req.path.split("/").filter(Boolean)[1]
    if (!slug) throw new AppException(404, "CLINIC_NOT_FOUND", "Clinic not found")
    const tenant = await this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } })
    if (!tenant) throw new AppException(404, "CLINIC_NOT_FOUND", "Clinic not found")
    tenantContext.run({ tenantId: tenant.id, userId: "public", role: "public" }, () => next())
  }
}
```

Wire in `app.module.ts`'s `configure`: `consumer.apply(PublicTenantMiddleware).forRoutes("public/:clinicSlug")`. **One binding is enough** — Nest 11 middleware paths match nested segments, so this covers `/public/:clinicSlug/anything/deep` too. This was verified empirically (a test-only nested probe controller in the spec, plus a mutation test: disabling the binding turns the nested case red). A second `"public/:clinicSlug/*path"` binding is unnecessary; note that a bare `*` would throw at boot under Express 5, so do not add one.

Note the existing `TenantContextMiddleware` also runs and is a no-op without a bearer token, so ordering is not a hazard — but confirm the public middleware is applied after it so an authenticated staff member hitting a public URL still gets their own tenant, not the slug's. Assert that in the spec.

- [ ] **Step 3: Throttling**

In `app.module.ts` imports:

```ts
    ThrottlerModule.forRoot({
      throttlers: [{ name: "public", ttl: 60_000, limit: 60 }],
      storage: new ThrottlerStorageRedisService(process.env.REDIS_URL ?? "redis://localhost:6379")
    }),
```

and `{ provide: APP_GUARD, useClass: ThrottlerGuard }` **after** the existing guards. Apply `@SkipThrottle()` at the class level on every existing controller (auth, shifts, appointments, patients, availability, directory, health, internal) so only `/public/*` is limited — the api test suite fires far more than 60 requests per minute and would otherwise go red.

- [ ] **Step 4: Controller + service + spec**

`GET /public/:clinicSlug` returns the clinic summary via `prisma.scoped` (proving the middleware works). Mark the controller `@Public()`.

`apps/api/test/public-clinic.spec.ts`:
1. returns the demo clinic's branches and active services for `demo-clinic`
2. unknown slug → 404 `CLINIC_NOT_FOUND`
3. no `Authorization` header needed (assert 200 anonymous)
4. a nested public route resolves tenant context too (hit `GET /public/demo-clinic/availability` once Task 2 exists — for now assert the middleware is bound by checking a deliberately nested 404 path returns `CLINIC_NOT_FOUND` rather than a tenant-context error)
5. **cross-tenant**: create a second tenant in the spec, hit `/public/<second-slug>`, assert it never returns the demo clinic's branches

Add `"GET /public/:clinicSlug": "public"` to `REGISTRY`.

- [ ] **Step 5: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): public tenant context, rate limiting, and clinic endpoint"
```

---

### Task 2: Redis holds

**Files:**
- Create: `apps/api/src/holds/holds.service.ts`, `holds.module.ts`, `apps/api/src/holds/hold.lua.ts`
- Modify: `apps/api/src/availability/availability.service.ts`, `apps/api/src/public/public.controller.ts` + `public.service.ts`, `apps/api/test/tenant-isolation.spec.ts`
- Test: `apps/api/test/holds.spec.ts`

**Interfaces:**
- Consumes: `REDIS`, `AvailabilityService`, `currentTenant()`.
- Produces:

```ts
HOLD_TTL_SECONDS = 300
SLOT_MS = 900_000
slotKey(tenantId, dentistId, slotIndex): string   // hold:{t}:{d}:{i}
HoldsService.acquire({ dentistId, serviceId, branchId, startsAt, durationMin }): Promise<{ holdId, expiresAt }>
HoldsService.read(holdId): Promise<HoldRecord | null>
HoldsService.release(holdId): Promise<void>
HoldsService.heldSlotIndexes(dentistIds, fromMs, toMs, exceptHoldId?): Promise<Map<string, Set<number>>>
```

`acquire` runs a Lua script that `SET NX EX`s **every** slot key the window spans and rolls back all of them if any is taken (returns 0) — so two concurrent holds on overlapping windows cannot both succeed. On failure throw `409 SLOT_HELD`. The hold record (`hold:{holdId}` → JSON `{tenantId, dentistId, serviceId, branchId, startsAt, endsAt, slotIndexes}`) carries the same TTL.

`GET /public/:clinicSlug/availability?serviceId&branchId&date[&dentistId][&exceptHoldId]` returns `{ slots }` for **one BKK day** (the endpoint computes `from`/`to` itself — the wizard asks per day, and a single day bounds the `MGET`). It calls the existing `AvailabilityService.slots` unchanged, then subtracts held slots. `exceptHoldId` lets the caller see their own held slot as available (needed by the countdown UI and by reschedule).

Deliberate product decision to record in the task report: **staff availability does not subtract holds.** Staff booking is privileged by design ("staff booking — no hold required" in the spec), so a receptionist may book over a hold; the patient's confirm then loses to the EXCLUDE constraint and the wizard offers the nearest slot. Holds are a courtesy, the constraint is the authority.

- [ ] **Step 1: Write the failing spec**

`apps/api/test/holds.spec.ts` (uses `createTestApp`, its own tenant):
1. acquiring a hold removes exactly the overlapping starts from public availability, and `exceptHoldId` puts them back
2. two concurrent `Promise.all` acquisitions of the same window → exactly one 201, one `409 SLOT_HELD` (this is the load-bearing one — it must fail if the Lua script is replaced by a naive read-then-write)
3. a hold on an adjacent, non-overlapping window succeeds
4. `release` frees the slots immediately
5. TTL is set on every slot key and on the record (assert with `PTTL` through the injected client; assert > 0 and ≤ 300000)
6. a hold in tenant A never affects availability in tenant B (keys are tenant-scoped)

- [ ] **Step 2: Implement**

The Lua script (as a string constant in `hold.lua.ts`):

```lua
for i = 1, #KEYS do
  if redis.call('EXISTS', KEYS[i]) == 1 then return 0 end
end
for i = 1, #KEYS do
  redis.call('SET', KEYS[i], ARGV[1], 'EX', ARGV[2])
end
return 1
```

Register with `redis.defineCommand("acquireHold", { numberOfKeys: ... })` or call `redis.eval(script, keys.length, ...keys, holdId, ttl)`. The check-then-set loop is safe because Lua execution is atomic in Redis.

Slot span: `startIndex = floor(startMs / SLOT_MS)`, `endIndex = ceil(endMs / SLOT_MS) - 1`, where `endMs = startMs + durationMin*60_000`. Assert in a unit-level case that a 45-minute window at 09:00 spans exactly indexes for 09:00/09:15/09:30 and not 09:45.

`release` needs a Lua script too, for the mirror-image reason: a blind `DEL` of the slot keys would, after a hold's TTL had already lapsed and a *different* hold had taken those slots, delete the new owner's keys. The release script deletes a key only when its value equals the releasing holdId. Slot key values are therefore the owning holdId, which is also what makes `exceptHoldId` a value comparison rather than a second lookup.

The Lua rollback is written as "check all, then set all" rather than "set-NX each and undo on failure" deliberately: because the whole script is atomic, no other client can interleave between the two loops, so there is nothing to undo. Do not "improve" it into a per-key `SET NX` loop with compensating `DEL`s — that would delete keys belonging to a *different* hold if it ever ran non-atomically.

- [ ] **Step 3: Wire the public endpoints**

`POST /public/:clinicSlug/holds` body `{ serviceId, branchId, dentistId, startsAt }` → `{ holdId, expiresAt }`; the service duration comes from the DB, never the client. `DELETE /public/:clinicSlug/holds/:holdId` → 204 (used when the patient backs out). Both `@Public()`. Register both plus the availability route in `REGISTRY` as `"public"`.

- [ ] **Step 4: Commit**

```bash
git add apps/api
git commit -m "feat(api): redis slot holds with atomic all-or-nothing acquisition"
```

---

### Task 3: Public confirm, patient upsert, and signed manage links

**Files:**
- Create: `apps/api/prisma/migrations/<timestamp>_patient_phone_unique/migration.sql`, `apps/api/src/public/manage-token.service.ts`
- Modify: `apps/api/prisma/schema.prisma`, `apps/api/src/public/public.service.ts` + `public.controller.ts`, `apps/api/test/tenant-isolation.spec.ts`
- Test: `apps/api/test/public-booking.spec.ts`

**Interfaces:**
- Consumes: `AppointmentsService.create` (unchanged — the constraint stays the referee), `HoldsService`, `JwtService`.
- Produces:
  - `POST /public/:clinicSlug/appointments` body `{ holdId, name, phone, email? }` → `{ appointment, manageToken }`. Validates the hold, upserts the patient by `(tenantId, phone)`, books through the existing service, releases the hold, and returns a manage token. `409 HOLD_EXPIRED` when the hold is gone; `409 SLOT_CONFLICT` passes through untouched when staff beat them to it.
  - `ManageTokenService.sign(appointmentId)` / `.verify(token)` — JWT with `{ sub: appointmentId, tenantId, purpose: "manage" }`, 30-day expiry, signed with `JWT_SECRET`; `verify` rejects any token whose `purpose` is not `manage` (so an access token can never be used as a manage link).
  - `GET /public/manage/:token` → the appointment summary; `POST /public/manage/:token/cancel` → 204; both `@Public()`. **`/public/manage/*` is NOT under `:clinicSlug`**, so it needs its own middleware binding that establishes tenant context from the token's `tenantId` — do not skip this and reach for the unscoped client.
  - **Middleware order is load-bearing.** `forRoutes("public/:clinicSlug")` also matches `/public/manage/<token>` with `clinicSlug === "manage"`, so `PublicTenantMiddleware` would 404 `CLINIC_NOT_FOUND` before the manage middleware ever ran. Register `ManageTokenMiddleware` **first**, and move `PublicTenantMiddleware`'s `if (currentTenant()) return next()` short-circuit above its slug lookup. Swapping the two bindings turns all five manage tests red — verified.

- [ ] **Step 1: Migration**

`patients` has `@@unique([tenantId, phone, email])`, which is too wide to key an upsert on. Narrow it to `@@unique([tenantId, phone])` and drop the now strictly-implied three-column index. Consequence: two patients in one tenant can no longer share a phone. Generate with `prisma migrate dev --create-only`, inspect the SQL, and check for existing duplicates first:

```sql
SELECT tenant_id, phone, count(*) FROM patients GROUP BY 1,2 HAVING count(*) > 1;
```

The seed generates unique phones, but run it anyway and report the result — if duplicates exist, the migration will fail on production data. Then `prisma migrate deploy`.

- [ ] **Step 2: Spec first**

`apps/api/test/public-booking.spec.ts`:
1. hold → confirm creates a `confirmed` appointment, releases the hold (the slot is available again to a fresh availability call), and returns a manage token
2. confirming twice with the same hold → second gets `409 HOLD_EXPIRED`
3. confirming with a hold whose key was deleted (simulate expiry via `release`) → `409 HOLD_EXPIRED`
4. the same phone booking twice creates **one** patient row, and the second booking keeps the original name (documented: first name wins; a rename is a staff action)
5. staff books the same slot between hold and confirm → confirm returns `409 SLOT_CONFLICT`, proving holds are courtesy and the constraint is authority
6. `GET /public/manage/<token>` returns the booking; a token signed with `purpose: "access"` is rejected 401; a token for tenant A cannot read tenant B's appointment
7. cancel via manage link sets status `cancelled` and frees the slot

Add all four new routes to `REGISTRY` as `"public"`.

- [ ] **Step 3: Implement, then commit**

```bash
git add apps/api
git commit -m "feat(api): public booking confirm with patient upsert and signed manage links"
```

---

### Task 4: BullMQ confirmation email

**Files:**
- Create: `apps/api/src/mail/mail.module.ts`, `mail.queue.ts`, `mail.processor.ts`, `mail.transport.ts`, `templates.ts`
- Modify: `apps/api/src/public/public.service.ts`, `docker-compose.yml` (add mailpit), `.env.example`
- Test: `apps/api/test/mail.spec.ts`

**Interfaces:**
- Consumes: `bullmq`, its **own** ioredis connection (`maxRetriesPerRequest: null`).
- Produces: `MailQueue.enqueueConfirmation({ appointmentId })`; a worker in the same process that loads the appointment, renders subject/text/html, and hands it to a transport. `MailTransport` is an interface with two implementations selected at construction: `SmtpTransport` when `SMTP_URL` is set, else `LogTransport` (structured `console.log`, no external dependency, no cost). Jobs use `attempts: 3`, exponential backoff, `removeOnComplete: 50`.

Zero-budget note to state in the README later: the queue, retries, and worker are real; only the final hop is pluggable. `docker-compose` gains mailpit so local development sees actual rendered mail at `http://localhost:8025`.

- [ ] **Step 1: Spec**

`apps/api/test/mail.spec.ts` — inject a fake transport through the Nest testing module:
1. confirming a public booking enqueues exactly one job carrying the appointment id
2. the processor renders a subject containing the clinic name and a body containing the BKK-formatted appointment time and the manage URL
3. a transport that throws causes the job to retry (assert `attempts` config and that a failing transport does not fail the HTTP request — the booking must still return 201)

The third point is the important one: **email must never block or fail a booking.** Enqueue after commit, never inside the transaction, and swallow enqueue failures inside `MailQueue` so no call site has to remember to.

**The trap in the worker:** it runs outside any request, so it must establish tenant context itself — and `tenantContext.run(store, () => this.prisma.scoped.…)` compiles but fails at runtime. `PrismaPromise` is lazy, so the extension fires on `.then()`, which happens after `run()` has already returned. The callback must be `async` with the query `await`ed **inside** it. This is the same lazy-promise trap W1b hit; it applies to every non-HTTP entry point that touches `prisma.scoped`.

- [ ] **Step 2: Implement, then commit**

```bash
git add apps/api docker-compose.yml .env.example pnpm-lock.yaml
git commit -m "feat(api): bullmq confirmation email with pluggable transport"
```

---

### Task 5: Socket.IO — server

**Files:**
- Create: `apps/api/src/realtime/realtime.module.ts`, `realtime.gateway.ts`, `realtime.events.ts`
- Modify: `apps/api/src/appointments/appointments.service.ts` (emit after commit), `apps/api/src/public/public.service.ts`, `apps/api/src/main.ts` (CORS for the socket path)
- Test: `apps/api/test/realtime.spec.ts`

**Interfaces:**
- Consumes: `@nestjs/websockets`, `socket.io`, `JwtService`.
- Produces: namespace `/realtime`; JWT verified at handshake from `auth.token` (reject otherwise); clients join `tenant:{tenantId}:branch:{branchId}` on a `subscribe` message (server derives tenantId from the token, **never** from the payload — a client must not be able to join another tenant's room). `RealtimeGateway.appointmentChanged({ tenantId, branchId, action, appointmentId })` emits `appointment.changed`. Called from `AppointmentsService` after create/reschedule/status commit, and from the public confirm path.

- [ ] **Step 1: Spec**

`apps/api/test/realtime.spec.ts` using `socket.io-client` against the test app (`app.listen(0, "127.0.0.1")` already gives a real port — the existing `createTestApp` helper does this):
0. **first, prove the wiring can fail**: a socket gateway attached to a Nest app created by `createTestApp` needs `app.listen()` to have run (it has) *and* the websocket adapter to be initialised. If the events never arrive, check that before assuming the emit is wrong — and once green, mutation-test case 1 by removing the emit call, which must turn it red
1. a client with a valid token joins its branch room and receives `appointment.changed` when a booking is created through the HTTP API
2. a client with no token is rejected at handshake
3. a client for tenant A receives nothing when tenant B books (the isolation test that matters)
4. the emitted payload carries `appointmentId`, `branchId`, and `action`, and **no patient data** (events are invalidation signals, not data transfer)

- [ ] **Step 2: Implement, then commit**

Ensure `app.close()` in tests tears the gateway down — a leaked socket server would reintroduce the open-handle class of flake W5 eliminated. Run the api suite 10× and report.

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): socket.io gateway emitting post-commit appointment events"
```

---

### Task 6: Booking wizard

**Files:**
- Create: `apps/web/src/features/booking/booking-page.tsx`, `wizard-reducer.ts`, `steps/service-step.tsx`, `dentist-step.tsx`, `slot-step.tsx`, `details-step.tsx`, `confirmed-step.tsx`, `countdown-banner.tsx`, `apps/web/src/features/booking/hooks.ts`
- Modify: `apps/web/src/routes.tsx`, `packages/contracts/src/public.ts` + `index.ts`
- Test: `wizard-reducer.test.ts`, `countdown-banner.test.tsx`, `booking-page.test.tsx`

**Interfaces:**
- Consumes: the Task 1–3 endpoints, `SlotPicker` from W5 (`apps/web/src/components/slot-picker.tsx` — reuse it, do not fork), `api()`.
- Produces: route `/book/:clinicSlug`, a 4-step wizard matching MASTER §5.3 (service+branch → dentist or "any" → date+slot → details → confirmed), `wizardReducer` as a pure function (the design doc names it as the one piece of FE logic worth unit-testing), and `<CountdownBanner expiresAt>` driven by the server timestamp.

Behaviour the tests must pin:
- Selecting a slot POSTs a hold **immediately** and moves to details; the countdown starts from the server's `expiresAt`
- Expiry replaces the details form with the recovery state ("Your hold expired · 10:30 was taken · Nearest free: 10:45 · Pick another time") and returns to slot selection — never a silent failure
- Going back from details releases the hold (`DELETE`)
- A `409 SLOT_CONFLICT` on confirm shows the same recovery state, not a raw error
- "Any dentist" resolves server-side: the wizard omits `dentistId` and picks from the returned slots, whose `dentistId` it then holds

Public styling: body ≥16px (`text-base`), chips ≥44px, `tabular-nums`, `min-h-dvh`.

- [ ] **Step 1: TDD the reducer**, then the countdown, then the page. Full pipeline. Commit:

```bash
git add apps/web packages/contracts
git commit -m "feat(web): public booking wizard with server-driven hold countdown"
```

---

### Task 7: Manage page + realtime client

**Files:**
- Create: `apps/web/src/features/booking/manage-page.tsx`, `apps/web/src/lib/realtime.ts`
- Modify: `apps/web/src/routes.tsx`, `apps/web/src/features/timeline/timeline-page.tsx`, `apps/web/package.json`
- Test: `manage-page.test.tsx`, `realtime.test.ts`

**Interfaces:**
- Produces: route `/manage/:token` (view + cancel, with a confirmation dialog per MASTER's destructive-action rule); `useRealtime({ tenantId, branchId, onChange })` connecting to `/realtime` with the access token, joining the room, and calling `onChange` — the timeline invalidates `["appointments", branchId, dayStart]` on each event. Reconnect is socket.io's default; on reconnect the hook invalidates once to catch anything missed while offline.

The arriving card must animate per MASTER §2: 250ms fade + a `0.98 → 1` scale pulse, honouring `prefers-reduced-motion` (already global in `app.css`).

- [ ] Commit: `feat(web): manage booking page and realtime timeline updates`

---

### Task 8: Playwright J1 — the phone-to-desk moment

**Files:**
- Create: `apps/web/e2e/public-booking.spec.ts`
- Modify: `apps/web/e2e/helpers.ts`

**Interfaces:**
- Produces: J1 — two browser contexts in one test. Context A (mobile viewport, 390×844) walks the public wizard as a patient. Context B (desktop) is logged in as owner on the timeline for the same day and branch. The assertion is that B shows the new appointment **without reloading**.

Determinism, same discipline as J2: pick the dentist with no shift on the target Monday via the existing `findFreeDentist` helper, `clearColumn` first, and drive the wizard by role/name rather than by position. The realtime assertion must have a generous `expect(...).toBeVisible({ timeout: 10_000 })` but **must not** reload B — reloading would make the test pass without realtime working. Add a second assertion that B's toast/announcement region mentions the arrival, so a silent cache refetch cannot satisfy it.

Run 3× locally, no retries.

- [ ] Commit: `test(e2e): playwright J1 phone-to-desk realtime booking`

---

### Task 9: Gallery, docs, pipeline, push

**Files:**
- Modify: `apps/web/src/pages/dev-ui-page.tsx` + test, `docs/booking.md`, `README.md`, `docs/superpowers/plans/w6-public-booking-realtime.md`

- [ ] Add `CountdownBanner` (>2min / <60s urgent / expired) and the SlotPicker hold states to the gallery; update the placeholder line (only ViolationList and ShiftBlock remain, W7).
- [ ] Extend `docs/booking.md` with a "Public booking" section: the hold lifecycle, why holds are courtesy and constraints are authority, and the staff-privilege decision from Task 2.
- [ ] README: note that the mail transport is pluggable and defaults to logging, so the queue is real and the cost is zero.
- [ ] Sync this plan with execution findings.
- [ ] Full pipeline including both e2e journeys, push, watch CI, report.

---

## W6 exit criteria

- [ ] A patient books end-to-end at `/book/demo-clinic` with no account, on a 390px viewport
- [ ] Selecting a slot holds it in Redis; two concurrent holds for the same window → exactly one wins (spec-proven, Lua-atomic)
- [ ] The countdown is driven by the server's `expiresAt`; expiry shows the recovery state and returns to slot selection
- [ ] Confirm creates the appointment through the same constrained path staff use; a staff member winning the race yields `409 SLOT_CONFLICT` and the wizard recovers
- [ ] Confirmation email is enqueued after commit, retries on failure, and a failing transport never fails the booking
- [ ] Signed manage link views and cancels; a non-`manage` token is rejected; cross-tenant tokens fail
- [ ] Staff timeline shows a phone booking appear within ~1s with no reload (Playwright J1, two contexts)
- [ ] Socket rooms are derived from the JWT, never the client payload; tenant A never sees tenant B's events
- [ ] `/public/*` is rate-limited; the rest of the API is not
- [ ] Every new route classified in the isolation registry; one migration only; CI green including both journeys
