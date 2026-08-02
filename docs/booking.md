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

## Public booking

A patient books at `/book/:clinicSlug` with no account. Public routes carry no
JWT, so tenant scope comes from the slug: `PublicTenantMiddleware` resolves it
and runs the request inside the same `AsyncLocalStorage` context the
authenticated path uses. Everything downstream — `prisma.scoped`, the
availability engine, `AppointmentsService.create` — is the code staff already
use, not a parallel implementation without tenant safety.

### Hold lifecycle

A hold is a set of **slot keys**, not a range query. Time is bucketed into
15-minute slots; a hold owns `hold:{tenantId}:{dentistId}:{slotIndex}` for
every slot its window spans, where `startIndex = floor(startMs / 900000)` and
`endIndex = ceil(endMs / 900000) - 1`.

1. **Acquire.** One Lua script checks every key and only then sets every key,
   with the holdId as the value and a 300s TTL. Lua runs atomically, so no
   other client can interleave between the check loop and the set loop — two
   concurrent holds on overlapping windows cannot both win, and the loser gets
   409 `SLOT_HELD`. It is deliberately *not* a per-key `SET NX` with
   compensating deletes: that shape can delete another hold's keys if it ever
   runs non-atomically.
2. **Observe.** Public availability calls the shared engine unchanged and then
   subtracts held slots with an `MGET` of computed keys — bounded because the
   endpoint asks for one Bangkok day. `exceptHoldId` lets a caller see its own
   held slot as free, which is what makes the countdown screen and reschedule
   work.
3. **Expire.** The TTL is the whole cleanup story. There is no sweeper job and
   nothing to reconcile; keys simply stop existing. The wizard's countdown is
   driven by the server's `expiresAt`, never a timer seeded at mount, so a
   backgrounded phone cannot drift into believing it still holds the slot.
4. **Release.** Also a Lua script, and for the mirror-image reason: a blind
   `DEL` would, if the TTL had already lapsed and a different hold had taken
   those slots, delete the new owner's keys. Release deletes a key only when
   its value equals the releasing holdId. The wizard releases on back-out and
   the server releases after a successful confirm.

### Holds are a courtesy, the constraint is the authority

A hold makes the common case pleasant — a patient filling in their name does
not lose the slot to someone browsing. It is not a lock, and nothing in the
booking path trusts it. Confirm goes through the same `AppointmentsService`
and the same `EXCLUDE USING GIST` constraints as a staff booking, so the
database still has the final say and can still answer 409 `SLOT_CONFLICT`.

The consequence is deliberate: **staff availability does not subtract holds.**
Staff booking is privileged by design, so a receptionist taking a phone call
sees and can book a slot a web patient is holding. If they do, the patient's
confirm loses to the constraint and the wizard shows the recovery state ("that
time was just booked", nearest free slot, pick another) rather than a raw
error. The alternative — letting an anonymous 5-minute Redis key block the
front desk — trades a real, present patient for a maybe.

The same recovery state covers a lapsed hold (409 `HOLD_EXPIRED`), so both
failure modes are one screen the patient can act on.

### After confirm

Confirm upserts the patient by `(tenantId, phone)` — first name wins, a rename
is a staff action — books through the constrained path, releases the hold, and
returns a manage token. The token is a JWT with `purpose: "manage"` and a
30-day expiry; `verify` rejects any other purpose, so an access token can never
be replayed as a manage link. The confirmation email is enqueued on BullMQ
**after commit**, and enqueue failures are swallowed inside the queue wrapper:
email must never fail a booking that the database already accepted.

## Idempotency

Mutating booking routes accept an `Idempotency-Key` header. First call
executes and stores `{ body }` in Redis for 24 h; replays return the stored
body with `x-idempotent-replay: true`. Only successes are stored — a failure
must stay retryable. Keys are scoped per tenant, method, and path.
