# Hybrid Local Development Design

**Date:** 2026-08-06

## Goal

Make the daily local-development workflow a single `pnpm dev` command while preserving fast native
hot reload for the NestJS API and Vite web app. Docker Compose remains responsible only for stateful
infrastructure.

## Decision

Use a hybrid local environment:

```text
pnpm dev
  ├─ docker compose up -d --wait
  └─ turbo run dev --filter=@dentalops/api --filter=@dentalops/web
       ├─ NestJS watch mode on :3001
       └─ Vite dev server on :5173

Docker Compose
  ├─ Postgres :5432
  ├─ MongoDB :27017
  ├─ Redis :6379
  └─ Mailpit SMTP :1026 / UI :8026
```

`docker compose up -d --wait` is idempotent: it creates missing containers, starts stopped
containers, and waits for the existing Postgres, MongoDB and Redis health checks. It does not rebuild
application code and remains running after the developer stops `pnpm dev`.

## Command contract

| Command | Responsibility | Must not do |
|---|---|---|
| `pnpm setup` | Install dependencies, copy `.env.example` only when `.env` is absent, generate Prisma client, start healthy infrastructure, apply migrations and seed the demo tenant | Reset or overwrite an existing database |
| `pnpm dev` | Ensure healthy Docker infrastructure, then run only API and web watch processes | Run migrations, seed data, reset data or stop containers on exit |
| `pnpm infra:up` | Start and wait for infrastructure | Run Node applications or mutate database schema/data |
| `pnpm infra:down` | Stop infrastructure while retaining named volumes | Delete volumes or source files |
| `pnpm infra:logs` | Follow Compose service logs | Start application processes |
| `pnpm db:reset` | Explicitly reset the local Prisma database and reseed demo data after confirmation | Be called by another daily command |

`pnpm setup` is for first use and for a freshly cloned environment. A developer who pulls a migration
later uses `pnpm --filter @dentalops/api db:deploy` explicitly; `pnpm dev` stays non-mutating.

## Implementation boundaries

- Root `package.json` owns developer-facing orchestration commands.
- `docker-compose.yml` continues to own only Postgres, MongoDB, Redis and Mailpit; it will not gain
  API or web services, bind mounts, or Node dependencies.
- `turbo.json` continues to own persistent `dev` tasks. The root command filters Turbo to the two
  applications so package tasks cannot unexpectedly become long-running processes.
- `.env.example` stays the canonical local connection configuration. The setup helper may create
  `.env` only if it does not already exist and must never replace existing secrets.
- README becomes the single onboarding path and explains the first-run versus daily commands.

## Failure behaviour

- If Docker Desktop or the Compose plugin is unavailable, `pnpm infra:up`, `pnpm setup` and `pnpm dev`
  fail before starting Node processes with an actionable message.
- If a health check does not become healthy, the command exits non-zero and leaves containers available
  for `pnpm infra:logs`; it does not start API or web against partial infrastructure.
- If `.env` is absent during `pnpm dev`, the command fails with instructions to run `pnpm setup` rather
  than silently inventing credentials.
- Ctrl-C stops Turbo's API/web children. It deliberately leaves Docker infrastructure running, avoiding
  database teardown between edit cycles.

## Validation

1. From a clean clone with Docker available, `pnpm setup` produces a generated Prisma client, migrated
   and seeded local database, healthy services, and a usable `.env`.
2. `pnpm dev` starts from stopped infrastructure, waits for health checks, and serves API `:3001` and web
   `:5173`.
3. Running `pnpm dev` again while infrastructure is already healthy does not reset data or create
   duplicate containers.
4. With Docker unavailable, `pnpm dev` exits before Turbo starts and identifies the recovery command.
5. `pnpm infra:down` preserves named volumes; `pnpm db:reset` is the only documented destructive local
   data workflow.

## Rejected alternatives

- **All services in Docker Compose:** this improves host setup isolation but makes Vite/Nest filesystem
  watching and interactive debugging less direct, especially on macOS. It is unnecessary because this
  project already has a production Docker image and CI container test.
- **Always run `docker compose up -d` manually:** correct but leaves daily onboarding as three commands
  and does not use the health checks already present in the Compose file.
- **Run migrations and seed on every `pnpm dev`:** convenient only until it mutates a developer's test
  data during an ordinary edit cycle.
