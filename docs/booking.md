# Booking

## How a booking happens

1. Validate service, dentist, branch, patient (all tenant-scoped).
2. Compute the window: `endsAt = startsAt + durationMin`; the chair is claimed
   until `endsAt + bufferMin` — cleaning time blocks the chair, not the dentist.
3. In one transaction: pick a free chair and any required equipment unit,
   insert the appointment, insert the claims sorted by `resourceId`.
4. The database answers. `no_dentist_overlap` → 409 `SLOT_CONFLICT`, final.
   `no_resource_overlap` → retry the transaction (up to 8 attempts): the
   re-query naturally avoids the unit a concurrent booking just took.
   Postgres deadlock and serialization failures (SQLSTATE `40P01` and `40001`)
   are retried by the same loop, since both mean "try again", not "no". Exhausted
   retries → 409 `RESOURCE_UNAVAILABLE`.

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
executes and stores `{ body }` in Redis for 24 h; replays return the stored
body with `x-idempotent-replay: true`. Only successes are stored — a failure
must stay retryable. Keys are scoped per tenant, method, and path.
