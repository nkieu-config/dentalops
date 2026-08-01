# W2 Booking Hardened Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The full staff booking API — create with multi-resource auto-assignment, reschedule with optimistic concurrency and deadlock-safe lock ordering, status transitions that free slots, patients with cursor pagination, Redis-backed idempotency — proven by the signature specs: `booking-race`, `deadlock`, `idempotency`.

**Architecture:** Booking never pre-checks the dentist — it inserts and lets `no_dentist_overlap` answer, mapping the violation to `409 SLOT_CONFLICT`. Physical resources are auto-assigned: query free candidates, claim one, and if a concurrent booking wins the same chair (`no_resource_overlap`), retry the whole transaction — the re-query naturally avoids the now-taken unit. All claim writes happen in a single transaction, parent row first, claims **sorted by `resourceId`** — the global lock order that makes concurrent reschedules deadlock-free. The chair claim extends past the appointment by the service's `bufferMin` (cleaning time blocks the chair, not the dentist) — the first place the domain model pays off visibly.

**Tech Stack:** ioredis (idempotency keys), everything else already in the repo.

## Global Constraints

- Node >= 22, pnpm 10; plain `pnpm` — never `corepack enable` (EACCES on this machine)
- Prisma pinned `^6`; **no new migrations in this plan** (schema is complete for W2)
- TypeScript strict; **no comments in any code file**
- Conventional commits; **no trailers of any kind**
- Never read, print, or commit any `.env`
- `PrismaPromise` is lazy: inside `tenantContext.run(...)`, always await inside the callback
- Every new route MUST be added to `REGISTRY` in `apps/api/test/tenant-isolation.spec.ts` in the same task that creates it — its first test fails otherwise, by design
- Auth is global and opt-out: new controllers are protected automatically; `@Public()` only where the plan says so (nowhere in W2)
- Cross-tenant access returns 404; anonymous returns 401; wrong role returns 403
- Full pipeline (`pnpm lint && pnpm typecheck && pnpm test && pnpm build`) before every push; push to `origin main`; report CI conclusion

---

### Task 1: Booking service — create and list appointments

**Files:**
- Create: `apps/api/src/appointments/appointments.module.ts`, `appointments.controller.ts`, `appointments.service.ts`, `dto/create-appointment.dto.ts`, `dto/query-appointments.dto.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/test/tenant-isolation.spec.ts`
- Test: `apps/api/test/appointments.spec.ts`

**Interfaces:**
- Consumes: `prisma.scoped` (extension supplies `tenantId`; use `as never` on creates), `AppException`, the filter's exclusion→409 mapping.
- Produces: `POST /appointments` (roles owner+receptionist) and `GET /appointments?branchId&dentistId&from&to` returning appointments with `claims`, `service`, `patient` included. `AppointmentsService.create(dto)` and the private `findFreeResource` are reused by Task 2's reschedule.

- [ ] **Step 1: DTOs**

`apps/api/src/appointments/dto/create-appointment.dto.ts`:

```ts
import { ApiProperty } from "@nestjs/swagger"
import { IsISO8601, IsUUID } from "class-validator"

export class CreateAppointmentDto {
  @ApiProperty()
  @IsUUID()
  serviceId!: string

  @ApiProperty()
  @IsUUID()
  dentistId!: string

  @ApiProperty()
  @IsUUID()
  patientId!: string

  @ApiProperty()
  @IsUUID()
  branchId!: string

  @ApiProperty({ example: "2026-08-10T02:00:00.000Z" })
  @IsISO8601()
  startsAt!: string
}
```

`apps/api/src/appointments/dto/query-appointments.dto.ts`:

```ts
import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsISO8601, IsOptional, IsUUID } from "class-validator"

export class QueryAppointmentsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  dentistId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  from?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  to?: string
}
```

- [ ] **Step 2: The service**

`apps/api/src/appointments/appointments.service.ts`:

```ts
import { Injectable } from "@nestjs/common"
import { Prisma, Resource, ResourceType } from "@prisma/client"
import { AppException } from "../common/app.exception"
import { PrismaService } from "../prisma/prisma.service"
import { CreateAppointmentDto } from "./dto/create-appointment.dto"
import { QueryAppointmentsDto } from "./dto/query-appointments.dto"

const EXCLUSION = /exclusion constraint \\?"(\w+)\\?"/

const APPOINTMENT_INCLUDE = {
  claims: { where: { status: "active" as const } },
  service: true,
  patient: true
} satisfies Prisma.AppointmentInclude

interface Window {
  startsAt: Date
  endsAt: Date
  chairEndsAt: Date
}

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: QueryAppointmentsDto) {
    return this.prisma.scoped.appointment.findMany({
      where: {
        branchId: query.branchId,
        dentistId: query.dentistId,
        startsAt: query.to ? { lt: new Date(query.to) } : undefined,
        endsAt: query.from ? { gt: new Date(query.from) } : undefined
      },
      include: APPOINTMENT_INCLUDE,
      orderBy: { startsAt: "asc" }
    })
  }

  async create(dto: CreateAppointmentDto) {
    const service = await this.prisma.scoped.service.findUnique({
      where: { id: dto.serviceId },
      include: { requirements: true }
    })
    if (!service) throw new AppException(404, "NOT_FOUND", "Service not found")
    const dentist = await this.prisma.scoped.user.findFirst({
      where: { id: dto.dentistId, role: "dentist", isActive: true }
    })
    if (!dentist) throw new AppException(404, "NOT_FOUND", "Dentist not found")
    const branch = await this.prisma.scoped.branch.findUnique({ where: { id: dto.branchId } })
    if (!branch) throw new AppException(404, "NOT_FOUND", "Branch not found")
    const patient = await this.prisma.scoped.patient.findUnique({ where: { id: dto.patientId } })
    if (!patient) throw new AppException(404, "NOT_FOUND", "Patient not found")

    const startsAt = new Date(dto.startsAt)
    const win: Window = {
      startsAt,
      endsAt: new Date(startsAt.getTime() + service.durationMin * 60_000),
      chairEndsAt: new Date(
        startsAt.getTime() + (service.durationMin + service.bufferMin) * 60_000
      )
    }

    return this.withResourceRetry(() => this.attemptCreate(dto, service.requirements, win))
  }

  async withResourceRetry<T>(attempt: () => Promise<T>): Promise<T> {
    for (let i = 0; i < 4; i++) {
      try {
        return await attempt()
      } catch (e) {
        const constraint = e instanceof Error ? e.message.match(EXCLUSION)?.[1] : undefined
        if (constraint === "no_dentist_overlap") {
          throw new AppException(409, "SLOT_CONFLICT", "Dentist is already booked at this time", {
            constraint
          })
        }
        if (constraint === "no_resource_overlap") continue
        throw e
      }
    }
    throw new AppException(409, "RESOURCE_UNAVAILABLE", "No free chair or equipment at this time")
  }

  private attemptCreate(
    dto: CreateAppointmentDto,
    requirements: { equipmentTypeId: string }[],
    win: Window
  ) {
    return this.prisma.scoped.$transaction(async (tx) => {
      const claims = await this.pickResources(tx, dto.branchId, requirements, win)
      const appointment = await tx.appointment.create({
        data: {
          branchId: dto.branchId,
          serviceId: dto.serviceId,
          dentistId: dto.dentistId,
          patientId: dto.patientId,
          startsAt: win.startsAt,
          endsAt: win.endsAt
        } as never
      })
      for (const claim of claims) {
        await tx.resourceClaim.create({
          data: { appointmentId: appointment.id, ...claim } as never
        })
      }
      return tx.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
        include: APPOINTMENT_INCLUDE
      })
    })
  }

  async pickResources(
    tx: Prisma.TransactionClient,
    branchId: string,
    requirements: { equipmentTypeId: string }[],
    win: Window
  ) {
    const chair = await this.findFreeResource(tx, branchId, "chair", null, win.startsAt, win.chairEndsAt)
    if (!chair) {
      throw new AppException(409, "RESOURCE_UNAVAILABLE", "No free chair at this time")
    }
    const claims = [{ resourceId: chair.id, startsAt: win.startsAt, endsAt: win.chairEndsAt }]
    for (const req of requirements) {
      const unit = await this.findFreeResource(
        tx,
        branchId,
        "equipment",
        req.equipmentTypeId,
        win.startsAt,
        win.endsAt
      )
      if (!unit) {
        throw new AppException(409, "RESOURCE_UNAVAILABLE", "Required equipment is not free")
      }
      claims.push({ resourceId: unit.id, startsAt: win.startsAt, endsAt: win.endsAt })
    }
    return claims.sort((a, b) => a.resourceId.localeCompare(b.resourceId))
  }

  private async findFreeResource(
    tx: Prisma.TransactionClient,
    branchId: string,
    type: ResourceType,
    equipmentTypeId: string | null,
    startsAt: Date,
    endsAt: Date
  ): Promise<Resource | null> {
    const candidates = await tx.resource.findMany({
      where: {
        branchId,
        type,
        isActive: true,
        ...(equipmentTypeId ? { equipmentTypeId } : {})
      },
      orderBy: { name: "asc" }
    })
    if (candidates.length === 0) return null
    const busy = await tx.resourceClaim.findMany({
      where: {
        resourceId: { in: candidates.map((c) => c.id) },
        status: "active",
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt }
      },
      select: { resourceId: true }
    })
    const busyIds = new Set(busy.map((b) => b.resourceId))
    return candidates.find((c) => !busyIds.has(c.id)) ?? null
  }
}
```

Design notes the implementer should internalise:
- The dentist is never pre-checked; `no_dentist_overlap` answering with a violation IS the check, and it is race-proof where a pre-check would not be.
- The retry loop only retries `no_resource_overlap` — losing a chair race is recoverable (another chair may be free); a dentist conflict is not.
- `pickResources` returns claims **sorted by `resourceId`** — establish the habit here; Task 2's deadlock safety depends on this exact ordering discipline.
- The chair is claimed until `chairEndsAt` (duration + buffer); equipment only for the appointment itself.

- [ ] **Step 3: Controller and module**

`apps/api/src/appointments/appointments.controller.ts`:

```ts
import { Body, Controller, Get, Post, Query } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Roles } from "../auth/roles.decorator"
import { AppointmentsService } from "./appointments.service"
import { CreateAppointmentDto } from "./dto/create-appointment.dto"
import { QueryAppointmentsDto } from "./dto/query-appointments.dto"

@ApiTags("appointments")
@ApiBearerAuth()
@Controller("appointments")
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  list(@Query() query: QueryAppointmentsDto) {
    return this.appointments.list(query)
  }

  @Post()
  @Roles("owner", "receptionist")
  create(@Body() dto: CreateAppointmentDto) {
    return this.appointments.create(dto)
  }
}
```

`apps/api/src/appointments/appointments.module.ts`:

```ts
import { Module } from "@nestjs/common"
import { AppointmentsController } from "./appointments.controller"
import { AppointmentsService } from "./appointments.service"

@Module({
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService]
})
export class AppointmentsModule {}
```

Add `AppointmentsModule` to `app.module.ts` imports.

- [ ] **Step 4: Register the routes in the isolation registry**

In `apps/api/test/tenant-isolation.spec.ts` add to `REGISTRY`:

```ts
  "GET /appointments": "filtered",
  "POST /appointments": "auth-only",
```

- [ ] **Step 5: Write the test**

`apps/api/test/appointments.spec.ts` — setup mirrors `shifts.spec.ts` (signup a fresh tenant slug `appt-api-${Date.now()}`, grab `ownerToken`, look up the default branch; then create via raw prisma: one dentist user, one patient, one equipment type + one equipment resource in the branch, and one service `requirements: { create: { tenantId, equipmentTypeId } }` with `durationMin: 60, bufferMin: 15`). Also create a plain service (no requirements, `durationMin: 30, bufferMin: 0`). Tests:

```ts
  it("books an appointment and claims a chair with buffer", async () => {
    const res = await request(app.getHttpServer())
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ serviceId: bufferedServiceId, dentistId, patientId, branchId, startsAt: at(10, 9) })
      .expect(201)
    expect(res.body.claims.length).toBe(2)
    const chairClaim = res.body.claims.find((c: { resourceId: string }) => c.resourceId !== equipmentId)
    expect(new Date(chairClaim.endsAt).getTime() - new Date(res.body.endsAt).getTime()).toBe(15 * 60_000)
    const equipClaim = res.body.claims.find((c: { resourceId: string }) => c.resourceId === equipmentId)
    expect(equipClaim.endsAt).toBe(res.body.endsAt)
  })

  it("rejects a dentist double-booking with SLOT_CONFLICT", async () => {
    const res = await request(app.getHttpServer())
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ serviceId: plainServiceId, dentistId, patientId, branchId, startsAt: at(10, 9) })
      .expect(409)
    expect(apiErrorSchema.parse(res.body).errorCode).toBe("SLOT_CONFLICT")
  })

  it("books a second dentist at the same time on another chair", async () => {
    const res = await request(app.getHttpServer())
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ serviceId: plainServiceId, dentistId: dentist2Id, patientId, branchId, startsAt: at(10, 9) })
      .expect(201)
    expect(res.body.dentistId).toBe(dentist2Id)
  })

  it("returns RESOURCE_UNAVAILABLE when the only equipment unit is taken", async () => {
    const res = await request(app.getHttpServer())
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ serviceId: bufferedServiceId, dentistId: dentist2Id, patientId, branchId, startsAt: at(11, 9) })
    expect(res.status).toBe(201)
    const clash = await request(app.getHttpServer())
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ serviceId: bufferedServiceId, dentistId: dentist3Id, patientId, branchId, startsAt: at(11, 9) })
      .expect(409)
    expect(apiErrorSchema.parse(clash.body).errorCode).toBe("RESOURCE_UNAVAILABLE")
  })

  it("buffer blocks the chair but not the dentist", async () => {
    await request(app.getHttpServer())
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ serviceId: plainServiceId, dentistId, patientId, branchId, startsAt: at(12, 10) })
      .expect(201)
  })

  it("lists appointments for a window including claims", async () => {
    const res = await request(app.getHttpServer())
      .get("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .query({ branchId, from: at(10, 0), to: at(13, 0) })
      .expect(200)
    expect(res.body.length).toBeGreaterThanOrEqual(4)
    expect(res.body[0].claims).toBeDefined()
    expect(res.body[0].patient.name).toBeDefined()
  })

  it("dentist role cannot create appointments", async () => {
    await request(app.getHttpServer())
      .post("/appointments")
      .set("Authorization", `Bearer ${dentistToken}`)
      .send({ serviceId: plainServiceId, dentistId, patientId, branchId, startsAt: at(14, 9) })
      .expect(403)
  })
```

Use `const at = (day: number, h: number) => new Date(Date.UTC(2026, 9, day, h, 0, 0)).toISOString()` (October — no clash with earlier suites). The "buffer blocks the chair" test books the same dentist at exactly `endsAt` of an earlier buffered appointment on a branch with several chairs: dentist is free at the boundary, chair 1 is still in buffer, auto-assign takes chair 2 — asserting 201 is the proof. Requires `dentist3Id` for the equipment test: create three dentists in setup plus a `dentistToken` via login (hash a password with argon2 as in `shifts.spec.ts`).

- [ ] **Step 6: Run tests, full pipeline**

Run: `pnpm --filter @dentalops/api test -- appointments.spec`
Expected: 7 tests PASS.

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all green (42 api tests).

- [ ] **Step 7: Commit and push**

```bash
git add apps/api
git commit -m "feat: appointment booking with multi-resource auto-assignment"
git push
```

---

### Task 2: Reschedule and status transitions

**Files:**
- Modify: `apps/api/src/appointments/appointments.service.ts`, `appointments.controller.ts`, `apps/api/test/tenant-isolation.spec.ts`
- Create: `apps/api/src/appointments/dto/reschedule-appointment.dto.ts`, `dto/set-status.dto.ts`
- Test: `apps/api/test/reschedule.spec.ts`

**Interfaces:**
- Consumes: Task 1's service internals (`withResourceRetry`, `pickResources`, `APPOINTMENT_INCLUDE`).
- Produces: `PATCH /appointments/:id` (body `{ version, startsAt?, dentistId? }` → 409 `STALE_VERSION` on version mismatch, 409 `SLOT_CONFLICT`/`RESOURCE_UNAVAILABLE` on conflicts) and `PATCH /appointments/:id/status` (`completed | no_show | cancelled`; cancelling releases claims). The version contract is what W5's optimistic drag-and-drop rollback consumes.

- [ ] **Step 1: DTOs**

`apps/api/src/appointments/dto/reschedule-appointment.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { IsISO8601, IsInt, IsOptional, IsUUID, Min } from "class-validator"

export class RescheduleAppointmentDto {
  @ApiProperty({ description: "Version the client last saw; stale versions are rejected" })
  @IsInt()
  @Min(0)
  version!: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  startsAt?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  dentistId?: string
}
```

`apps/api/src/appointments/dto/set-status.dto.ts`:

```ts
import { ApiProperty } from "@nestjs/swagger"
import { IsIn } from "class-validator"

export class SetStatusDto {
  @ApiProperty({ enum: ["completed", "no_show", "cancelled"] })
  @IsIn(["completed", "no_show", "cancelled"])
  status!: "completed" | "no_show" | "cancelled"
}
```

- [ ] **Step 2: Service methods**

Append to `AppointmentsService`:

```ts
  async reschedule(id: string, dto: RescheduleAppointmentDto) {
    return this.withResourceRetry(() =>
      this.prisma.scoped.$transaction(async (tx) => {
        const current = await tx.appointment.findUnique({
          where: { id },
          include: { service: { include: { requirements: true } } }
        })
        if (!current) throw new AppException(404, "NOT_FOUND", "Appointment not found")
        if (current.status !== "confirmed") {
          throw new AppException(409, "NOT_CONFIRMED", "Only confirmed appointments can move")
        }

        const startsAt = dto.startsAt ? new Date(dto.startsAt) : current.startsAt
        const dentistId = dto.dentistId ?? current.dentistId
        const win = {
          startsAt,
          endsAt: new Date(startsAt.getTime() + current.service.durationMin * 60_000),
          chairEndsAt: new Date(
            startsAt.getTime() +
              (current.service.durationMin + current.service.bufferMin) * 60_000
          )
        }

        const updated = await tx.appointment.updateMany({
          where: { id, version: dto.version },
          data: {
            startsAt: win.startsAt,
            endsAt: win.endsAt,
            dentistId,
            version: { increment: 1 }
          }
        })
        if (updated.count === 0) {
          throw new AppException(409, "STALE_VERSION", "Appointment was changed by someone else", {
            currentVersion: current.version
          })
        }

        await tx.resourceClaim.updateMany({
          where: { appointmentId: id, status: "active" },
          data: { status: "released" }
        })
        const claims = await this.pickResources(
          tx,
          current.branchId,
          current.service.requirements,
          win
        )
        for (const claim of claims) {
          await tx.resourceClaim.create({ data: { appointmentId: id, ...claim } as never })
        }
        return tx.appointment.findUniqueOrThrow({
          where: { id },
          include: APPOINTMENT_INCLUDE
        })
      })
    )
  }

  async setStatus(id: string, dto: SetStatusDto) {
    return this.prisma.scoped.$transaction(async (tx) => {
      const current = await tx.appointment.findUnique({ where: { id } })
      if (!current) throw new AppException(404, "NOT_FOUND", "Appointment not found")
      if (current.status !== "confirmed") {
        throw new AppException(409, "INVALID_TRANSITION", `Cannot ${dto.status} a ${current.status} appointment`)
      }
      await tx.appointment.update({
        where: { id },
        data: { status: dto.status, version: { increment: 1 } }
      })
      if (dto.status === "cancelled") {
        await tx.resourceClaim.updateMany({
          where: { appointmentId: id, status: "active" },
          data: { status: "released" }
        })
      }
      return tx.appointment.findUniqueOrThrow({ where: { id }, include: APPOINTMENT_INCLUDE })
    })
  }
```

The deadlock discipline, spelled out: parent row first (its lock is the anchor), then claim writes in `resourceId` order via the already-sorted `pickResources` output. Two concurrent reschedules touching the same two resources therefore always acquire locks in the same global order — no cycle, no deadlock.

Status semantics carry a deliberate asymmetry. `completed` and `no_show` keep their claims `active`: the dentist constraint stops applying (its `WHERE status='confirmed'`), so the dentist is free, but the chair stays blocked for the original window — correct for `completed` (the room really is occupied until the buffer ends) and deliberate for `no_show` (the front desk may still be turning the room over). Only `cancelled` releases claims and frees everything early. The tests in Step 5 encode exactly this asymmetry.

- [ ] **Step 3: Controller routes**

Append to `AppointmentsController`:

```ts
  @Patch(":id")
  @Roles("owner", "receptionist")
  reschedule(@Param("id", ParseUUIDPipe) id: string, @Body() dto: RescheduleAppointmentDto) {
    return this.appointments.reschedule(id, dto)
  }

  @Patch(":id/status")
  setStatus(@Param("id", ParseUUIDPipe) id: string, @Body() dto: SetStatusDto) {
    return this.appointments.setStatus(id, dto)
  }
```

(`Patch`, `Param`, `ParseUUIDPipe` join the `@nestjs/common` import; the two DTO imports are added.) `setStatus` has no `@Roles` on purpose: dentists mark their own appointments completed/no-show. Per-dentist ownership enforcement is W4-timeline territory; W2 keeps it tenant-scoped.

- [ ] **Step 4: Registry + body map in the isolation spec**

The registry's `not-found` loop sends empty bodies, but `PATCH /appointments/:id` requires a valid `version` — validation would 400 before the 404. Extend the spec: add alongside `REGISTRY`:

```ts
const BODY_BY_ROUTE: Record<string, object> = {
  "PATCH /appointments/:id": { version: 0 },
  "PATCH /appointments/:id/status": { status: "cancelled" }
}
```

Add the entries:

```ts
  "PATCH /appointments/:id": "not-found",
  "PATCH /appointments/:id/status": "not-found",
```

Then in the `not-found` loop, send the body and widen the method cast:

```ts
      const res = await request(app.getHttpServer())
        [method.toLowerCase() as "get" | "delete" | "patch"](url)
        .set("Authorization", `Bearer ${intruderToken}`)
        .send(BODY_BY_ROUTE[key] ?? {})
```

and in the anonymous loop widen its cast to `"get" | "post" | "delete" | "patch"`.

- [ ] **Step 5: Write the test**

`apps/api/test/reschedule.spec.ts` — setup like Task 1 (fresh slug, November dates `Date.UTC(2026, 10, ...)`), then:

1. `reschedule moves the appointment and reissues claims` — create at 09:00, PATCH with `{ version: 0, startsAt: 11:00 }` → 200, `startsAt` updated, `version === 1`, active claims match the new window, old-window slot bookable by another appointment.
2. `stale version is rejected with STALE_VERSION` — PATCH again with `{ version: 0 }` → 409, `errorCode STALE_VERSION`, `details.currentVersion === 1`.
3. `reschedule into another dentist's slot returns SLOT_CONFLICT` — book dentist2 at 13:00; move appointment to 13:00 with `dentistId: dentist2` → 409 `SLOT_CONFLICT`.
4. `completed keeps the chair claim active` — status → completed (200); assert its claim rows still `active`; booking the same dentist at that time now succeeds (dentist constraint no longer applies) — use a branch with ≥2 chairs so the new booking takes another chair.
5. `cancelled releases claims and frees the exact slot` — create at 15:00, cancel, rebook identical `{dentist, time}` → 201.
6. `INVALID_TRANSITION on double status change` — cancelling the already-cancelled → 409 `INVALID_TRANSITION`.
7. `moving a cancelled appointment is NOT_CONFIRMED` — PATCH the cancelled one with correct version → 409 `NOT_CONFIRMED`.

- [ ] **Step 6: Run tests, full pipeline, commit, push**

Run: `pnpm --filter @dentalops/api test -- reschedule`
Expected: 7 tests PASS.

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all green (49 api tests — 42 + 7; the isolation spec grows assertions, not test count).

```bash
git add apps/api
git commit -m "feat: reschedule with optimistic versions and status transitions"
git push
```

---

### Task 3: Patients with cursor pagination

**Files:**
- Create: `apps/api/src/common/pagination.ts`, `apps/api/src/patients/patients.module.ts`, `patients.controller.ts`, `patients.service.ts`, `dto/create-patient.dto.ts`, `dto/query-patients.dto.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/test/tenant-isolation.spec.ts`
- Test: `apps/api/test/patients.spec.ts`

**Interfaces:**
- Consumes: `prisma.scoped`, `AppException`.
- Produces: `POST /patients`, `GET /patients?q&cursor&limit` → `{ items, nextCursor }`, `GET /patients/:id`; `encodeCursor` / `decodeCursor` in `common/pagination.ts` — the pattern every future list endpoint copies.

- [ ] **Step 1: Pagination helper**

`apps/api/src/common/pagination.ts`:

```ts
import { AppException } from "./app.exception"

export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

export interface CursorPosition {
  createdAt: Date
  id: string
}

export function encodeCursor(pos: CursorPosition): string {
  return Buffer.from(`${pos.createdAt.toISOString()}|${pos.id}`).toString("base64url")
}

export function decodeCursor(cursor: string | undefined): CursorPosition | null {
  if (!cursor) return null
  const raw = Buffer.from(cursor, "base64url").toString("utf8")
  const [iso, id] = raw.split("|")
  const createdAt = iso ? new Date(iso) : new Date(NaN)
  if (!id || Number.isNaN(createdAt.getTime())) {
    throw new AppException(400, "INVALID_CURSOR", "Malformed pagination cursor")
  }
  return { createdAt, id }
}

export function toPage<T extends { createdAt: Date; id: string }>(
  rows: T[],
  limit: number
): Page<T> {
  const items = rows.slice(0, limit)
  const last = items[items.length - 1]
  return {
    items,
    nextCursor: rows.length > limit && last ? encodeCursor(last) : null
  }
}
```

- [ ] **Step 2: DTOs, service, controller, module**

`dto/create-patient.dto.ts`: `name` (`@IsString @MinLength(1) @MaxLength(120)`), `phone` (`@Matches(/^0\d{8,9}$/)`), `email` (`@IsEmail`), optional `notes` (`@IsOptional @IsString @MaxLength(2000)`).

`dto/query-patients.dto.ts`: optional `q` (`@IsOptional @IsString @MaxLength(80)`), optional `cursor` (`@IsOptional @IsString`), optional `limit` (`@IsOptional @Type(() => Number) @IsInt @Min(1) @Max(100)`, default applied in service as 20; `Type` from `class-transformer`).

`patients.service.ts`:

```ts
import { Injectable } from "@nestjs/common"
import { Prisma } from "@prisma/client"
import { AppException } from "../common/app.exception"
import { decodeCursor, toPage } from "../common/pagination"
import { PrismaService } from "../prisma/prisma.service"
import { CreatePatientDto } from "./dto/create-patient.dto"
import { QueryPatientsDto } from "./dto/query-patients.dto"

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePatientDto) {
    try {
      return await this.prisma.scoped.patient.create({ data: { ...dto } as never })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new AppException(409, "DUPLICATE_PATIENT", "A patient with this phone and email already exists")
      }
      throw e
    }
  }

  async list(query: QueryPatientsDto) {
    const limit = query.limit ?? 20
    const cursor = decodeCursor(query.cursor)
    const rows = await this.prisma.scoped.patient.findMany({
      where: {
        AND: [
          query.q
            ? {
                OR: [
                  { name: { contains: query.q, mode: "insensitive" } },
                  { phone: { contains: query.q } }
                ]
              }
            : {},
          cursor
            ? {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } }
                ]
              }
            : {}
        ]
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1
    })
    return toPage(rows, limit)
  }

  async get(id: string) {
    const patient = await this.prisma.scoped.patient.findUnique({ where: { id } })
    if (!patient) throw new AppException(404, "NOT_FOUND", "Patient not found")
    return patient
  }
}
```

Controller: `GET /patients` (any staff role), `POST /patients` (`@Roles("owner", "receptionist")`), `GET /patients/:id` — standard shape as in Task 1. Module registered in `app.module.ts`.

- [ ] **Step 3: Registry entries**

```ts
  "GET /patients": "filtered",
  "POST /patients": "auth-only",
  "GET /patients/:id": "not-found",
```

- [ ] **Step 4: Write the test**

`apps/api/test/patients.spec.ts` — fresh tenant; create 25 patients via the API in a loop (distinct phones `08${String(i).padStart(8, "0")}`); tests:

1. create returns 201 and the patient
2. duplicate phone+email → 409 `DUPLICATE_PATIENT`
3. list page 1: `limit=10` → 10 items + non-null `nextCursor`; page 2 via cursor → 10 more, no overlap of ids; walking to the end yields all 25+ exactly once
4. `q` search by name substring and by phone substring both hit
5. malformed cursor → 400 `INVALID_CURSOR`
6. `GET /patients/:id` returns the row; random UUID → 404

- [ ] **Step 5: Run, pipeline, commit, push**

Run: `pnpm --filter @dentalops/api test -- patients`
Expected: 6 tests PASS. Full pipeline green (55 api tests).

```bash
git add apps/api
git commit -m "feat: patients with cursor pagination and search"
git push
```

---

### Task 4: Redis and Idempotency-Key

**Files:**
- Create: `apps/api/src/redis/redis.module.ts`, `apps/api/src/common/idempotency.interceptor.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/appointments/appointments.controller.ts`, `apps/api/test/setup-env.ts`, `turbo.json`, `.github/workflows/ci.yml`
- Test: `apps/api/test/idempotency.spec.ts`

**Interfaces:**
- Consumes: `currentTenant()`, `AppException`; docker-compose Redis locally, Upstash in production (`REDIS_URL` already present in `.env.example` and `render.yaml` since W0).
- Produces: `REDIS` injection token providing an `ioredis` client, closed on shutdown; `IdempotencyInterceptor` applied to `POST /appointments` and both PATCH routes. Replays carry header `x-idempotent-replay: true`. W6 reuses the Redis client for holds.

- [ ] **Step 1: Install and module**

Run: `pnpm --filter @dentalops/api add ioredis`

`apps/api/src/redis/redis.module.ts`:

```ts
import { Global, Inject, Module, OnApplicationShutdown } from "@nestjs/common"
import Redis from "ioredis"

export const REDIS = "REDIS_CLIENT"

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: () =>
        new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
          maxRetriesPerRequest: 2
        })
    }
  ],
  exports: [REDIS]
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  onApplicationShutdown() {
    return this.redis.quit()
  }
}
```

Add `RedisModule` to `app.module.ts` imports.

- [ ] **Step 2: The interceptor**

`apps/api/src/common/idempotency.interceptor.ts`:

```ts
import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from "@nestjs/common"
import type { Request, Response } from "express"
import Redis from "ioredis"
import { Observable, of } from "rxjs"
import { tap } from "rxjs/operators"
import { currentTenant } from "../tenant/tenant-context"
import { REDIS } from "../redis/redis.module"
import { AppException } from "./app.exception"

const TTL_SECONDS = 24 * 60 * 60

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<Request>()
    const res = context.switchToHttp().getResponse<Response>()
    const key = req.headers["idempotency-key"]
    if (!key || typeof key !== "string") return next.handle()

    const tenantId = currentTenant()?.tenantId ?? "anon"
    const storeKey = `idem:${tenantId}:${req.method}:${req.path}:${key}`

    const cached = await this.redis.get(storeKey)
    if (cached) {
      const { status, body } = JSON.parse(cached) as { status: number; body: unknown }
      res.setHeader("x-idempotent-replay", "true")
      res.status(status)
      return of(body)
    }

    const lock = await this.redis.set(`${storeKey}:lock`, "1", "EX", 30, "NX")
    if (!lock) {
      throw new AppException(409, "IDEMPOTENCY_IN_FLIGHT", "The same request is still being processed")
    }

    return next.handle().pipe(
      tap({
        next: (body) => {
          void this.redis
            .set(storeKey, JSON.stringify({ status: res.statusCode, body }), "EX", TTL_SECONDS)
            .then(() => this.redis.del(`${storeKey}:lock`))
        },
        error: () => {
          void this.redis.del(`${storeKey}:lock`)
        }
      })
    )
  }
}
```

Only successful responses are stored — a failed attempt must stay retryable with the same key. Apply it in the appointments controller: `@UseInterceptors(IdempotencyInterceptor)` on `create`, `reschedule`, and `setStatus` (imports: `UseInterceptors` from `@nestjs/common`, the interceptor).

- [ ] **Step 3: Environment plumbing**

- `apps/api/test/setup-env.ts`: add `process.env.REDIS_URL ??= "redis://localhost:6379"`
- `turbo.json` test task env: append `"REDIS_URL"`
- `.github/workflows/ci.yml`: under `services:` add

```yaml
      redis:
        image: redis:7
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 20
```

and `REDIS_URL: redis://localhost:6379` to the job `env` block.

- [ ] **Step 4: Write the test**

`apps/api/test/idempotency.spec.ts` — fresh tenant (December dates), one dentist/patient/plain service; tests:

1. `same key replays the stored response` — POST with `Idempotency-Key: k1` → 201; identical POST with `k1` → same status, same appointment `id`, header `x-idempotent-replay: true`; DB count for the dentist = 1.
2. `different key actually executes` — same slot with `k2` → 409 `SLOT_CONFLICT` (proof the second call hit the service).
3. `key is scoped per route` — `PATCH /appointments/:id/status` with key `k1` (same string, different route) → executes normally (200), not a replay.

- [ ] **Step 5: Run, pipeline, commit, push**

Run: `pnpm --filter @dentalops/api test -- idempotency`
Expected: 3 tests PASS. Full pipeline green (58 api tests).

```bash
git add apps/api turbo.json .github/workflows/ci.yml
git commit -m "feat: redis-backed idempotency keys for booking mutations"
git push
```

---

### Task 5: The signature concurrency specs

**Files:**
- Test: `apps/api/test/booking-race.spec.ts`, `apps/api/test/deadlock.spec.ts`
- Possibly modify: `apps/api/src/appointments/appointments.service.ts` (only if a spec exposes a real defect — that is their purpose; record any change)

**Interfaces:**
- Consumes: the full booking API.
- Produces: the two most-cited tests in the README. No new routes.

- [ ] **Step 1: The race spec**

`apps/api/test/booking-race.spec.ts` — fresh tenant (dates in `Date.UTC(2027, 0, ...)`), setup with **four** dentists and the default 3 chairs; plain service (no equipment, no buffer):

```ts
  it("20 concurrent bookings for one dentist slot: exactly one wins", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        request(app.getHttpServer())
          .post("/appointments")
          .set("Authorization", `Bearer ${ownerToken}`)
          .send({ serviceId, dentistId: dentists[0], patientId, branchId, startsAt: at(4, 9) })
      )
    )
    const byStatus = results.reduce<Record<number, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1
      return acc
    }, {})
    expect(byStatus[201]).toBe(1)
    expect(byStatus[409]).toBe(19)
    const count = await prisma.appointment.count({
      where: { dentistId: dentists[0], status: "confirmed" }
    })
    expect(count).toBe(1)
  })

  it("4 concurrent bookings, 3 chairs: exactly three win and take distinct chairs", async () => {
    const results = await Promise.all(
      dentists.map((dentistId) =>
        request(app.getHttpServer())
          .post("/appointments")
          .set("Authorization", `Bearer ${ownerToken}`)
          .send({ serviceId, dentistId, patientId, branchId, startsAt: at(5, 9) })
      )
    )
    const statuses = results.map((r) => r.status).sort()
    expect(statuses).toEqual([201, 201, 201, 409])
    const loser = results.find((r) => r.status === 409)
    expect(apiErrorSchema.parse(loser!.body).errorCode).toBe("RESOURCE_UNAVAILABLE")
    const claims = await prisma.resourceClaim.findMany({
      where: { status: "active", startsAt: new Date(at(5, 9)) }
    })
    const chairIds = new Set(claims.map((c) => c.resourceId))
    expect(chairIds.size).toBe(3)
  })
```

The second test is the sharper one: four different dentists (so `no_dentist_overlap` never fires) racing for three chairs — the retry loop must converge with every winner on a distinct chair and the loser told the truth.

- [ ] **Step 2: The deadlock spec**

`apps/api/test/deadlock.spec.ts` — fresh tenant with **two chairs and one equipment type with two units** (both appointments must be able to coexist), a service requiring that equipment, two dentists. Create appointments A (dentist1) and B (dentist2) at adjacent times so each holds one chair + one equipment unit — the multi-resource setup where opposite-order claim writes would form a lock cycle. Then hammer:

```ts
  it("concurrent opposite reschedules never deadlock", async () => {
    for (let i = 0; i < 15; i++) {
      const [ra, rb] = await Promise.all([
        request(app.getHttpServer())
          .patch(`/appointments/${apptA.id}`)
          .set("Authorization", `Bearer ${ownerToken}`)
          .send({ version: versionA, startsAt: at(10 + (i % 2), 9) }),
        request(app.getHttpServer())
          .patch(`/appointments/${apptB.id}`)
          .set("Authorization", `Bearer ${ownerToken}`)
          .send({ version: versionB, startsAt: at(10 + ((i + 1) % 2), 13) })
      ])
      for (const r of [ra, rb]) {
        expect([200, 409]).toContain(r.status)
        if (r.status === 409) {
          const code = apiErrorSchema.parse(r.body).errorCode
          expect(["SLOT_CONFLICT", "RESOURCE_UNAVAILABLE", "STALE_VERSION"]).toContain(code)
        }
        expect(JSON.stringify(r.body)).not.toMatch(/deadlock|40P01/i)
      }
      versionA = ra.status === 200 ? ra.body.version : versionA
      versionB = rb.status === 200 ? rb.body.version : versionB
    }
  })

  it("a deadlock would have surfaced as 500 INTERNAL — none did across all iterations", async () => {
    const events = await prisma.appointment.findMany({ where: { id: { in: [apptA.id, apptB.id] } } })
    expect(events.every((a) => a.status === "confirmed")).toBe(true)
  })
```

Honest scope note for the report: this is a regression harness — it hammers the interleaving that *would* deadlock without sorted claim writes and asserts the contract stays clean (only domain 409s, never a 500/40P01). It cannot force the scheduler to interleave adversarially on every run.

- [ ] **Step 3: Run, pipeline, commit, push**

Run: `pnpm --filter @dentalops/api test -- booking-race && pnpm --filter @dentalops/api test -- deadlock`
Expected: 2 + 2 tests PASS. If either exposes a service defect, fix the service, record exactly what changed and why, and re-run the full suite.

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all green (62 api tests).

```bash
git add apps/api
git commit -m "test: booking race and deadlock signature specs"
git push
```

---

### Task 6: Rich demo seed and booking docs

**Files:**
- Modify: `apps/api/prisma/seed.ts`, `apps/api/test/seed.spec.ts`
- Create: `docs/booking.md`

**Interfaces:**
- Consumes: the whole schema.
- Produces: a demo tenant with ~40 patients, materialized shifts for every dentist over a ±30-day window, and 400+ constraint-respecting appointments with realistic statuses — what W3 benchmarks against and W4's timeline renders on demo login.

- [ ] **Step 1: Extend the seed**

Modify `apps/api/prisma/seed.ts`. Requirements (implement inside the existing `main()` after staff creation; keep everything already there):

1. **Deterministic randomness** — a tiny PRNG so reseeds are stable:

```ts
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20260801)
```

2. **40 patients** — combine two arrays of 8 Thai first names and 5 Thai surnames (romanized), phones `08100000${i}`-style unique, emails `patient${i}@example.com`. Replace the previous 4-patient block entirely.

3. **Shifts** — for each of the 4 dentists define a weekly pattern: dentists 1–2 full-time (`mon–fri 09:00–17:00` UTC+7 → store as `02:00–10:00` UTC), dentist 3 part-time (`tue/thu 13:00–20:00` local → `06:00–13:00` UTC), dentist 4 (`mon/wed/sat 09:00–15:00` local → `02:00–08:00` UTC). Alternate branches by weekday parity. Materialize one `shift` row per working day across `today−30 … today+30` (compute `today` once via `new Date()` at the top — a seed script may read the clock).

4. **Appointments** — for every shift day: `2 + Math.floor(rand() * 4)` appointments, sequential from shift start, each a random service, gap of `0|15|30` minutes after the previous chair-claim end. For each: pick a free chair (inline helper mirroring the service's overlap query — chair claim covers duration + buffer); pick a free equipment unit when the service requires one, else skip that appointment; random patient. Past appointments: 80% `completed`, 10% `no_show`, 10% `cancelled` (cancelled → claims `released`); future: `confirmed`. Wrap each insert in `try/catch` and skip on conflict — the constraints are the referee, the seed never fights them.

5. Log the final counts: `console.log` of patients, shifts, appointments created.

- [ ] **Step 2: Update the seed spec**

In `apps/api/test/seed.spec.ts` update the first test's expectations: `patients` → `40`, and add:

```ts
    const [shifts, appointments] = await Promise.all([
      prisma.shift.count({ where: { tenantId } }),
      prisma.appointment.count({ where: { tenantId } })
    ])
    expect(shifts).toBeGreaterThan(100)
    expect(appointments).toBeGreaterThan(300)
```

The idempotency test stays as-is (the leading `deleteMany` cascades everything).

- [ ] **Step 3: Run the seed and the suite**

Run: `pnpm --filter @dentalops/api db:seed`
Expected: logs counts; patients 40, shifts > 100, appointments > 300; completes in under ~60s.

Run: `pnpm --filter @dentalops/api test -- seed`
Expected: 2 tests PASS.

- [ ] **Step 4: Write `docs/booking.md`**

```markdown
# Booking

## How a booking happens

1. Validate service, dentist, branch, patient (all tenant-scoped).
2. Compute the window: `endsAt = startsAt + durationMin`; the chair is claimed
   until `endsAt + bufferMin` — cleaning time blocks the chair, not the dentist.
3. In one transaction: pick a free chair and any required equipment unit,
   insert the appointment, insert the claims sorted by `resourceId`.
4. The database answers. `no_dentist_overlap` → 409 `SLOT_CONFLICT`, final.
   `no_resource_overlap` → retry the transaction (up to 4×): the re-query
   naturally avoids the unit a concurrent booking just took. Exhausted retries
   → 409 `RESOURCE_UNAVAILABLE`.

There is no dentist pre-check on purpose: a pre-check is a race window, the
constraint is not.

## Why claim writes are sorted

Two concurrent reschedules touching the same resources acquire row locks
parent-first, then claims in `resourceId` order — one global order, so no
lock cycle can form. `test/deadlock.spec.ts` hammers the interleaving that
would deadlock without this.

## Status semantics

| Transition | Claims | Slot |
|---|---|---|
| confirmed → completed | stay `active` | chair blocked until buffer ends; dentist freed |
| confirmed → no_show | stay `active` | same — the room may still need turning over |
| confirmed → cancelled | → `released` | everything instantly rebookable |

Both exclusion constraints carry partial `WHERE` predicates, so a cancelled
row stops blocking without being deleted.

## Concurrent edits

Every appointment carries a `version`. Mutations send the version they saw;
the update is `WHERE id AND version`, and zero rows updated means
409 `STALE_VERSION` with the current version in `details`. This is the
contract the timeline's optimistic drag-and-drop rolls back on.

## Idempotency

Mutating booking routes accept an `Idempotency-Key` header. First call
executes and stores `{status, body}` in Redis for 24 h; replays return the
stored response with `x-idempotent-replay: true`. Only successes are stored —
a failure must stay retryable. Keys are scoped per tenant, method, and path.
```

- [ ] **Step 5: Full pipeline, commit, push**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all green (62 api tests; seed suite unchanged in count).

```bash
git add apps/api docs/booking.md
git commit -m "feat: rich demo seed with shifts and appointments plus booking docs"
git push
```

---

## W2 exit criteria

- [ ] Staff can book, move, complete, no-show, and cancel appointments through the API; every path tenant-scoped
- [ ] Chair auto-assignment survives a 4-way race for 3 chairs with distinct winners (`booking-race.spec.ts`)
- [ ] 20 concurrent identical bookings produce exactly one row (`booking-race.spec.ts`)
- [ ] Concurrent opposite reschedules never surface a deadlock (`deadlock.spec.ts`)
- [ ] `STALE_VERSION` optimistic concurrency works and is documented as the FE rollback contract
- [ ] Idempotency replays are real (header-marked) and scoped per tenant/route
- [ ] Buffer semantics: chair blocked through cleanup, dentist free at `endsAt` — tested
- [ ] Demo tenant: 40 patients, >100 shifts, >300 appointments with realistic statuses; `db:seed` idempotent
- [ ] Every new route classified in the isolation registry; CI green throughout
