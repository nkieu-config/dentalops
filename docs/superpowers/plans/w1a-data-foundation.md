# W1a Data Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The complete PostgreSQL schema with double-booking made structurally impossible — three `EXCLUDE USING GIST` constraints proven by tests that run against a real database in CI.

**Architecture:** Prisma owns the ordinary schema and migrations. Time ranges are *not* stored by the application: each scheduling table keeps plain `starts_at` / `ends_at` columns that Prisma reads and writes normally, plus a **database-generated `during tstzrange` column** derived from them. The exclusion constraints sit on that generated column, so the guarantee holds no matter what code path performs the write — including raw SQL and manual `psql` edits.

**Tech Stack:** Prisma 6, PostgreSQL 16 (`btree_gist`), Jest + Supertest, GitHub Actions service containers.

## Global Constraints

- Node >= 22, pnpm 10; plain `pnpm` works — never run `corepack enable` (fails with EACCES on this machine)
- TypeScript `strict: true`; typecheck must pass with zero errors
- **No comments in any code file** (project rule) — SQL migration files are exempt where a comment explains a non-obvious constraint
- Conventional commit messages; **no trailers of any kind** (no `Co-Authored-By`)
- Never read, print, or commit `.env` contents
- Every table carries `tenant_id`; every timestamp column is `timestamptz`; the application always stores UTC
- Local database comes from `docker compose up -d` (postgres 16 on 5432, user/pass/db all `dentalops`)
- Integration tests run against a real Postgres — never mock the database layer
- Push to `origin main` after each task

---

### Task 1: Prisma setup, first migration, and CI database

**Files:**
- Create: `apps/api/prisma/schema.prisma`, `apps/api/.env`, `apps/api/src/prisma/prisma.service.ts`, `apps/api/src/prisma/prisma.module.ts`
- Modify: `apps/api/package.json`, `apps/api/src/app.module.ts`, `.github/workflows/ci.yml`, `.env.example`

**Interfaces:**
- Produces: `PrismaService` (extends `PrismaClient`, implements `OnModuleInit`) exported from `PrismaModule`; models `Tenant` and `User`. Every later task adds models to the same `schema.prisma` and injects `PrismaService`.

- [ ] **Step 1: Install Prisma and initialise**

Run:

```bash
pnpm --filter @dentalops/api add @prisma/client@^6
pnpm --filter @dentalops/api add -D prisma@^6
```

The major version is pinned deliberately. Prisma 7 rejects `url` and `directUrl` inside the `datasource` block — they move to a separate `prisma.config.ts` — so every schema snippet in this plan assumes Prisma 6. Keep the pin for the remaining tasks.

- [ ] **Step 2: Create the schema with the first two models**

`apps/api/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

enum UserRole {
  owner
  receptionist
  dentist
}

model Tenant {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  slug      String   @unique
  name      String
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  users User[]

  @@map("tenants")
}

model User {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String   @map("tenant_id") @db.Uuid
  email        String
  passwordHash String   @map("password_hash")
  name         String
  role         UserRole
  isActive     Boolean  @default(true) @map("is_active")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, email])
  @@index([tenantId])
  @@map("users")
}
```

`gen_random_uuid()` is a database default rather than Prisma's client-side `uuid()` on purpose — later tasks insert rows with raw SQL, and those inserts must not have to supply an id.

- [ ] **Step 3: Point Prisma at the local database**

Prisma reads `.env` from its own project directory, so create `apps/api/.env` (already covered by the root `.gitignore` rule for `.env`):

```
DATABASE_URL=postgresql://dentalops:dentalops@localhost:5432/dentalops
DIRECT_URL=postgresql://dentalops:dentalops@localhost:5432/dentalops
```

Add to the root `.env.example` below the existing `DATABASE_URL` line:

```
DIRECT_URL=postgresql://dentalops:dentalops@localhost:5432/dentalops
```

- [ ] **Step 4: Add scripts to the api package**

Add to the `"scripts"` block of `apps/api/package.json`:

```json
"db:migrate": "prisma migrate dev",
"db:deploy": "prisma migrate deploy",
"db:generate": "prisma generate",
"db:reset": "prisma migrate reset --force"
```

- [ ] **Step 5: Run the first migration**

Run: `docker compose up -d && pnpm --filter @dentalops/api exec prisma migrate dev --name init`

Expected: creates `apps/api/prisma/migrations/<timestamp>_init/migration.sql`, applies it, and prints `Your database is now in sync with your schema.`

Verify: `docker compose exec postgres psql -U dentalops -c "\dt"`
Expected: tables `tenants`, `users`, `_prisma_migrations`.

- [ ] **Step 6: Create PrismaService and its module**

`apps/api/src/prisma/prisma.service.ts`:

```ts
import { Injectable, OnModuleInit } from "@nestjs/common"
import { PrismaClient } from "@prisma/client"

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect()
  }
}
```

`apps/api/src/prisma/prisma.module.ts`:

```ts
import { Global, Module } from "@nestjs/common"
import { PrismaService } from "./prisma.service"

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService]
})
export class PrismaModule {}
```

Modify `apps/api/src/app.module.ts` to import it:

```ts
import { Module } from "@nestjs/common"
import { APP_FILTER } from "@nestjs/core"
import { SentryGlobalFilter, SentryModule } from "@sentry/nestjs/setup"
import { HealthController } from "./health/health.controller"
import { PrismaModule } from "./prisma/prisma.module"

@Module({
  imports: [SentryModule.forRoot(), PrismaModule],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: SentryGlobalFilter }]
})
export class AppModule {}
```

- [ ] **Step 7: Give CI a database**

Two changes are needed, not one. Turborepo runs tasks in a sanitised environment and passes through only the variables a task declares, so setting `DATABASE_URL` at the workflow level is not enough on its own — Jest would still see nothing. It works locally only because `apps/api/.env` exists on disk for Prisma to read.

First, declare the variables on the `test` task in `turbo.json`:

```json
"test": { "dependsOn": ["^build"], "env": ["DATABASE_URL", "DIRECT_URL"] },
```

Then replace `.github/workflows/ci.yml` with:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  ci:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: dentalops
          POSTGRES_PASSWORD: dentalops
          POSTGRES_DB: dentalops
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U dentalops"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 20
    env:
      DATABASE_URL: postgresql://dentalops:dentalops@localhost:5432/dentalops
      DIRECT_URL: postgresql://dentalops:dentalops@localhost:5432/dentalops
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @dentalops/api exec prisma generate
      - run: pnpm --filter @dentalops/api exec prisma migrate deploy
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

- [ ] **Step 8: Make the generated client reachable everywhere it is built**

pnpm 10 blocks postinstall scripts by default, and Prisma generates its client from a postinstall. pnpm 10 also no longer reads the `pnpm` field in `package.json` — settings live in `pnpm-workspace.yaml` now. Append there:

```yaml
onlyBuiltDependencies:
  - "@prisma/client"
  - "@prisma/engines"
  - esbuild
  - prisma
```

That is necessary but **not sufficient**. Prisma's postinstall runs from its own directory inside `node_modules/.pnpm/`, cannot find a schema that lives at `apps/api/prisma/schema.prisma`, and quietly emits a client stub containing none of our models. Anything that builds this repo from a clean checkout must therefore run `prisma generate` explicitly — CI already does (Step 7), and the deploy needs it too.

Update the `buildCommand` in `render.yaml` to generate the client and apply migrations before building:

```yaml
    buildCommand: npm i -g pnpm@10.4.1 && pnpm install --frozen-lockfile && pnpm --filter @dentalops/api exec prisma generate && pnpm --filter @dentalops/api exec prisma migrate deploy && pnpm turbo run build --filter=@dentalops/api
```

Verify the stub-versus-real distinction yourself, so the failure mode is familiar rather than mysterious:

```bash
grep -l "Tenant" node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/index.d.ts
```

Expected: no match immediately after a fresh `pnpm install`, and a match after `pnpm --filter @dentalops/api exec prisma generate`.

Then run the full pipeline: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all green.

- [ ] **Step 9: Commit and push**

```bash
git add apps/api .github/workflows/ci.yml .env.example pnpm-lock.yaml
git commit -m "feat: prisma setup with tenant and user models and ci database"
git push
```

Verify: `gh run list --limit 1` reports success.

---

### Task 2: Core domain tables

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_domain/migration.sql` (generated)

**Interfaces:**
- Consumes: `Tenant` from Task 1.
- Produces: models `Branch`, `Service`, `EquipmentType`, `Resource`, `ServiceEquipmentRequirement`, `Patient`, and enum `ResourceType`. Task 3 references `Branch` and `User`; Task 4 references `Service`, `Resource`, `Patient`.

- [ ] **Step 1: Append the models to `schema.prisma`**

```prisma
enum ResourceType {
  chair
  equipment
}

model Branch {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String   @map("tenant_id") @db.Uuid
  name         String
  timezone     String   @default("Asia/Bangkok")
  openingHours Json     @map("opening_hours")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  tenant    Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  resources Resource[]

  @@index([tenantId])
  @@map("branches")
}

model Service {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  name        String
  durationMin Int      @map("duration_min")
  bufferMin   Int      @default(0) @map("buffer_min")
  colorIndex  Int      @default(0) @map("color_index")
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  tenant       Tenant                        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  requirements ServiceEquipmentRequirement[]

  @@index([tenantId])
  @@map("services")
}

model EquipmentType {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String   @map("tenant_id") @db.Uuid
  name      String
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)

  tenant       Tenant                        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  resources    Resource[]
  requirements ServiceEquipmentRequirement[]

  @@index([tenantId])
  @@map("equipment_types")
}

model Resource {
  id              String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String       @map("tenant_id") @db.Uuid
  branchId        String       @map("branch_id") @db.Uuid
  equipmentTypeId String?      @map("equipment_type_id") @db.Uuid
  type            ResourceType
  name            String
  isActive        Boolean      @default(true) @map("is_active")
  createdAt       DateTime     @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt       DateTime     @updatedAt @map("updated_at") @db.Timestamptz(3)

  tenant        Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  branch        Branch         @relation(fields: [branchId], references: [id], onDelete: Cascade)
  equipmentType EquipmentType? @relation(fields: [equipmentTypeId], references: [id])

  @@index([tenantId, branchId])
  @@map("resources")
}

model ServiceEquipmentRequirement {
  id              String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String @map("tenant_id") @db.Uuid
  serviceId       String @map("service_id") @db.Uuid
  equipmentTypeId String @map("equipment_type_id") @db.Uuid
  quantity        Int    @default(1)

  tenant        Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  service       Service       @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  equipmentType EquipmentType @relation(fields: [equipmentTypeId], references: [id], onDelete: Cascade)

  @@unique([serviceId, equipmentTypeId])
  @@map("service_equipment_requirements")
}

model Patient {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String   @map("tenant_id") @db.Uuid
  name      String
  phone     String
  email     String
  notes     String?
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, phone, email])
  @@index([tenantId])
  @@map("patients")
}
```

Add the matching back-relations to `Tenant`:

```prisma
  branches       Branch[]
  services       Service[]
  equipmentTypes EquipmentType[]
  resources      Resource[]
  requirements   ServiceEquipmentRequirement[]
  patients       Patient[]
```

- [ ] **Step 2: Generate and apply the migration**

Run: `pnpm --filter @dentalops/api exec prisma migrate dev --name domain`
Expected: `Your database is now in sync with your schema.`

- [ ] **Step 3: Verify the tables exist**

Run: `docker compose exec postgres psql -U dentalops -c "\dt"`
Expected: `branches`, `equipment_types`, `patients`, `resources`, `service_equipment_requirements`, `services` are all listed.

- [ ] **Step 4: Verify typecheck still passes**

Run: `pnpm --filter @dentalops/api exec prisma generate && pnpm typecheck`
Expected: 4/4 packages pass.

- [ ] **Step 5: Commit and push**

```bash
git add apps/api/prisma
git commit -m "feat: branches, services, resources, equipment, and patients schema"
git push
```

---

### Task 3: Shifts with a generated range column and an exclusion constraint

This is the first constraint. Get the pattern right here — Task 4 repeats it twice.

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_shifts/migration.sql` (generated, then hand-edited)
- Test: `apps/api/test/shift-exclusion.spec.ts`

**Interfaces:**
- Consumes: `Tenant`, `User`, `Branch`.
- Produces: models `ShiftSeries`, `Shift`, `TimeBlock`, enum `RecurrenceFreq`; constraint `no_staff_double_shift`. Task 4 reuses the generated-column pattern; W1b's roster endpoints read these tables.

- [ ] **Step 1: Append the models**

`during` is declared so Prisma knows the column exists and does not try to drop it on the next diff. It is nullable and never written by application code — the database computes it.

```prisma
enum RecurrenceFreq {
  weekly
  monthly_date
}

model ShiftSeries {
  id          String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String         @map("tenant_id") @db.Uuid
  staffId     String         @map("staff_id") @db.Uuid
  branchId    String         @map("branch_id") @db.Uuid
  freq        RecurrenceFreq
  interval    Int            @default(1)
  byWeekday   Int[]          @map("by_weekday")
  timeStart   String         @map("time_start")
  durationMin Int            @map("duration_min")
  startsOn    DateTime       @map("starts_on") @db.Date
  endsOn      DateTime?      @map("ends_on") @db.Date
  createdAt   DateTime       @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt   DateTime       @updatedAt @map("updated_at") @db.Timestamptz(3)

  tenant Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  shifts Shift[]

  @@index([tenantId, staffId])
  @@map("shift_series")
}

model Shift {
  id        String                   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String                   @map("tenant_id") @db.Uuid
  staffId   String                   @map("staff_id") @db.Uuid
  branchId  String                   @map("branch_id") @db.Uuid
  seriesId  String?                  @map("series_id") @db.Uuid
  startsAt  DateTime                 @map("starts_at") @db.Timestamptz(3)
  endsAt    DateTime                 @map("ends_at") @db.Timestamptz(3)
  during    Unsupported("tstzrange")?
  detached  Boolean                  @default(false)
  createdAt DateTime                 @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime                 @updatedAt @map("updated_at") @db.Timestamptz(3)

  tenant Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  series ShiftSeries? @relation(fields: [seriesId], references: [id], onDelete: Cascade)

  @@index([tenantId, branchId, startsAt])
  @@index([tenantId, staffId, startsAt])
  @@map("shifts")
}

model TimeBlock {
  id        String                   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String                   @map("tenant_id") @db.Uuid
  staffId   String?                  @map("staff_id") @db.Uuid
  branchId  String?                  @map("branch_id") @db.Uuid
  reason    String
  startsAt  DateTime                 @map("starts_at") @db.Timestamptz(3)
  endsAt    DateTime                 @map("ends_at") @db.Timestamptz(3)
  during    Unsupported("tstzrange")?
  createdAt DateTime                 @default(now()) @map("created_at") @db.Timestamptz(3)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, staffId, startsAt])
  @@map("time_blocks")
}
```

Add to `Tenant`:

```prisma
  shiftSeries ShiftSeries[]
  shifts      Shift[]
  timeBlocks  TimeBlock[]
```

- [ ] **Step 2: Create the migration without applying it**

Run: `pnpm --filter @dentalops/api exec prisma migrate dev --name shifts --create-only`
Expected: `Prisma Migrate created the following migration without applying it`.

- [ ] **Step 3: Hand-edit the generated SQL**

Prisma writes `"during" tstzrange` as an ordinary nullable column. Open the new `migration.sql`, delete the two `"during" tstzrange` column definitions from the `CREATE TABLE` statements, and append this block to the end of the file:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "shifts"
  ADD COLUMN "during" tstzrange
  GENERATED ALWAYS AS (tstzrange("starts_at", "ends_at", '[)')) STORED;

ALTER TABLE "time_blocks"
  ADD COLUMN "during" tstzrange
  GENERATED ALWAYS AS (tstzrange("starts_at", "ends_at", '[)')) STORED;

-- A staff member cannot hold two overlapping shifts, in any branch.
ALTER TABLE "shifts"
  ADD CONSTRAINT "no_staff_double_shift"
  EXCLUDE USING GIST ("staff_id" WITH =, "during" WITH &&);

CREATE INDEX "shifts_during_idx" ON "shifts" USING GIST ("during");
CREATE INDEX "time_blocks_during_idx" ON "time_blocks" USING GIST ("during");
```

`'[)'` makes ranges half-open: a shift ending at 17:00 and another starting at 17:00 do **not** overlap. `btree_gist` is what allows the equality operator on `staff_id` to sit inside a GiST exclusion constraint.

- [ ] **Step 4: Apply the migration**

Run: `pnpm --filter @dentalops/api exec prisma migrate dev`
Expected: `The following migration(s) have been applied` with no drift warning.

Prisma **will** report drift on the `during` columns afterwards — it compares the generated column against the plain `tstzrange` declaration and the difference is by design. Two facts learned the hard way (Prisma 6.19.3):

- `@ignore` is NOT valid on `Unsupported` fields (validation error P1012) — do not try it.
- Bare `prisma migrate dev` will block on an interactive drift prompt asking to create a fix-up migration. Never answer it; kill it if reached.

The working pattern, used from here on for every migration touching a `during` table: create with `--create-only`, hand-edit, then apply with `pnpm --filter @dentalops/api exec prisma migrate deploy` (deploy applies without drift-checking). Verify with `prisma migrate status` reporting `Database schema is up to date!`. The residual dev-only diff (`DROP DEFAULT` + the GiST indexes) is cosmetic and expected.

Verify the constraint landed:

```bash
docker compose exec postgres psql -U dentalops -c "\d shifts" | grep -A2 "Check constraints\|Exclude"
```

Expected: a line containing `no_staff_double_shift EXCLUDE USING gist (staff_id WITH =, during WITH &&)`.

- [ ] **Step 5: Write the failing test**

`apps/api/test/shift-exclusion.spec.ts`:

```ts
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const at = (h: number) => new Date(Date.UTC(2026, 7, 3, h, 0, 0))

describe("shift exclusion constraint", () => {
  let tenantId: string
  let staffId: string
  let branchId: string

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `excl-${Date.now()}`, name: "Exclusion Test Clinic" }
    })
    tenantId = tenant.id

    const branch = await prisma.branch.create({
      data: { tenantId, name: "Main", openingHours: {} }
    })
    branchId = branch.id

    const user = await prisma.user.create({
      data: {
        tenantId,
        email: "dentist@example.com",
        passwordHash: "x",
        name: "Dr. Anong",
        role: "dentist"
      }
    })
    staffId = user.id
  })

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } })
    await prisma.$disconnect()
  })

  it("rejects a second overlapping shift for the same staff member", async () => {
    await prisma.shift.create({
      data: { tenantId, staffId, branchId, startsAt: at(9), endsAt: at(17) }
    })

    await expect(
      prisma.shift.create({
        data: { tenantId, staffId, branchId, startsAt: at(16), endsAt: at(20) }
      })
    ).rejects.toThrow()
  })

  it("allows a back-to-back shift that only touches at the boundary", async () => {
    const shift = await prisma.shift.create({
      data: { tenantId, staffId, branchId, startsAt: at(17), endsAt: at(20) }
    })
    expect(shift.id).toBeDefined()
  })

  it("computes the generated range column from starts_at and ends_at", async () => {
    const rows = await prisma.$queryRaw<{ during: string }[]>`
      SELECT "during"::text FROM "shifts" WHERE "staff_id" = ${staffId}::uuid ORDER BY "starts_at" LIMIT 1
    `
    expect(rows[0]?.during).toContain("2026-08-03")
  })
})
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @dentalops/api test -- shift-exclusion`
Expected: 3 tests PASS. The first proves the constraint fires, the second proves half-open ranges behave correctly, the third proves the generated column is populated by the database rather than the application.

- [ ] **Step 7: Commit and push**

```bash
git add apps/api/prisma apps/api/test
git commit -m "feat: shifts and time blocks with generated ranges and exclusion constraint"
git push
```

Verify: `gh run list --limit 1` reports success — CI now runs migrations and this test against its own Postgres.

---

### Task 4: Appointments, resource claims, and the two remaining exclusion constraints

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_appointments/migration.sql` (generated, then hand-edited)
- Test: `apps/api/test/appointment-exclusion.spec.ts`

**Interfaces:**
- Consumes: `Tenant`, `User`, `Branch`, `Service`, `Resource`, `Patient`, `RecurrenceFreq`.
- Produces: models `AppointmentSeries`, `Appointment`, `ResourceClaim`, enums `AppointmentStatus`, `ClaimStatus`; constraints `no_dentist_overlap`, `no_resource_overlap`. W1b and W2 build every booking endpoint on top of these.

- [ ] **Step 1: Append the models**

```prisma
enum AppointmentStatus {
  confirmed
  completed
  cancelled
  no_show
}

enum ClaimStatus {
  active
  released
}

model AppointmentSeries {
  id          String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String         @map("tenant_id") @db.Uuid
  freq        RecurrenceFreq
  interval    Int            @default(1)
  byWeekday   Int[]          @map("by_weekday")
  count       Int
  createdAt   DateTime       @default(now()) @map("created_at") @db.Timestamptz(3)

  tenant       Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  appointments Appointment[]

  @@index([tenantId])
  @@map("appointment_series")
}

model Appointment {
  id        String                   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String                   @map("tenant_id") @db.Uuid
  branchId  String                   @map("branch_id") @db.Uuid
  seriesId  String?                  @map("series_id") @db.Uuid
  serviceId String                   @map("service_id") @db.Uuid
  dentistId String                   @map("dentist_id") @db.Uuid
  patientId String                   @map("patient_id") @db.Uuid
  startsAt  DateTime                 @map("starts_at") @db.Timestamptz(3)
  endsAt    DateTime                 @map("ends_at") @db.Timestamptz(3)
  during    Unsupported("tstzrange")?
  status    AppointmentStatus        @default(confirmed)
  version   Int                      @default(0)
  detached  Boolean                  @default(false)
  createdBy String?                  @map("created_by") @db.Uuid
  createdAt DateTime                 @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime                 @updatedAt @map("updated_at") @db.Timestamptz(3)

  tenant  Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  series  AppointmentSeries? @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  claims  ResourceClaim[]

  @@index([tenantId, branchId, startsAt])
  @@index([tenantId, dentistId, startsAt])
  @@map("appointments")
}

model ResourceClaim {
  id            String                   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String                   @map("tenant_id") @db.Uuid
  appointmentId String                   @map("appointment_id") @db.Uuid
  resourceId    String                   @map("resource_id") @db.Uuid
  startsAt      DateTime                 @map("starts_at") @db.Timestamptz(3)
  endsAt        DateTime                 @map("ends_at") @db.Timestamptz(3)
  during        Unsupported("tstzrange")?
  status        ClaimStatus              @default(active)

  tenant      Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  appointment Appointment @relation(fields: [appointmentId], references: [id], onDelete: Cascade)

  @@index([tenantId, resourceId, startsAt])
  @@map("resource_claims")
}
```

Add to `Tenant`:

```prisma
  appointmentSeries AppointmentSeries[]
  appointments      Appointment[]
  resourceClaims    ResourceClaim[]
```

- [ ] **Step 2: Create the migration without applying it**

Run: `pnpm --filter @dentalops/api exec prisma migrate dev --name appointments --create-only`

- [ ] **Step 3: Hand-edit the generated SQL**

Delete the two `"during" tstzrange` column definitions Prisma emitted, then append:

```sql
ALTER TABLE "appointments"
  ADD COLUMN "during" tstzrange
  GENERATED ALWAYS AS (tstzrange("starts_at", "ends_at", '[)')) STORED;

ALTER TABLE "resource_claims"
  ADD COLUMN "during" tstzrange
  GENERATED ALWAYS AS (tstzrange("starts_at", "ends_at", '[)')) STORED;

-- A dentist cannot hold two overlapping confirmed appointments.
-- Cancelled and no-show rows are excluded so a freed slot is immediately rebookable.
ALTER TABLE "appointments"
  ADD CONSTRAINT "no_dentist_overlap"
  EXCLUDE USING GIST ("dentist_id" WITH =, "during" WITH &&)
  WHERE ("status" = 'confirmed');

-- A physical resource cannot be claimed twice at once.
ALTER TABLE "resource_claims"
  ADD CONSTRAINT "no_resource_overlap"
  EXCLUDE USING GIST ("resource_id" WITH =, "during" WITH &&)
  WHERE ("status" = 'active');

CREATE INDEX "appointments_during_idx" ON "appointments" USING GIST ("during");
CREATE INDEX "resource_claims_during_idx" ON "resource_claims" USING GIST ("during");
```

The partial `WHERE` clauses are the reason cancellation is a status change rather than a delete: the row stays for audit and history, but stops blocking the slot.

- [ ] **Step 4: Apply and verify**

Run: `pnpm --filter @dentalops/api exec prisma migrate deploy`

(`deploy`, not `dev` — see Task 3 Step 4: dev drift-checks the generated columns and blocks on an interactive prompt. Regenerate the client afterwards: `pnpm --filter @dentalops/api exec prisma generate`.)

Verify:

```bash
docker compose exec postgres psql -U dentalops -c "\d appointments" | grep no_dentist_overlap
docker compose exec postgres psql -U dentalops -c "\d resource_claims" | grep no_resource_overlap
```

Expected: both constraints listed with their `WHERE` predicates.

- [ ] **Step 5: Write the test**

`apps/api/test/appointment-exclusion.spec.ts`:

```ts
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const at = (h: number, m = 0) => new Date(Date.UTC(2026, 7, 4, h, m, 0))

describe("appointment and resource exclusion constraints", () => {
  let tenantId: string
  let branchId: string
  let serviceId: string
  let dentistId: string
  let patientId: string
  let chairId: string

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `appt-${Date.now()}`, name: "Appointment Test Clinic" }
    })
    tenantId = tenant.id

    const branch = await prisma.branch.create({
      data: { tenantId, name: "Main", openingHours: {} }
    })
    branchId = branch.id

    const service = await prisma.service.create({
      data: { tenantId, name: "Cleaning", durationMin: 60 }
    })
    serviceId = service.id

    const dentist = await prisma.user.create({
      data: {
        tenantId,
        email: "dentist2@example.com",
        passwordHash: "x",
        name: "Dr. Somchai",
        role: "dentist"
      }
    })
    dentistId = dentist.id

    const patient = await prisma.patient.create({
      data: { tenantId, name: "Somsak C.", phone: "0812345678", email: "s@example.com" }
    })
    patientId = patient.id

    const chair = await prisma.resource.create({
      data: { tenantId, branchId, type: "chair", name: "Chair 1" }
    })
    chairId = chair.id
  })

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } })
    await prisma.$disconnect()
  })

  const makeAppointment = (startHour: number, endHour: number) =>
    prisma.appointment.create({
      data: {
        tenantId,
        branchId,
        serviceId,
        dentistId,
        patientId,
        startsAt: at(startHour),
        endsAt: at(endHour)
      }
    })

  it("rejects a second confirmed appointment overlapping the same dentist", async () => {
    await makeAppointment(9, 10)
    await expect(makeAppointment(9, 11)).rejects.toThrow()
  })

  it("allows the overlapping slot once the blocking appointment is cancelled", async () => {
    const blocking = await makeAppointment(13, 14)
    await expect(makeAppointment(13, 14)).rejects.toThrow()

    await prisma.appointment.update({
      where: { id: blocking.id },
      data: { status: "cancelled" }
    })

    const replacement = await makeAppointment(13, 14)
    expect(replacement.status).toBe("confirmed")
  })

  it("rejects a second active claim on the same resource", async () => {
    const first = await makeAppointment(15, 16)
    await prisma.resourceClaim.create({
      data: {
        tenantId,
        appointmentId: first.id,
        resourceId: chairId,
        startsAt: at(15),
        endsAt: at(16)
      }
    })

    const otherDentist = await prisma.user.create({
      data: {
        tenantId,
        email: "dentist3@example.com",
        passwordHash: "x",
        name: "Dr. Ploy",
        role: "dentist"
      }
    })

    const second = await prisma.appointment.create({
      data: {
        tenantId,
        branchId,
        serviceId,
        dentistId: otherDentist.id,
        patientId,
        startsAt: at(15, 30),
        endsAt: at(16, 30)
      }
    })

    await expect(
      prisma.resourceClaim.create({
        data: {
          tenantId,
          appointmentId: second.id,
          resourceId: chairId,
          startsAt: at(15, 30),
          endsAt: at(16, 30)
        }
      })
    ).rejects.toThrow()
  })
})
```

The third test is the one that matters most: two *different* dentists, so `no_dentist_overlap` does not fire — the booking is stopped purely because they would share a chair.

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @dentalops/api test -- appointment-exclusion`
Expected: 3 tests PASS.

- [ ] **Step 7: Commit and push**

```bash
git add apps/api/prisma apps/api/test
git commit -m "feat: appointments and resource claims with exclusion constraints"
git push
```

---

### Task 5: Seed script and a documented database ERD

**Files:**
- Create: `apps/api/prisma/seed.ts`, `docs/database.md`
- Modify: `apps/api/package.json`
- Test: `apps/api/test/seed.spec.ts`

**Interfaces:**
- Consumes: every model from Tasks 1–4.
- Produces: `pnpm --filter @dentalops/api db:seed` creating a demo tenant with slug `demo-clinic`. W1b's demo-login resolves this tenant; W2 grows the seed to 500+ appointments.

- [ ] **Step 1: Install the seed runner**

Run: `pnpm --filter @dentalops/api add -D tsx`

Add to `apps/api/package.json`:

```json
"db:seed": "tsx prisma/seed.ts"
```

and a top-level `"prisma"` block in the same file:

```json
"prisma": { "seed": "tsx prisma/seed.ts" }
```

- [ ] **Step 2: Write the seed script**

`apps/api/prisma/seed.ts`:

```ts
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const OPENING_HOURS = {
  mon: [["09:00", "20:00"]],
  tue: [["09:00", "20:00"]],
  wed: [["09:00", "20:00"]],
  thu: [["09:00", "20:00"]],
  fri: [["09:00", "20:00"]],
  sat: [["09:00", "17:00"]],
  sun: []
}

async function main() {
  await prisma.tenant.deleteMany({ where: { slug: "demo-clinic" } })

  const tenant = await prisma.tenant.create({
    data: { slug: "demo-clinic", name: "ยิ้มสวย ทันตคลินิก" }
  })

  const sukhumvit = await prisma.branch.create({
    data: { tenantId: tenant.id, name: "Sukhumvit", openingHours: OPENING_HOURS }
  })

  const ladprao = await prisma.branch.create({
    data: { tenantId: tenant.id, name: "Ladprao", openingHours: OPENING_HOURS }
  })

  const xray = await prisma.equipmentType.create({
    data: { tenantId: tenant.id, name: "X-ray unit" }
  })

  const services = await Promise.all(
    [
      { name: "Cleaning", durationMin: 45, colorIndex: 0 },
      { name: "Filling", durationMin: 60, colorIndex: 1 },
      { name: "Root canal", durationMin: 90, colorIndex: 2 },
      { name: "Ortho adjustment", durationMin: 30, colorIndex: 3 },
      { name: "Extraction", durationMin: 60, colorIndex: 4 },
      { name: "Whitening", durationMin: 75, colorIndex: 5 }
    ].map((s) =>
      prisma.service.create({ data: { tenantId: tenant.id, bufferMin: 10, ...s } })
    )
  )

  const rootCanal = services.find((s) => s.name === "Root canal")
  if (rootCanal) {
    await prisma.serviceEquipmentRequirement.create({
      data: { tenantId: tenant.id, serviceId: rootCanal.id, equipmentTypeId: xray.id }
    })
  }

  for (const branch of [sukhumvit, ladprao]) {
    for (const n of [1, 2, 3]) {
      await prisma.resource.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          type: "chair",
          name: `${branch.name} Chair ${n}`
        }
      })
    }
    await prisma.resource.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        equipmentTypeId: xray.id,
        type: "equipment",
        name: `${branch.name} X-ray`
      }
    })
  }

  const staff = [
    { name: "Anong Prasert", role: "owner" as const },
    { name: "Somchai Wattana", role: "dentist" as const },
    { name: "Ploy Siriwan", role: "dentist" as const },
    { name: "Nid Kanjana", role: "dentist" as const },
    { name: "Kiat Thongchai", role: "dentist" as const },
    { name: "Malee Suksan", role: "receptionist" as const }
  ]

  for (const [i, person] of staff.entries()) {
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `${person.role}${i}@demo-clinic.local`,
        passwordHash: "seeded-placeholder",
        name: person.name,
        role: person.role
      }
    })
  }

  const patients = [
    { name: "Somsak Chaiwat", phone: "0811111111" },
    { name: "Pim Wongsakorn", phone: "0822222222" },
    { name: "Nattapong Meesuk", phone: "0833333333" },
    { name: "Kanya Tanakit", phone: "0844444444" }
  ]

  for (const [i, p] of patients.entries()) {
    await prisma.patient.create({
      data: {
        tenantId: tenant.id,
        name: p.name,
        phone: p.phone,
        email: `patient${i}@example.com`
      }
    })
  }

  console.log(`Seeded tenant ${tenant.slug} (${tenant.id})`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
```

`passwordHash` is a placeholder here — W1b replaces it with real argon2 hashes once the auth module exists.

- [ ] **Step 3: Run the seed**

Run: `pnpm --filter @dentalops/api db:seed`
Expected: `Seeded tenant demo-clinic (<uuid>)`.

Run it a second time.
Expected: the same output with a different uuid, and no unique-constraint error — the leading `deleteMany` makes it idempotent.

- [ ] **Step 4: Write the seed test**

`apps/api/test/seed.spec.ts`:

```ts
import { execSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

describe("seed script", () => {
  beforeAll(() => {
    execSync("pnpm db:seed", { cwd: `${__dirname}/..`, stdio: "pipe" })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("creates the demo tenant with branches, services, resources, staff and patients", async () => {
    const tenant = await prisma.tenant.findUnique({ where: { slug: "demo-clinic" } })
    expect(tenant).not.toBeNull()

    const tenantId = tenant!.id
    const [branches, services, resources, users, patients] = await Promise.all([
      prisma.branch.count({ where: { tenantId } }),
      prisma.service.count({ where: { tenantId } }),
      prisma.resource.count({ where: { tenantId } }),
      prisma.user.count({ where: { tenantId } }),
      prisma.patient.count({ where: { tenantId } })
    ])

    expect(branches).toBe(2)
    expect(services).toBe(6)
    expect(resources).toBe(8)
    expect(users).toBe(6)
    expect(patients).toBe(4)
  })

  it("is idempotent", async () => {
    execSync("pnpm db:seed", { cwd: `${__dirname}/..`, stdio: "pipe" })
    const count = await prisma.tenant.count({ where: { slug: "demo-clinic" } })
    expect(count).toBe(1)
  })
})
```

- [ ] **Step 5: Run the test**

Run: `pnpm --filter @dentalops/api test -- seed`
Expected: 2 tests PASS.

- [ ] **Step 6: Document the schema**

`docs/database.md`:

```markdown
# Database

PostgreSQL 16 is the source of truth. Prisma owns the ordinary schema; three
exclusion constraints are hand-written SQL because Prisma cannot express them.

## Why generated range columns

Scheduling tables store plain `starts_at` and `ends_at` columns that the
application reads and writes normally. A third column is derived by the database:

    during tstzrange GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED

The exclusion constraints sit on `during`, never on the application-written
columns. Two consequences follow. The application can never write an
inconsistent range, because it does not write the range at all. And the
guarantee holds for every writer — Prisma, raw SQL, a migration, or someone
typing into psql.

`'[)'` makes ranges half-open, so a shift ending at 17:00 and one starting at
17:00 do not overlap.

## The three constraints

| Table | Constraint | Meaning |
|---|---|---|
| `shifts` | `no_staff_double_shift` | one staff member, no overlapping shifts, across all branches |
| `appointments` | `no_dentist_overlap` | one dentist, no overlapping appointments, `WHERE status = 'confirmed'` |
| `resource_claims` | `no_resource_overlap` | one physical resource, no overlapping claims, `WHERE status = 'active'` |

The partial `WHERE` predicates are why cancellation is a status change rather
than a delete: the row survives for history but stops blocking the slot.

`btree_gist` is required — it is what permits the equality operator on a uuid
column inside a GiST exclusion constraint.

## Multi-resource appointments

An appointment claims a dentist directly and every physical resource through a
`resource_claims` row. Equipment with several units is several resource rows, so
capacity emerges from unit assignment and per-row exclusion — no counting logic
is needed anywhere.

`resource_claims.starts_at` / `ends_at` are denormalised from the parent
appointment. Rescheduling updates parent and children inside one transaction
with a consistent lock ordering.

## Commands

    pnpm --filter @dentalops/api db:migrate    create and apply a migration
    pnpm --filter @dentalops/api db:deploy     apply pending migrations (CI, production)
    pnpm --filter @dentalops/api db:seed       load the demo tenant
    pnpm --filter @dentalops/api db:reset      drop, re-migrate, re-seed
```

- [ ] **Step 7: Verify the whole pipeline, then commit and push**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all green, 9 api tests passing (1 health + 3 shift + 3 appointment + 2 seed).

```bash
git add apps/api docs/database.md
git commit -m "feat: demo tenant seed script and database documentation"
git push
```

Verify: `gh run list --limit 1` reports success.

---

## W1a exit criteria

- [ ] `pnpm --filter @dentalops/api db:reset` rebuilds the entire database from migrations plus seed with no manual steps
- [ ] All three exclusion constraints exist in the database and each has a passing test proving it fires
- [ ] The half-open boundary case is tested (back-to-back bookings are legal)
- [ ] The cancellation-frees-the-slot case is tested
- [ ] The two-different-dentists-one-chair case is tested — proving resource exclusion is independent of dentist exclusion
- [ ] CI runs migrations against its own Postgres service and all tests pass there
- [ ] `docs/database.md` explains the generated-column decision well enough to answer it cold in an interview
