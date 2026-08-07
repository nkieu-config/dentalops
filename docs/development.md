# Local development

## Prerequisites

Use Node 22, pnpm 10, and Docker.

## First run

```bash
pnpm setup
pnpm demo:seed
pnpm dev
```

The web app runs at http://localhost:5173. API health is at http://localhost:3001/api/v1/health and Swagger is at http://localhost:3001/api/docs outside production.

## Daily infrastructure

```bash
pnpm infra:up
pnpm infra:logs
pnpm infra:down
```

The development command waits for Postgres, Redis, and MongoDB health, then starts the API and web app. Stopping it leaves Docker services and their named volumes running.

## Demo data and reset safety

```bash
pnpm demo:seed
pnpm db:reset
```

Both commands ask before recreating data. `pnpm db:reset` deletes all local Prisma data before reseeding; never point it at a database you care about.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @dentalops/web e2e
```

## Local email

MailTransport sends through SMTP when SMTP_URL is set and logs structured messages otherwise. Docker Compose starts Mailpit, so rendered local messages are available at http://localhost:8026 without a paid provider. The queue, retry policy, and worker remain the same in both modes.
