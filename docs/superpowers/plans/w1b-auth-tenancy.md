# W1b Auth & Tenant Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff authentication (signup / login / refresh / demo-login) and tenant isolation enforced at the Prisma query layer, proven by an isolation test that automatically covers every registered route — plus the API-wide error contract and Swagger, since endpoints start existing this week.

**Architecture:** A hand-rolled `AsyncLocalStorage` carries `{ tenantId, userId, role }` per request. A single Prisma client extension reads it at query time and injects the tenant filter into every operation on tenant-owned models — services cannot forget it because they never write it. Cross-tenant lookups surface as Prisma `P2025`, which the global exception filter maps to 404, so an outsider cannot distinguish "not yours" from "does not exist". Auth is Passport JWT (access token in the `Authorization` header, refresh token in an httpOnly cookie). One global exception filter owns the error contract `{ statusCode, errorCode, message, details?, requestId }` and reports unexpected errors to Sentry itself.

**Tech Stack:** @nestjs/passport + passport-jwt + @nestjs/jwt, argon2, cookie-parser, class-validator/class-transformer, @nestjs/swagger, AsyncLocalStorage (node:async_hooks), Prisma client extensions.

## Global Constraints

- Node >= 22, pnpm 10; plain `pnpm` works — never run `corepack enable` (EACCES on this machine)
- Prisma stays pinned `^6` (6.19.3); migrations touching `during` tables use `--create-only` → hand-edit → `migrate deploy` (never bare `migrate dev` — interactive drift prompt). This plan adds **no** migrations.
- TypeScript strict; **no comments in any code file** (project rule)
- Conventional commits; **no trailers of any kind** (no Co-Authored-By)
- Never read, print, or commit any `.env`; new secrets go into `.env.example` as placeholders only
- Integration tests run against the real local Postgres (docker compose); Jest picks up `apps/api/test/**/*.spec.ts`
- API error responses always match the shared `apiErrorSchema` contract — no raw Nest error bodies escape
- Cross-tenant access must return **404, never 403** — a 403 confirms the resource exists
- Push to `origin main` after each task; report the CI conclusion

---

### Task 1: Error contract, request IDs, validation, and Swagger

**Files:**
- Create: `packages/contracts/src/error.ts`, `apps/api/src/common/request-id.middleware.ts`, `apps/api/src/common/app.exception.ts`, `apps/api/src/common/app-exception.filter.ts`
- Modify: `packages/contracts/src/index.ts`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`
- Test: `apps/api/test/error-contract.spec.ts`

**Interfaces:**
- Produces: `apiErrorSchema` / `ApiError` in `@dentalops/contracts`; `AppException(status, errorCode, message, details?)`; global `AppExceptionFilter` mapping — `AppException` → its own code, class-validator 400 → `VALIDATION_ERROR`, Postgres exclusion violation → `409 SLOT_CONFLICT` with `details.constraint`, Prisma `P2025` → `404 NOT_FOUND`, anything else → `500 INTERNAL` + `Sentry.captureException`. Every later endpoint relies on this filter; the web app parses `ApiError`.

- [ ] **Step 1: Install dependencies**

```bash
pnpm --filter @dentalops/api add @nestjs/swagger cookie-parser class-validator class-transformer
pnpm --filter @dentalops/api add -D @types/cookie-parser @types/express
```

`@types/express` is needed as a direct dev dependency: several files from here on `import type { Request, Response } from "express"`, and under pnpm's strict `node_modules` the transitive types from `@nestjs/platform-express` are not visible to the api package.

- [ ] **Step 2: Add the error contract to `packages/contracts`**

`packages/contracts/src/error.ts`:

```ts
import { z } from "zod"

export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  errorCode: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  requestId: z.string()
})

export type ApiError = z.infer<typeof apiErrorSchema>
```

Append to `packages/contracts/src/index.ts`:

```ts
export { apiErrorSchema } from "./error"
export type { ApiError } from "./error"
```

- [ ] **Step 3: Request-id middleware**

`apps/api/src/common/request-id.middleware.ts`:

```ts
import { randomUUID } from "node:crypto"
import { Injectable, NestMiddleware } from "@nestjs/common"
import type { NextFunction, Request, Response } from "express"

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request & { id?: string }, res: Response, next: NextFunction) {
    req.id = randomUUID()
    res.setHeader("x-request-id", req.id)
    next()
  }
}
```

- [ ] **Step 4: AppException and the global filter**

`apps/api/src/common/app.exception.ts`:

```ts
import { HttpException } from "@nestjs/common"

export class AppException extends HttpException {
  constructor(status: number, errorCode: string, message: string, details?: unknown) {
    super({ message, errorCode, details }, status)
  }
}
```

`apps/api/src/common/app-exception.filter.ts`:

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from "@nestjs/common"
import { Prisma } from "@prisma/client"
import * as Sentry from "@sentry/nestjs"
import type { Request, Response } from "express"

const ERROR_CODE_BY_STATUS: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "RATE_LIMITED"
}

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const res = ctx.getResponse<Response>()
    const req = ctx.getRequest<Request & { id?: string }>()
    const requestId = req.id ?? "unknown"

    const exclusion =
      exception instanceof Error ? exception.message.match(/exclusion constraint "(\w+)"/) : null
    if (exclusion) {
      return res.status(409).json({
        statusCode: 409,
        errorCode: "SLOT_CONFLICT",
        message: "The requested time conflicts with an existing booking",
        details: { constraint: exclusion[1] },
        requestId
      })
    }

    if (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      exception.code === "P2025"
    ) {
      return res.status(404).json({
        statusCode: 404,
        errorCode: "NOT_FOUND",
        message: "Resource not found",
        requestId
      })
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const body = exception.getResponse() as
        | string
        | { message?: string | string[]; errorCode?: string; details?: unknown }
      const rawMessage =
        typeof body === "string" ? body : (body.message ?? exception.message)
      const isValidation = status === 400 && Array.isArray(rawMessage)
      return res.status(status).json({
        statusCode: status,
        errorCode:
          typeof body === "object" && body.errorCode
            ? body.errorCode
            : isValidation
              ? "VALIDATION_ERROR"
              : (ERROR_CODE_BY_STATUS[status] ?? "HTTP_ERROR"),
        message: Array.isArray(rawMessage) ? rawMessage.join("; ") : String(rawMessage),
        details: typeof body === "object" ? body.details : undefined,
        requestId
      })
    }

    Sentry.captureException(exception)
    return res.status(500).json({
      statusCode: 500,
      errorCode: "INTERNAL",
      message: "Internal server error",
      requestId
    })
  }
}
```

- [ ] **Step 5: Wire everything in `app.module.ts` and `main.ts`**

`apps/api/src/app.module.ts` — the filter **replaces** `SentryGlobalFilter` (a single catch-all owns the contract; it reports to Sentry itself, which the previous filter can no longer do because ours would swallow everything first):

```ts
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common"
import { APP_FILTER } from "@nestjs/core"
import { SentryModule } from "@sentry/nestjs/setup"
import { AppExceptionFilter } from "./common/app-exception.filter"
import { RequestIdMiddleware } from "./common/request-id.middleware"
import { HealthController } from "./health/health.controller"
import { PrismaModule } from "./prisma/prisma.module"

@Module({
  imports: [SentryModule.forRoot(), PrismaModule],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: AppExceptionFilter }]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes("*")
  }
}
```

`apps/api/src/main.ts`:

```ts
import "./instrument"
import { ValidationPipe } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger"
import cookieParser from "cookie-parser"
import { AppModule } from "./app.module"

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.setGlobalPrefix("api/v1")
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173", credentials: true })
  app.use(cookieParser())
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))

  const swaggerConfig = new DocumentBuilder()
    .setTitle("DentalOps API")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build()
  SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, swaggerConfig))

  await app.listen(process.env.PORT ?? 3001)
}

void bootstrap()
```

Note `credentials: true` on CORS — the refresh cookie needs it in Task 3.

- [ ] **Step 6: Write the contract test**

`apps/api/test/error-contract.spec.ts`:

```ts
import { Controller, Get, INestApplication, Post, ValidationPipe } from "@nestjs/common"
import { APP_FILTER } from "@nestjs/core"
import { Test } from "@nestjs/testing"
import { IsInt, Min } from "class-validator"
import request from "supertest"
import { apiErrorSchema } from "@dentalops/contracts"
import { AppException } from "../src/common/app.exception"
import { AppExceptionFilter } from "../src/common/app-exception.filter"
import { RequestIdMiddleware } from "../src/common/request-id.middleware"

class DemoDto {
  @IsInt()
  @Min(1)
  quantity!: number
}

@Controller("boom")
class BoomController {
  @Get("app")
  app() {
    throw new AppException(409, "SLOT_TAKEN", "Someone got there first", { slot: "10:00" })
  }

  @Get("crash")
  crash() {
    throw new Error("unexpected")
  }

  @Post("validate")
  validate() {
    return { ok: true }
  }
}

describe("error contract", () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BoomController],
      providers: [{ provide: APP_FILTER, useClass: AppExceptionFilter }]
    }).compile()
    app = moduleRef.createNestApplication()
    app.use(new RequestIdMiddleware().use.bind(new RequestIdMiddleware()))
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it("formats AppException with its errorCode and details", async () => {
    const res = await request(app.getHttpServer()).get("/boom/app").expect(409)
    const parsed = apiErrorSchema.parse(res.body)
    expect(parsed.errorCode).toBe("SLOT_TAKEN")
    expect(parsed.details).toEqual({ slot: "10:00" })
    expect(res.headers["x-request-id"]).toBe(parsed.requestId)
  })

  it("formats validation failures as VALIDATION_ERROR", async () => {
    const res = await request(app.getHttpServer())
      .post("/boom/validate")
      .send({ quantity: 0 })
      .expect(400)
    const parsed = apiErrorSchema.parse(res.body)
    expect(parsed.errorCode).toBe("VALIDATION_ERROR")
  })

  it("hides unexpected errors behind INTERNAL", async () => {
    const res = await request(app.getHttpServer()).get("/boom/crash").expect(500)
    const parsed = apiErrorSchema.parse(res.body)
    expect(parsed.errorCode).toBe("INTERNAL")
    expect(parsed.message).not.toContain("unexpected")
  })
})
```

The validate route needs its body typed: change the `validate` method signature to accept the DTO —

```ts
  @Post("validate")
  validate(@Body() dto: DemoDto) {
    return { ok: true, quantity: dto.quantity }
  }
```

and add `Body` to the `@nestjs/common` import in the test file.

- [ ] **Step 7: Run tests, then the full pipeline**

Run: `pnpm --filter @dentalops/api test -- error-contract`
Expected: 3 tests PASS.

Run: `pnpm --filter @dentalops/contracts build && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all green (12 api tests).

- [ ] **Step 8: Commit and push**

```bash
git add packages/contracts apps/api pnpm-lock.yaml
git commit -m "feat: api error contract with request ids, validation, and swagger"
git push
```

---

### Task 2: Tenant context and the Prisma tenant extension

**Files:**
- Create: `apps/api/src/tenant/tenant-context.ts`, `apps/api/src/prisma/tenant.extension.ts`
- Modify: `apps/api/src/prisma/prisma.service.ts`
- Test: `apps/api/test/tenant-extension.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` from W1a.
- Produces: `tenantContext` (AsyncLocalStorage), `currentTenant()` returning `{ tenantId, userId, role } | undefined`, and `prisma.scoped` — the extended client every service must use for tenant-owned data. The raw client (`prisma.<model>`) remains for the auth module only, which queries across tenants by design.

- [ ] **Step 1: The context**

`apps/api/src/tenant/tenant-context.ts`:

```ts
import { AsyncLocalStorage } from "node:async_hooks"

export interface TenantContextData {
  tenantId: string
  userId: string
  role: string
}

export const tenantContext = new AsyncLocalStorage<TenantContextData>()

export function currentTenant(): TenantContextData | undefined {
  return tenantContext.getStore()
}
```

- [ ] **Step 2: The extension**

Prisma 6 accepts additional non-unique filters in `findUnique` / `update` / `delete` where clauses, so merging `tenantId` into unique lookups is native — a cross-tenant id then behaves exactly like a missing id (`P2025` → the filter's 404).

`apps/api/src/prisma/tenant.extension.ts`:

```ts
import { Prisma } from "@prisma/client"
import { currentTenant } from "../tenant/tenant-context"

const TENANT_MODELS = new Set([
  "User",
  "Branch",
  "Service",
  "EquipmentType",
  "Resource",
  "ServiceEquipmentRequirement",
  "Patient",
  "ShiftSeries",
  "Shift",
  "TimeBlock",
  "AppointmentSeries",
  "Appointment",
  "ResourceClaim"
])

const LIST_OPS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany"
])

const UNIQUE_OPS = new Set(["findUnique", "findUniqueOrThrow", "update", "delete", "upsert"])

export const tenantExtension = Prisma.defineExtension({
  name: "tenantScope",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!TENANT_MODELS.has(model)) return query(args)
        const ctx = currentTenant()
        if (!ctx) {
          throw new Error(`Tenant-scoped query on ${model}.${operation} outside tenant context`)
        }
        const tenantId = ctx.tenantId
        const a = args as Record<string, unknown>

        if (operation === "create") {
          a.data = { ...(a.data as object), tenantId }
          return query(a)
        }
        if (operation === "createMany" || operation === "createManyAndReturn") {
          const data = a.data
          a.data = Array.isArray(data)
            ? data.map((d: object) => ({ ...d, tenantId }))
            : { ...(data as object), tenantId }
          return query(a)
        }
        if (LIST_OPS.has(operation)) {
          a.where = { AND: [(a.where as object) ?? {}, { tenantId }] }
          return query(a)
        }
        if (UNIQUE_OPS.has(operation)) {
          a.where = { ...(a.where as object), tenantId }
          return query(a)
        }
        return query(a)
      }
    }
  }
})
```

The `async () => await fn()` wrapper in the test helper below is load-bearing, not style. `PrismaPromise` is lazy: the extension's `$allOperations` hook fires when `.then` is called, not when the call expression is evaluated. `tenantContext.run(store, fn)` invokes `fn` synchronously, receives an unstarted promise, and returns — so an `await` at the *call site* runs `.then` after the store is already gone. The await must happen inside the callback. The request middleware is unaffected, because the controller and service awaits all occur within the chain `run` started.

Two deliberate choices worth understanding before writing them:
- **Missing context throws** rather than silently returning unscoped data. A request that reaches a tenant-scoped query without a tenant is a programming error and must explode in tests, not leak in production.
- The auth module and the seed script use the **raw** client precisely because they operate before or across tenant boundaries.

- [ ] **Step 3: Expose the scoped client**

`apps/api/src/prisma/prisma.service.ts`:

```ts
import { Injectable, OnModuleInit } from "@nestjs/common"
import { PrismaClient } from "@prisma/client"
import { tenantExtension } from "./tenant.extension"

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  readonly scoped = this.$extends(tenantExtension)

  async onModuleInit() {
    await this.$connect()
  }
}
```

- [ ] **Step 4: Write the test**

`apps/api/test/tenant-extension.spec.ts`:

```ts
import { PrismaService } from "../src/prisma/prisma.service"
import { tenantContext } from "../src/tenant/tenant-context"

const prisma = new PrismaService()

const asTenant = <T>(tenantId: string, fn: () => Promise<T>) =>
  tenantContext.run({ tenantId, userId: "test-user", role: "owner" }, async () => await fn())

describe("tenant extension", () => {
  let tenantA: string
  let tenantB: string
  let serviceInB: string

  beforeAll(async () => {
    const a = await prisma.tenant.create({
      data: { slug: `ext-a-${Date.now()}`, name: "Tenant A" }
    })
    const b = await prisma.tenant.create({
      data: { slug: `ext-b-${Date.now()}`, name: "Tenant B" }
    })
    tenantA = a.id
    tenantB = b.id

    const svc = await prisma.service.create({
      data: { tenantId: tenantB, name: "B-only cleaning", durationMin: 30 }
    })
    serviceInB = svc.id
  })

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenantA } })
    await prisma.tenant.delete({ where: { id: tenantB } })
    await prisma.$disconnect()
  })

  it("injects tenantId on create", async () => {
    const created = await asTenant(tenantA, () =>
      prisma.scoped.service.create({ data: { name: "A cleaning", durationMin: 30 } })
    )
    expect(created.tenantId).toBe(tenantA)
  })

  it("filters findMany to the current tenant", async () => {
    const seen = await asTenant(tenantA, () => prisma.scoped.service.findMany())
    expect(seen.every((s) => s.tenantId === tenantA)).toBe(true)
    expect(seen.some((s) => s.id === serviceInB)).toBe(false)
  })

  it("makes a cross-tenant findUnique behave like a missing row", async () => {
    const found = await asTenant(tenantA, () =>
      prisma.scoped.service.findUnique({ where: { id: serviceInB } })
    )
    expect(found).toBeNull()
  })

  it("makes a cross-tenant update throw P2025", async () => {
    await expect(
      asTenant(tenantA, () =>
        prisma.scoped.service.update({
          where: { id: serviceInB },
          data: { name: "stolen" }
        })
      )
    ).rejects.toMatchObject({ code: "P2025" })
  })

  it("refuses to run scoped queries outside any tenant context", async () => {
    await expect(prisma.scoped.service.findMany()).rejects.toThrow("outside tenant context")
  })
})
```

Note the create in the first test passes no `tenantId` — TypeScript will reject that because the generated type requires the relation. Silence it the honest way: the extension owns the field, so the service layer types should not require it. For now cast at the call site in the test only:

```ts
      prisma.scoped.service.create({ data: { name: "A cleaning", durationMin: 30 } as never })
```

Use the same `as never` cast in the later shift test and service code where the extension supplies `tenantId`. It is ugly and deliberate — a visible marker of exactly where the extension is trusted.

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @dentalops/api test -- tenant-extension`
Expected: 5 tests PASS.

- [ ] **Step 6: Full pipeline, commit, push**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all green (17 api tests).

```bash
git add apps/api
git commit -m "feat: tenant context and prisma extension enforcing tenant isolation"
git push
```

---

### Task 3: Auth — signup, login, refresh, demo-login

**Files:**
- Create: `apps/api/src/auth/auth.module.ts`, `auth.service.ts`, `auth.controller.ts`, `jwt.strategy.ts`, `jwt-auth.guard.ts`, `roles.decorator.ts`, `roles.guard.ts`, `current-user.decorator.ts`, `dto/signup.dto.ts`, `dto/login.dto.ts`, `dto/demo-login.dto.ts`, `apps/api/src/tenant/tenant-context.middleware.ts`, `apps/api/src/tenant/defaults.ts`, `apps/api/test/setup-env.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/prisma/seed.ts`, `apps/api/jest.config.cjs`, `.env.example`, `turbo.json`, `.github/workflows/ci.yml`, `render.yaml`
- Test: `apps/api/test/auth.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (raw client — auth is deliberately unscoped), `AppException`, `tenantContext`.
- Produces: `POST /auth/signup|login|refresh|demo-login`, `GET /auth/me`; `JwtAuthGuard`, `RolesGuard` + `@Roles(...roles)`, `@CurrentUser()` returning `{ userId, tenantId, role, name }`; `TenantContextMiddleware` that verifies a Bearer token and wraps the request in `tenantContext.run`. JWT payload shape: `{ sub, tenantId, role, name }`. Demo credentials: `owner@demo-clinic.local` / `receptionist@demo-clinic.local` / `dentist1@demo-clinic.local`, password `demo1234`.

- [ ] **Step 1: Install dependencies**

```bash
pnpm --filter @dentalops/api add @nestjs/jwt @nestjs/passport passport passport-jwt argon2
pnpm --filter @dentalops/api add -D @types/passport-jwt
```

- [ ] **Step 2: Secrets plumbing**

Append to `.env.example`:

```
JWT_SECRET=change-me
JWT_REFRESH_SECRET=change-me-too
```

Add both (with real random values you generate via `openssl rand -hex 32`) to the untracked `apps/api/.env`.

`turbo.json` — extend the test task env:

```json
"test": { "dependsOn": ["^build"], "env": ["DATABASE_URL", "DIRECT_URL", "JWT_SECRET", "JWT_REFRESH_SECRET"] },
```

`.github/workflows/ci.yml` — add to the job-level `env` block:

```yaml
      JWT_SECRET: ci-test-secret
      JWT_REFRESH_SECRET: ci-test-refresh-secret
```

`render.yaml` — add to `envVars`:

```yaml
      - key: JWT_SECRET
        sync: false
      - key: JWT_REFRESH_SECRET
        sync: false
```

`apps/api/test/setup-env.ts` (belt-and-suspenders for local runs):

```ts
process.env.JWT_SECRET ??= "test-secret"
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret"
```

`apps/api/test/global-setup.cjs` — the demo tenant must exist before any suite runs. Without this, `auth.spec.ts`'s demo-login test silently depends on `seed.spec.ts` having run first, and Jest's parallel workers order suites nondeterministically: it passes locally (where you seeded by hand) and fails in CI. Plain CommonJS so no transform is needed.

```js
const { execSync } = require("node:child_process")

module.exports = () => {
  execSync("pnpm db:seed", { cwd: `${__dirname}/..`, stdio: "pipe" })
}
```

`apps/api/jest.config.cjs` — add both:

```js
  setupFiles: ["<rootDir>/test/setup-env.ts"],
  globalSetup: "<rootDir>/test/global-setup.cjs",
```

- [ ] **Step 3: Shared tenant defaults**

`apps/api/src/tenant/defaults.ts`:

```ts
export const DEFAULT_OPENING_HOURS = {
  mon: [["09:00", "20:00"]],
  tue: [["09:00", "20:00"]],
  wed: [["09:00", "20:00"]],
  thu: [["09:00", "20:00"]],
  fri: [["09:00", "20:00"]],
  sat: [["09:00", "17:00"]],
  sun: []
}

export const DEFAULT_SERVICES = [
  { name: "Cleaning", durationMin: 45, colorIndex: 0 },
  { name: "Filling", durationMin: 60, colorIndex: 1 },
  { name: "Root canal", durationMin: 90, colorIndex: 2 },
  { name: "Ortho adjustment", durationMin: 30, colorIndex: 3 },
  { name: "Extraction", durationMin: 60, colorIndex: 4 },
  { name: "Whitening", durationMin: 75, colorIndex: 5 }
]
```

- [ ] **Step 4: DTOs**

`apps/api/src/auth/dto/signup.dto.ts`:

```ts
import { ApiProperty } from "@nestjs/swagger"
import { IsEmail, IsString, Matches, MaxLength, MinLength } from "class-validator"

export class SignupDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  clinicName!: string

  @ApiProperty({ description: "URL-safe unique identifier for the clinic" })
  @Matches(/^[a-z0-9-]{3,40}$/)
  slug!: string

  @ApiProperty()
  @IsEmail()
  email!: string

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string
}
```

`apps/api/src/auth/dto/login.dto.ts`:

```ts
import { ApiProperty } from "@nestjs/swagger"
import { IsEmail, IsString, Matches, MinLength } from "class-validator"

export class LoginDto {
  @ApiProperty()
  @Matches(/^[a-z0-9-]{3,40}$/)
  clinicSlug!: string

  @ApiProperty()
  @IsEmail()
  email!: string

  @ApiProperty()
  @IsString()
  @MinLength(1)
  password!: string
}
```

Login requires the clinic slug because email is only unique per tenant — the same address may exist in two clinics.

`apps/api/src/auth/dto/demo-login.dto.ts`:

```ts
import { ApiProperty } from "@nestjs/swagger"
import { IsIn } from "class-validator"

export class DemoLoginDto {
  @ApiProperty({ enum: ["owner", "receptionist", "dentist"] })
  @IsIn(["owner", "receptionist", "dentist"])
  role!: "owner" | "receptionist" | "dentist"
}
```

- [ ] **Step 5: Auth service**

`apps/api/src/auth/auth.service.ts`:

```ts
import { Injectable } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import { User } from "@prisma/client"
import * as argon2 from "argon2"
import { AppException } from "../common/app.exception"
import { PrismaService } from "../prisma/prisma.service"
import { DEFAULT_OPENING_HOURS, DEFAULT_SERVICES } from "../tenant/defaults"
import { DemoLoginDto } from "./dto/demo-login.dto"
import { LoginDto } from "./dto/login.dto"
import { SignupDto } from "./dto/signup.dto"

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface JwtPayload {
  sub: string
  tenantId: string
  role: string
  name: string
}

const DEMO_SLUG = "demo-clinic"

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService
  ) {}

  private async issueTokens(user: User): Promise<AuthTokens> {
    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      name: user.name
    }
    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: "15m"
    })
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: "7d"
    })
    return { accessToken, refreshToken }
  }

  async signup(dto: SignupDto) {
    const existing = await this.prisma.tenant.findUnique({ where: { slug: dto.slug } })
    if (existing) throw new AppException(409, "SLUG_TAKEN", "That clinic URL is already in use")

    const passwordHash = await argon2.hash(dto.password)
    const user = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { slug: dto.slug, name: dto.clinicName }
      })
      const branch = await tx.branch.create({
        data: { tenantId: tenant.id, name: "Main Branch", openingHours: DEFAULT_OPENING_HOURS }
      })
      await tx.resource.createMany({
        data: [1, 2, 3].map((n) => ({
          tenantId: tenant.id,
          branchId: branch.id,
          type: "chair" as const,
          name: `Chair ${n}`
        }))
      })
      await tx.service.createMany({
        data: DEFAULT_SERVICES.map((s) => ({ tenantId: tenant.id, bufferMin: 10, ...s }))
      })
      return tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email.toLowerCase(),
          passwordHash,
          name: dto.name,
          role: "owner"
        }
      })
    })
    return { user, tokens: await this.issueTokens(user) }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: dto.email.toLowerCase(),
        isActive: true,
        tenant: { slug: dto.clinicSlug }
      }
    })
    const valid = user && (await argon2.verify(user.passwordHash, dto.password))
    if (!valid) throw new AppException(401, "INVALID_CREDENTIALS", "Wrong clinic, email, or password")
    return { user, tokens: await this.issueTokens(user) }
  }

  async demoLogin(dto: DemoLoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { role: dto.role, isActive: true, tenant: { slug: DEMO_SLUG } },
      orderBy: { email: "asc" }
    })
    if (!user) throw new AppException(503, "DEMO_UNAVAILABLE", "Demo tenant is not seeded")
    return { user, tokens: await this.issueTokens(user) }
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) throw new AppException(401, "NO_REFRESH_TOKEN", "Missing refresh token")
    let payload: JwtPayload
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET
      })
    } catch {
      throw new AppException(401, "INVALID_REFRESH_TOKEN", "Refresh token invalid or expired")
    }
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, isActive: true }
    })
    if (!user) throw new AppException(401, "INVALID_REFRESH_TOKEN", "User no longer active")
    return { user, tokens: await this.issueTokens(user) }
  }
}
```

- [ ] **Step 6: Strategy, guards, decorators**

`apps/api/src/auth/jwt.strategy.ts`:

```ts
import { Injectable } from "@nestjs/common"
import { PassportStrategy } from "@nestjs/passport"
import { ExtractJwt, Strategy } from "passport-jwt"
import { JwtPayload } from "./auth.service"

export interface AuthenticatedUser {
  userId: string
  tenantId: string
  role: string
  name: string
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET ?? "test-secret"
    })
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
      name: payload.name
    }
  }
}
```

`apps/api/src/auth/jwt-auth.guard.ts`:

```ts
import { Injectable } from "@nestjs/common"
import { AuthGuard } from "@nestjs/passport"

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {}
```

`apps/api/src/auth/roles.decorator.ts`:

```ts
import { SetMetadata } from "@nestjs/common"

export const ROLES_KEY = "roles"
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles)
```

`apps/api/src/auth/roles.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { AppException } from "../common/app.exception"
import { ROLES_KEY } from "./roles.decorator"
import { AuthenticatedUser } from "./jwt.strategy"

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ])
    if (!required || required.length === 0) return true
    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user
    if (!user || !required.includes(user.role)) {
      throw new AppException(403, "FORBIDDEN", "Insufficient role for this action")
    }
    return true
  }
}
```

`apps/api/src/auth/current-user.decorator.ts`:

```ts
import { ExecutionContext, createParamDecorator } from "@nestjs/common"
import { AuthenticatedUser } from "./jwt.strategy"

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser =>
    ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>().user
)
```

- [ ] **Step 7: The tenant context middleware**

Passport populates `req.user` at guard time, which is too late to wrap the whole handler in `AsyncLocalStorage`. A middleware runs early enough. It verifies the same Bearer token; requests without a valid token simply proceed without a context, and the extension's missing-context throw catches any protected query that slips through an unguarded route.

`apps/api/src/tenant/tenant-context.middleware.ts`:

```ts
import { Injectable, NestMiddleware } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import type { NextFunction, Request, Response } from "express"
import { JwtPayload } from "../auth/auth.service"
import { tenantContext } from "./tenant-context"

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly jwt: JwtService) {}

  use(req: Request, _res: Response, next: NextFunction) {
    const header = req.headers.authorization
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined
    if (!token) return next()
    try {
      const payload = this.jwt.verify<JwtPayload>(token, { secret: process.env.JWT_SECRET })
      tenantContext.run(
        { tenantId: payload.tenantId, userId: payload.sub, role: payload.role },
        next
      )
    } catch {
      next()
    }
  }
}
```

- [ ] **Step 8: Controller and module**

`apps/api/src/auth/auth.controller.ts`:

```ts
import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import type { Request, Response } from "express"
import { AuthService } from "./auth.service"
import { CurrentUser } from "./current-user.decorator"
import { DemoLoginDto } from "./dto/demo-login.dto"
import { LoginDto } from "./dto/login.dto"
import { SignupDto } from "./dto/signup.dto"
import { JwtAuthGuard } from "./jwt-auth.guard"
import { AuthenticatedUser } from "./jwt.strategy"

const REFRESH_COOKIE = "dentalops_refresh"

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/api/v1/auth",
  maxAge: 7 * 24 * 60 * 60 * 1000
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private respond(
    res: Response,
    result: { user: { id: string; tenantId: string; name: string; role: string }; tokens: { accessToken: string; refreshToken: string } }
  ) {
    res.cookie(REFRESH_COOKIE, result.tokens.refreshToken, cookieOptions)
    return res.json({
      accessToken: result.tokens.accessToken,
      user: {
        id: result.user.id,
        tenantId: result.user.tenantId,
        name: result.user.name,
        role: result.user.role
      }
    })
  }

  @Post("signup")
  @HttpCode(200)
  async signup(@Body() dto: SignupDto, @Res() res: Response) {
    return this.respond(res, await this.auth.signup(dto))
  }

  @Post("login")
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res() res: Response) {
    return this.respond(res, await this.auth.login(dto))
  }

  @Post("demo-login")
  @HttpCode(200)
  async demoLogin(@Body() dto: DemoLoginDto, @Res() res: Response) {
    return this.respond(res, await this.auth.demoLogin(dto))
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res() res: Response) {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE]
    return this.respond(res, await this.auth.refresh(token))
  }

  @Get("me")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return user
  }
}
```

`apps/api/src/auth/auth.module.ts`:

```ts
import { Module } from "@nestjs/common"
import { JwtModule } from "@nestjs/jwt"
import { PassportModule } from "@nestjs/passport"
import { AuthController } from "./auth.controller"
import { AuthService } from "./auth.service"
import { JwtStrategy } from "./jwt.strategy"

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [JwtStrategy]
})
export class AuthModule {}
```

`apps/api/src/app.module.ts` — final form for this task:

```ts
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common"
import { APP_FILTER, APP_GUARD } from "@nestjs/core"
import { JwtModule } from "@nestjs/jwt"
import { SentryModule } from "@sentry/nestjs/setup"
import { AuthModule } from "./auth/auth.module"
import { RolesGuard } from "./auth/roles.guard"
import { AppExceptionFilter } from "./common/app-exception.filter"
import { RequestIdMiddleware } from "./common/request-id.middleware"
import { HealthController } from "./health/health.controller"
import { PrismaModule } from "./prisma/prisma.module"
import { TenantContextMiddleware } from "./tenant/tenant-context.middleware"

@Module({
  imports: [SentryModule.forRoot(), PrismaModule, JwtModule.register({}), AuthModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AppExceptionFilter },
    { provide: APP_GUARD, useClass: RolesGuard }
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, TenantContextMiddleware).forRoutes("*")
  }
}
```

`RolesGuard` is global so `@Roles` works anywhere; routes without the decorator pass through untouched.

- [ ] **Step 9: Real password hashes in the seed**

Modify `apps/api/prisma/seed.ts` — replace the staff-creation block and add the argon2 import plus the defaults import (delete the now-duplicated inline `OPENING_HOURS` and service array, importing from `../src/tenant/defaults` instead):

```ts
import * as argon2 from "argon2"
import { DEFAULT_OPENING_HOURS, DEFAULT_SERVICES } from "../src/tenant/defaults"
```

```ts
  const passwordHash = await argon2.hash("demo1234")

  const staff = [
    { email: "owner@demo-clinic.local", name: "Anong Prasert", role: "owner" as const },
    { email: "receptionist@demo-clinic.local", name: "Malee Suksan", role: "receptionist" as const },
    { email: "dentist1@demo-clinic.local", name: "Somchai Wattana", role: "dentist" as const },
    { email: "dentist2@demo-clinic.local", name: "Ploy Siriwan", role: "dentist" as const },
    { email: "dentist3@demo-clinic.local", name: "Nid Kanjana", role: "dentist" as const },
    { email: "dentist4@demo-clinic.local", name: "Kiat Thongchai", role: "dentist" as const }
  ]

  for (const person of staff) {
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: person.email,
        passwordHash,
        name: person.name,
        role: person.role
      }
    })
  }
```

Every seeded count stays identical, so `seed.spec.ts` keeps passing unchanged. Re-run `pnpm --filter @dentalops/api db:seed` afterwards so the local demo users get real hashes.

- [ ] **Step 10: Write the auth test**

`apps/api/test/auth.spec.ts`:

```ts
import { INestApplication, ValidationPipe } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import cookieParser from "cookie-parser"
import { apiErrorSchema } from "@dentalops/contracts"
import { AppModule } from "../src/app.module"
import { PrismaService } from "../src/prisma/prisma.service"

describe("auth", () => {
  let app: INestApplication
  let prisma: PrismaService
  const slug = `auth-test-${Date.now()}`

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    app.use(cookieParser())
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    prisma = app.get(PrismaService)
    await app.init()
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } })
    await app.close()
  })

  const signupBody = {
    clinicName: "Auth Test Clinic",
    slug,
    email: "owner@authtest.local",
    password: "s3cure-pass",
    name: "Owner Person"
  }

  it("signs up a new clinic with defaults provisioned", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/signup")
      .send(signupBody)
      .expect(200)
    expect(res.body.accessToken).toBeDefined()
    expect(res.body.user.role).toBe("owner")

    const tenant = await prisma.tenant.findUnique({ where: { slug } })
    const [branches, services, chairs] = await Promise.all([
      prisma.branch.count({ where: { tenantId: tenant!.id } }),
      prisma.service.count({ where: { tenantId: tenant!.id } }),
      prisma.resource.count({ where: { tenantId: tenant!.id, type: "chair" } })
    ])
    expect(branches).toBe(1)
    expect(services).toBe(6)
    expect(chairs).toBe(3)
  })

  it("rejects a duplicate slug with SLUG_TAKEN", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/signup")
      .send({ ...signupBody, email: "other@authtest.local" })
      .expect(409)
    expect(apiErrorSchema.parse(res.body).errorCode).toBe("SLUG_TAKEN")
  })

  it("logs in with correct credentials and sets a refresh cookie", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ clinicSlug: slug, email: signupBody.email, password: signupBody.password })
      .expect(200)
    expect(res.body.accessToken).toBeDefined()
    const cookies = res.headers["set-cookie"] as unknown as string[]
    expect(cookies.some((c) => c.startsWith("dentalops_refresh=") && c.includes("HttpOnly"))).toBe(
      true
    )
  })

  it("rejects a wrong password with INVALID_CREDENTIALS", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ clinicSlug: slug, email: signupBody.email, password: "wrong-password" })
      .expect(401)
    expect(apiErrorSchema.parse(res.body).errorCode).toBe("INVALID_CREDENTIALS")
  })

  it("serves /auth/me with a valid token and rejects without one", async () => {
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ clinicSlug: slug, email: signupBody.email, password: signupBody.password })
    const me = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .expect(200)
    expect(me.body.role).toBe("owner")
    await request(app.getHttpServer()).get("/auth/me").expect(401)
  })

  it("refreshes using the httpOnly cookie", async () => {
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ clinicSlug: slug, email: signupBody.email, password: signupBody.password })
    const cookies = login.headers["set-cookie"] as unknown as string[]
    const res = await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", cookies)
      .expect(200)
    expect(res.body.accessToken).toBeDefined()
  })

  it("demo-login works for every role after seeding", async () => {
    for (const role of ["owner", "receptionist", "dentist"]) {
      const res = await request(app.getHttpServer())
        .post("/auth/demo-login")
        .send({ role })
        .expect(200)
      expect(res.body.user.role).toBe(role)
    }
  })
})
```

- [ ] **Step 11: Run tests, re-seed, full pipeline**

Run: `pnpm --filter @dentalops/api db:seed && pnpm --filter @dentalops/api test -- auth`
Expected: 7 tests PASS.

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all green (24 api tests).

- [ ] **Step 12: Commit and push**

```bash
git add apps/api turbo.json .github/workflows/ci.yml render.yaml .env.example pnpm-lock.yaml
git commit -m "feat: jwt auth with signup, login, refresh, and demo login"
git push
```

**Report to the user:** `JWT_SECRET` and `JWT_REFRESH_SECRET` must be set in the Render dashboard before the next deploy (generate with `openssl rand -hex 32`).

---

### Task 4: Shifts endpoints — the first tenant-scoped resource

**Files:**
- Create: `apps/api/src/shifts/shifts.module.ts`, `shifts.controller.ts`, `shifts.service.ts`, `dto/create-shift.dto.ts`, `dto/query-shifts.dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/shifts.spec.ts`

**Interfaces:**
- Consumes: `prisma.scoped`, `JwtAuthGuard`, `@Roles`, `AppException`, the filter's `SLOT_CONFLICT` / `P2025` mappings.
- Produces: `GET /shifts?branchId&staffId&from&to`, `POST /shifts` (owner only), `DELETE /shifts/:id` (owner only). W1b's isolation spec and W4's timeline both consume `GET /shifts`.

- [ ] **Step 1: DTOs**

`apps/api/src/shifts/dto/create-shift.dto.ts`:

```ts
import { ApiProperty } from "@nestjs/swagger"
import { IsISO8601, IsUUID } from "class-validator"

export class CreateShiftDto {
  @ApiProperty()
  @IsUUID()
  staffId!: string

  @ApiProperty()
  @IsUUID()
  branchId!: string

  @ApiProperty({ example: "2026-08-03T02:00:00.000Z" })
  @IsISO8601()
  startsAt!: string

  @ApiProperty({ example: "2026-08-03T10:00:00.000Z" })
  @IsISO8601()
  endsAt!: string
}
```

`apps/api/src/shifts/dto/query-shifts.dto.ts`:

```ts
import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsISO8601, IsOptional, IsUUID } from "class-validator"

export class QueryShiftsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  staffId?: string

  @ApiPropertyOptional({ example: "2026-08-03T00:00:00.000Z" })
  @IsOptional()
  @IsISO8601()
  from?: string

  @ApiPropertyOptional({ example: "2026-08-10T00:00:00.000Z" })
  @IsOptional()
  @IsISO8601()
  to?: string
}
```

- [ ] **Step 2: Service**

`apps/api/src/shifts/shifts.service.ts`:

```ts
import { Injectable } from "@nestjs/common"
import { AppException } from "../common/app.exception"
import { PrismaService } from "../prisma/prisma.service"
import { CreateShiftDto } from "./dto/create-shift.dto"
import { QueryShiftsDto } from "./dto/query-shifts.dto"

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: QueryShiftsDto) {
    return this.prisma.scoped.shift.findMany({
      where: {
        branchId: query.branchId,
        staffId: query.staffId,
        startsAt: query.to ? { lt: new Date(query.to) } : undefined,
        endsAt: query.from ? { gt: new Date(query.from) } : undefined
      },
      orderBy: { startsAt: "asc" }
    })
  }

  async create(dto: CreateShiftDto) {
    const startsAt = new Date(dto.startsAt)
    const endsAt = new Date(dto.endsAt)
    if (startsAt >= endsAt) {
      throw new AppException(400, "INVALID_RANGE", "startsAt must be before endsAt")
    }
    const staff = await this.prisma.scoped.user.findUnique({ where: { id: dto.staffId } })
    if (!staff) throw new AppException(404, "NOT_FOUND", "Staff member not found")
    const branch = await this.prisma.scoped.branch.findUnique({ where: { id: dto.branchId } })
    if (!branch) throw new AppException(404, "NOT_FOUND", "Branch not found")

    return this.prisma.scoped.shift.create({
      data: {
        staffId: dto.staffId,
        branchId: dto.branchId,
        startsAt,
        endsAt
      } as never
    })
  }

  remove(id: string) {
    return this.prisma.scoped.shift.delete({ where: { id } })
  }
}
```

The overlap filter in `list` is the standard interval trick: a shift intersects `[from, to)` iff `startsAt < to AND endsAt > from`.

- [ ] **Step 3: Controller and module**

`apps/api/src/shifts/shifts.controller.ts`:

```ts
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { Roles } from "../auth/roles.decorator"
import { CreateShiftDto } from "./dto/create-shift.dto"
import { QueryShiftsDto } from "./dto/query-shifts.dto"
import { ShiftsService } from "./shifts.service"

@ApiTags("shifts")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("shifts")
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Get()
  list(@Query() query: QueryShiftsDto) {
    return this.shifts.list(query)
  }

  @Post()
  @Roles("owner")
  create(@Body() dto: CreateShiftDto) {
    return this.shifts.create(dto)
  }

  @Delete(":id")
  @Roles("owner")
  @HttpCode(204)
  async remove(@Param("id", ParseUUIDPipe) id: string) {
    await this.shifts.remove(id)
  }
}
```

`apps/api/src/shifts/shifts.module.ts`:

```ts
import { Module } from "@nestjs/common"
import { ShiftsController } from "./shifts.controller"
import { ShiftsService } from "./shifts.service"

@Module({
  controllers: [ShiftsController],
  providers: [ShiftsService]
})
export class ShiftsModule {}
```

Add `ShiftsModule` to the `imports` array in `apps/api/src/app.module.ts`.

- [ ] **Step 4: Write the test**

`apps/api/test/shifts.spec.ts`:

```ts
import { INestApplication, ValidationPipe } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import cookieParser from "cookie-parser"
import { apiErrorSchema } from "@dentalops/contracts"
import { AppModule } from "../src/app.module"
import { PrismaService } from "../src/prisma/prisma.service"

describe("shifts endpoints", () => {
  let app: INestApplication
  let prisma: PrismaService
  let ownerToken: string
  let dentistToken: string
  let staffId: string
  let branchId: string
  const slug = `shifts-test-${Date.now()}`

  const at = (day: number, h: number) => new Date(Date.UTC(2026, 8, day, h, 0, 0)).toISOString()

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    app.use(cookieParser())
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    prisma = app.get(PrismaService)
    await app.init()

    const signup = await request(app.getHttpServer()).post("/auth/signup").send({
      clinicName: "Shifts Test Clinic",
      slug,
      email: "owner@shiftstest.local",
      password: "s3cure-pass",
      name: "Owner"
    })
    ownerToken = signup.body.accessToken

    const tenant = await prisma.tenant.findUnique({ where: { slug } })
    const branch = await prisma.branch.findFirst({ where: { tenantId: tenant!.id } })
    branchId = branch!.id

    const dentist = await prisma.user.create({
      data: {
        tenantId: tenant!.id,
        email: "dentist@shiftstest.local",
        passwordHash: "x",
        name: "Dr. Test",
        role: "dentist"
      }
    })
    staffId = dentist.id

    const argon2 = await import("argon2")
    await prisma.user.update({
      where: { id: dentist.id },
      data: { passwordHash: await argon2.hash("s3cure-pass") }
    })
    const dentistLogin = await request(app.getHttpServer()).post("/auth/login").send({
      clinicSlug: slug,
      email: "dentist@shiftstest.local",
      password: "s3cure-pass"
    })
    dentistToken = dentistLogin.body.accessToken
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } })
    await app.close()
  })

  it("owner creates a shift", async () => {
    await request(app.getHttpServer())
      .post("/shifts")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ staffId, branchId, startsAt: at(7, 2), endsAt: at(7, 10) })
      .expect(201)
  })

  it("overlapping shift for the same staff returns SLOT_CONFLICT with the constraint name", async () => {
    const res = await request(app.getHttpServer())
      .post("/shifts")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ staffId, branchId, startsAt: at(7, 9), endsAt: at(7, 12) })
      .expect(409)
    const parsed = apiErrorSchema.parse(res.body)
    expect(parsed.errorCode).toBe("SLOT_CONFLICT")
    expect(parsed.details).toEqual({ constraint: "no_staff_double_shift" })
  })

  it("back-to-back shift at the boundary is allowed", async () => {
    await request(app.getHttpServer())
      .post("/shifts")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ staffId, branchId, startsAt: at(7, 10), endsAt: at(7, 13) })
      .expect(201)
  })

  it("dentist role cannot create shifts", async () => {
    const res = await request(app.getHttpServer())
      .post("/shifts")
      .set("Authorization", `Bearer ${dentistToken}`)
      .send({ staffId, branchId, startsAt: at(8, 2), endsAt: at(8, 10) })
      .expect(403)
    expect(apiErrorSchema.parse(res.body).errorCode).toBe("FORBIDDEN")
  })

  it("lists shifts within a window", async () => {
    const res = await request(app.getHttpServer())
      .get("/shifts")
      .set("Authorization", `Bearer ${ownerToken}`)
      .query({ from: at(7, 0), to: at(8, 0), staffId })
      .expect(200)
    expect(res.body.length).toBe(2)
  })

  it("unauthenticated requests are rejected", async () => {
    await request(app.getHttpServer()).get("/shifts").expect(401)
  })

  it("deleting a shift frees the slot", async () => {
    const list = await request(app.getHttpServer())
      .get("/shifts")
      .set("Authorization", `Bearer ${ownerToken}`)
      .query({ staffId })
    const first = list.body[0]
    await request(app.getHttpServer())
      .delete(`/shifts/${first.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(204)
    await request(app.getHttpServer())
      .post("/shifts")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ staffId, branchId, startsAt: first.startsAt, endsAt: first.endsAt })
      .expect(201)
  })
})
```

- [ ] **Step 5: Run tests, full pipeline**

Run: `pnpm --filter @dentalops/api test -- shifts.spec`
Expected: 7 tests PASS.

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all green (31 api tests).

- [ ] **Step 6: Commit and push**

```bash
git add apps/api
git commit -m "feat: shift endpoints with role guard and conflict mapping"
git push
```

---

### Task 5: The automated tenant-isolation spec

**Files:**
- Create: `apps/api/test/tenant-isolation.spec.ts`, `docs/security.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a spec that discovers every registered route from the Express router and fails if any route is missing from its isolation registry — adding an endpoint without declaring its isolation behaviour turns CI red. This spec is cited in the README and grows with every future endpoint task.

- [ ] **Step 1: Write the spec**

`apps/api/test/tenant-isolation.spec.ts`:

```ts
import { INestApplication, ValidationPipe } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import cookieParser from "cookie-parser"
import { AppModule } from "../src/app.module"
import { PrismaService } from "../src/prisma/prisma.service"

type Expectation = "public" | "auth-only" | "not-found" | "filtered"

const REGISTRY: Record<string, Expectation> = {
  "GET /health": "public",
  "POST /auth/signup": "public",
  "POST /auth/login": "public",
  "POST /auth/demo-login": "public",
  "POST /auth/refresh": "public",
  "GET /auth/me": "auth-only",
  "GET /shifts": "filtered",
  "POST /shifts": "auth-only",
  "DELETE /shifts/:id": "not-found"
}

interface DiscoveredRoute {
  method: string
  path: string
}

function discoverRoutes(app: INestApplication): DiscoveredRoute[] {
  type RouterStack = { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> }
  const instance = app.getHttpAdapter().getInstance() as {
    _router?: RouterStack
    router?: RouterStack
  }
  const router = instance._router ?? instance.router
  if (!router) throw new Error("Could not locate the Express router for route discovery")
  return router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      method: Object.keys(layer.route!.methods)[0]!.toUpperCase(),
      path: layer.route!.path
    }))
}

describe("tenant isolation across every route", () => {
  let app: INestApplication
  let prisma: PrismaService
  let intruderToken: string
  let victimShiftId: string
  const victimSlug = `iso-victim-${Date.now()}`
  const intruderSlug = `iso-intruder-${Date.now()}`

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    app.use(cookieParser())
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    prisma = app.get(PrismaService)
    await app.init()

    const victim = await request(app.getHttpServer()).post("/auth/signup").send({
      clinicName: "Victim Clinic",
      slug: victimSlug,
      email: "owner@victim.local",
      password: "s3cure-pass",
      name: "Victim Owner"
    })
    const intruder = await request(app.getHttpServer()).post("/auth/signup").send({
      clinicName: "Intruder Clinic",
      slug: intruderSlug,
      email: "owner@intruder.local",
      password: "s3cure-pass",
      name: "Intruder Owner"
    })
    intruderToken = intruder.body.accessToken

    const victimTenant = await prisma.tenant.findUnique({ where: { slug: victimSlug } })
    const victimBranch = await prisma.branch.findFirst({ where: { tenantId: victimTenant!.id } })
    const shift = await request(app.getHttpServer())
      .post("/shifts")
      .set("Authorization", `Bearer ${victim.body.accessToken}`)
      .send({
        staffId: victim.body.user.id,
        branchId: victimBranch!.id,
        startsAt: "2026-09-14T02:00:00.000Z",
        endsAt: "2026-09-14T10:00:00.000Z"
      })
    victimShiftId = shift.body.id
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { in: [victimSlug, intruderSlug] } } })
    await app.close()
  })

  it("every discovered route is declared in the isolation registry", () => {
    const missing = discoverRoutes(app)
      .map((r) => `${r.method} ${r.path}`)
      .filter((key) => !(key in REGISTRY))
    expect(missing).toEqual([])
  })

  it("cross-tenant lookups on id routes return 404, never 200 or 403", async () => {
    const idRoutes = Object.entries(REGISTRY).filter(([, exp]) => exp === "not-found")
    for (const [key] of idRoutes) {
      const [method, path] = key.split(" ") as [string, string]
      const url = path.replace(":id", victimShiftId)
      const res = await request(app.getHttpServer())
        [method.toLowerCase() as "get" | "delete" | "patch"](url)
        .set("Authorization", `Bearer ${intruderToken}`)
      expect([404]).toContain(res.status)
    }
  })

  it("collection routes never leak another tenant's rows", async () => {
    const res = await request(app.getHttpServer())
      .get("/shifts")
      .set("Authorization", `Bearer ${intruderToken}`)
      .expect(200)
    const ids = (res.body as Array<{ id: string }>).map((s) => s.id)
    expect(ids).not.toContain(victimShiftId)
  })

  it("auth-only routes reject anonymous requests", async () => {
    const routes = Object.entries(REGISTRY).filter(
      ([, exp]) => exp === "auth-only" || exp === "filtered" || exp === "not-found"
    )
    for (const [key] of routes) {
      const [method, path] = key.split(" ") as [string, string]
      const url = path.replace(":id", victimShiftId)
      const res = await request(app.getHttpServer())[
        method.toLowerCase() as "get" | "post" | "delete"
      ](url)
      expect(res.status).toBe(401)
    }
  })
})
```

The first test is the enforcement mechanism: any future endpoint that is not consciously classified fails CI immediately. The registry entry is one line; deciding which class it belongs to is the point.

- [ ] **Step 2: Run it**

Run: `pnpm --filter @dentalops/api test -- tenant-isolation`
Expected: 4 tests PASS. If the discovery test lists unexpected framework routes (e.g. Swagger's), extend the filter in `discoverRoutes` to exclude paths starting with `/api/docs` and re-run — record it if so.

- [ ] **Step 3: Write `docs/security.md`**

```markdown
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
```

- [ ] **Step 4: Full pipeline, commit, push**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all green (35 api tests).

```bash
git add apps/api docs/security.md
git commit -m "test: automated tenant isolation spec covering every route"
git push
```

---

## W1b exit criteria

- [ ] Signup provisions a working tenant (branch, chairs, services) in one transaction
- [ ] Login / refresh / demo-login / me all pass; refresh token is httpOnly and never in a response body
- [ ] The tenant extension injects scope on create, list, and unique operations, and throws outside context
- [ ] Cross-tenant access returns 404 on id routes and empty results on collections — proven per route by the registry spec
- [ ] The registry spec fails when a route is added without classification (verified by its own first test)
- [ ] Exclusion violations surface as `409 SLOT_CONFLICT` with the constraint name through the public API
- [ ] `JWT_SECRET` / `JWT_REFRESH_SECRET` set on Render (user action) and deploy is green
- [ ] CI green; `docs/security.md` explains the model well enough to answer isolation questions cold
