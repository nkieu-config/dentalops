# Booking

## How a booking happens

1. Validate service, dentist, branch, patient (all tenant-scoped).
2. Compute the window: `endsAt = startsAt + durationMin`; the chair is claimed until
   `endsAt + bufferMin` — cleaning time blocks the chair, not the dentist.
3. In one transaction: pick a free chair and any required equipment unit, insert the appointment,
   insert the claims sorted by `resourceId`.
4. The database answers. `no_dentist_overlap` → 409 `SLOT_CONFLICT`, final. `no_resource_overlap`
   → retry (up to 8 attempts): the re-query naturally avoids the unit a concurrent booking just
   took. Postgres deadlock/serialization failures (`40P01`, `40001`) retry the same way, since both
   mean "try again". Exhausted retries → 409 `RESOURCE_UNAVAILABLE`.

There is no dentist pre-check on purpose: a pre-check is a race window, the constraint is not.

Claim writes are sorted by `resourceId` so two concurrent reschedules touching the same resources
acquire locks in one global order — no lock cycle can form. `test/deadlock.spec.ts` covers it.

## Status semantics

| Transition | Claims | Slot |
|---|---|---|
| confirmed → completed | stay `active` | chair blocked until buffer ends; dentist freed |
| confirmed → no_show | stay `active` | same — the room may still need turning over |
| confirmed → cancelled | → `released` | everything instantly rebookable |

Both exclusion constraints carry partial `WHERE` predicates, so a cancelled row stops blocking
without being deleted.

## Concurrent edits

Every appointment carries a `version`. Mutations send the version they saw; the update is
`WHERE id AND version`, and zero rows updated means 409 `STALE_VERSION` with the current version
in `details` — the contract the timeline's optimistic drag rolls back on.

## Public booking

A patient books at `/book/:clinicSlug` with no account. Public routes carry no JWT, so tenant
scope comes from the slug: `PublicTenantMiddleware` resolves it and runs the request inside the
same `AsyncLocalStorage` context the authenticated path uses — the code staff already use, not a
parallel implementation without tenant safety.

### Holds are a courtesy, the constraint is the authority

A hold reserves a set of 15-minute slot keys (`hold:{tenantId}:{dentistId}:{slotIndex}`) via a Lua
script — atomic check-then-set, so two concurrent holds on overlapping windows cannot both win. A
300s TTL is the entire cleanup story; there is no sweeper.

A hold is not a lock, and nothing in the booking path trusts it. Confirm goes through the same
`AppointmentsService` and `EXCLUDE USING GIST` constraints as a staff booking, so the database has
the final say and can still answer 409 `SLOT_CONFLICT`.

The consequence is deliberate: **staff availability does not subtract holds.** A receptionist
taking a phone call sees and can book a slot a web patient is holding. If they do, the patient's
confirm loses to the constraint and the wizard shows a recovery state ("that time was just
booked", nearest free slot) rather than a raw error — the same screen a lapsed hold (409
`HOLD_EXPIRED`) shows.

### When Redis is unreachable

The courtesy is the only part of booking that needs Redis, so an outage costs the courtesy and
nothing else. `acquire` falls back to a **signed hold**: a JWT with `purpose: "hold"` carrying the
same fields and the same 300s life. `read` verifies it instead of reading Redis; `release` is a
no-op; confirm cannot tell the two apart. Availability stops subtracting holds, because a hold
that cannot be read cannot be honoured.

Two patients can now reach confirm for the same slot, and `EXCLUDE USING GIST` rejects the loser
exactly as it rejects the patient a receptionist beat — the courtesy rule, arrived at from the
other direction. The purpose claim is load-bearing: manage, access, and hold tokens are all signed
distinctly, so a manage link can never be spent as a hold. `apps/api/test/booking-without-redis.spec.ts`
books through a dead Redis end to end.

### After confirm

Confirm upserts the patient by `(tenantId, phone)`, books through the constrained path, releases
the hold, and returns a manage token (`purpose: "manage"`, 30-day expiry). The confirmation email
enqueues on BullMQ **after commit**; enqueue failures are swallowed inside the queue wrapper —
email must never fail a booking the database already accepted.

## Idempotency

Mutating booking routes accept an `Idempotency-Key` header. First call executes and stores the
body in Redis for 24h; replays return it with `x-idempotent-replay: true`. Only successes are
stored — a failure must stay retryable. Keys scope per tenant, method, and path.

When Redis cannot answer, the interceptor runs the request without deduplication and logs the
degradation once, not once per request — a merely-unreachable store must never report
`IDEMPOTENCY_IN_FLIGHT`, which would turn a retryable outage into a permanent 409.
