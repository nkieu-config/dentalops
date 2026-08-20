# Local setup

The three commands that get a working clinic — `pnpm setup`, `pnpm demo:seed`, `pnpm dev` — are in
the README. This covers everything after that.

`pnpm setup` writes `apps/api/.env` and `apps/web/.env` from the `.env.example` beside each —
every API command runs with `apps/api` as its working directory, so Prisma and Nest read from
there, and Vite reads from the package holding `vite.config.ts`. A root `.env` is read by nothing.

## Infrastructure

```bash
pnpm infra:up      # Postgres, Redis, MongoDB, Mailpit — waits for health
pnpm infra:down
pnpm infra:logs
```

`pnpm dev` calls `infra:up` itself. Stopping it leaves Docker volumes intact.

## Demo data

```bash
pnpm demo:seed   # replace the demo tenant
pnpm db:reset    # drop all local data, re-migrate, re-seed
```

Both ask for confirmation before running.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @dentalops/web e2e
```

## Local email

`SMTP_URL` set → sends through SMTP; unset → logs structured messages. Docker Compose starts
Mailpit, so rendered emails are at http://localhost:8026 either way.
