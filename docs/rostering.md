# Rostering

## The four rules

`validateRoster` in `@dentalops/availability` is a pure function over intervals —
no database, no clock, no timezone beyond the fixed Bangkok offset the week
boundaries need. `POST /roster/validate` is only the shell that gathers rows for
it, which is why every rule below is unit-tested without a database.

| Rule | Severity | Meaning |
|---|---|---|
| `appointment_outside_shift` | block | a confirmed appointment not fully covered by that staff member's shifts; carries every offending id in `appointmentIds` |
| `overlapping_shifts` | block | two shifts for the same staff member overlap |
| `weekly_hours_exceeded` | warn | shift minutes in a Mon–Sun Bangkok week over `maxWeeklyMinutes` (default 2880 = 48h) |
| `insufficient_rest` | warn | gap between consecutive shifts under `minRestMinutes` (default 660 = 11h) |

**Block** means the editor refuses to save; **warn** means it says so and saves
anyway. The split is a judgement about who is hurt: an appointment left outside
a shift is a patient arriving to an empty chair, while a 51-hour week is a
manager's problem that a manager is allowed to decide to have.

Violations come back severity-major, then by `staffId`, then by the instant they
attach to — so the panel's blocking group is already in reading order.

Four semantics, each a place a naive implementation goes wrong:

- **"Fully covered" means covered by the union** of that staff member's shifts,
  so an appointment running across two back-to-back shifts is fine.
  `subtract([appointment], normalize(shifts))` — never a single-shift
  containment test.
- **Half-open `[start, end)` everywhere**, matching the availability engine and
  the database's `tstzrange(..., '[)')`. A 09:00–17:00 shift covers an
  appointment ending at 17:00, and two shifts touching at 17:00 do not overlap.
- **Rest is measured between normalized shifts**, so an overlap reports one
  overlap rather than an overlap plus a bogus negative rest.
- **A staff member with no shifts produces nothing** — not a zero-hours warning.
  Not rostering someone is not a roster mistake.

## Why validate is a dry run, not save-then-check

`POST /roster/validate` (owner) takes `{ branchId, from, to, draftShifts }` and
returns `{ violations }`. It writes nothing. `draftShifts` *replace* the
persisted shifts of every staff member they mention inside `[from, to)`, so the
question the endpoint answers is "what would break if I did this?", asked while
the user is still dragging.

Save-then-check was rejected for three reasons:

1. **The question is asked before the answer is wanted.** The editor fires this
   debounced at 250ms — on every pointer move of a drag and every keystroke in
   the time fields. Writing each of those to the database to ask about it would
   be a write per frame, and every one of them visible to the rest of the clinic
   over the timeline's live updates.
2. **The undo can fail.** Shrinking a shift and putting it back is two writes,
   and the restore is not guaranteed: `no_staff_double_shift` can reject it if
   anything else moved in between. A check that can leave the roster worse than
   it found it is not a check.
3. **These rules have no referee.** Booking can be optimistic because the
   `EXCLUDE` constraint is the authority — a wrong answer is a 409, not a double
   booking. Nothing in Postgres can enforce "11 hours between shifts", so roster
   rules are policy evaluated in the application, and the honest shape for
   policy is a question that changes nothing.

The window is capped at 31 days (`RANGE_TOO_LARGE`), the same cap
`GET /availability` carries, so the dry run stays two indexed `SELECT`s.

## this / following / all

Google Calendar's three scopes, over `PATCH /series/:id` with
`{ scope, fromAppointmentId, … }`:

| Scope | What moves | What is left alone |
|---|---|---|
| `this` | only `fromAppointmentId`, through the ordinary `reschedule` path, then marked `detached` | every other occurrence |
| `following` | the anchor and everything after it, onto a **new** `AppointmentSeries` carrying the edited rule | earlier occurrences keep the old `seriesId`, whose count is trimmed to what remains |
| `all` | every non-`detached`, still-confirmed occurrence | detached occurrences, cancelled ones |

`detached` is the flag that means **the user has already spoken about this
occurrence individually**. A `this` edit sets it, and from then on `following`
and `all` skip that row: the point of moving one occurrence is that a later
bulk edit must not silently undo it. The same flag carries the same meaning on
shifts — `PATCH /shifts/:id` sets `detached: true`, so dragging one shift in the
grid is the shift version of a `this` edit, and neither `scope: "all"` nor the
nightly job will overwrite it.

Both `following` and `all` are multi-row edits, so they run inside the same
savepoint loop as series creation: report every conflicting occurrence, change
nothing. Two details make them survivable:

- **Every dentist involved is locked first**, in sorted id order, with the same
  `lockDentist` the single-booking path uses. A multi-row edit that opted out of
  that ordering would be the deadlock `deadlock.spec.ts` exists to prevent.
- **A forward move is applied in reverse order.** Shifting ten weekly
  occurrences one hour later, first-to-last, would drop each occurrence onto the
  slot its unmoved neighbour still owns and report ten conflicts that do not
  exist. Positive deltas therefore walk the list backwards.

## Why series conflicts need savepoints

A recurring booking has to report *every* occurrence that conflicts and insert
*nothing*. Those two requirements are what force the mechanism.

A Postgres transaction is poisoned by its first constraint violation: after the
`EXCLUDE` rejects occurrence #3, every later statement fails with SQLSTATE
`25P02` "current transaction is aborted" until somebody rolls back. So a plain
loop cannot report occurrence #17 — and it does not even fail gracefully. The
observed failure without savepoints is a 500: the insert after the first
conflict raises `25P02`, which is not an `AppException` and escapes before any
report is assembled.

Wrapping each occurrence in `SAVEPOINT occ_n` / `ROLLBACK TO SAVEPOINT occ_n`
scopes the abort to the subtransaction. The constraint then judges every
occurrence on its own, conflicts accumulate in a list, and throwing
`409 SERIES_CONFLICT` at the end rolls the outer transaction back — which is
what makes "reports everything, inserts nothing" literally true.

A pre-check `SELECT` would have been simpler and is wrong: it is a race window,
and the thesis of this system is that the constraint is the referee. Each
occurrence must actually be attempted.

Two things to know about the mechanism:

- The savepoint name is interpolated into raw SQL, so it is built from the loop
  index and nothing else. Types erase at runtime; `index.toFixed(0)` is what
  actually guarantees the fragment is `[0-9]+`.
- A real **deadlock** (`40P01`) aborts the whole transaction, not just the
  subtransaction, so `ROLLBACK TO SAVEPOINT` cannot recover from one. What keeps
  that from happening is reusing `lockDentist` and `pickResources`: the series
  takes the same per-dentist `FOR UPDATE` lock and the same sorted resource-lock
  order as a single booking. A busy chair is different again: the resource retry
  wraps the savepoint, so each of its eight attempts gets a fresh subtransaction
  and a re-query that naturally avoids the unit somebody else just took.

## The nightly horizon job

Recurring shifts are materialized rows, not a rule evaluated at read time, so
something has to keep the next 90 days populated. A BullMQ repeatable job
(`horizon`, cron `0 18 * * *`, `tz: "UTC"` = 01:00 Bangkok) tops every open
series back up to `today + 90`.

`tz` is required, not decorative: BullMQ resolves a cron in the process's local
zone, and these machines run Asia/Bangkok, so omitting it fires the job seven
hours early. BullMQ v6 also removed `repeat` from `Queue.add` — the scheduler is
registered with `upsertJobScheduler`, which is idempotent across restarts.

Three properties make it safe to run every night:

- **Idempotent by construction.** For each series the job takes the anchor
  `max(startsAt)` of its existing shifts (or `startsOn` when there are none),
  clamps it to the start of today, and materializes forward to the horizon,
  skipping any occurrence whose `(seriesId, startsAt)` already exists. A second
  run on an untouched series creates 0.
- **It never resurrects a deleted occurrence.** Because it only ever moves
  *forward* from the latest existing shift, a gap left by a deleted occurrence
  is never revisited. A `detached` shift is stronger still: its local date is
  treated as an exception and skipped even when free, so a hand-edited shift
  never gets a duplicate materialized beside it.
- **A conflict is skipped, not fatal.** An occurrence that hits
  `no_staff_double_shift` increments `skipped` and the run continues. A nightly
  job must not die because one clinic double-booked a dentist.

The one asymmetry worth stating: deleting occurrences from the **tail** of a
series is indistinguishable from the horizon simply not having reached them, so
the job fills them back in — that is the top-up case, byte for byte. Ending a
series early is therefore expressed as an end date
(`DELETE /shift-series/:id?scope=following`), which closes `endsOn` at the
boundary and drops the series out of the job's "open series" query, rather than
by deleting rows.

The job runs outside any request, so it establishes tenant context itself, per
tenant, and awaits its queries *inside* `tenantContext.run` — a `PrismaPromise`
is lazy, and returning one from the callback would run it after the context has
already been torn down.

## The editor

`/app/roster` (owner only) is a week × staff grid at `≥1024` with the violation
panel docked right, a 3-day window at `768–1023`, and a per-staff list with a
violations bottom sheet below `768`. Every edit — dialog or drag — updates a
draft, fires the debounced dry run, and renders the result live; a blocking
violation disables **Save** and links to the appointments it names.

Known limits, deliberate:

- **Move between days only, no resize.** The grid is categorical — rows are
  staff, columns are days — so there is no time axis to snap a pixel delta
  against. Times are edited in the dialog.
- **No vertical drag.** Moving a shift to a different staff member would need
  `PATCH /shifts/:id` to accept `staffId`, which it does not; reassigning is a
  delete plus an add.
- **Validation is anchored to the staff who have shifts.** A dentist with
  appointments but no shift at all in the window (and no draft naming them) is
  not evaluated, so deleting a staff member's last shift of the week silences
  the `appointment_outside_shift` violation instead of raising it. Shrinking a
  shift, the case the rule exists for, is unaffected.
