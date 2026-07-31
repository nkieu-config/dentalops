# Security model

## Authentication

Staff authenticate with JWT: a 15-minute access token in the `Authorization`
header and a 7-day refresh token in an httpOnly cookie scoped to
`/api/v1/auth`. Passwords are hashed with argon2. Login requires the clinic
slug because email addresses are only unique per tenant.

`POST /auth/demo-login { role }` issues a real session for the seeded demo
tenant — it exists so a portfolio reviewer reaches the product in one click.

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

## Error contract

Every error response is `{ statusCode, errorCode, message, details?,
requestId }`. Machine-readable codes seen so far: `VALIDATION_ERROR`,
`INVALID_CREDENTIALS`, `SLUG_TAKEN`, `SLOT_CONFLICT`, `NOT_FOUND`,
`FORBIDDEN`, `INTERNAL`. The `requestId` matches the `x-request-id` response
header and the Sentry event for 5xx responses.
