# Security model

## Authentication

Staff authenticate with JWT: a 15-minute access token in the `Authorization`
header and a 7-day refresh token in an httpOnly cookie scoped to
`/api/v1/auth`. Passwords are hashed with argon2. Login requires the clinic
slug because email addresses are only unique per tenant.

`POST /auth/demo-login { role }` issues a real session for the seeded demo
tenant — it exists so a portfolio reviewer reaches the product in one click.

Signup and login allow ten attempts a minute per address. When Redis cannot
answer, the limiter keeps counting in the instance's own memory rather than
letting everything through; a shared limit degrades to a local one, not to
none.

## One key per purpose

Four kinds of token exist — the staff access token, the refresh token, the
30-day manage link mailed to a patient, and the short-lived signed hold issued
when Redis is unavailable. Each is signed with its own key, derived by HMAC
from the root secret in `apps/api/src/auth/token-secrets.ts`.

They were once signed with the same secret, and a security review found what
that allowed: `JwtStrategy` accepted any correctly signed token and turned it
into a staff identity, so the manage link in a patient's confirmation email
read the whole clinic's appointments, read the patient registry, and cancelled
other people's bookings. Verified against a running instance before the fix.

Separate keys make the substitution cryptographically impossible rather than
dependent on someone remembering a claim check. As defence in depth,
`JwtStrategy`, the tenant middleware and the realtime gateway all additionally
require a payload that looks like a staff session — a known role, not merely a
valid signature. `apps/api/test/token-scope.spec.ts` holds the line.

The API refuses to start if `JWT_SECRET` or `JWT_REFRESH_SECRET` is missing,
and in production if `WEB_ORIGIN` is missing: without it every confirmation
email would carry a manage link pointing at localhost, and nothing
server-side would notice.

## Columns the client never asks for

`passwordHash` is omitted at the Prisma client level
(`apps/api/src/prisma/private-columns.ts`), so a query has to name it to read
it. `AuthService.login` is the only caller that does. Every user query
reaching a client already passed an explicit `select`, but that is a rule each
new query has to remember; this is the same guarantee without the remembering.

## Tenant isolation

Isolation is enforced at the query layer, not by discipline:

1. A middleware verifies the Bearer token and wraps the request in an
   `AsyncLocalStorage` context carrying `{ tenantId, userId, role }`.
2. A Prisma client extension reads that context for every operation on a
   tenant-owned model: creates get `tenantId` injected, list queries get it
   merged into `where`, and unique lookups get it added as an extra filter —
   Prisma 6 allows non-unique filters in unique where clauses.
3. A scoped query with no tenant context throws instead of returning
   unscoped data.

Cross-tenant ids therefore behave exactly like missing ids: Prisma raises
`P2025` and the exception filter answers **404**. Never 403 — a 403 would
confirm the resource exists.

The auth module and the seed script use the raw client deliberately; they
operate before or across tenant boundaries.

## The enforcement test

`apps/api/test/tenant-isolation.spec.ts` discovers every route registered in
Express and fails if any route is missing from its isolation registry. Adding
an endpoint without classifying its isolation behaviour turns CI red.

A dentist is additionally held to their own schedule: `GET /appointments`
filters to the caller when their role is `dentist`, `PATCH /:id/status`
refuses somebody else's appointment with `NOT_YOUR_APPOINTMENT`, and
`GET /patients/:id` filters the appointment history the same way — otherwise a
colleague's whole book could be read one patient at a time.

## Error contract

Every error response is `{ statusCode, errorCode, message, details?,
requestId }`. Machine-readable codes seen so far: `VALIDATION_ERROR`,
`INVALID_CREDENTIALS`, `SLUG_TAKEN`, `SLOT_CONFLICT`, `NOT_FOUND`,
`FORBIDDEN`, `NOT_YOUR_APPOINTMENT`, `EMAIL_TAKEN`, `HOLD_EXPIRED`,
`INTERNAL`. The `requestId` matches the `x-request-id` response
header and the Sentry event for 5xx responses.
