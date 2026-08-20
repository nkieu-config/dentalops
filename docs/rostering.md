# Rostering

## The four rules

`validateRoster` in `@dentalops/availability` is a pure function over intervals — no database, no
clock, no timezone beyond the fixed Bangkok offset week boundaries need.

| Rule | Severity | Meaning |
|---|---|---|
| `appointment_outside_shift` | block | a confirmed appointment not fully covered by that staff member's shifts |
| `overlapping_shifts` | block | two shifts for the same staff member overlap |
| `weekly_hours_exceeded` | warn | shift minutes in a Mon–Sun Bangkok week over `maxWeeklyMinutes` (default 48h) |
| `insufficient_rest` | warn | gap between consecutive shifts under `minRestMinutes` (default 11h) |

**Block** refuses to save; **warn** saves anyway. The split is a judgement about who is hurt: an
appointment left outside a shift is a patient arriving to an empty chair; a 51-hour week is a
manager's problem a manager is allowed to decide to have.

Edge cases handled: "fully covered" means covered by the *union* of shifts (an appointment
spanning two back-to-back shifts is fine); half-open `[start, end)` matches the database
convention; rest is measured between normalized shifts, so an overlap reports one violation, not
an overlap plus a bogus negative rest; a staff member with no shifts produces nothing, not a
zero-hours warning.

## Why validate is a dry run, not save-then-check

`POST /roster/validate` (owner) takes `{ branchId, from, to, draftShifts }`, writes nothing, and
answers "what would break if I did this?" while the user is still dragging.

Save-then-check was rejected: the check fires debounced at 250ms on every drag frame, so writing
each one to the database would be a write per frame, visible to the whole clinic over live
updates. The undo can also fail — shrinking then restoring a shift is two writes, and the restore
is not guaranteed if anything else moved in between. And these rules have no referee: booking can
be optimistic because `EXCLUDE` is the authority (a wrong answer is a 409, not a double booking),
but nothing in Postgres enforces "11 hours between shifts" — roster rules are application policy,
and the honest shape for policy is a question that changes nothing.

## this / following / all

Google Calendar's three scopes, over `PATCH /series/:id`:

| Scope | What moves | What is left alone |
|---|---|---|
| `this` | only the target occurrence, marked `detached` | every other occurrence |
| `following` | the anchor and everything after, onto a new series | earlier occurrences keep the old series |
| `all` | every non-`detached`, still-confirmed occurrence | detached and cancelled occurrences |

`detached` means the user has already spoken about that occurrence individually — a `this` edit
sets it, and `following`/`all` skip that row afterward, so a bulk edit cannot silently undo it.
The same flag carries the same meaning on shifts.

Both `following` and `all` lock every dentist involved first (sorted id order, same as
single-booking), and a forward move is applied in reverse order — shifting occurrences
first-to-last would drop each onto the slot its unmoved neighbour still owns.

## Why series conflicts need savepoints

A recurring booking must report *every* conflicting occurrence and insert *nothing*. A Postgres
transaction is poisoned by its first constraint violation — after `EXCLUDE` rejects occurrence #3,
every later statement fails until a rollback, so a plain loop cannot report occurrence #17, and it
fails as a 500, not a clean error.

`SAVEPOINT occ_n` / `ROLLBACK TO SAVEPOINT occ_n` per occurrence scopes the abort to the
subtransaction: the constraint judges every occurrence on its own, conflicts accumulate, and
`409 SERIES_CONFLICT` rolls the outer transaction back at the end. A pre-check `SELECT` would be
simpler and wrong — it is a race window, and this system's thesis is that the constraint is the
referee. A real deadlock (`40P01`) still aborts the whole transaction, which is why the series
reuses the same per-dentist lock and sorted resource-lock order as a single booking.

## The nightly horizon job

Recurring shifts are materialized rows, not a rule evaluated at read time. A BullMQ repeatable job
(`horizon`, cron `0 18 * * *` UTC = 01:00 Bangkok) tops every open series back up to `today + 90`.

- **Idempotent.** Each series materializes forward from its latest existing shift, skipping
  occurrences that already exist. A second run on an untouched series creates 0.
- **Never resurrects a deleted occurrence** — it only moves forward, so a gap from a deletion is
  never revisited. A `detached` shift's date is skipped even when free.
- **A conflict is skipped, not fatal** — one clinic's double-booked dentist doesn't kill the run
  for everyone else.

Ending a series early is an end date (`endsOn`), not a row deletion — deleting from the tail is
indistinguishable from the horizon simply not having reached it yet, so the job would fill it back
in.

## Known limits

Validation is anchored to staff who have shifts in the window: a dentist with appointments but no
shift at all (and no draft naming them) is not evaluated, so deleting a staff member's last shift
of the week silences the outside-shift violation instead of raising it.
