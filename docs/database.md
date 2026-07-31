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
