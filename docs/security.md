# Security model

## Authentication

Staff authenticate with JWT: a 15-minute access token in `Authorization`, a 7-day refresh token
in an httpOnly cookie scoped to `/api/v1/auth`. Passwords hash with argon2. Login requires the
clinic slug because email is only unique per tenant.

`POST /auth/demo-login { role }` issues a real session for the seeded demo tenant, so a reviewer
reaches the product in one click.

Signup and login allow ten attempts a minute per address. When Redis cannot answer, the limiter
counts in the instance's own memory instead of letting everything through — a shared limit
degrades to a local one, not to none.

## One key per purpose

Four token kinds exist — staff access, refresh, the 30-day patient manage link, and the
short-lived signed hold issued when Redis is down. Each is signed with its own key, derived by
HMAC from the root secret (`apps/api/src/auth/token-secrets.ts`).

They were once signed with the same secret. A security review found what that allowed:
`JwtStrategy` accepted any correctly signed token and turned it into a staff identity, so the
manage link in a patient's confirmation email could read the whole clinic's appointments, read the
patient registry, and cancel other people's bookings — verified against a running instance before
the fix.

Separate keys make the substitution cryptographically impossible rather than dependent on someone
remembering a claim check. As defence in depth, `JwtStrategy`, the tenant middleware, and the
realtime gateway all additionally require a payload that looks like a staff session — a known
role, not merely a valid signature. `apps/api/test/token-scope.spec.ts` holds the line.

The API refuses to start if `JWT_SECRET`, `JWT_REFRESH_SECRET`, or (in production) `WEB_ORIGIN` is
missing — without the last one, every confirmation email would carry a manage link pointing at
localhost, silently.

## Columns the client never asks for

`passwordHash` is omitted at the Prisma client level (`apps/api/src/prisma/private-columns.ts`),
so a query has to name it to read it. Only `AuthService.login` does. Every user query already
passes an explicit `select`, but that is a rule each new query has to remember; this is the same
guarantee without the remembering.

## Tenant isolation

Enforced at the query layer, not by discipline:

1. Middleware verifies the Bearer token and wraps the request in an `AsyncLocalStorage` context:
   `{ tenantId, userId, role }`.
2. A Prisma extension reads that context for every operation on a tenant-owned model — creates get
   `tenantId` injected, list queries get it merged into `where`, unique lookups get it added as an
   extra filter.
3. A scoped query with no tenant context throws instead of returning unscoped data.

Cross-tenant ids behave like missing ids: Prisma raises `P2025`, the exception filter answers
**404**, never 403 — a 403 would confirm the resource exists.

`apps/api/test/tenant-isolation.spec.ts` discovers every route registered in Express and fails if
any is missing from its isolation registry.

A dentist is additionally held to their own schedule: `GET /appointments` filters to the caller
when their role is `dentist`, `PATCH /:id/status` refuses somebody else's appointment with
`NOT_YOUR_APPOINTMENT`, and `GET /patients/:id` filters appointment history the same way.

## Error contract

Every error response is `{ statusCode, errorCode, message, details?, requestId }`. About thirty
`errorCode` values exist — grep `AppException(` in `apps/api/src` for the current set. The web
client branches on `SLOT_CONFLICT`, `SLOT_HELD`, `STALE_VERSION`, `SERIES_CONFLICT`,
`HOLD_EXPIRED`, `INVALID_CREDENTIALS`, `NOT_FOUND`; everything else reaches the user as its
message. `requestId` matches the `x-request-id` header and the Sentry event for 5xx responses.
