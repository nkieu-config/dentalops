# W0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed walking skeleton — React web on Vercel calls NestJS `/api/v1/health` on Render — with monorepo tooling, dev databases in Docker, green CI, and Sentry wired, all on free tiers.

**Architecture:** pnpm + Turborepo monorepo with three workspaces this week: `packages/config` (shared tsconfig), `packages/contracts` (Zod schemas shared web↔api), `apps/api` (NestJS), `apps/web` (React 19 + Vite + TanStack Query). Postgres/Mongo/Redis run via docker-compose for later weeks; cloud instances (Neon/Atlas/Upstash) are provisioned now and wired as env vars.

**Tech Stack:** Node 22, pnpm 10, Turborepo 2, TypeScript strict, NestJS 11, React 19, Vite, TanStack Query, Zod, Jest + Supertest (api), Vitest + React Testing Library (web/contracts), ESLint 9 flat config, GitHub Actions, Sentry.

## Global Constraints

- Node >= 22, pnpm 10 via corepack; `packageManager` pinned in root package.json
- TypeScript `strict: true` in every package; typecheck must pass with zero errors
- **No comments in any code file** (project rule — applies to all code the plan produces)
- All UI copy, docs, commit messages in English
- Free tiers only: Vercel Hobby, Render free, Neon free, Atlas M0, Upstash free, Sentry free
- Conventional commit messages (`feat:`, `chore:`, `test:`, `ci:`); no AI attribution trailers
- W0 hard timebox: 4 working days; if a step fights you for >1 hour, note it and move on
- Repo is public on GitHub (required for free unlimited CI)
- API routes live under global prefix `/api/v1`

---

### Task 1: Monorepo scaffold (pnpm + Turborepo)

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.gitignore`, `.nvmrc`, `.env.example`

**Interfaces:**
- Produces: workspace layout `apps/*`, `packages/*`; root scripts `dev/build/lint/typecheck/test` that later tasks' packages plug into via their own scripts of the same names.

- [ ] **Step 1: Enable pnpm and create root package.json**

Run: `corepack enable && corepack prepare pnpm@10.4.1 --activate`

Create `package.json`:

```json
{
  "name": "dentalops",
  "private": true,
  "packageManager": "pnpm@10.4.1",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "lint": "eslint ."
  }
}
```

- [ ] **Step 2: Create workspace + turbo config**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - packages/*
```

Create `turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"] },
    "dev": { "cache": false, "persistent": true }
  }
}
```

- [ ] **Step 3: Create .gitignore, .nvmrc, .env.example**

`.gitignore`:

```
node_modules/
dist/
.turbo/
coverage/
.env
.env.local
*.local
.DS_Store
```

`.nvmrc`:

```
22
```

`.env.example`:

```
DATABASE_URL=postgresql://dentalops:dentalops@localhost:5432/dentalops
MONGODB_URL=mongodb://localhost:27017/dentalops
REDIS_URL=redis://localhost:6379
WEB_ORIGIN=http://localhost:5173
SENTRY_DSN=
VITE_API_URL=http://localhost:3001
VITE_SENTRY_DSN=
```

- [ ] **Step 4: Install turbo and verify the pipeline runs (empty)**

Run: `pnpm add -D -w turbo && pnpm build`
Expected: turbo reports `No tasks were executed as part of this run` (no packages yet) with exit code 0.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json .gitignore .nvmrc .env.example pnpm-lock.yaml
git commit -m "chore: scaffold pnpm + turborepo monorepo"
```

---

### Task 2: Shared TypeScript + ESLint config

**Files:**
- Create: `packages/config/package.json`, `packages/config/tsconfig.base.json`, `eslint.config.mjs`

**Interfaces:**
- Produces: `@dentalops/config/tsconfig.base.json` — every later tsconfig extends it; root `eslint.config.mjs` lints all packages via root `pnpm lint`.

- [ ] **Step 1: Create the config package**

`packages/config/package.json`:

```json
{
  "name": "@dentalops/config",
  "version": "0.0.0",
  "private": true,
  "files": ["tsconfig.base.json"]
}
```

`packages/config/tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "target": "ES2023",
    "lib": ["ES2023"]
  }
}
```

- [ ] **Step 2: Root ESLint flat config**

Run: `pnpm add -D -w eslint typescript typescript-eslint prettier`

Create `.prettierrc`:

```json
{ "semi": false, "printWidth": 100 }
```

Create `eslint.config.mjs`:

```js
import tseslint from "typescript-eslint"

export default tseslint.config(
  { ignores: ["**/dist/**", "**/coverage/**", "**/.turbo/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }]
    }
  }
)
```

- [ ] **Step 3: Verify lint runs clean**

Run: `pnpm lint`
Expected: exit code 0, no errors (nothing to lint yet beyond configs).

- [ ] **Step 4: Commit**

```bash
git add packages/config eslint.config.mjs .prettierrc package.json pnpm-lock.yaml
git commit -m "chore: shared tsconfig base and root eslint flat config"
```

---

### Task 3: `packages/contracts` — first shared Zod schema (TDD)

**Files:**
- Create: `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, `packages/contracts/vitest.config.ts`, `packages/contracts/src/health.ts`, `packages/contracts/src/index.ts`
- Test: `packages/contracts/test/health.test.ts`

**Interfaces:**
- Produces: `healthResponseSchema` (Zod object) and type `HealthResponse = { status: "ok"; version: string; uptimeSeconds: number }` — consumed by Task 4 (api returns it) and Task 5 (web parses it).

- [ ] **Step 1: Package scaffold**

`packages/contracts/package.json`:

```json
{
  "name": "@dentalops/contracts",
  "version": "0.0.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": { "zod": "^4.0.0" },
  "devDependencies": { "typescript": "^5.7.0", "vitest": "^3.0.0" }
}
```

`packages/contracts/tsconfig.json`:

```json
{
  "extends": "../config/tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "declaration": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

`packages/contracts/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: { include: ["test/**/*.test.ts"] }
})
```

Run: `pnpm install`

- [ ] **Step 2: Write the failing test**

`packages/contracts/test/health.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { healthResponseSchema } from "../src/health"

describe("healthResponseSchema", () => {
  it("accepts a valid payload", () => {
    const parsed = healthResponseSchema.safeParse({
      status: "ok",
      version: "0.0.0",
      uptimeSeconds: 12
    })
    expect(parsed.success).toBe(true)
  })

  it("rejects an unknown status", () => {
    const parsed = healthResponseSchema.safeParse({
      status: "down",
      version: "0.0.0",
      uptimeSeconds: 12
    })
    expect(parsed.success).toBe(false)
  })

  it("rejects negative uptime", () => {
    const parsed = healthResponseSchema.safeParse({
      status: "ok",
      version: "0.0.0",
      uptimeSeconds: -1
    })
    expect(parsed.success).toBe(false)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @dentalops/contracts test`
Expected: FAIL — cannot resolve `../src/health`.

- [ ] **Step 4: Implement the schema**

`packages/contracts/src/health.ts`:

```ts
import { z } from "zod"

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative()
})

export type HealthResponse = z.infer<typeof healthResponseSchema>
```

`packages/contracts/src/index.ts`:

```ts
export { healthResponseSchema } from "./health"
export type { HealthResponse } from "./health"
```

- [ ] **Step 5: Run tests and build**

Run: `pnpm --filter @dentalops/contracts test && pnpm --filter @dentalops/contracts build`
Expected: 3 tests PASS; `dist/index.js` and `dist/index.d.ts` exist.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts pnpm-lock.yaml
git commit -m "feat: contracts package with health response schema"
```

---

### Task 4: `apps/api` — NestJS with `/api/v1/health` (TDD)

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/tsconfig.build.json`, `apps/api/nest-cli.json`, `apps/api/jest.config.cjs`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/health/health.controller.ts`
- Test: `apps/api/test/health.e2e-spec.ts`

**Interfaces:**
- Consumes: `HealthResponse`, `healthResponseSchema` from `@dentalops/contracts`.
- Produces: running API on `PORT` (default 3001) with global prefix `api/v1`; CORS allows `WEB_ORIGIN`. Task 5 fetches `GET {api}/api/v1/health`. Task 7 deploys this app.

- [ ] **Step 1: Package scaffold**

`apps/api/package.json`:

```json
{
  "name": "@dentalops/api",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "nest start --watch",
    "build": "nest build",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "jest",
    "start": "node dist/main.js"
  },
  "dependencies": {
    "@dentalops/contracts": "workspace:*",
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/testing": "^11.0.0",
    "@types/jest": "^29.5.0",
    "@types/supertest": "^6.0.0",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.0",
    "typescript": "^5.7.0"
  }
}
```

`apps/api/tsconfig.json`:

```json
{
  "extends": "../../packages/config/tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "outDir": "dist"
  },
  "include": ["src", "test"]
}
```

`apps/api/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "include": ["src"]
}
```

`apps/api/nest-cli.json`:

```json
{
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": { "tsConfigPath": "tsconfig.build.json", "deleteOutDir": true }
}
```

`apps/api/jest.config.cjs`:

```js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/**/*.e2e-spec.ts", "<rootDir>/src/**/*.spec.ts"]
}
```

Run: `pnpm install`

- [ ] **Step 2: Write the failing test**

`apps/api/test/health.e2e-spec.ts`:

```ts
import { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { healthResponseSchema } from "@dentalops/contracts"
import { AppModule } from "../src/app.module"

describe("GET /health", () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it("returns a payload matching the shared contract", async () => {
    const res = await request(app.getHttpServer()).get("/health").expect(200)
    expect(healthResponseSchema.safeParse(res.body).success).toBe(true)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @dentalops/api test`
Expected: FAIL — cannot resolve `../src/app.module`.

- [ ] **Step 4: Implement module, controller, bootstrap**

`apps/api/src/health/health.controller.ts`:

```ts
import { Controller, Get } from "@nestjs/common"
import type { HealthResponse } from "@dentalops/contracts"

const startedAt = Date.now()

@Controller("health")
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return {
      status: "ok",
      version: process.env.APP_VERSION ?? "0.0.0",
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000)
    }
  }
}
```

`apps/api/src/app.module.ts`:

```ts
import { Module } from "@nestjs/common"
import { HealthController } from "./health/health.controller"

@Module({ controllers: [HealthController] })
export class AppModule {}
```

`apps/api/src/main.ts`:

```ts
import { NestFactory } from "@nestjs/core"
import { AppModule } from "./app.module"

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.setGlobalPrefix("api/v1")
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173" })
  await app.listen(process.env.PORT ?? 3001)
}

void bootstrap()
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @dentalops/api test`
Expected: PASS (1 test).

- [ ] **Step 6: Boot the server and hit it manually**

Run: `pnpm --filter @dentalops/api build && pnpm --filter @dentalops/api start &` then `curl -s http://localhost:3001/api/v1/health`
Expected: `{"status":"ok","version":"0.0.0","uptimeSeconds":0}` (uptime may vary). Stop the server afterwards.

- [ ] **Step 7: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat: nestjs api with health endpoint under /api/v1"
```

---

### Task 5: `apps/web` — React 19 + Vite + TanStack Query (TDD)

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/vite-env.d.ts`, `apps/web/vitest.setup.ts`
- Test: `apps/web/src/App.test.tsx`

**Interfaces:**
- Consumes: `healthResponseSchema` from `@dentalops/contracts`; `GET {VITE_API_URL}/api/v1/health` from Task 4.
- Produces: `App` component rendering API health; Vercel deploys this app in Task 7.

- [ ] **Step 1: Package scaffold**

`apps/web/package.json`:

```json
{
  "name": "@dentalops/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@dentalops/contracts": "workspace:*",
    "@tanstack/react-query": "^5.60.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.1.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

`apps/web/tsconfig.json`:

```json
{
  "extends": "../../packages/config/tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts", "vitest.setup.ts"]
}
```

`apps/web/vite.config.ts`:

```ts
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { include: ["@dentalops/contracts"] },
  build: { commonjsOptions: { include: [/packages\/contracts/, /node_modules/] } },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"]
  }
})
```

`apps/web/vitest.setup.ts`:

```ts
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

afterEach(() => {
  cleanup()
})
```

`apps/web/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

`apps/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DentalOps</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Run: `pnpm install`

- [ ] **Step 2: Write the failing test**

`apps/web/src/App.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import { App } from "./App"

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok", version: "0.0.0", uptimeSeconds: 42 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    )
  )
})

it("renders API health once loaded", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  )
  expect(await screen.findByText(/API ok/)).toBeDefined()
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @dentalops/web test`
Expected: FAIL — cannot resolve `./App`.

- [ ] **Step 4: Implement App and entrypoint**

`apps/web/src/App.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query"
import { healthResponseSchema } from "@dentalops/contracts"

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001"

async function fetchHealth() {
  const res = await fetch(`${apiUrl}/api/v1/health`)
  if (!res.ok) throw new Error(`API responded ${res.status}`)
  return healthResponseSchema.parse(await res.json())
}

export function App() {
  const { data, isPending, isError } = useQuery({ queryKey: ["health"], queryFn: fetchHealth })

  if (isPending) return <p>Checking API…</p>
  if (isError) return <p>API unreachable</p>
  return (
    <p>
      API {data.status} — v{data.version}, up {data.uptimeSeconds}s
    </p>
  )
}
```

`apps/web/src/main.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"

const client = new QueryClient()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  </StrictMode>
)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @dentalops/web test`
Expected: PASS (1 test).

- [ ] **Step 6: Verify end-to-end locally**

Run api (`pnpm --filter @dentalops/api dev`) and web (`pnpm --filter @dentalops/web dev`) in two terminals; open `http://localhost:5173`.
Expected: page shows `API ok — v0.0.0, up Ns`.

- [ ] **Step 7: Run the full root pipeline**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all green across contracts, api, web.

- [ ] **Step 8: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat: react web app rendering api health via shared contract"
```

---

### Task 6: docker-compose for dev databases

**Files:**
- Create: `docker-compose.yml`

**Interfaces:**
- Produces: Postgres 16 on 5432 (user/pass/db `dentalops`), Mongo 7 on 27017, Redis 7 on 6379 — matching `.env.example` URLs. W1+ plans connect to these.

- [ ] **Step 1: Create docker-compose.yml**

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: dentalops
      POSTGRES_PASSWORD: dentalops
      POSTGRES_DB: dentalops
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dentalops"]
      interval: 5s
      timeout: 3s
      retries: 10
    volumes:
      - pgdata:/var/lib/postgresql/data
  mongo:
    image: mongo:7
    ports:
      - "27017:27017"
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.runCommand({ ping: 1 })"]
      interval: 5s
      timeout: 3s
      retries: 10
    volumes:
      - mongodata:/data/db
  redis:
    image: redis:7
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10
volumes:
  pgdata:
  mongodata:
```

- [ ] **Step 2: Verify all three services become healthy**

Run: `docker compose up -d && sleep 15 && docker compose ps`
Expected: all three services show `healthy`.

Run: `docker compose exec postgres pg_isready -U dentalops && docker compose exec redis redis-cli ping`
Expected: `accepting connections` and `PONG`.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: docker compose with postgres, mongo, redis for dev"
```

---

### Task 7: GitHub repo + CI pipeline

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: public GitHub repo with branch protection on `main`; CI (lint → typecheck → test → build) required on every PR. Later plans append integration/e2e jobs to this file.

- [ ] **Step 1: Create the workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

- [ ] **Step 2: Create the public repo and push**

Run:

```bash
gh repo create dentalops --public --source=. --push
```

Expected: repo visible on GitHub, Actions tab shows the CI run turning green.

- [ ] **Step 3: Protect main**

Run:

```bash
gh api -X PUT "repos/{owner}/dentalops/branches/main/protection" \
  -F "required_status_checks[strict]=true" \
  -F "required_status_checks[contexts][]=ci" \
  -F "enforce_admins=false" \
  -F "required_pull_request_reviews=null" \
  -F "restrictions=null"
```

Expected: pushing directly to main is still allowed for you, but CI status is required on PRs. (If the API shape fights you, set it in repo Settings → Branches instead — do not burn more than 15 minutes here.)

- [ ] **Step 4: Commit marker**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: lint, typecheck, test, build on every push and pr"
git push
```

---

### Task 8: Cloud provisioning + walking-skeleton deploy

Manual dashboard work — no code files except one Render config. Record every secret in a local password manager or untracked `.env.production.notes`; never commit secrets.

**Interfaces:**
- Produces: live URLs `https://<app>.vercel.app` and `https://<service>.onrender.com`; env vars `DATABASE_URL` (Neon), `MONGODB_URL` (Atlas), `REDIS_URL` (Upstash) stored on Render for W1+ use.

- [ ] **Step 1: Provision the three data stores (free tiers)**

1. **Neon**: create project `dentalops` (region: Singapore) → copy pooled connection string.
2. **MongoDB Atlas**: create M0 cluster (region: Singapore) → create db user → allow access from `0.0.0.0/0` → copy connection string.
3. **Upstash**: create Redis database (region: Singapore) → copy `rediss://` URL.

Expected: three connection strings recorded locally.

- [ ] **Step 2: Deploy api to Render**

Create `render.yaml` in repo root:

```yaml
services:
  - type: web
    name: dentalops-api
    runtime: node
    plan: free
    buildCommand: corepack enable && pnpm install --frozen-lockfile && pnpm turbo run build --filter=@dentalops/api
    startCommand: node apps/api/dist/main.js
    healthCheckPath: /api/v1/health
    envVars:
      - key: NODE_VERSION
        value: "22"
      - key: WEB_ORIGIN
        sync: false
      - key: DATABASE_URL
        sync: false
      - key: MONGODB_URL
        sync: false
      - key: REDIS_URL
        sync: false
```

In the Render dashboard: New → Blueprint → connect the GitHub repo → set the four `sync: false` env values (`WEB_ORIGIN` = your Vercel URL once known; the three connection strings from Step 1).

Run after deploy completes: `curl -s https://<service>.onrender.com/api/v1/health`
Expected: `{"status":"ok",...}`

- [ ] **Step 3: Deploy web to Vercel**

Vercel dashboard: Add New Project → import the repo → Root Directory `apps/web` → Framework Vite → env var `VITE_API_URL=https://<service>.onrender.com` → Deploy.

Then update `WEB_ORIGIN` on Render to `https://<app>.vercel.app` and redeploy the api.

Open `https://<app>.vercel.app`.
Expected: `API ok — v0.0.0, up Ns` — the walking skeleton is live end-to-end.

- [ ] **Step 4: Keep-alive ping**

UptimeRobot (free): add HTTP monitor on `https://<service>.onrender.com/api/v1/health`, interval 5 minutes.
Expected: monitor shows Up.

- [ ] **Step 5: Commit**

```bash
git add render.yaml
git commit -m "chore: render blueprint for api deploy"
git push
```

---

### Task 9: Sentry on both apps

**Files:**
- Create: `apps/api/src/instrument.ts`
- Modify: `apps/api/src/main.ts`, `apps/web/src/main.tsx`

**Interfaces:**
- Consumes: `SENTRY_DSN` (api) and `VITE_SENTRY_DSN` (web) env vars.
- Produces: unhandled errors in either app appear in Sentry; later weeks rely on this being in place from day one.

- [ ] **Step 1: Create a Sentry account + two projects**

sentry.io free tier → create org → project `dentalops-api` (Node) and `dentalops-web` (React) → copy both DSNs. Add `SENTRY_DSN` to Render env; `VITE_SENTRY_DSN` to Vercel env; both into local `.env`.

- [ ] **Step 2: Install and wire the api**

Run: `pnpm --filter @dentalops/api add @sentry/nestjs`

Use `@sentry/nestjs`, not `@sentry/node`. Nest's exception layer handles controller throws before they reach Express, so a plain `@sentry/node` init captures process-level crashes but silently misses every HTTP 500 from a controller. Registering `SentryGlobalFilter` as `APP_FILTER` is what actually reports them — `SentryModule.forRoot()` alone is not sufficient.

`apps/api/src/instrument.ts`:

```ts
import * as Sentry from "@sentry/nestjs"

if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 })
}
```

`apps/api/src/app.module.ts`:

```ts
import { Module } from "@nestjs/common"
import { APP_FILTER } from "@nestjs/core"
import { SentryGlobalFilter, SentryModule } from "@sentry/nestjs/setup"
import { HealthController } from "./health/health.controller"

@Module({
  imports: [SentryModule.forRoot()],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: SentryGlobalFilter }]
})
export class AppModule {}
```

Modify `apps/api/src/main.ts` — add as the first line:

```ts
import "./instrument"
import { NestFactory } from "@nestjs/core"
import { AppModule } from "./app.module"

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.setGlobalPrefix("api/v1")
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173" })
  await app.listen(process.env.PORT ?? 3001)
}

void bootstrap()
```

- [ ] **Step 3: Install and wire the web**

Run: `pnpm --filter @dentalops/web add @sentry/react`

Modify `apps/web/src/main.tsx` — add before `createRoot`:

```tsx
import * as Sentry from "@sentry/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN })
}

const client = new QueryClient()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  </StrictMode>
)
```

- [ ] **Step 4: Verify an event reaches Sentry**

Temporarily run locally with `SENTRY_DSN` set and add `throw new Error("sentry smoke test")` inside `getHealth`, hit the endpoint once, then **revert the throw**.
Expected: the event appears in the `dentalops-api` Sentry project within a minute.

- [ ] **Step 5: Verify pipeline still green, then commit and push**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all green.

```bash
git add apps/api apps/web pnpm-lock.yaml
git commit -m "feat: sentry error tracking on api and web"
git push
```

---

### Task 10: README skeleton

**Files:**
- Create: `README.md`

**Interfaces:**
- Produces: the README shell that W8 expands; CI badge proves the pipeline publicly from week zero.

- [ ] **Step 1: Write README.md**

```markdown
# DentalOps

![CI](https://github.com/<owner>/dentalops/actions/workflows/ci.yml/badge.svg)

Multi-tenant appointment and roster management for dental clinics.
Live demo: https://<app>.vercel.app

## Status

Week 0 of 8 — walking skeleton deployed. See
[docs/superpowers/specs/dentalops-design.md](docs/superpowers/specs/dentalops-design.md)
for the full design.

## Development

    corepack enable
    pnpm install
    docker compose up -d
    pnpm dev

Web: http://localhost:5173 — API: http://localhost:3001/api/v1/health

## Monorepo

    apps/web              React 19 + Vite + TanStack Query
    apps/api              NestJS
    packages/contracts    Zod schemas shared web/api
    packages/config       shared tsconfig
```

Replace `<owner>` and `<app>` with real values.

- [ ] **Step 2: Commit and push**

```bash
git add README.md
git commit -m "docs: readme skeleton with ci badge and quickstart"
git push
```

Expected final state: GitHub shows a green badge; the Vercel URL renders live API health. **W0 exit criteria met.**
