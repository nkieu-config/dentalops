# W9 — Spec Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every gap found between the approved design doc (`docs/superpowers/specs/dentalops-design.md`) and the shipped system, so the repo's claims and its behaviour agree.

**Architecture:** No new architectural decisions. Seven of the eight gaps are additions inside existing modules; the eighth (audit log) adds one NestJS module wrapping the official MongoDB driver, following the same "interface with a null implementation when the env var is absent" pattern that `MailTransport` already uses, so local dev and CI keep working with or without Mongo.

**Tech Stack:** NestJS 11, Prisma, PostgreSQL 16, MongoDB 7 (`mongodb` driver, no ODM), Redis, React 19, Vitest, Jest + Supertest, Playwright.

## Global Constraints

- No code comments. Well-named identifiers and clear structure carry the meaning.
- No `Co-Authored-By` or any AI-attribution trailer in commit messages.
- Never read, print, or commit `.env` contents. Only public URLs may appear in chat or docs.
- All times stored UTC (`timestamptz`), rendered Asia/Bangkok. Bangkok offset is the fixed constant `BANGKOK_OFFSET_MIN = 420` already defined in `apps/api/src/appointments/series.service.ts:12`.
- Cross-tenant denial is **404, never 403**. Within-tenant role denial is **403** with a machine-readable `errorCode`.
- Every new endpoint is registered in the isolation registry of `apps/api/test/tenant-isolation.spec.ts`, or its test `every discovered route is declared in the isolation registry` fails.
- `PrismaPromise` is lazy: any `tenantContext.run(store, fn)` must use an `async` callback with the query `await`ed **inside** it.
- Turbo caches gates. Run every gate with `--force` and check the exit code explicitly (`echo "exit=$?"`), never through a pipe into `grep`.
- Fixture shapes this plan's hand-written specs get wrong, found while executing Task 1 — check them before running any new spec:
  - `prisma.patient.create` requires `email`; `Patient.email` is non-nullable (`apps/api/prisma/schema.prisma:160`).
  - `POST /auth/login` requires `clinicSlug` as well as `email` and `password` (`apps/api/src/auth/dto/login.dto.ts`), and matches `/^[a-z0-9-]{3,40}$/`.
- Corrections found while executing Task 3:
  - Jest reads its environment from `apps/api/.env` (Prisma's loader, relative to the schema), never from the repo-root `.env`. A variable added only at the root is invisible to the API suite.
  - `turbo.json`'s `test` task filters the environment. A new variable must be listed there or `pnpm test` cannot see it in CI.
  - The request id lives on `req.id`, set by `RequestIdMiddleware` (`apps/api/src/common/request-id.middleware.ts:8`) — there is no `req.requestId`.
  - `AuditService.list` scopes on `currentTenant()`, so a spec calling it outside an HTTP request must wrap the call in `tenantContext.run`.
  - `MongoClient.connect()` rejects when Mongo is unreachable, which would fail app bootstrap. `mongoProvider` catches it and yields `null`, so a dead Mongo degrades to a no-op instead of taking the API down.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `apps/api/src/audit/audit.module.ts` | Wires the Mongo client, service and interceptor |
| `apps/api/src/audit/mongo.provider.ts` | Connects `MongoClient` when `MONGODB_URL` is set; yields `null` otherwise |
| `apps/api/src/audit/audit.service.ts` | `record()` write path, index creation, `list()` cursor read |
| `apps/api/src/audit/audit.interceptor.ts` | Records successful mutations without touching the response |
| `apps/api/src/audit/audit.controller.ts` | `GET /audit-logs` (owner only) |
| `apps/api/test/dentist-scope.spec.ts` | Role policy — the security gap |
| `apps/api/test/audit.spec.ts` | Write path, TTL index, cursor, tenant scope |
| `apps/api/test/manage-reschedule.spec.ts` | Patient self-service reschedule |
| `apps/web/src/features/activity/activity-page.tsx` | Activity feed screen |
| `apps/web/src/features/activity/activity-page.test.tsx` | Feed rendering and paging |
| `apps/web/src/lib/use-online.ts` | `navigator.onLine` + event subscription |
| `apps/web/src/lib/use-online.test.ts` | Transitions |
| `apps/web/src/features/timeline/use-column-mode.ts` | Dentist ↔ chair column grouping |
| `apps/web/src/features/timeline/use-column-mode.test.ts` | Grouping and URL round-trip |
| `packages/contracts/src/audit.ts` | `auditEntrySchema`, `auditPageSchema` |

**Modified:** `apps/api/src/appointments/appointments.service.ts`, `apps/api/src/public/public.service.ts`, `apps/api/src/public/public-manage.controller.ts`, `apps/api/src/demo/demo-seed.ts`, `apps/api/src/directory/directory.controller.ts`, `apps/api/src/directory/directory.service.ts`, `apps/api/src/app.module.ts`, `apps/api/test/tenant-isolation.spec.ts`, `apps/web/src/features/timeline/timeline-page.tsx`, `apps/web/src/components/shell/app-shell.tsx`, `apps/web/src/routes.tsx`, `apps/web/src/features/booking/manage-page.tsx`, `.github/workflows/ci.yml`, `README.md`, `docs/superpowers/specs/dentalops-design.md`.

---

### Task 1: Dentist scope — the authorization gap

The design doc's Authorization section promises "Dentists see only their own schedule and may only update their own appointment statuses (service-layer policy, tested per role)". Neither half exists: `GET /appointments` has no role filter and `setStatus` never looks at the caller.

**Files:**
- Modify: `apps/api/src/appointments/appointments.service.ts` (`list` at :50, `setStatus` at :354)
- Test: `apps/api/test/dentist-scope.spec.ts` (create)

**Interfaces:**
- Consumes: `currentTenant(): { tenantId: string; userId: string; role: string } | undefined` from `apps/api/src/tenant/tenant-context.ts`.
- Produces: nothing new for other tasks. Task 5 depends on the **public path staying unaffected** — the middlewares set `role: "public"`, so a policy keyed on `role === "dentist"` must leave it alone.

**The trap:** `PublicService.manageCancel` (`apps/api/src/public/public.service.ts:182`) calls `this.appointments.setStatus`. Under `ManageTokenMiddleware` the context is `{ userId: "public", role: "public" }`. If the guard is written as "only the owning dentist may change status", patients lose the ability to cancel their own booking. Key the check on `role === "dentist"` and nothing else.

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/dentist-scope.spec.ts`:

```ts
import { INestApplication } from "@nestjs/common"
import type { Server } from "node:http"
import request from "supertest"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

describe("dentist scope", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  const slug = `scope-${Date.now()}`

  let ownerToken: string
  let dentistAToken: string
  let dentistAId: string
  let dentistBId: string
  let branchId: string
  let serviceId: string
  let patientId: string
  let appointmentOfA: string
  let appointmentOfB: string

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)

    const signup = await request(server).post("/auth/signup").send({
      clinicName: "Scope Clinic",
      slug,
      email: `owner@${slug}.local`,
      password: "s3cure-pass",
      name: "Owner"
    })
    expectStatus(signup, 200)
    ownerToken = (signup.body as { accessToken: string }).accessToken

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug } })
    const passwordHash = (
      await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id } })
    ).passwordHash

    const dentistA = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `a@${slug}.local`,
        passwordHash,
        name: "Dentist A",
        role: "dentist"
      }
    })
    const dentistB = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `b@${slug}.local`,
        passwordHash,
        name: "Dentist B",
        role: "dentist"
      }
    })
    dentistAId = dentistA.id
    dentistBId = dentistB.id

    const branch = await prisma.branch.findFirstOrThrow({ where: { tenantId: tenant.id } })
    const service = await prisma.service.findFirstOrThrow({ where: { tenantId: tenant.id } })
    branchId = branch.id
    serviceId = service.id

    const patient = await prisma.patient.create({
      data: { tenantId: tenant.id, name: "Somchai", phone: `08${Date.now() % 100000000}` }
    })
    patientId = patient.id

    const login = await request(server)
      .post("/auth/login")
      .send({ email: `a@${slug}.local`, password: "s3cure-pass" })
    expectStatus(login, 200)
    dentistAToken = (login.body as { accessToken: string }).accessToken

    appointmentOfA = await book(dentistAId, "2027-03-01T03:00:00.000Z")
    appointmentOfB = await book(dentistBId, "2027-03-01T05:00:00.000Z")
  })

  const book = async (dentistId: string, startsAt: string) => {
    const res = await request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ branchId, serviceId, dentistId, patientId, startsAt })
    expectStatus(res, 201)
    return (res.body as { id: string }).id
  }

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } })
    await app.close()
  })

  it("shows an owner every dentist's appointments", async () => {
    const res = await request(server)
      .get(`/appointments?branchId=${branchId}&from=2027-03-01T00:00:00.000Z&to=2027-03-02T00:00:00.000Z`)
      .set("Authorization", `Bearer ${ownerToken}`)
    expectStatus(res, 200)
    const ids = (res.body as Array<{ id: string }>).map((a) => a.id)
    expect(ids).toEqual(expect.arrayContaining([appointmentOfA, appointmentOfB]))
  })

  it("shows a dentist only their own appointments", async () => {
    const res = await request(server)
      .get(`/appointments?branchId=${branchId}&from=2027-03-01T00:00:00.000Z&to=2027-03-02T00:00:00.000Z`)
      .set("Authorization", `Bearer ${dentistAToken}`)
    expectStatus(res, 200)
    const ids = (res.body as Array<{ id: string }>).map((a) => a.id)
    expect(ids).toContain(appointmentOfA)
    expect(ids).not.toContain(appointmentOfB)
  })

  it("ignores a dentistId filter naming somebody else", async () => {
    const res = await request(server)
      .get(
        `/appointments?branchId=${branchId}&dentistId=${dentistBId}` +
          `&from=2027-03-01T00:00:00.000Z&to=2027-03-02T00:00:00.000Z`
      )
      .set("Authorization", `Bearer ${dentistAToken}`)
    expectStatus(res, 200)
    const ids = (res.body as Array<{ id: string }>).map((a) => a.id)
    expect(ids).not.toContain(appointmentOfB)
  })

  it("lets a dentist complete their own appointment", async () => {
    const res = await request(server)
      .patch(`/appointments/${appointmentOfA}/status`)
      .set("Authorization", `Bearer ${dentistAToken}`)
      .send({ status: "completed" })
    expectStatus(res, 200)
    expect((res.body as { status: string }).status).toBe("completed")
  })

  it("refuses to let a dentist touch another dentist's appointment", async () => {
    const res = await request(server)
      .patch(`/appointments/${appointmentOfB}/status`)
      .set("Authorization", `Bearer ${dentistAToken}`)
      .send({ status: "no_show" })
    expectStatus(res, 403)
    expect((res.body as { errorCode: string }).errorCode).toBe("NOT_YOUR_APPOINTMENT")

    const untouched = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentOfB } })
    expect(untouched.status).toBe("confirmed")
  })

  it("still lets an owner set any status", async () => {
    const res = await request(server)
      .patch(`/appointments/${appointmentOfB}/status`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ status: "no_show" })
    expectStatus(res, 200)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @dentalops/api exec jest test/dentist-scope.spec.ts
```

Expected: the two scoping tests and the refusal test FAIL — a dentist currently sees and mutates everything.

- [ ] **Step 3: Implement the policy in the service layer**

In `apps/api/src/appointments/appointments.service.ts`, add the import:

```ts
import { currentTenant } from "../tenant/tenant-context"
```

Replace `list` (currently at :50):

```ts
  list(query: QueryAppointmentsDto) {
    const actor = currentTenant()
    const dentistId = actor?.role === "dentist" ? actor.userId : query.dentistId
    return this.prisma.scoped.appointment.findMany({
      where: {
        branchId: query.branchId,
        dentistId,
        startsAt: query.to ? { lt: new Date(query.to) } : undefined,
        endsAt: query.from ? { gt: new Date(query.from) } : undefined
      },
      include: APPOINTMENT_INCLUDE,
      orderBy: { startsAt: "asc" }
    })
  }
```

In `setStatus`, immediately after the `if (!current)` guard and before the status-transition check:

```ts
      const actor = currentTenant()
      if (actor?.role === "dentist" && current.dentistId !== actor.userId) {
        throw new AppException(
          403,
          "NOT_YOUR_APPOINTMENT",
          "A dentist may only change the status of their own appointments"
        )
      }
```

- [ ] **Step 4: Run the test again**

```bash
pnpm --filter @dentalops/api exec jest test/dentist-scope.spec.ts
```

Expected: 6 passed.

- [ ] **Step 5: Prove the patient path is untouched**

```bash
pnpm --filter @dentalops/api exec jest test/public-booking.spec.ts test/appointments.spec.ts test/reschedule.spec.ts
```

Expected: all pass. If `manageCancel` broke, the policy was keyed on something other than `role === "dentist"` — fix that, do not weaken the test.

- [ ] **Step 6: Mutation-test the policy**

Delete the `throw new AppException(403, "NOT_YOUR_APPOINTMENT", …)` block, re-run `dentist-scope.spec.ts`, confirm the refusal test goes red, then restore it. Do the same for the `actor?.role === "dentist" ? actor.userId : query.dentistId` ternary by reverting it to `query.dentistId`. Both mutations must be caught.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/appointments/appointments.service.ts apps/api/test/dentist-scope.spec.ts
git commit -m "feat(api): hold dentists to their own schedule and their own appointments"
```

---

### Task 2: Give the demo the recurrence it was built for

`grep -i series apps/api/src/demo/demo-seed.ts` returns nothing. W7 built appointment series, shift series, series split and the ⟳ badge, and none of it is visible to anyone who opens the demo. The design doc's demo tenant spec calls for an "ortho series".

**Files:**
- Modify: `apps/api/src/demo/demo-seed.ts`
- Modify: `apps/api/test/demo-reset.spec.ts`

**Interfaces:**
- Consumes: `DemoSeedCounts { patients: number; shifts: number; appointments: number }` from `apps/api/src/demo/demo-seed.ts:86`.
- Produces: `DemoSeedCounts` gains `appointmentSeries: number` and `shiftSeries: number`. `DemoResetService.reset()` returns this widened shape; Task 9's README numbers come from it.

**Design:** The seed builds appointments inside a per-dentist cursor loop (`demo-seed.ts:233-292`). Reserve the head of that cursor rather than fighting the EXCLUDE constraints afterwards. Dentist index 0 works weekdays 1–5 from 02:00 UTC; on **Wednesdays only**, place one "Ortho adjustment" (30 min) at the shift start, tie it to an `AppointmentSeries`, and start the ordinary cursor after it. Because the ortho block occupies the first slot before any random appointment is placed, no conflict is possible.

Shift series are simpler: create a `ShiftSeries` row per dentist pattern and stamp `seriesId` onto the shift rows that pattern already generates.

- [ ] **Step 1: Write the failing assertions**

In `apps/api/test/demo-reset.spec.ts`, replace the body of `it("rebuilds the demo tenant to its seeded shape")`:

```ts
  it("rebuilds the demo tenant to its seeded shape", async () => {
    const counts = await demo.reset()
    expect(counts.patients).toBe(120)
    expect(counts.shifts).toBeGreaterThan(300)
    expect(counts.appointments).toBeGreaterThan(1000)
    expect(counts.appointmentSeries).toBeGreaterThan(0)
    expect(counts.shiftSeries).toBeGreaterThan(0)

    const tenant = await prisma.tenant.findUnique({ where: { slug: "demo-clinic" } })
    expect(tenant).not.toBeNull()
    expect(await prisma.patient.count({ where: { tenantId: tenant!.id } })).toBe(counts.patients)
  })

  it("seeds an ortho series a visitor can actually see on the timeline", async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo-clinic" } })
    const series = await prisma.appointmentSeries.findFirstOrThrow({
      where: { tenantId: tenant.id },
      include: { appointments: { orderBy: { startsAt: "asc" } } }
    })
    expect(series.freq).toBe("weekly")
    expect(series.appointments.length).toBeGreaterThanOrEqual(6)

    const upcoming = series.appointments.filter((a) => a.startsAt > new Date())
    expect(upcoming.length).toBeGreaterThan(0)

    const spacing = series.appointments
      .slice(1)
      .map((a, i) => a.startsAt.getTime() - series.appointments[i]!.startsAt.getTime())
    expect(new Set(spacing)).toEqual(new Set([7 * 24 * 60 * 60 * 1000]))
  })

  it("attaches materialized shifts to a recurring series", async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo-clinic" } })
    const series = await prisma.shiftSeries.findFirstOrThrow({ where: { tenantId: tenant.id } })
    const attached = await prisma.shift.count({ where: { seriesId: series.id } })
    expect(attached).toBeGreaterThan(10)
  })
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @dentalops/api exec jest test/demo-reset.spec.ts
```

Expected: FAIL — `appointmentSeries` is `undefined` and `findFirstOrThrow` finds no series row.

- [ ] **Step 3: Widen the counts type**

In `apps/api/src/demo/demo-seed.ts`, replace the `DemoSeedCounts` interface at :86:

```ts
export interface DemoSeedCounts {
  patients: number
  shifts: number
  appointments: number
  appointmentSeries: number
  shiftSeries: number
}
```

- [ ] **Step 4: Create the shift series and stamp the shifts**

In `seedDemoTenant`, immediately before the `for (let offset = -SEED_WINDOW_DAYS; ...)` loop (`demo-seed.ts:207`), add:

```ts
  const seriesByDentist = new Map<string, string>()
  for (const [dentistIndex, dentistId] of dentistIds.entries()) {
    const pattern = SHIFT_PATTERNS[dentistIndex]
    if (!pattern) continue
    const branch = branches[dentistIndex % branches.length]
    if (!branch) continue
    const series = await prisma.shiftSeries.create({
      data: {
        tenantId: tenant.id,
        staffId: dentistId,
        branchId: branch.id,
        freq: "weekly",
        interval: 1,
        byWeekday: pattern.weekdays,
        timeStart: `${String(pattern.startHourUtc).padStart(2, "0")}:00`,
        durationMin: pattern.durationMin,
        startsOn: new Date(midnightUtc - SEED_WINDOW_DAYS * DAY_MS)
      }
    })
    seriesByDentist.set(dentistId, series.id)
  }
```

Move the `const midnightUtc = ...` line (`demo-seed.ts:205`) above this block so it is in scope.

Then in the shift push inside the day loop (`demo-seed.ts:225-231`), add the link:

```ts
      shiftRows.push({
        tenantId: tenant.id,
        staffId: dentistId,
        branchId: branch.id,
        seriesId: seriesByDentist.get(dentistId),
        startsAt: new Date(shiftStart),
        endsAt: new Date(shiftEnd)
      })
```

- [ ] **Step 5: Create the ortho series and reserve its slot**

Before the day loop, after the shift-series block:

```ts
  const orthoService = services.find((s) => s.name === "Ortho adjustment")
  const orthoDentistId = dentistIds[0]
  const orthoPatientId = patientIds[0]
  const ORTHO_WEEKDAY = 3
  const orthoSeries =
    orthoService && orthoDentistId && orthoPatientId
      ? await prisma.appointmentSeries.create({
          data: {
            tenantId: tenant.id,
            freq: "weekly",
            interval: 1,
            byWeekday: [ORTHO_WEEKDAY],
            count: 0
          }
        })
      : null
  let orthoCount = 0
```

Inside the dentist loop, immediately after `let cursor = shiftStart` (`demo-seed.ts:234`), insert:

```ts
      if (
        orthoSeries &&
        orthoService &&
        orthoPatientId &&
        dentistId === orthoDentistId &&
        weekday === ORTHO_WEEKDAY
      ) {
        const orthoEnd = cursor + orthoService.durationMin * MINUTE_MS
        const orthoChairEnd = orthoEnd + orthoService.bufferMin * MINUTE_MS
        const orthoId = randomUuid()
        const orthoStatus: AppointmentStatus = orthoEnd < now.getTime() ? "completed" : "confirmed"
        batch.appointments.push({
          id: orthoId,
          tenantId: tenant.id,
          branchId: branch.id,
          seriesId: orthoSeries.id,
          serviceId: orthoService.id,
          dentistId,
          patientId: orthoPatientId,
          startsAt: new Date(cursor),
          endsAt: new Date(orthoEnd),
          status: orthoStatus
        })
        batch.claims.push({
          tenantId: tenant.id,
          appointmentId: orthoId,
          resourceId: chairId,
          startsAt: new Date(cursor),
          endsAt: new Date(orthoChairEnd),
          status: "active"
        })
        orthoCount++
        cursor = orthoChairEnd
      }
```

After the day loop closes and before `await prisma.shift.createMany(...)`:

```ts
  if (orthoSeries) {
    await prisma.appointmentSeries.update({
      where: { id: orthoSeries.id },
      data: { count: orthoCount }
    })
  }
```

Finally widen the return:

```ts
  return {
    patients: patientRows.length,
    shifts: shiftRows.length,
    appointments: appointmentCount,
    appointmentSeries: orthoSeries ? 1 : 0,
    shiftSeries: seriesByDentist.size
  }
```

- [ ] **Step 6: Run the tests**

```bash
pnpm --filter @dentalops/api exec jest test/demo-reset.spec.ts test/seed.spec.ts
```

Expected: PASS. If the ortho appointments trigger the seed's `insertOneByOne` fallback, `orthoCount` will exceed the rows actually inserted — check by asserting `series.appointments.length` equals the recorded `count`, and if they differ, the reserved slot is colliding: verify the ortho block runs **before** the `for (let n = 0; n < target; n++)` loop, not inside it.

- [ ] **Step 7: See it**

```bash
pnpm --filter @dentalops/api db:seed
pnpm dev
```

Open the timeline on a Wednesday and confirm the ⟳ badge renders on the ortho appointment, and that the series edit dialog offers this / this and following / all.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/demo/demo-seed.ts apps/api/test/demo-reset.spec.ts
git commit -m "feat(api): seed the demo with the recurrence W7 built"
```

---

### Task 3: MongoDB audit log — the write path

**Files:**
- Create: `apps/api/src/audit/mongo.provider.ts`, `audit.service.ts`, `audit.interceptor.ts`, `audit.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `.github/workflows/ci.yml`
- Test: `apps/api/test/audit.spec.ts` (create)

**Interfaces:**
- Produces, consumed by Task 4:
  ```ts
  export const MONGO = Symbol("MONGO")
  export interface AuditEntry {
    tenantId: string
    actor: { type: "staff" | "public"; id: string; name: string }
    action: string
    entity: { type: string; id: string }
    before?: unknown
    after?: unknown
    at: Date
    requestId: string
  }
  export interface AuditPage { entries: AuditEntry[]; nextCursor: string | null }
  class AuditService {
    record(entry: Omit<AuditEntry, "at">): void
    list(input: { cursor?: string; limit: number }): Promise<AuditPage>
    get enabled(): boolean
  }
  ```

**Design decisions, and why:**

1. **Official `mongodb` driver, no Mongoose.** The talking point in the design doc is "append-only, write-heavy, flexible schema, no joins". Bolting a schema enforcer on top would argue against the reason the database was chosen.
2. **Absent `MONGODB_URL` means audit is a no-op, not a crash.** This mirrors `createMailTransport` (`apps/api/src/mail/mail.transport.ts:52`), which picks `SmtpTransport` or a logging transport from the environment. Local dev and any contributor without Mongo keep working.
3. **`record()` returns `void`, not a promise.** The audit log must never add latency to a booking or a failure mode to a request. It fires and forgets, and routes its own failures to Sentry.
4. **A 30-day TTL index.** Atlas M0 gives 512 MB and the demo tenant reseeds every six hours; without expiry the collection grows without bound. The design doc does not mention this — it is a gap in the spec, not in the plan.
5. **`before` is only populated where a service already loaded the row.** An interceptor cannot see pre-mutation state. Rather than fake it, the interceptor records `after` alone, and Task 3 adds two explicit `record` calls in `AppointmentsService` where `current` is already in hand.

- [ ] **Step 1: Install the driver**

```bash
pnpm --filter @dentalops/api add mongodb@6
```

- [ ] **Step 2: Write the failing test**

Create `apps/api/test/audit.spec.ts`:

```ts
import { INestApplication } from "@nestjs/common"
import type { Server } from "node:http"
import request from "supertest"
import { AuditService } from "../src/audit/audit.service"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

const settle = () => new Promise((resolve) => setTimeout(resolve, 200))

describe("audit log", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let audit: AuditService
  let token: string
  let branchId: string
  let serviceId: string
  let dentistId: string
  let patientId: string
  const slug = `audit-${Date.now()}`

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)
    audit = app.get(AuditService)

    const signup = await request(server).post("/auth/signup").send({
      clinicName: "Audit Clinic",
      slug,
      email: `owner@${slug}.local`,
      password: "s3cure-pass",
      name: "Owner"
    })
    expectStatus(signup, 200)
    token = (signup.body as { accessToken: string }).accessToken

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug } })
    const passwordHash = (
      await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id } })
    ).passwordHash
    const dentist = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `d@${slug}.local`,
        passwordHash,
        name: "Dentist",
        role: "dentist"
      }
    })
    dentistId = dentist.id
    branchId = (await prisma.branch.findFirstOrThrow({ where: { tenantId: tenant.id } })).id
    serviceId = (await prisma.service.findFirstOrThrow({ where: { tenantId: tenant.id } })).id
    patientId = (
      await prisma.patient.create({
        data: {
          tenantId: tenant.id,
          name: "Ploy",
          phone: `07${Date.now() % 100000000}`,
          email: `ploy@${slug}.local`
        }
      })
    ).id
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } })
    await app.close()
  })

  const skipWithoutMongo = () => {
    if (!audit.enabled) {
      console.warn("MONGODB_URL not set — audit assertions skipped")
      return true
    }
    return false
  }

  it("records a successful booking", async () => {
    if (skipWithoutMongo()) return
    const res = await request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${token}`)
      .send({ branchId, serviceId, dentistId, patientId, startsAt: "2027-04-01T03:00:00.000Z" })
    expectStatus(res, 201)
    await settle()

    const page = await audit.list({ limit: 10 })
    const entry = page.entries.find((e) => e.entity.id === (res.body as { id: string }).id)
    expect(entry).toBeDefined()
    expect(entry!.action).toBe("POST /appointments")
    expect(entry!.actor.name).toBe("Owner")
    expect(entry!.requestId).toBeTruthy()
  })

  it("records nothing when the mutation failed", async () => {
    if (skipWithoutMongo()) return
    const before = (await audit.list({ limit: 50 })).entries.length
    const res = await request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${token}`)
      .send({ branchId, serviceId, dentistId, patientId, startsAt: "not-a-date" })
    expect(res.status).toBeGreaterThanOrEqual(400)
    await settle()
    expect((await audit.list({ limit: 50 })).entries.length).toBe(before)
  })

  it("captures before and after on a status change", async () => {
    if (skipWithoutMongo()) return
    const created = await request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${token}`)
      .send({ branchId, serviceId, dentistId, patientId, startsAt: "2027-04-02T03:00:00.000Z" })
    expectStatus(created, 201)
    const id = (created.body as { id: string }).id

    const res = await request(server)
      .patch(`/appointments/${id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "completed" })
    expectStatus(res, 200)
    await settle()

    const page = await audit.list({ limit: 20 })
    const entry = page.entries.find(
      (e) => e.entity.id === id && e.action === "appointment.status"
    )
    expect(entry).toBeDefined()
    expect((entry!.before as { status: string }).status).toBe("confirmed")
    expect((entry!.after as { status: string }).status).toBe("completed")
  })

  it("expires entries so a free-tier cluster cannot fill up", async () => {
    if (skipWithoutMongo()) return
    const indexes = await audit.describeIndexes()
    const ttl = indexes.find((i) => i.expireAfterSeconds !== undefined)
    expect(ttl).toBeDefined()
    expect(ttl!.expireAfterSeconds).toBe(30 * 24 * 60 * 60)
  })

  it("never returns another tenant's entries", async () => {
    if (skipWithoutMongo()) return
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug } })
    const page = await audit.list({ limit: 100 })
    expect(page.entries.every((e) => e.tenantId === tenant.id)).toBe(true)
  })
})
```

- [ ] **Step 3: Run it to make sure it fails**

```bash
pnpm --filter @dentalops/api exec jest test/audit.spec.ts
```

Expected: FAIL — `AuditService` does not exist.

- [ ] **Step 4: Carry the actor's name in the tenant context**

The audit entry needs a human-readable actor. `JwtPayload` already carries `name` (`apps/api/src/auth/auth.service.ts:21`) but `TenantContextMiddleware` drops it, so without this step the interceptor and the service-level `record` calls would disagree — one reading `req.user.name`, the other having only a uuid.

In `apps/api/src/tenant/tenant-context.ts`:

```ts
export interface TenantContextData {
  tenantId: string
  userId: string
  role: string
  name: string
}
```

Then update all five `tenantContext.run` call sites, or typecheck fails:

| File | Value for `name` |
|---|---|
| `src/tenant/tenant-context.middleware.ts:17` | `payload.name` |
| `src/public/public-tenant.middleware.ts:33` | `"Guest"` |
| `src/public/manage-token.middleware.ts:21` | `"Guest"` |
| `src/roster/horizon.processor.ts:43` | `"Horizon worker"` |
| `src/mail/mail.processor.ts:33` | `"Mail worker"` |
| `test/tenant-extension.spec.ts:7` | `"Test User"` |

Remember the lazy-`PrismaPromise` rule: `horizon.processor.ts` and `mail.processor.ts` already pass `async` callbacks with the query awaited inside. Do not restructure them.

Run `pnpm turbo run typecheck --force; echo "exit=$?"` before moving on. Expected `exit=0`.

- [ ] **Step 5: The Mongo provider**

Create `apps/api/src/audit/mongo.provider.ts`:

```ts
import { Provider } from "@nestjs/common"
import { MongoClient } from "mongodb"

export const MONGO = Symbol("MONGO")

export const mongoProvider: Provider = {
  provide: MONGO,
  useFactory: async (): Promise<MongoClient | null> => {
    const url = process.env.MONGODB_URL
    if (!url) return null
    const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 })
    await client.connect()
    return client
  }
}
```

- [ ] **Step 6: The service**

Create `apps/api/src/audit/audit.service.ts`:

```ts
import { Inject, Injectable, OnModuleInit } from "@nestjs/common"
import * as Sentry from "@sentry/nestjs"
import { Collection, MongoClient, ObjectId } from "mongodb"
import { currentTenant } from "../tenant/tenant-context"
import { MONGO } from "./mongo.provider"

const COLLECTION = "audit_logs"
const RETENTION_SECONDS = 30 * 24 * 60 * 60

export interface AuditEntry {
  tenantId: string
  actor: { type: "staff" | "public"; id: string; name: string }
  action: string
  entity: { type: string; id: string }
  before?: unknown
  after?: unknown
  at: Date
  requestId: string
}

export interface AuditPage {
  entries: AuditEntry[]
  nextCursor: string | null
}

interface StoredEntry extends AuditEntry {
  _id: ObjectId
}

@Injectable()
export class AuditService implements OnModuleInit {
  constructor(@Inject(MONGO) private readonly client: MongoClient | null) {}

  get enabled(): boolean {
    return this.client !== null
  }

  private get collection(): Collection<StoredEntry> | null {
    return this.client ? this.client.db().collection<StoredEntry>(COLLECTION) : null
  }

  async onModuleInit() {
    const collection = this.collection
    if (!collection) return
    await collection.createIndex({ tenantId: 1, at: -1 })
    await collection.createIndex({ at: 1 }, { expireAfterSeconds: RETENTION_SECONDS })
  }

  record(entry: Omit<AuditEntry, "at">): void {
    const collection = this.collection
    if (!collection) return
    void collection
      .insertOne({ ...entry, at: new Date() } as StoredEntry)
      .catch((error: unknown) => Sentry.captureException(error))
  }

  async list(input: { cursor?: string; limit: number }): Promise<AuditPage> {
    const collection = this.collection
    const tenant = currentTenant()
    if (!collection || !tenant) return { entries: [], nextCursor: null }

    const filter: Record<string, unknown> = { tenantId: tenant.tenantId }
    if (input.cursor) filter._id = { $lt: new ObjectId(input.cursor) }

    const rows = await collection
      .find(filter)
      .sort({ _id: -1 })
      .limit(input.limit + 1)
      .toArray()

    const page = rows.slice(0, input.limit)
    const last = page.at(-1)
    return {
      entries: page.map(({ _id, ...rest }) => rest),
      nextCursor: rows.length > input.limit && last ? last._id.toHexString() : null
    }
  }

  async describeIndexes(): Promise<Array<{ expireAfterSeconds?: number }>> {
    const collection = this.collection
    if (!collection) return []
    return (await collection.indexes()) as Array<{ expireAfterSeconds?: number }>
  }
}
```

The `filter._id = { $lt: ... }` cursor sorts on `_id` descending rather than on `at`, because `ObjectId` is monotonic and unique while two entries can share a millisecond — a cursor on `at` would skip or repeat rows under load.

- [ ] **Step 7: The interceptor**

Create `apps/api/src/audit/audit.interceptor.ts`:

```ts
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common"
import type { Request } from "express"
import { Observable, tap } from "rxjs"
import { currentTenant } from "../tenant/tenant-context"
import { AuditService } from "./audit.service"

const MUTATIONS = new Set(["POST", "PATCH", "DELETE"])
const SILENT = [/^\/auth\//, /^\/internal\//]

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { requestId?: string }>()
    const path = req.route?.path ?? req.path
    if (!MUTATIONS.has(req.method) || SILENT.some((p) => p.test(req.path))) {
      return next.handle()
    }

    return next.handle().pipe(
      tap((body: unknown) => {
        const tenant = currentTenant()
        if (!tenant) return
        const entityId =
          (body as { id?: string } | null)?.id ?? (req.params.id as string | undefined) ?? ""
        this.audit.record({
          tenantId: tenant.tenantId,
          actor: {
            type: tenant.role === "public" ? "public" : "staff",
            id: tenant.userId,
            name: tenant.name
          },
          action: `${req.method} ${path}`,
          entity: { type: path.split("/")[1] ?? "unknown", id: entityId },
          after: body ?? undefined,
          requestId: req.requestId ?? ""
        })
      })
    )
  }
}
```

`tap` only runs on the success channel, which is what makes the "records nothing when the mutation failed" test pass without an explicit status check.

- [ ] **Step 8: The module, and wiring it globally**

Create `apps/api/src/audit/audit.module.ts`:

```ts
import { Global, Module } from "@nestjs/common"
import { AuditService } from "./audit.service"
import { mongoProvider } from "./mongo.provider"

@Global()
@Module({
  providers: [mongoProvider, AuditService],
  exports: [AuditService]
})
export class AuditModule {}
```

In `apps/api/src/app.module.ts`: add `AuditModule` to `imports` immediately after `RedisModule`, and add to `providers`:

```ts
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
```

placing it **after** the existing `LatencyInterceptor` entry.

- [ ] **Step 9: Explicit before/after on the two appointment mutations**

In `apps/api/src/appointments/appointments.service.ts`, inject the service:

```ts
    private readonly audit: AuditService,
```

In `setStatus`, after the transaction resolves and before `this.announce(...)`:

```ts
    this.audit.record({
      tenantId: updated.tenantId,
      actor: auditActor(),
      action: "appointment.status",
      entity: { type: "appointment", id: updated.id },
      before: { status: "confirmed" },
      after: { status: updated.status },
      requestId: ""
    })
```

Capture `current.status` into a variable inside the transaction and use it for `before` rather than the literal — the transition guard means it is always `confirmed` today, but a literal would silently lie the moment that guard changes.

Add the shared helper to `apps/api/src/audit/audit.service.ts`:

```ts
export const auditActor = (): AuditEntry["actor"] => {
  const tenant = currentTenant()
  return {
    type: tenant?.role === "public" ? "public" : "staff",
    id: tenant?.userId ?? "unknown",
    name: tenant?.name ?? "unknown"
  }
}
```

- [ ] **Step 10: Add Mongo to CI**

In `.github/workflows/ci.yml`, add under `services:`:

```yaml
      mongo:
        image: mongo:7
        ports:
          - 27017:27017
        options: >-
          --health-cmd "mongosh --quiet --eval 'db.runCommand({ ping: 1 })'"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 20
```

and under `env:`:

```yaml
      MONGODB_URL: mongodb://localhost:27017/dentalops_ci
```

- [ ] **Step 11: Run the tests**

```bash
docker compose up -d mongo
pnpm --filter @dentalops/api exec jest test/audit.spec.ts
```

Expected: 5 passed. If they report as skipped, `MONGODB_URL` is not in the local `.env` — add it (the value is already in `.env.example`) and re-run. A skipped run is not a pass.

- [ ] **Step 12: Prove audit failure cannot break a booking**

Stop Mongo mid-suite and confirm bookings still succeed:

```bash
docker compose stop mongo
pnpm --filter @dentalops/api exec jest test/appointments.spec.ts
docker compose start mongo
```

Expected: PASS. If appointments fail, `record()` is being awaited somewhere — find it and remove the await.

- [ ] **Step 13: Commit**

```bash
git add apps/api/src/audit apps/api/src/tenant apps/api/src/public apps/api/src/roster apps/api/src/mail apps/api/src/app.module.ts apps/api/src/appointments/appointments.service.ts apps/api/test/audit.spec.ts .github/workflows/ci.yml apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): audit log write path on mongodb, with a ttl the free tier needs"
```

---

### Task 4: `GET /audit-logs` and the activity feed

**Files:**
- Create: `apps/api/src/audit/audit.controller.ts`, `packages/contracts/src/audit.ts`, `apps/web/src/features/activity/activity-page.tsx`, `apps/web/src/features/activity/activity-page.test.tsx`
- Modify: `packages/contracts/src/index.ts`, `apps/api/src/audit/audit.module.ts`, `apps/api/test/tenant-isolation.spec.ts`, `apps/web/src/routes.tsx`, `apps/web/src/components/shell/app-shell.tsx`

**Interfaces:**
- Consumes: `AuditService.list({ cursor?, limit })` and `AuditPage` from Task 3.
- Produces: `auditPageSchema` in `@dentalops/contracts`; the route `/app/activity`.

- [ ] **Step 1: The contract**

Create `packages/contracts/src/audit.ts`:

```ts
import { z } from "zod"

export const auditEntrySchema = z.object({
  tenantId: z.string().uuid(),
  actor: z.object({
    type: z.enum(["staff", "public"]),
    id: z.string(),
    name: z.string()
  }),
  action: z.string(),
  entity: z.object({ type: z.string(), id: z.string() }),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  at: z.coerce.date(),
  requestId: z.string()
})

export const auditPageSchema = z.object({
  entries: z.array(auditEntrySchema),
  nextCursor: z.string().nullable()
})

export type AuditEntry = z.infer<typeof auditEntrySchema>
export type AuditPage = z.infer<typeof auditPageSchema>
```

Add `export * from "./audit"` to `packages/contracts/src/index.ts`.

- [ ] **Step 2: The controller**

Create `apps/api/src/audit/audit.controller.ts`:

```ts
import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Roles } from "../auth/roles.decorator"
import { AuditService } from "./audit.service"

@ApiTags("audit")
@ApiBearerAuth()
@Controller("audit-logs")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Roles("owner")
  list(
    @Query("cursor") cursor?: string,
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit = 50
  ) {
    return this.audit.list({ cursor, limit: Math.min(Math.max(limit, 1), 100) })
  }
}
```

Add `controllers: [AuditController]` to `AuditModule`.

- [ ] **Step 3: Register the route in the isolation registry**

In `apps/api/test/tenant-isolation.spec.ts`, add to `REGISTRY`:

```ts
  "GET /audit-logs": { kind: "collection", auth: true },
```

matching the shape the neighbouring entries use. Run the suite; the `every discovered route is declared in the isolation registry` test must stay green.

- [ ] **Step 4: The feed screen**

Create `apps/web/src/features/activity/activity-page.tsx`. It uses `useInfiniteQuery` against `/audit-logs`, renders each entry as actor + action + relative time with the entity id, shows `EmptyState` with the `History` icon when there is nothing, and a "Load older" button while `nextCursor` is non-null. Follow the query and error conventions in `apps/web/src/features/roster/hooks.ts`.

- [ ] **Step 5: Route and nav**

In `apps/web/src/routes.tsx` add a lazy `ActivityPage` and the child route `{ path: "activity", element: deferred(<ActivityPage />) }`.

In `apps/web/src/components/shell/app-shell.tsx` add to `navItems`, using the `History` icon:

```ts
  { to: "/app/activity", label: "Activity", icon: History, visible: canManageRoster },
```

`canManageRoster` is owner-only, which matches `@Roles("owner")` on the controller. Task 1's invariant test in `app-shell.test.tsx` — "guards every gated destination with the predicate its route uses" — must be extended to cover `/app/activity`.

Note the mobile bottom bar now carries five items, which is the Material limit. Do not add a sixth.

- [ ] **Step 6: Tests, then commit**

```bash
pnpm --filter @dentalops/web exec vitest run src/features/activity src/components/shell
pnpm --filter @dentalops/api exec jest test/tenant-isolation.spec.ts
```

```bash
git add apps/api/src/audit packages/contracts/src apps/web/src/features/activity apps/web/src/routes.tsx apps/web/src/components/shell apps/api/test/tenant-isolation.spec.ts
git commit -m "feat: activity feed reading the audit log"
```

---

### Task 5: Patient self-service reschedule

The design doc lists `POST /public/manage/:token/reschedule` — "goes through a fresh hold". It does not exist; patients can only cancel.

**Files:**
- Modify: `apps/api/src/public/public.service.ts`, `apps/api/src/public/public-manage.controller.ts`, `apps/web/src/features/booking/manage-page.tsx`
- Test: `apps/api/test/manage-reschedule.spec.ts` (create)

**Interfaces:**
- Consumes: `HoldsService.read(holdId)`, `HoldsService.release(holdId)`, `AppointmentsService.reschedule(id, dto)` where `RescheduleAppointmentDto` requires `version: number`.
- Produces: `PublicService.manageReschedule(token, body: { holdId: string })`.

**The version problem:** `reschedule` takes a client-supplied `version` for optimistic concurrency, but a patient holding an email link has never seen one. Read the appointment inside `manageReschedule` and pass its current version. This is correct rather than a shortcut: the patient's concurrency protection is the Redis hold, which no one else can take, and the appointment row is re-read microseconds before the update.

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/manage-reschedule.spec.ts` covering: a full public booking produces a manage token; acquiring a fresh hold and posting it moves the appointment; the hold is released afterwards; an expired or unknown `holdId` returns `409 HOLD_EXPIRED`; a hold belonging to another tenant returns `409 HOLD_EXPIRED`; a cancelled appointment cannot be rescheduled. Model the booking setup on `apps/api/test/public-booking.spec.ts`.

- [ ] **Step 2: Run it, confirm 404**

```bash
pnpm --filter @dentalops/api exec jest test/manage-reschedule.spec.ts
```

- [ ] **Step 3: Implement**

In `apps/api/src/public/public.service.ts`, beside `manageCancel`:

```ts
  async manageReschedule(token: string, body: { holdId: string }) {
    const claims = await this.manageTokens.verify(token)
    const hold = await this.holds.read(body.holdId)
    if (!hold || hold.tenantId !== claims.tenantId) {
      throw new AppException(409, "HOLD_EXPIRED", "That time is no longer held for you")
    }

    const current = await this.prisma.scoped.appointment.findUnique({
      where: { id: claims.sub },
      select: { version: true, status: true }
    })
    if (!current) throw new AppException(404, "NOT_FOUND", "Appointment not found")
    if (current.status !== "confirmed") {
      throw new AppException(409, "INVALID_TRANSITION", `Cannot reschedule a ${current.status} appointment`)
    }

    await this.appointments.reschedule(claims.sub, {
      version: current.version,
      startsAt: hold.startsAt,
      dentistId: hold.dentistId
    })
    await this.holds.release(body.holdId)
    return this.appointmentView(claims.sub)
  }
```

In `apps/api/src/public/public-manage.controller.ts`:

```ts
  @Post(":token/reschedule")
  reschedule(@Param("token") token: string, @Body() body: RescheduleByTokenDto) {
    return this.publicService.manageReschedule(token, body)
  }
```

with a `RescheduleByTokenDto` carrying a single `@IsUUID() holdId!: string`.

- [ ] **Step 4: Register the route in the isolation registry, run tests**

```bash
pnpm --filter @dentalops/api exec jest test/manage-reschedule.spec.ts test/tenant-isolation.spec.ts
```

- [ ] **Step 5: The UI**

In `apps/web/src/features/booking/manage-page.tsx`, add a "Reschedule" button beside "Cancel booking" that reuses the wizard's slot picker and countdown banner: pick a new slot → hold → confirm → refresh the view. Reuse `CountdownBanner` and `SlotPicker` rather than writing new components.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/public apps/api/test/manage-reschedule.spec.ts apps/api/test/tenant-isolation.spec.ts apps/web/src/features/booking/manage-page.tsx
git commit -m "feat: let patients move their own booking through a fresh hold"
```

---

### Task 6: Timeline columns switchable to chairs

Design doc Flow 2: "Columns = dentists (switchable to chairs)". Only dentist columns exist. This also needs `GET /resources`, which the admin API surface lists and which does not exist either.

**Files:**
- Modify: `apps/api/src/directory/directory.controller.ts`, `apps/api/src/directory/directory.service.ts`, `packages/contracts/src/directory.ts`
- Create: `apps/web/src/features/timeline/use-column-mode.ts` + test
- Modify: `apps/web/src/features/timeline/timeline-page.tsx`

- [ ] **Step 1: `GET /resources`**

Add to `DirectoryController` a `@Get("resources")` returning active resources for a branch (`?branchId=`), selecting `id`, `name`, `type`, `branchId`, ordered by name. Add the matching Zod schema to `packages/contracts/src/directory.ts`, register the route in the isolation registry, and add a spec case to `apps/api/test/directory.spec.ts`.

- [ ] **Step 2: The grouping hook**

`useColumnMode` reads `?c=dentist|chair` from the URL (defaulting to `dentist`), and returns the column list plus a function mapping an appointment to a column id. In chair mode a column is a resource of `type === "chair"`, and an appointment belongs to the column of its active chair claim — appointments arrive with `claims` already included by `APPOINTMENT_INCLUDE`.

Write `use-column-mode.test.ts` first, covering: default mode is dentist; an appointment with a chair claim lands in that chair's column; an appointment whose chair claim was released is absent from chair mode; the mode survives a URL round-trip.

- [ ] **Step 3: Wire it into the timeline, keeping drag honest**

Pass the resolved columns into `TimeGrid` in place of `allDentists`. **Drag-to-move must be disabled in chair mode** — `PATCH /appointments/:id` reschedules by dentist and time, and there is no API for moving an appointment to a different chair. Gate `drag.startMove`/`startResize` on `mode === "dentist"` and add a test asserting a drag in chair mode does not fire a mutation. Shipping a drag that silently reassigns the wrong thing would be worse than not shipping the toggle.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/directory packages/contracts/src/directory.ts apps/web/src/features/timeline apps/api/test
git commit -m "feat(web): switch timeline columns between dentists and chairs"
```

---

### Task 7: Offline banner that actually disables mutations

Design doc §Designed states: "offline banner disables mutations". The banner exists only as a static tile in the `/dev/ui` gallery.

**Files:**
- Create: `apps/web/src/lib/use-online.ts` + `use-online.test.ts`
- Modify: `apps/web/src/components/shell/app-shell.tsx`, `apps/web/src/features/timeline/timeline-page.tsx`, `apps/web/src/features/roster/roster-page.tsx`

- [ ] **Step 1: The hook, test first**

`useOnline()` uses `useSyncExternalStore` over the `online`/`offline` window events with `navigator.onLine` as the snapshot — the same store pattern `apps/web/src/lib/session.ts` already uses. Test: initial value follows `navigator.onLine`; dispatching `offline` flips it; the listener is removed on unmount.

- [ ] **Step 2: The banner**

In `AppShell`, render a banner above the topbar when offline, with `role="status"` and `aria-live="polite"`, reading "You are offline — changes are paused until you reconnect." It sits above the existing demo banner.

- [ ] **Step 3: Disable the mutation entry points**

Gate the timeline's create/drag affordances and the roster's Save on `useOnline()`, alongside the existing `canCreate` / `canManageRoster` checks. Add a test asserting the roster Save button is disabled while offline.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/use-online.ts apps/web/src/lib/use-online.test.ts apps/web/src/components/shell apps/web/src/features
git commit -m "feat(web): pause mutations while the browser is offline"
```

---

### Task 8: "Any dentist" picks the least-booked one

Design doc Flow 1: "'any dentist' → server assigns lowest-utilization". The wizard's own copy says "the first dentist free at the time you choose" — honest, but not what was designed.

**Files:**
- Modify: `apps/api/src/public/public.service.ts` (`availableSlots` at :86)
- Modify: `apps/web/src/features/booking/steps/dentist-step.tsx:64`
- Test: `apps/api/test/public-booking.spec.ts`

**Why here and not in `AvailabilityService`:** `/availability` is the engine endpoint, and the staff timeline relies on getting every `(dentist, start)` pair for its suggestions. Collapsing there would break create-drawer. `availableSlots` is the public "any dentist" surface, and is the only place the choice belongs.

- [ ] **Step 1: Write the failing test**

In `apps/api/test/public-booking.spec.ts`, add: two dentists rostered on the same day at the same hours, one already carrying three booked appointments and the other one. Request public availability with no `dentistId`. Assert every returned slot names the less-booked dentist, and that exactly one slot is returned per start time.

- [ ] **Step 2: Implement**

In `availableSlots`, when `query.dentistId` is undefined, count booked minutes per dentist for that Bangkok day with one `groupBy` over `appointment` where `status = "confirmed"`, then reduce the slot list to one entry per `startsAt`, choosing the candidate with the fewest booked minutes and breaking ties on `dentistId` so the result is deterministic and the test cannot flake.

- [ ] **Step 3: Make the copy true again**

`apps/web/src/features/booking/steps/dentist-step.tsx:64` becomes: "Pick anyone, or let the clinic give you whichever dentist has the lightest day."

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/public/public.service.ts apps/api/test/public-booking.spec.ts apps/web/src/features/booking/steps/dentist-step.tsx
git commit -m "feat(api): assign the least-booked dentist when the patient has no preference"
```

---

### Task 9: Reconcile the documents with the system

**Files:** `README.md`, `docs/superpowers/specs/dentalops-design.md`, `docs/superpowers/plans/w9-spec-reconciliation.md`

- [ ] **Step 1: README**

Remove the "audit log is designed but not built" bullet and the "no patients screen and no settings screen" bullet's audit clause. Add MongoDB to the stack table with its one-line rationale. Update the test counts from a real run, not from memory. Add Activity to any screen list. Keep every limitation that is still true: single timezone, no payments, cold starts, shifts not draggable between staff, Lighthouse measured not gated, and now — accurately — the Patients and Settings screens, which this week does not build.

- [ ] **Step 2: Design doc reconciliation note**

Append a short section titled "Reconciliation (W9)" recording what shipped differently and why, so the spec stops being read as a description of the system:

- The availability cache key is `availver:{tenant}:{date}` composed into the entry key, not `avail:{branch}:{service}:{date}` — versioned invalidation avoids a Redis `SCAN`.
- Admin CRUD stayed read-only: `GET /branches /services /staff /resources` shipped; POST/PATCH/DELETE and `/equipment-types` did not, because the Settings screen that would drive them was cut.
- The Patients and Settings screens remain unbuilt; the app says so in place of each.
- The screen inventory shipped 9 of the 11 listed.

- [ ] **Step 3: Every gate, forced, exit codes checked one at a time**

```bash
pnpm lint; echo "lint exit=$?"
pnpm turbo run typecheck --force; echo "typecheck exit=$?"
pnpm turbo run test --force; echo "test exit=$?"
pnpm turbo run build --force; echo "build exit=$?"
pnpm --filter @dentalops/web e2e; echo "e2e exit=$?"
```

Every line must print `exit=0`. Do not chain these with `&&` or pipe them into `grep` — both have hidden a red gate in this repo before.

- [ ] **Step 4: Push and watch CI**

```bash
git add README.md docs/
git commit -m "docs: reconcile the readme and the spec with what W9 shipped"
git push origin main
gh run watch
```

- [ ] **Step 5: Production**

Confirm `MONGODB_URL` is set on Render before the deploy completes, otherwise the audit log silently no-ops in production while the README claims it works. Verify by loading the Activity screen on the live demo and confirming entries appear after a booking.

---

## Exit criteria

1. A dentist logging into the demo sees only their own appointments and is refused, with `NOT_YOUR_APPOINTMENT`, when they try to complete somebody else's.
2. The demo timeline shows the ⟳ series badge without any setup, and the series edit dialog offers all three scopes.
3. A booking made in the demo appears in the Activity feed within a second, attributed to the actor who made it.
4. Stopping Mongo does not stop bookings.
5. The audit collection carries a 30-day TTL index.
6. A patient can move their own appointment from the emailed link.
7. The timeline switches between dentist and chair columns, and does not offer a drag it cannot honour.
8. Pulling the network shows the offline banner and disables Save.
9. Booking with no dentist preference returns the least-booked dentist, and the wizard's copy says so.
10. Every gate green, CI green, and no claim in the README that the system does not honour.
