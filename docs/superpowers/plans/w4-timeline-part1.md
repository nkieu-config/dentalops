# W4 Timeline Part 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The staff web app goes from a health-check page to a working scheduler: design tokens + primitives, demo login, responsive app shell, and the flagship TimeGrid — dentist columns, shift shading, now line, appointment cards with overlap lanes, click/drag-to-create booking against the real API — plus the `/dev/ui` gallery that renders every component in every state.

**Architecture:** This is a protected FE week. The DOM strategy is the core decision: grid lines are CSS `repeating-linear-gradient` (zero nodes), appointment cards are absolutely positioned from pure geometry functions, and a scroll-driven visible-range hook windows the cards — so the 1,000-card gallery fixture stays smooth without a virtualization library. Off-shift shading reuses `subtract()` from `@dentalops/availability` in the browser — the same tested interval math the server uses, which is the whole point of the shared package. Times are computed in UTC epoch ms and rendered through `Intl` with `timeZone: "Asia/Bangkok"`, so any viewer sees clinic time. Access tokens live only in memory; a silent `POST /auth/refresh` (httpOnly cookie) restores the session on reload and retries once on 401.

**Tech Stack:** React 19, react-router, Tailwind CSS v4 (`@tailwindcss/vite`), radix dialog, cva + clsx + tailwind-merge, lucide-react, sonner, `@fontsource-variable/inter`, MSW v2 for tests. No new BE frameworks.

## Global Constraints

- Node >= 22, pnpm 10; plain `pnpm` — never `corepack enable` (EACCES on this machine)
- **After any `pnpm install`, run `pnpm --filter @dentalops/api db:generate`** — pnpm 10 blocks Prisma's postinstall and typecheck fails with a stubbed client otherwise
- TypeScript strict everywhere; **no comments in any code file**; `@typescript-eslint/no-unused-vars` is `error`
- Conventional commits; **no trailers of any kind**
- Never read, print, or commit any `.env`
- **The only BE work allowed this week is Task 2** (three read-only list endpoints). Anything else that looks like it needs API changes is out of scope — flag it and stop
- Every new API route goes into `REGISTRY` in `apps/api/test/tenant-isolation.spec.ts` in the same task (all three here are `"filtered"`)
- `GET /staff` must never return `passwordHash` — use an explicit Prisma `select`; the spec asserts its absence
- Design tokens come only from `docs/design-system/MASTER.md`; **no hard-coded colors or spacing outside `app.css`** — components reference tokens (`bg-primary`, `var(--hue2-border)`, `h-topbar`)
- Chrome is quiet, data carries the color, status is reserved: brand teal never on appointment cards; red/amber/emerald only for status; every status has an icon or text, never color alone
- All times/durations/counts render with `tabular-nums`; no `100vh` (use `100dvh`); `body` never scrolls horizontally — only the grid container scrolls
- The web test glob must become `src/**/*.test.{ts,tsx}` (Task 1) — the math libs test as `.ts`
- Do not reformat files you are not changing
- Full pipeline (`pnpm lint && pnpm typecheck && pnpm test && pnpm build`) before every push; push to `origin main`; report CI conclusion

---

### Task 1: Design tokens, primitives, router skeleton

**Files:**
- Create: `apps/web/src/app.css`, `apps/web/src/lib/cn.ts`, `apps/web/src/components/ui/button.tsx`, `input.tsx`, `label.tsx`, `native-select.tsx`, `skeleton.tsx`, `sheet.tsx`, `empty-state.tsx`, `apps/web/src/routes.tsx`, `apps/web/src/pages/dev-ui-page.tsx`, `apps/web/vercel.json`
- Modify: `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/src/main.tsx`, `apps/web/vitest.setup.ts`, `apps/web/index.html` (title "DentalOps")
- Delete: `apps/web/src/App.tsx`, `apps/web/src/App.test.tsx` (replaced by routes; the health probe moves to the landing page in Task 3)
- Test: `apps/web/src/components/ui/button.test.tsx`

**Interfaces:**
- Consumes: `docs/design-system/MASTER.md` §2 (token block) and §3 (data hues).
- Produces: `cn(...inputs)`, `<Button variant="default|secondary|ghost|destructive" size="default|sm|icon">`, `<Input>`, `<Label>`, `<NativeSelect>`, `<Skeleton>`, `<Sheet open onOpenChange side>` (radix dialog panel sliding from right/bottom), `<EmptyState icon title hint>`. Router with routes `/`, `/app` (layout stub), `/app/timeline` (placeholder), `/dev/ui`. Every later task builds screens from exactly these.

- [ ] **Step 1: Install dependencies**

In `apps/web`, add to `dependencies`: `react-router`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/react-dialog`, `sonner`, `@fontsource-variable/inter`, `tailwindcss`, `@tailwindcss/vite`, `"@dentalops/availability": "workspace:*"`; to `devDependencies`: `msw`, `@testing-library/user-event`, `@testing-library/jest-dom`.

Run: `pnpm install && pnpm --filter @dentalops/api db:generate && pnpm --filter @dentalops/availability build && pnpm --filter @dentalops/contracts build`

- [ ] **Step 2: Tokens**

Create `apps/web/src/app.css`: copy the **entire CSS block from `docs/design-system/MASTER.md` §2 verbatim** (from `@import "tailwindcss";` through the reduced-motion rule). Then append the data-hue variables from §3 exactly:

```css
:root {
  --hue0-bg: #f0f9ff; --hue0-border: #0284c7;
  --hue1-bg: #f5f3ff; --hue1-border: #7c3aed;
  --hue2-bg: #fdf4ff; --hue2-border: #c026d3;
  --hue3-bg: #eef2ff; --hue3-border: #4f46e5;
  --hue4-bg: #f7fee7; --hue4-border: #4d7c0f;
  --hue5-bg: #fff7ed; --hue5-border: #c2410c;
}

.dark {
  --hue0-bg: #082f49; --hue0-border: #38bdf8;
  --hue1-bg: #2e1065; --hue1-border: #a78bfa;
  --hue2-bg: #4a044e; --hue2-border: #e879f9;
  --hue3-bg: #1e1b4b; --hue3-border: #818cf8;
  --hue4-bg: #1a2e05; --hue4-border: #a3e635;
  --hue5-bg: #431407; --hue5-border: #fb923c;
}

body {
  background: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-sans);
  font-size: 0.875rem;
  line-height: 1.375rem;
  overflow-x: hidden;
}
```

- [ ] **Step 3: Vite + test config**

`apps/web/vite.config.ts` — add the Tailwind plugin and widen globs:

```ts
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: ["@dentalops/contracts", "@dentalops/availability"]
  },
  build: {
    commonjsOptions: {
      include: [/packages\/contracts/, /packages\/availability/, /node_modules/]
    }
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"]
  }
})
```

Append to `apps/web/vitest.setup.ts` (keep the existing cleanup):

```ts
import "@testing-library/jest-dom/vitest"
```

`apps/web/vercel.json`:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

- [ ] **Step 4: cn + primitives**

`apps/web/src/lib/cn.ts`:

```ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))
```

`apps/web/src/components/ui/button.tsx`:

```tsx
import { cva, type VariantProps } from "class-variance-authority"
import { ButtonHTMLAttributes, forwardRef } from "react"
import { cn } from "../../lib/cn"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:opacity-90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:opacity-90"
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-xs",
        icon: "h-9 w-9"
      }
    },
    defaultVariants: { variant: "default", size: "default" }
  }
)

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type, ...props }, ref) => (
    <button
      ref={ref}
      type={type ?? "button"}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
)
Button.displayName = "Button"
```

`input.tsx`, `label.tsx`, `native-select.tsx`, `skeleton.tsx` — same idiom, minimal:

```tsx
import { InputHTMLAttributes, forwardRef } from "react"
import { cn } from "../../lib/cn"

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
)
Input.displayName = "Input"
```

```tsx
import { LabelHTMLAttributes } from "react"
import { cn } from "../../lib/cn"

export const Label = ({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) => (
  <label
    className={cn("text-xs font-medium uppercase tracking-wide text-muted-foreground", className)}
    {...props}
  />
)
```

```tsx
import { SelectHTMLAttributes, forwardRef } from "react"
import { cn } from "../../lib/cn"

export const NativeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      {...props}
    />
  )
)
NativeSelect.displayName = "NativeSelect"
```

```tsx
import { HTMLAttributes } from "react"
import { cn } from "../../lib/cn"

export const Skeleton = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />
)
```

`sheet.tsx` — radix dialog as a slide-in panel:

```tsx
import * as Dialog from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { ReactNode } from "react"
import { cn } from "../../lib/cn"

interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  side?: "right" | "bottom"
  children: ReactNode
}

export const Sheet = ({ open, onOpenChange, title, side = "right", children }: SheetProps) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
      <Dialog.Content
        className={cn(
          "fixed z-50 bg-card text-card-foreground shadow-md focus:outline-none overflow-y-auto",
          side === "right" &&
            "inset-y-0 right-0 w-full max-w-md border-l border-border p-6",
          side === "bottom" &&
            "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-lg border-t border-border p-6"
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          <Dialog.Close
            aria-label="Close"
            className="rounded-md p-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </Dialog.Close>
        </div>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
)
```

`empty-state.tsx`:

```tsx
import { LucideIcon } from "lucide-react"

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  hint?: string
}

export const EmptyState = ({ icon: Icon, title, hint }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
    <Icon className="h-8 w-8 text-muted-foreground" />
    <p className="font-medium">{title}</p>
    {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
  </div>
)
```

- [ ] **Step 5: Router skeleton + entry**

`apps/web/src/routes.tsx`:

```tsx
import { createBrowserRouter, Outlet } from "react-router"
import { DevUiPage } from "./pages/dev-ui-page"

const Placeholder = ({ label }: { label: string }) => (
  <div className="p-8 text-muted-foreground">{label}</div>
)

export const router = createBrowserRouter([
  { path: "/", element: <Placeholder label="Landing — Task 3" /> },
  {
    path: "/app",
    element: <Outlet />,
    children: [{ path: "timeline", element: <Placeholder label="Timeline — Task 5" /> }]
  },
  { path: "/dev/ui", element: <DevUiPage /> }
])
```

`apps/web/src/main.tsx`:

```tsx
import "@fontsource-variable/inter"
import "./app.css"
import * as Sentry from "@sentry/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router"
import { Toaster } from "sonner"
import { router } from "./routes"

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN })
}

const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } }
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  </StrictMode>
)
```

`apps/web/src/pages/dev-ui-page.tsx` — first section only (tokens + primitives; grows in Task 8):

```tsx
import { CalendarX } from "lucide-react"
import { Button } from "../components/ui/button"
import { EmptyState } from "../components/ui/empty-state"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Skeleton } from "../components/ui/skeleton"

const swatches = [
  "background", "foreground", "primary", "secondary", "muted", "accent",
  "destructive", "warning", "success", "border"
]

export const DevUiPage = () => (
  <div className="mx-auto max-w-4xl space-y-10 p-8">
    <h1 className="text-2xl font-semibold">/dev/ui</h1>
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Tokens</h2>
      <div className="flex flex-wrap gap-3">
        {swatches.map((name) => (
          <div key={name} className="text-center text-xs">
            <div
              className="h-12 w-12 rounded-md border border-border"
              style={{ background: `var(--color-${name})` }}
            />
            {name}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-12 w-12 rounded-sm border-l-[3px]"
            style={{ background: `var(--hue${i}-bg)`, borderLeftColor: `var(--hue${i}-border)` }}
          />
        ))}
      </div>
    </section>
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Primitives</h2>
      <div className="flex flex-wrap items-center gap-2">
        <Button>Default</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Button size="sm">Small</Button>
        <Button disabled>Disabled</Button>
      </div>
      <div className="max-w-xs space-y-2">
        <Label htmlFor="demo-input">Label</Label>
        <Input id="demo-input" placeholder="Input" />
        <Skeleton className="h-9 w-full" />
      </div>
      <EmptyState icon={CalendarX} title="No appointments" hint="Drag on the grid to create one" />
    </section>
  </div>
)
```

- [ ] **Step 6: Test**

`apps/web/src/components/ui/button.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Button } from "./button"

describe("Button", () => {
  it("defaults to type=button so forms are not submitted by accident", () => {
    render(<Button>Go</Button>)
    expect(screen.getByRole("button", { name: "Go" })).toHaveAttribute("type", "button")
  })

  it("applies the destructive variant class", () => {
    render(<Button variant="destructive">Delete</Button>)
    expect(screen.getByRole("button", { name: "Delete" }).className).toContain("bg-destructive")
  })
})
```

Run: `pnpm --filter @dentalops/web test` → PASS. Run `pnpm --filter @dentalops/web build` → builds. Open `pnpm --filter @dentalops/web dev` is not required in CI, skip.

- [ ] **Step 7: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): design tokens, ui primitives, and router skeleton"
```

---

### Task 2: Directory endpoints — the week's only BE work

**Files:**
- Create: `apps/api/src/directory/directory.module.ts`, `directory.controller.ts`, `directory.service.ts`, `dto/query-staff.dto.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/test/tenant-isolation.spec.ts`
- Test: `apps/api/test/directory.spec.ts`

**Interfaces:**
- Consumes: `prisma.scoped`.
- Produces: `GET /branches` → `[{ id, name, openingHours }]`; `GET /staff?role=` → `[{ id, name, role, isActive }]` (**never** `passwordHash` or `email` — explicit `select`); `GET /services` → `[{ id, name, durationMin, bufferMin, colorIndex, isActive }]`. All auth-only (any role), tenant-scoped by the extension. Task 3's hooks consume these exact shapes.

- [ ] **Step 1: Implement**

`apps/api/src/directory/dto/query-staff.dto.ts`:

```ts
import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsIn, IsOptional } from "class-validator"

export class QueryStaffDto {
  @ApiPropertyOptional({ enum: ["owner", "dentist", "receptionist"] })
  @IsOptional()
  @IsIn(["owner", "dentist", "receptionist"])
  role?: "owner" | "dentist" | "receptionist"
}
```

`apps/api/src/directory/directory.service.ts`:

```ts
import { Injectable } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { QueryStaffDto } from "./dto/query-staff.dto"

@Injectable()
export class DirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  branches() {
    return this.prisma.scoped.branch.findMany({
      select: { id: true, name: true, openingHours: true },
      orderBy: { name: "asc" }
    })
  }

  staff(query: QueryStaffDto) {
    return this.prisma.scoped.user.findMany({
      where: query.role ? { role: query.role } : {},
      select: { id: true, name: true, role: true, isActive: true },
      orderBy: { name: "asc" }
    })
  }

  services() {
    return this.prisma.scoped.service.findMany({
      select: {
        id: true,
        name: true,
        durationMin: true,
        bufferMin: true,
        colorIndex: true,
        isActive: true
      },
      orderBy: { name: "asc" }
    })
  }
}
```

`apps/api/src/directory/directory.controller.ts`:

```ts
import { Controller, Get, Query } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { DirectoryService } from "./directory.service"
import { QueryStaffDto } from "./dto/query-staff.dto"

@ApiTags("directory")
@ApiBearerAuth()
@Controller()
export class DirectoryController {
  constructor(private readonly directory: DirectoryService) {}

  @Get("branches")
  branches() {
    return this.directory.branches()
  }

  @Get("staff")
  staff(@Query() query: QueryStaffDto) {
    return this.directory.staff(query)
  }

  @Get("services")
  services() {
    return this.directory.services()
  }
}
```

`directory.module.ts` wires controller + service; add `DirectoryModule` to `app.module.ts` imports. Add to `REGISTRY`:

```ts
  "GET /branches": "filtered",
  "GET /staff": "filtered",
  "GET /services": "filtered",
```

- [ ] **Step 2: Spec**

`apps/api/test/directory.spec.ts`:

```ts
import { INestApplication } from "@nestjs/common"
import request from "supertest"
import type { Server } from "node:http"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

describe("directory", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let ownerToken: string
  const slug = `dir-test-${Date.now()}`

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)
    const signup = await request(server).post("/auth/signup").send({
      clinicName: "Directory Test Clinic",
      slug,
      email: "owner@dirtest.local",
      password: "s3cure-pass",
      name: "Owner"
    })
    expectStatus(signup, 200)
    ownerToken = signup.body.accessToken
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } })
    await app.close()
  })

  it("lists the tenant's branches", async () => {
    const res = await request(server)
      .get("/branches")
      .set("Authorization", `Bearer ${ownerToken}`)
    expectStatus(res, 200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].name).toBe("Main Branch")
    expect(res.body[0].openingHours).toBeDefined()
  })

  it("lists staff without ever exposing credentials", async () => {
    const res = await request(server)
      .get("/staff")
      .set("Authorization", `Bearer ${ownerToken}`)
    expectStatus(res, 200)
    expect(res.body.length).toBeGreaterThanOrEqual(1)
    for (const member of res.body) {
      expect(member).toHaveProperty("id")
      expect(member).toHaveProperty("name")
      expect(member).toHaveProperty("role")
      expect(member).toHaveProperty("isActive")
      expect(member).not.toHaveProperty("passwordHash")
      expect(member).not.toHaveProperty("email")
    }
  })

  it("filters staff by role", async () => {
    const res = await request(server)
      .get("/staff")
      .query({ role: "dentist" })
      .set("Authorization", `Bearer ${ownerToken}`)
    expectStatus(res, 200)
    expect(res.body.every((m: { role: string }) => m.role === "dentist")).toBe(true)
  })

  it("lists services with their stored colorIndex", async () => {
    const res = await request(server)
      .get("/services")
      .set("Authorization", `Bearer ${ownerToken}`)
    expectStatus(res, 200)
    expect(res.body).toHaveLength(6)
    const indexes = res.body.map((s: { colorIndex: number }) => s.colorIndex).sort()
    expect(indexes).toEqual([0, 1, 2, 3, 4, 5])
  })
})
```

Run: `cd apps/api && pnpm test` → 18 suites (directory added), all passing.

- [ ] **Step 3: Commit**

```bash
git add apps/api
git commit -m "feat(api): read-only directory endpoints for branches, staff, services"
```

---

### Task 3: Contracts, api client, session, demo landing, app shell

**Files:**
- Create: `packages/contracts/src/directory.ts`, `packages/contracts/src/scheduling.ts`, `packages/contracts/src/auth.ts`, `apps/web/src/lib/api.ts`, `apps/web/src/lib/session.ts`, `apps/web/src/lib/theme.ts`, `apps/web/src/pages/landing-page.tsx`, `apps/web/src/components/shell/app-shell.tsx`, `apps/web/src/components/shell/require-auth.tsx`, `apps/web/src/test/msw.ts`
- Modify: `packages/contracts/src/index.ts`, `apps/web/src/routes.tsx`, `apps/web/vitest.setup.ts`
- Test: `apps/web/src/lib/api.test.ts`, `apps/web/src/components/shell/require-auth.test.tsx`

**Interfaces:**
- Consumes: Task 2's endpoints; the auth controller's `{ accessToken, user: { id, tenantId, name, role } }` response; the api error contract `{ statusCode, errorCode, message, details?, requestId }`.
- Produces:
  - Contracts: `authSessionSchema`/`AuthSession`, `branchSchema`, `staffMemberSchema`, `serviceSummarySchema`, `shiftSchema`, `appointmentSchema` (with nested `service`, `patient`, `claims`), `patientSchema`, `patientPageSchema`.
  - `api(path, schema, init?)` — base `${VITE_API_URL}/api/v1`, `credentials: "include"`, bearer header when a session exists, single-flight refresh + one retry on 401, throws `ApiError { status, errorCode, message, details }` on failure.
  - `session.ts`: `getSession()`, `useSession()` (via `useSyncExternalStore`), `setSession(s, { demo })`, `isDemo()`, `refreshSession()` (single-flight), `logout()`.
  - `<RequireAuth>` route wrapper: no session → try one silent refresh → still none → redirect `/`.
  - `<AppShell>`: topbar (h `--spacing-topbar`), nav per breakpoint map (≥1024 sidebar 240px; 768–1023 icon rail; <768 bottom nav), demo banner, `<Outlet/>`.
  - MSW server for web tests.

- [ ] **Step 1: Contracts**

`packages/contracts/src/auth.ts`:

```ts
import { z } from "zod"

export const sessionUserSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  name: z.string(),
  role: z.enum(["owner", "dentist", "receptionist"])
})

export const authSessionSchema = z.object({
  accessToken: z.string(),
  user: sessionUserSchema
})

export type SessionUser = z.infer<typeof sessionUserSchema>
export type AuthSession = z.infer<typeof authSessionSchema>
```

`packages/contracts/src/directory.ts`:

```ts
import { z } from "zod"

export const branchSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  openingHours: z.unknown()
})

export const staffMemberSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  role: z.enum(["owner", "dentist", "receptionist"]),
  isActive: z.boolean()
})

export const serviceSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  durationMin: z.number().int(),
  bufferMin: z.number().int(),
  colorIndex: z.number().int(),
  isActive: z.boolean()
})

export type Branch = z.infer<typeof branchSchema>
export type StaffMember = z.infer<typeof staffMemberSchema>
export type ServiceSummary = z.infer<typeof serviceSummarySchema>
```

`packages/contracts/src/scheduling.ts` — parse only what the timeline consumes; `.loose()` objects so extra API fields never break the FE:

```ts
import { z } from "zod"

export const shiftSchema = z.looseObject({
  id: z.uuid(),
  staffId: z.uuid(),
  branchId: z.uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime()
})

export const appointmentStatusSchema = z.enum(["confirmed", "completed", "cancelled", "no_show"])

export const appointmentSchema = z.looseObject({
  id: z.uuid(),
  branchId: z.uuid(),
  serviceId: z.uuid(),
  dentistId: z.uuid(),
  patientId: z.uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  status: appointmentStatusSchema,
  version: z.number().int(),
  service: z.looseObject({ id: z.uuid(), name: z.string(), colorIndex: z.number().int() }),
  patient: z.looseObject({ id: z.uuid(), name: z.string(), phone: z.string() })
})

export const patientSchema = z.looseObject({
  id: z.uuid(),
  name: z.string(),
  phone: z.string()
})

export const patientPageSchema = z.object({
  items: z.array(patientSchema),
  nextCursor: z.string().nullable()
})

export type Shift = z.infer<typeof shiftSchema>
export type Appointment = z.infer<typeof appointmentSchema>
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>
export type Patient = z.infer<typeof patientSchema>
```

Export all three modules from `packages/contracts/src/index.ts` following its existing explicit named-export style. Run `pnpm --filter @dentalops/contracts build`.

- [ ] **Step 2: Session + api client**

`apps/web/src/lib/session.ts`:

```ts
import { authSessionSchema, type AuthSession } from "@dentalops/contracts"
import { useSyncExternalStore } from "react"

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001"

let session: AuthSession | null = null
let demo = false
const listeners = new Set<() => void>()

const emit = () => {
  for (const listener of listeners) listener()
}

export const getSession = () => session
export const isDemo = () => demo

export const setSession = (next: AuthSession | null, opts?: { demo?: boolean }) => {
  session = next
  demo = next === null ? false : (opts?.demo ?? demo)
  emit()
}

export const useSession = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => session
  )

let refreshing: Promise<AuthSession | null> | null = null

export const refreshSession = (): Promise<AuthSession | null> => {
  refreshing ??= fetch(`${API_URL}/api/v1/auth/refresh`, {
    method: "POST",
    credentials: "include"
  })
    .then(async (res) => (res.ok ? authSessionSchema.parse(await res.json()) : null))
    .catch(() => null)
    .then((next) => {
      refreshing = null
      setSession(next)
      return next
    })
  return refreshing
}

export const logout = () => setSession(null)
```

`apps/web/src/lib/api.ts`:

```ts
import { apiErrorSchema } from "@dentalops/contracts"
import type { ZodType } from "zod"
import { getSession, refreshSession } from "./session"

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001"

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly errorCode: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
  }
}

interface ApiInit {
  method?: "GET" | "POST" | "PATCH" | "DELETE"
  body?: unknown
  query?: Record<string, string | undefined>
}

export const api = async <T>(path: string, schema: ZodType<T>, init: ApiInit = {}): Promise<T> => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (value !== undefined) params.set(key, value)
  }
  const qs = params.size > 0 ? `?${params.toString()}` : ""
  const url = `${API_URL}/api/v1${path}${qs}`

  const run = () =>
    fetch(url, {
      method: init.method ?? "GET",
      credentials: "include",
      headers: {
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(getSession() ? { authorization: `Bearer ${getSession()!.accessToken}` } : {})
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined
    })

  let res = await run()
  if (res.status === 401 && getSession()) {
    const renewed = await refreshSession()
    if (renewed) res = await run()
  }
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null)
    const parsed = apiErrorSchema.safeParse(body)
    if (parsed.success) {
      throw new ApiError(res.status, parsed.data.errorCode, parsed.data.message, parsed.data.details)
    }
    throw new ApiError(res.status, "HTTP_ERROR", `API responded ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return schema.parse(await res.json())
}
```

`apps/web/src/lib/theme.ts`:

```ts
export const initTheme = () => {
  const stored = localStorage.getItem("dentalops-theme")
  const dark = stored ? stored === "dark" : matchMedia("(prefers-color-scheme: dark)").matches
  document.documentElement.classList.toggle("dark", dark)
}

export const toggleTheme = () => {
  const dark = document.documentElement.classList.toggle("dark")
  localStorage.setItem("dentalops-theme", dark ? "dark" : "light")
}
```

Call `initTheme()` at the top of `main.tsx` (before render).

- [ ] **Step 3: Landing + guard + shell**

`apps/web/src/pages/landing-page.tsx`:

```tsx
import { authSessionSchema } from "@dentalops/contracts"
import { useMutation } from "@tanstack/react-query"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { api } from "../lib/api"
import { setSession } from "../lib/session"
import { Button } from "../components/ui/button"

const roles = [
  { role: "owner", label: "Try as Owner", hint: "Full control — roster, settings, reports" },
  { role: "receptionist", label: "Try as Receptionist", hint: "The booking desk — timeline and patients" },
  { role: "dentist", label: "Try as Dentist", hint: "Your own schedule" }
] as const

export const LandingPage = () => {
  const navigate = useNavigate()
  const demoLogin = useMutation({
    mutationFn: (role: string) =>
      api("/auth/demo-login", authSessionSchema, { method: "POST", body: { role } }),
    onSuccess: (session) => {
      setSession(session, { demo: true })
      navigate("/app/timeline")
    },
    onError: () => toast.error("Demo login failed — is the API awake?")
  })

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 p-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold">DentalOps</h1>
        <p className="text-base text-muted-foreground">
          Multi-tenant appointment and roster scheduling for dental clinics
        </p>
      </div>
      <div className="space-y-3">
        {roles.map(({ role, label, hint }) => (
          <Button
            key={role}
            className="h-auto w-full flex-col items-start gap-1 py-3"
            variant={role === "owner" ? "default" : "secondary"}
            disabled={demoLogin.isPending}
            onClick={() => demoLogin.mutate(role)}
          >
            <span className="font-semibold">{label}</span>
            <span className="text-xs opacity-80">{hint}</span>
          </Button>
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        A demo clinic with 431 seeded appointments. Data resets periodically.
      </p>
    </main>
  )
}
```

`apps/web/src/components/shell/require-auth.tsx`:

```tsx
import { ReactNode, useEffect, useState } from "react"
import { Navigate } from "react-router"
import { refreshSession, useSession } from "../../lib/session"
import { Skeleton } from "../ui/skeleton"

export const RequireAuth = ({ children }: { children: ReactNode }) => {
  const session = useSession()
  const [checked, setChecked] = useState(session !== null)

  useEffect(() => {
    if (session === null && !checked) {
      void refreshSession().finally(() => setChecked(true))
    }
  }, [session, checked])

  if (session) return children
  if (!checked) {
    return (
      <div className="space-y-3 p-8">
        <Skeleton className="h-topbar w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  return <Navigate to="/" replace />
}
```

`apps/web/src/components/shell/app-shell.tsx` — topbar + responsive nav + demo banner. Full code:

```tsx
import { CalendarDays, ClipboardList, Moon, Settings, Users } from "lucide-react"
import { NavLink, Outlet, useNavigate } from "react-router"
import { isDemo, logout, useSession } from "../../lib/session"
import { toggleTheme } from "../../lib/theme"
import { cn } from "../../lib/cn"
import { Button } from "../ui/button"

const navItems = [
  { to: "/app/timeline", label: "Timeline", icon: CalendarDays },
  { to: "/app/roster", label: "Roster", icon: ClipboardList },
  { to: "/app/patients", label: "Patients", icon: Users },
  { to: "/app/settings", label: "Settings", icon: Settings }
]

const NavList = ({ railOnly }: { railOnly: boolean }) => (
  <nav className="flex flex-col gap-1 p-2">
    {navItems.map(({ to, label, icon: Icon }) => (
      <NavLink
        key={to}
        to={to}
        title={label}
        className={({ isActive }) =>
          cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
            isActive ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-accent"
          )
        }
      >
        <Icon className="h-4 w-4 shrink-0" />
        {railOnly ? null : <span>{label}</span>}
      </NavLink>
    ))}
  </nav>
)

export const AppShell = () => {
  const session = useSession()
  const navigate = useNavigate()

  return (
    <div className="flex min-h-dvh flex-col">
      {isDemo() ? (
        <div className="bg-warning px-4 py-1 text-center text-xs font-medium text-warning-foreground">
          Demo mode — data resets periodically
        </div>
      ) : null}
      <header className="flex h-topbar shrink-0 items-center gap-3 border-b border-border px-4">
        <span className="font-semibold text-primary">DentalOps</span>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={toggleTheme}>
          <Moon className="h-4 w-4" />
        </Button>
        <span className="hidden text-sm text-muted-foreground sm:inline">{session?.user.name}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            logout()
            navigate("/")
          }}
        >
          Log out
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-14 shrink-0 border-r border-border md:block lg:w-60">
          <div className="lg:hidden">
            <NavList railOnly />
          </div>
          <div className="hidden lg:block">
            <NavList railOnly={false} />
          </div>
        </aside>
        <main className="min-w-0 flex-1 pb-bottomnav md:pb-0">
          <Outlet />
        </main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-bottomnav border-t border-border bg-background md:hidden">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 text-[0.65rem]",
                isActive ? "text-primary" : "text-muted-foreground"
              )
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
```

Update `routes.tsx`: `/` → `<LandingPage/>`; `/app` → `<RequireAuth><AppShell/></RequireAuth>` with children `timeline` (placeholder until Task 5), `roster`, `patients`, `settings` (Placeholder "arrives in W7/W6"); keep `/dev/ui` unguarded.

- [ ] **Step 4: MSW + tests**

`apps/web/src/test/msw.ts`:

```ts
import { setupServer } from "msw/node"
import { http, HttpResponse } from "msw"

export const API = "http://localhost:3001/api/v1"
export const server = setupServer()
export { http, HttpResponse }
```

Append to `vitest.setup.ts`:

```ts
import { afterAll, beforeAll } from "vitest"
import { server } from "./src/test/msw"

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

(merge with the existing `afterEach(cleanup)` — one file, both behaviours; also call `setSession(null)` in `afterEach` to isolate session state between tests.)

`apps/web/src/lib/api.test.ts`:

```ts
import { z } from "zod"
import { afterEach, describe, expect, it } from "vitest"
import { API, HttpResponse, http, server } from "../test/msw"
import { api, ApiError } from "./api"
import { setSession } from "./session"

const fakeSession = {
  accessToken: "t1",
  user: {
    id: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
    tenantId: "6f9619ff-8b86-4d01-b42d-00cf4fc964fe",
    name: "Owner",
    role: "owner" as const
  }
}

afterEach(() => setSession(null))

describe("api client", () => {
  it("refreshes once on 401 and retries with the new token", async () => {
    setSession(fakeSession)
    const seen: string[] = []
    server.use(
      http.get(`${API}/ping`, ({ request }) => {
        const auth = request.headers.get("authorization") ?? ""
        seen.push(auth)
        if (auth === "Bearer t2") return HttpResponse.json({ ok: true })
        return HttpResponse.json(
          { statusCode: 401, errorCode: "UNAUTHORIZED", message: "no", requestId: "r" },
          { status: 401 }
        )
      }),
      http.post(`${API}/auth/refresh`, () =>
        HttpResponse.json({ ...fakeSession, accessToken: "t2" })
      )
    )
    const result = await api("/ping", z.object({ ok: z.boolean() }))
    expect(result.ok).toBe(true)
    expect(seen).toEqual(["Bearer t1", "Bearer t2"])
  })

  it("throws a typed ApiError carrying the errorCode", async () => {
    server.use(
      http.get(`${API}/boom`, () =>
        HttpResponse.json(
          { statusCode: 409, errorCode: "SLOT_CONFLICT", message: "taken", requestId: "r" },
          { status: 409 }
        )
      )
    )
    const err = await api("/boom", z.unknown()).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).errorCode).toBe("SLOT_CONFLICT")
  })

  it("does not attempt refresh for anonymous requests", async () => {
    let refreshCalls = 0
    server.use(
      http.get(`${API}/anon`, () =>
        HttpResponse.json(
          { statusCode: 401, errorCode: "UNAUTHORIZED", message: "no", requestId: "r" },
          { status: 401 }
        )
      ),
      http.post(`${API}/auth/refresh`, () => {
        refreshCalls++
        return HttpResponse.json(fakeSession)
      })
    )
    await expect(api("/anon", z.unknown())).rejects.toBeInstanceOf(ApiError)
    expect(refreshCalls).toBe(0)
  })
})
```

`apps/web/src/components/shell/require-auth.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router"
import { afterEach, describe, expect, it } from "vitest"
import { API, HttpResponse, http, server } from "../../test/msw"
import { setSession } from "../../lib/session"
import { RequireAuth } from "./require-auth"

afterEach(() => setSession(null))

const mount = () =>
  render(
    <MemoryRouter initialEntries={["/app"]}>
      <Routes>
        <Route path="/" element={<p>landing</p>} />
        <Route
          path="/app"
          element={
            <RequireAuth>
              <p>protected</p>
            </RequireAuth>
          }
        />
      </Routes>
    </MemoryRouter>
  )

describe("RequireAuth", () => {
  it("restores the session via silent refresh", async () => {
    server.use(
      http.post(`${API}/auth/refresh`, () =>
        HttpResponse.json({
          accessToken: "t1",
          user: {
            id: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
            tenantId: "6f9619ff-8b86-4d01-b42d-00cf4fc964fe",
            name: "Owner",
            role: "owner"
          }
        })
      )
    )
    mount()
    expect(await screen.findByText("protected")).toBeInTheDocument()
  })

  it("redirects to landing when refresh fails", async () => {
    server.use(http.post(`${API}/auth/refresh`, () => new HttpResponse(null, { status: 401 })))
    mount()
    expect(await screen.findByText("landing")).toBeInTheDocument()
  })
})
```

Run: `pnpm --filter @dentalops/web test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts apps/web
git commit -m "feat(web): session management, typed api client, demo landing, app shell"
```

---

### Task 4: Timeline geometry and lane layout — pure functions

**Files:**
- Create: `apps/web/src/features/timeline/lib/geometry.ts`, `apps/web/src/features/timeline/lib/lanes.ts`
- Test: `apps/web/src/features/timeline/lib/geometry.test.ts`, `apps/web/src/features/timeline/lib/lanes.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces (Tasks 5–8 use these exact names):

```ts
PX_PER_MIN = 16 / 15
DAY_MS
bkkDayStart(isoDate: string): number
bkkToday(): string
bkkShiftDate(isoDate: string, days: number): string
msToY(ms: number, dayStart: number): number
yToMs(y: number, dayStart: number): number
snapFloor(ms: number, stepMin?: number): number
snapCeil(ms: number, stepMin?: number): number
fmtTime(ms: number): string
fmtDay(isoDate: string): string
layoutLanes(items: { id, start, end }[]): Map<string, { id, lane, lanes }>
```

- [ ] **Step 1: Write the failing tests**

`geometry.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  bkkDayStart,
  bkkShiftDate,
  fmtTime,
  msToY,
  snapCeil,
  snapFloor,
  yToMs
} from "./geometry"

const day = bkkDayStart("2026-08-03")

describe("geometry", () => {
  it("bangkok midnight is 17:00 UTC the previous day", () => {
    expect(day).toBe(Date.parse("2026-08-02T17:00:00Z"))
  })

  it("maps time to pixels at 16px per 15 minutes", () => {
    expect(msToY(day, day)).toBe(0)
    expect(msToY(day + 9 * 3_600_000, day)).toBe(9 * 64)
    expect(msToY(day + 15 * 60_000, day)).toBe(16)
  })

  it("round-trips y back to time", () => {
    const nineFifteen = day + 9.25 * 3_600_000
    expect(yToMs(msToY(nineFifteen, day), day)).toBe(nineFifteen)
  })

  it("snaps to the 15-minute grid in both directions", () => {
    const t = day + 9 * 3_600_000 + 7 * 60_000
    expect(snapFloor(t)).toBe(day + 9 * 3_600_000)
    expect(snapCeil(t)).toBe(day + 9.25 * 3_600_000)
    expect(snapFloor(day + 9 * 3_600_000)).toBe(day + 9 * 3_600_000)
  })

  it("formats clinic wall time regardless of the viewer's zone", () => {
    expect(fmtTime(Date.parse("2026-08-03T02:00:00Z"))).toBe("09:00")
    expect(fmtTime(Date.parse("2026-08-03T16:30:00Z"))).toBe("23:30")
  })

  it("shifts a calendar date across a month boundary", () => {
    expect(bkkShiftDate("2026-08-31", 1)).toBe("2026-09-01")
    expect(bkkShiftDate("2026-08-01", -1)).toBe("2026-07-31")
  })
})
```

`lanes.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { layoutLanes } from "./lanes"

const item = (id: string, start: number, end: number) => ({ id, start, end })

describe("layoutLanes", () => {
  it("disjoint items each get the full width", () => {
    const out = layoutLanes([item("a", 0, 10), item("b", 20, 30)])
    expect(out.get("a")).toEqual({ id: "a", lane: 0, lanes: 1 })
    expect(out.get("b")).toEqual({ id: "b", lane: 0, lanes: 1 })
  })

  it("touching boundaries do not overlap", () => {
    const out = layoutLanes([item("a", 0, 10), item("b", 10, 20)])
    expect(out.get("a")!.lanes).toBe(1)
    expect(out.get("b")!.lane).toBe(0)
  })

  it("two overlapping items split into two lanes", () => {
    const out = layoutLanes([item("a", 0, 20), item("b", 10, 30)])
    expect(out.get("a")).toEqual({ id: "a", lane: 0, lanes: 2 })
    expect(out.get("b")).toEqual({ id: "b", lane: 1, lanes: 2 })
  })

  it("a chain reuses freed lanes but the cluster shares its width", () => {
    const out = layoutLanes([item("a", 0, 20), item("b", 10, 40), item("c", 25, 50)])
    expect(out.get("a")!.lane).toBe(0)
    expect(out.get("b")!.lane).toBe(1)
    expect(out.get("c")!.lane).toBe(0)
    expect(out.get("a")!.lanes).toBe(2)
    expect(out.get("c")!.lanes).toBe(2)
  })

  it("separate clusters size independently", () => {
    const out = layoutLanes([
      item("a", 0, 20),
      item("b", 10, 20),
      item("c", 30, 40)
    ])
    expect(out.get("a")!.lanes).toBe(2)
    expect(out.get("c")!.lanes).toBe(1)
  })

  it("triple overlap needs three lanes", () => {
    const out = layoutLanes([item("a", 0, 30), item("b", 5, 30), item("c", 10, 30)])
    expect(out.get("c")).toEqual({ id: "c", lane: 2, lanes: 3 })
  })
})
```

Run: `pnpm --filter @dentalops/web test` → FAIL (modules missing).

- [ ] **Step 2: Implement**

`geometry.ts`:

```ts
export const PX_PER_MIN = 16 / 15
export const DAY_MS = 86_400_000
const MINUTE = 60_000

export const bkkDayStart = (isoDate: string): number => Date.parse(`${isoDate}T00:00:00+07:00`)

const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" })
const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
})
const dayFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric"
})

export const bkkToday = (): string => dateFmt.format(new Date())

export const bkkShiftDate = (isoDate: string, days: number): string =>
  dateFmt.format(new Date(bkkDayStart(isoDate) + days * DAY_MS + DAY_MS / 2))

export const msToY = (ms: number, dayStart: number): number =>
  ((ms - dayStart) / MINUTE) * PX_PER_MIN

export const yToMs = (y: number, dayStart: number): number =>
  dayStart + Math.round(y / PX_PER_MIN) * MINUTE

export const snapFloor = (ms: number, stepMin = 15): number =>
  Math.floor(ms / (stepMin * MINUTE)) * stepMin * MINUTE

export const snapCeil = (ms: number, stepMin = 15): number =>
  Math.ceil(ms / (stepMin * MINUTE)) * stepMin * MINUTE

export const fmtTime = (ms: number): string => timeFmt.format(new Date(ms))

export const fmtDay = (isoDate: string): string =>
  dayFmt.format(new Date(bkkDayStart(isoDate) + DAY_MS / 2))
```

`lanes.ts`:

```ts
export interface LaneItem {
  id: string
  start: number
  end: number
}

export interface LanePosition {
  id: string
  lane: number
  lanes: number
}

export const layoutLanes = (items: LaneItem[]): Map<string, LanePosition> => {
  const sorted = [...items].sort(
    (a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id)
  )
  const result = new Map<string, LanePosition>()
  let laneEnds: number[] = []
  let cluster: string[] = []
  let clusterEnd = Number.NEGATIVE_INFINITY

  const flush = () => {
    for (const id of cluster) {
      const placed = result.get(id)
      if (placed) placed.lanes = laneEnds.length
    }
    cluster = []
    laneEnds = []
  }

  for (const current of sorted) {
    if (current.start >= clusterEnd) {
      flush()
      clusterEnd = current.end
    } else {
      clusterEnd = Math.max(clusterEnd, current.end)
    }
    let lane = laneEnds.findIndex((end) => end <= current.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(current.end)
    } else {
      laneEnds[lane] = current.end
    }
    result.set(current.id, { id: current.id, lane, lanes: 0 })
    cluster.push(current.id)
  }
  flush()
  return result
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `pnpm --filter @dentalops/web test` → PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): timeline geometry and overlap lane layout"
```

---

### Task 5: TimeGrid — columns, shift shading, now line, windowing

**Files:**
- Create: `apps/web/src/features/timeline/hooks.ts`, `apps/web/src/features/timeline/use-visible-range.ts`, `apps/web/src/features/timeline/time-grid.tsx`, `apps/web/src/features/timeline/timeline-page.tsx`, `apps/web/src/features/timeline/timeline-toolbar.tsx`
- Modify: `apps/web/src/routes.tsx` (timeline route → `<TimelinePage/>`)
- Test: `apps/web/src/features/timeline/time-grid.test.tsx`

**Interfaces:**
- Consumes: `api`, contracts schemas, `subtract` + `Interval` from `@dentalops/availability`, geometry helpers, directory endpoints.
- Produces: `useBranches()`, `useDentists()`, `useServices()`, `useShifts(branchId, dayStart)`, `useAppointments(branchId, dayStart)` (query keys `["branches"]`, `["staff"]`, `["services"]`, `["shifts", branchId, dayStart]`, `["appointments", branchId, dayStart]`); `<TimeGrid date branchId dentists shifts appointments onSlotDrag onAppointmentClick/>` rendering a 24h scrollable day (1536px), URL state `?d=YYYY-MM-DD&b=<branchId>`. Tasks 6–7 plug cards and drag-create into the two callbacks.

- [ ] **Step 1: Data hooks**

`hooks.ts`:

```ts
import {
  appointmentSchema,
  branchSchema,
  serviceSummarySchema,
  shiftSchema,
  staffMemberSchema
} from "@dentalops/contracts"
import { useQuery } from "@tanstack/react-query"
import { z } from "zod"
import { api } from "../../lib/api"
import { DAY_MS } from "./lib/geometry"

export const useBranches = () =>
  useQuery({ queryKey: ["branches"], queryFn: () => api("/branches", z.array(branchSchema)) })

export const useDentists = () =>
  useQuery({
    queryKey: ["staff", "dentist"],
    queryFn: () => api("/staff", z.array(staffMemberSchema), { query: { role: "dentist" } }),
    select: (staff) => staff.filter((s) => s.isActive)
  })

export const useServices = () =>
  useQuery({
    queryKey: ["services"],
    queryFn: () => api("/services", z.array(serviceSummarySchema)),
    select: (services) => services.filter((s) => s.isActive)
  })

const dayQuery = (dayStart: number) => ({
  from: new Date(dayStart).toISOString(),
  to: new Date(dayStart + DAY_MS).toISOString()
})

export const useShifts = (branchId: string | undefined, dayStart: number) =>
  useQuery({
    queryKey: ["shifts", branchId, dayStart],
    enabled: branchId !== undefined,
    queryFn: () =>
      api("/shifts", z.array(shiftSchema), { query: { branchId, ...dayQuery(dayStart) } })
  })

export const useAppointments = (branchId: string | undefined, dayStart: number) =>
  useQuery({
    queryKey: ["appointments", branchId, dayStart],
    enabled: branchId !== undefined,
    queryFn: () =>
      api("/appointments", z.array(appointmentSchema), {
        query: { branchId, ...dayQuery(dayStart) }
      })
  })
```

- [ ] **Step 2: Visible-range windowing hook**

`use-visible-range.ts`:

```ts
import { RefObject, useEffect, useState } from "react"

export interface VisibleRange {
  top: number
  bottom: number
}

const OVERSCAN = 200

export const useVisibleRange = (ref: RefObject<HTMLElement | null>): VisibleRange => {
  const [range, setRange] = useState<VisibleRange>({ top: 0, bottom: 2000 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let frame = 0
    const measure = () => {
      frame = 0
      setRange({
        top: el.scrollTop - OVERSCAN,
        bottom: el.scrollTop + (el.clientHeight || 1600) + OVERSCAN
      })
    }
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure)
    }
    measure()
    el.addEventListener("scroll", schedule, { passive: true })
    const observer = new ResizeObserver(schedule)
    observer.observe(el)
    return () => {
      el.removeEventListener("scroll", schedule)
      observer.disconnect()
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [ref])

  return range
}
```

- [ ] **Step 3: TimeGrid**

`time-grid.tsx` — the day surface. Key structure (write it exactly like this; Tasks 6–7 extend the marked areas):

```tsx
import { subtract, type Interval } from "@dentalops/availability"
import type { Appointment, Shift, StaffMember } from "@dentalops/contracts"
import { ReactNode, useEffect, useMemo, useRef, useState } from "react"
import { DAY_MS, bkkDayStart, bkkToday, fmtTime, msToY } from "./lib/geometry"
import { useVisibleRange } from "./use-visible-range"

const GRID_HEIGHT = 24 * 64

const gridBackground = {
  backgroundImage:
    "repeating-linear-gradient(to bottom, var(--grid-line-hour) 0px, var(--grid-line-hour) 1px, transparent 1px, transparent 64px), repeating-linear-gradient(to bottom, var(--grid-line) 0px, var(--grid-line) 1px, transparent 1px, transparent 16px)"
}

const stripeBackground = {
  backgroundImage:
    "repeating-linear-gradient(45deg, var(--offshift) 0px, var(--offshift) 6px, var(--offshift-stripe) 6px, var(--offshift-stripe) 7px)"
}

const toInterval = (row: { startsAt: string; endsAt: string }): Interval => ({
  start: Date.parse(row.startsAt),
  end: Date.parse(row.endsAt)
})

interface TimeGridProps {
  date: string
  dentists: StaffMember[]
  shifts: Shift[]
  appointments: Appointment[]
  renderAppointment: (appointment: Appointment, dayStart: number) => ReactNode
  columnOverlay?: (dentist: StaffMember, dayStart: number) => ReactNode
}

const useNow = (active: boolean) => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

export const TimeGrid = ({
  date,
  dentists,
  shifts,
  appointments,
  renderAppointment,
  columnOverlay
}: TimeGridProps) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const range = useVisibleRange(scrollRef)
  const dayStart = bkkDayStart(date)
  const isToday = date === bkkToday()
  const now = useNow(isToday)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 8 * 64 - 16 })
  }, [date])

  const offShiftByDentist = useMemo(() => {
    const day: Interval = { start: dayStart, end: dayStart + DAY_MS }
    const map = new Map<string, Interval[]>()
    for (const dentist of dentists) {
      const own = shifts.filter((s) => s.staffId === dentist.id).map(toInterval)
      map.set(dentist.id, subtract([day], own))
    }
    return map
  }, [dentists, shifts, dayStart])

  const visible = useMemo(
    () =>
      appointments.filter((a) => {
        const top = msToY(Date.parse(a.startsAt), dayStart)
        const bottom = msToY(Date.parse(a.endsAt), dayStart)
        return bottom >= range.top && top <= range.bottom
      }),
    [appointments, dayStart, range]
  )

  return (
    <div ref={scrollRef} data-testid="timegrid-scroll" className="min-h-0 flex-1 overflow-auto">
      <div className="flex min-w-fit">
        <div
          className="sticky left-0 z-20 w-timegutter shrink-0 bg-background"
          style={{ height: GRID_HEIGHT }}
        >
          <div className="relative h-full border-r border-border">
            {Array.from({ length: 24 }, (_, hour) => (
              <span
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums"
                style={{ top: hour * 64 }}
              >
                {String(hour).padStart(2, "0")}:00
              </span>
            ))}
            {isToday ? (
              <span
                className="absolute right-1 z-10 -translate-y-1/2 rounded-sm px-1 text-[0.65rem] font-medium text-white tabular-nums"
                style={{ top: msToY(now, dayStart), background: "var(--now-line)" }}
              >
                {fmtTime(now)}
              </span>
            ) : null}
          </div>
        </div>
        <div className="relative flex flex-1" style={{ height: GRID_HEIGHT, ...gridBackground }}>
          {dentists.map((dentist) => (
            <div
              key={dentist.id}
              data-testid={`col-${dentist.id}`}
              className="relative min-w-col-min flex-1 border-r border-border"
            >
              {(offShiftByDentist.get(dentist.id) ?? []).map((block) => (
                <div
                  key={block.start}
                  data-testid="offshift"
                  className="absolute inset-x-0"
                  style={{
                    top: msToY(block.start, dayStart),
                    height: msToY(block.end, dayStart) - msToY(block.start, dayStart),
                    ...stripeBackground
                  }}
                />
              ))}
              {visible
                .filter((a) => a.dentistId === dentist.id)
                .map((a) => renderAppointment(a, dayStart))}
              {columnOverlay?.(dentist, dayStart)}
            </div>
          ))}
          {isToday ? (
            <div
              className="pointer-events-none absolute inset-x-0 z-10 h-px"
              data-testid="now-line"
              style={{ top: msToY(now, dayStart), background: "var(--now-line)" }}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
```

Sticky column headers: `timeline-page.tsx` renders a header row above the grid (sticky within the page, showing dentist names) — keep the grid itself header-free so its height math stays pure.

- [ ] **Step 4: Toolbar + page**

`timeline-toolbar.tsx`:

```tsx
import type { Branch } from "@dentalops/contracts"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "../../components/ui/button"
import { NativeSelect } from "../../components/ui/native-select"
import { bkkShiftDate, bkkToday, fmtDay } from "./lib/geometry"

interface ToolbarProps {
  date: string
  branchId: string | undefined
  branches: Branch[]
  onChange: (next: { date?: string; branchId?: string }) => void
}

export const TimelineToolbar = ({ date, branchId, branches, onChange }: ToolbarProps) => (
  <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
    <NativeSelect
      aria-label="Branch"
      className="w-auto"
      value={branchId ?? ""}
      onChange={(e) => onChange({ branchId: e.target.value })}
    >
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </NativeSelect>
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Previous day"
        onClick={() => onChange({ date: bkkShiftDate(date, -1) })}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-40 text-center text-sm font-medium tabular-nums">{fmtDay(date)}</span>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Next day"
        onClick={() => onChange({ date: bkkShiftDate(date, 1) })}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
    <Button variant="secondary" size="sm" onClick={() => onChange({ date: bkkToday() })}>
      Today
    </Button>
  </div>
)
```

`timeline-page.tsx` (Task 5 version — cards render as plain positioned divs; Task 6 replaces `renderAppointment` with the real card):

```tsx
import { CalendarX } from "lucide-react"
import { useSearchParams } from "react-router"
import { EmptyState } from "../../components/ui/empty-state"
import { Skeleton } from "../../components/ui/skeleton"
import { useAppointments, useBranches, useDentists, useShifts } from "./hooks"
import { bkkDayStart, bkkToday, msToY } from "./lib/geometry"
import { TimeGrid } from "./time-grid"
import { TimelineToolbar } from "./timeline-toolbar"

export const TimelinePage = () => {
  const [params, setParams] = useSearchParams()
  const date = params.get("d") ?? bkkToday()
  const branches = useBranches()
  const branchId = params.get("b") ?? branches.data?.[0]?.id
  const dayStart = bkkDayStart(date)
  const dentists = useDentists()
  const shifts = useShifts(branchId, dayStart)
  const appointments = useAppointments(branchId, dayStart)

  const onChange = (next: { date?: string; branchId?: string }) => {
    const merged = new URLSearchParams(params)
    if (next.date) merged.set("d", next.date)
    if (next.branchId) merged.set("b", next.branchId)
    setParams(merged)
  }

  if (branches.isPending || dentists.isPending) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }
  if (branches.isError || dentists.isError) {
    return <EmptyState icon={CalendarX} title="Could not load the clinic" hint="Retry shortly" />
  }

  return (
    <div className="flex h-[calc(100dvh-var(--spacing-topbar))] flex-col">
      <TimelineToolbar
        date={date}
        branchId={branchId}
        branches={branches.data}
        onChange={onChange}
      />
      <div className="sticky top-0 z-20 flex border-b border-border bg-background pl-timegutter">
        {(dentists.data ?? []).map((d) => (
          <div key={d.id} className="min-w-col-min flex-1 truncate px-2 py-1 text-sm font-medium">
            {d.name}
          </div>
        ))}
      </div>
      <TimeGrid
        date={date}
        dentists={dentists.data ?? []}
        shifts={shifts.data ?? []}
        appointments={appointments.data ?? []}
        renderAppointment={(a, ds) => (
          <div
            key={a.id}
            className="absolute inset-x-1 rounded-sm border border-border bg-card px-1 text-xs"
            style={{
              top: msToY(Date.parse(a.startsAt), ds),
              height: msToY(Date.parse(a.endsAt), ds) - msToY(Date.parse(a.startsAt), ds)
            }}
          >
            {a.service.name}
          </div>
        )}
      />
    </div>
  )
}
```

Point the timeline route at `<TimelinePage/>`.

- [ ] **Step 5: Test**

`time-grid.test.tsx`:

```tsx
import type { Appointment, Shift, StaffMember } from "@dentalops/contracts"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { TimeGrid } from "./time-grid"

const dentist: StaffMember = {
  id: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  name: "Dr. Test",
  role: "dentist",
  isActive: true
}

const shift = (startsAt: string, endsAt: string): Shift =>
  ({
    id: "7f9619ff-8b86-4d01-b42d-00cf4fc964ff",
    staffId: dentist.id,
    branchId: "8f9619ff-8b86-4d01-b42d-00cf4fc964ff",
    startsAt,
    endsAt
  }) as Shift

describe("TimeGrid", () => {
  it("shades everything outside the shift as off-shift", () => {
    render(
      <TimeGrid
        date="2026-08-03"
        dentists={[dentist]}
        shifts={[shift("2026-08-03T02:00:00.000Z", "2026-08-03T10:00:00.000Z")]}
        appointments={[]}
        renderAppointment={() => null}
      />
    )
    const blocks = screen.getAllByTestId("offshift")
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toHaveStyle({ top: "0px", height: "576px" })
    expect(blocks[1]).toHaveStyle({ top: "1088px" })
  })

  it("a dentist with no shift is fully shaded", () => {
    render(
      <TimeGrid
        date="2026-08-03"
        dentists={[dentist]}
        shifts={[]}
        appointments={[]}
        renderAppointment={() => null}
      />
    )
    const blocks = screen.getAllByTestId("offshift")
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toHaveStyle({ top: "0px", height: "1536px" })
  })

  it("renders appointments through the render prop", () => {
    const appointment = {
      id: "9f9619ff-8b86-4d01-b42d-00cf4fc964ff",
      dentistId: dentist.id,
      startsAt: "2026-08-03T02:00:00.000Z",
      endsAt: "2026-08-03T03:00:00.000Z"
    } as Appointment
    render(
      <TimeGrid
        date="2026-08-03"
        dentists={[dentist]}
        shifts={[]}
        appointments={[appointment]}
        renderAppointment={(a) => <div key={a.id}>card-{a.id}</div>}
      />
    )
    expect(screen.getByText(`card-${appointment.id}`)).toBeInTheDocument()
  })
})
```

Shift 09:00–17:00 BKK = 02:00–10:00 UTC → off-shift `[00:00, 09:00)` = 0–576px and `[17:00, 24:00)` = top 1088px. jsdom has no layout — `clientHeight` is 0 — which is why the hook falls back to `|| 1600`: the visible window in tests is `[-200, 1800]`, so a 02:00 card (top 576) renders in the third test.

Add `use-visible-range.test.tsx` proving the windowing math against real dimensions (jsdom lets you define them):

```tsx
import { render, screen, fireEvent } from "@testing-library/react"
import { useRef } from "react"
import { describe, expect, it } from "vitest"
import { useVisibleRange } from "./use-visible-range"

const Harness = () => {
  const ref = useRef<HTMLDivElement>(null)
  const range = useVisibleRange(ref)
  return (
    <div ref={ref} data-testid="scroller">
      <output>{`${range.top}:${range.bottom}`}</output>
    </div>
  )
}

describe("useVisibleRange", () => {
  it("derives the padded window from scrollTop and clientHeight", async () => {
    render(<Harness />)
    const el = screen.getByTestId("scroller")
    Object.defineProperty(el, "clientHeight", { value: 800, configurable: true })
    Object.defineProperty(el, "scrollTop", { value: 500, writable: true })
    fireEvent.scroll(el)
    expect(await screen.findByText("300:1500")).toBeInTheDocument()
  })
})
```

(The scroll handler is rAF-throttled — if `findByText` alone is flaky, stub `requestAnimationFrame` to run callbacks synchronously in this test.)

Run: `pnpm --filter @dentalops/web test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): timegrid with shift shading, now line, and scroll windowing"
```

---

### Task 6: AppointmentCard, lanes, details drawer, status actions

**Files:**
- Create: `apps/web/src/features/timeline/appointment-card.tsx`, `apps/web/src/features/timeline/appointment-drawer.tsx`
- Modify: `apps/web/src/features/timeline/timeline-page.tsx`
- Test: `apps/web/src/features/timeline/appointment-card.test.tsx`, `apps/web/src/features/timeline/appointment-drawer.test.tsx`

**Interfaces:**
- Consumes: `layoutLanes`, geometry, `Sheet`, `api`, `ApiError`, sonner `toast`.
- Produces: `<AppointmentCard appointment dayStart lane lanes onClick>` implementing MASTER §3 status treatments exactly; `<AppointmentDrawer appointment open onOpenChange>` with Complete / No-show / Cancel actions calling `PATCH /appointments/:id/status`, invalidating `["appointments"]`, toasting success and `ApiError` messages. Task 7 reuses the drawer pattern for create.

- [ ] **Step 1: Card**

`appointment-card.tsx`:

```tsx
import type { Appointment } from "@dentalops/contracts"
import { AlertTriangle, Check, Repeat } from "lucide-react"
import { cn } from "../../lib/cn"
import { fmtTime, msToY } from "./lib/geometry"

interface AppointmentCardProps {
  appointment: Appointment
  dayStart: number
  lane: number
  lanes: number
  onClick: (appointment: Appointment) => void
}

export const AppointmentCard = ({
  appointment,
  dayStart,
  lane,
  lanes,
  onClick
}: AppointmentCardProps) => {
  const start = Date.parse(appointment.startsAt)
  const end = Date.parse(appointment.endsAt)
  const top = msToY(start, dayStart)
  const height = Math.max(msToY(end, dayStart) - top, 16)
  const hue = appointment.service.colorIndex % 6
  const cancelled = appointment.status === "cancelled"
  const noShow = appointment.status === "no_show"
  const completed = appointment.status === "completed"

  return (
    <button
      type="button"
      data-testid={`appt-${appointment.id}`}
      onClick={() => onClick(appointment)}
      className={cn(
        "absolute z-[5] flex flex-col items-start overflow-hidden rounded-sm border-l-[3px] px-1.5 py-0.5 text-left text-xs leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        completed && "opacity-70",
        cancelled && "border-l-border bg-muted text-muted-foreground"
      )}
      style={{
        top,
        height,
        left: `calc(${(lane / lanes) * 100}% + 2px)`,
        width: `calc(${(1 / lanes) * 100}% - 4px)`,
        ...(cancelled
          ? {}
          : {
              background: `var(--hue${hue}-bg)`,
              borderLeftColor: noShow ? "var(--warning)" : `var(--hue${hue}-border)`
            })
      }}
    >
      <span className="flex w-full items-center gap-1">
        <span className="font-medium tabular-nums">
          {fmtTime(start)}–{fmtTime(end)}
        </span>
        <span className="ml-auto flex items-center gap-0.5">
          {appointment.seriesId ? <Repeat className="h-3 w-3" aria-label="Recurring" /> : null}
          {completed ? <Check className="h-3 w-3" aria-label="Completed" /> : null}
          {noShow ? (
            <AlertTriangle className="h-3 w-3" style={{ color: "var(--warning)" }} aria-label="No-show" />
          ) : null}
        </span>
      </span>
      <span className={cn("truncate font-medium", cancelled && "line-through")}>
        {appointment.service.name}
      </span>
      <span className="truncate text-muted-foreground">{appointment.patient.name}</span>
    </button>
  )
}
```

(`seriesId` reaches the card through the loose schema; add `seriesId: z.uuid().nullable().optional()` to `appointmentSchema` in contracts so it is typed.)

- [ ] **Step 2: Drawer**

`appointment-drawer.tsx`:

```tsx
import type { Appointment, AppointmentStatus } from "@dentalops/contracts"
import { appointmentSchema } from "@dentalops/contracts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, ApiError } from "../../lib/api"
import { Button } from "../../components/ui/button"
import { Label } from "../../components/ui/label"
import { Sheet } from "../../components/ui/sheet"
import { fmtTime } from "./lib/geometry"

interface AppointmentDrawerProps {
  appointment: Appointment | null
  onClose: () => void
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="space-y-1">
    <Label>{label}</Label>
    <p className="text-sm">{value}</p>
  </div>
)

export const AppointmentDrawer = ({ appointment, onClose }: AppointmentDrawerProps) => {
  const queryClient = useQueryClient()
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AppointmentStatus }) =>
      api(`/appointments/${id}/status`, appointmentSchema, { method: "PATCH", body: { status } }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ["appointments"] })
      toast.success(`Marked ${updated.status.replace("_", "-")}`)
      onClose()
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Something went wrong")
  })

  return (
    <Sheet
      open={appointment !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={appointment?.service.name ?? ""}
    >
      {appointment ? (
        <div className="space-y-4">
          <Row
            label="Time"
            value={`${fmtTime(Date.parse(appointment.startsAt))}–${fmtTime(Date.parse(appointment.endsAt))}`}
          />
          <Row label="Patient" value={`${appointment.patient.name} · ${appointment.patient.phone}`} />
          <Row label="Status" value={appointment.status.replace("_", "-")} />
          {appointment.status === "confirmed" ? (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                size="sm"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ id: appointment.id, status: "completed" })}
              >
                Complete
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ id: appointment.id, status: "no_show" })}
              >
                No-show
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ id: appointment.id, status: "cancelled" })}
              >
                Cancel
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  )
}
```

- [ ] **Step 3: Wire into the page**

In `timeline-page.tsx`: add `const [selected, setSelected] = useState<Appointment | null>(null)`; compute lanes per dentist with `useMemo` over `layoutLanes(appointments.map(a => ({ id: a.id, start: Date.parse(a.startsAt), end: Date.parse(a.endsAt) })))` **grouped by dentist** (one `layoutLanes` call per dentist's appointments); replace the placeholder `renderAppointment` with `<AppointmentCard>` passing the lane position (default `{lane: 0, lanes: 1}` when missing); render `<AppointmentDrawer appointment={selected} onClose={() => setSelected(null)}/>`.

- [ ] **Step 4: Tests**

`appointment-card.test.tsx` — build a fixture appointment (helper returning a full `Appointment`), assert: confirmed card shows time range + service + patient and has hue background/border via inline style; completed shows the ✓ icon (`getByLabelText("Completed")`) and `opacity-70` class; no_show border-left color is `var(--warning)` and shows the ⚠ icon; cancelled has `line-through`, `bg-muted` class, no hue background. Assert `top`/`height` for a 09:00–10:00 BKK appointment with `dayStart = bkkDayStart("2026-08-03")`: top 576px, height 64px.

`appointment-drawer.test.tsx` — MSW `PATCH /appointments/:id/status` returning the updated appointment; user clicks Complete; assert the request body was `{ status: "completed" }` and drawer closes. Second case: MSW returns the 409 error contract with `errorCode: "INVALID_TRANSITION"`; assert `toast` error text appears (query by the message text within the document).

Run: `pnpm --filter @dentalops/web test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web packages/contracts
git commit -m "feat(web): appointment cards with status treatments and details drawer"
```

---

### Task 7: Drag-to-create with prefilled booking drawer

**Files:**
- Create: `apps/web/src/features/timeline/use-drag-create.ts`, `apps/web/src/features/timeline/create-drawer.tsx`
- Modify: `apps/web/src/features/timeline/timeline-page.tsx` (pass `columnOverlay` + render `<CreateDrawer/>`)
- Test: `apps/web/src/features/timeline/create-drawer.test.tsx`, `apps/web/src/features/timeline/use-drag-create.test.tsx`

**Interfaces:**
- Consumes: geometry (`yToMs`, `snapFloor`, `snapCeil`), `useServices`, `GET /patients?q=`, `POST /appointments`, off-shift intervals.
- Produces: `useDragCreate({ dayStart, onSelect })` returning `{ overlayProps, ghost }` — pointer handlers for the column overlay; a ghost `{ start: number; end: number } | null` while dragging; on release (or plain click = one 15-min slot) calls `onSelect({ dentistId, startsAt })`. `<CreateDrawer draft onClose>` posts the booking; `409 SLOT_CONFLICT` / `RESOURCE_UNAVAILABLE` surface as toasts with the API's message.

- [ ] **Step 1: Drag hook**

`use-drag-create.ts`:

```ts
import { PointerEvent, useState } from "react"
import { snapCeil, snapFloor, yToMs } from "./lib/geometry"

export interface DragGhost {
  start: number
  end: number
}

interface DragCreateOptions {
  dayStart: number
  onSelect: (range: DragGhost) => void
}

const SLOT_MS = 15 * 60_000

export const useDragCreate = ({ dayStart, onSelect }: DragCreateOptions) => {
  const [anchor, setAnchor] = useState<number | null>(null)
  const [ghost, setGhost] = useState<DragGhost | null>(null)

  const localY = (e: PointerEvent<HTMLDivElement>) =>
    e.clientY - e.currentTarget.getBoundingClientRect().top

  const rangeFrom = (anchorMs: number, currentMs: number): DragGhost => {
    const start = snapFloor(Math.min(anchorMs, currentMs))
    const end = Math.max(snapCeil(Math.max(anchorMs, currentMs)), start + SLOT_MS)
    return { start, end }
  }

  const overlayProps = {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
      const ms = yToMs(localY(e), dayStart)
      setAnchor(ms)
      setGhost(rangeFrom(ms, ms))
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      if (anchor === null) return
      setGhost(rangeFrom(anchor, yToMs(localY(e), dayStart)))
    },
    onPointerUp: () => {
      if (ghost) onSelect(ghost)
      setAnchor(null)
      setGhost(null)
    },
    onPointerCancel: () => {
      setAnchor(null)
      setGhost(null)
    }
  }

  return { overlayProps, ghost }
}
```

- [ ] **Step 2: Create drawer**

`create-drawer.tsx`:

```tsx
import { appointmentSchema, patientPageSchema, type StaffMember } from "@dentalops/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FormEvent, useState } from "react"
import { toast } from "sonner"
import { api, ApiError } from "../../lib/api"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { NativeSelect } from "../../components/ui/native-select"
import { Sheet } from "../../components/ui/sheet"
import { useServices } from "./hooks"
import { fmtTime } from "./lib/geometry"

export interface CreateDraft {
  dentist: StaffMember
  branchId: string
  startsAt: number
}

interface CreateDrawerProps {
  draft: CreateDraft | null
  onClose: () => void
}

export const CreateDrawer = ({ draft, onClose }: CreateDrawerProps) => {
  const queryClient = useQueryClient()
  const services = useServices()
  const [serviceId, setServiceId] = useState("")
  const [patientId, setPatientId] = useState("")
  const [search, setSearch] = useState("")

  const patients = useQuery({
    queryKey: ["patients", search],
    queryFn: () =>
      api("/patients", patientPageSchema, { query: { q: search || undefined, limit: "20" } })
  })

  const create = useMutation({
    mutationFn: () =>
      api("/appointments", appointmentSchema, {
        method: "POST",
        body: {
          serviceId,
          dentistId: draft!.dentist.id,
          patientId,
          branchId: draft!.branchId,
          startsAt: new Date(draft!.startsAt).toISOString()
        }
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["appointments"] })
      toast.success("Appointment booked")
      onClose()
    },
    onError: (error) => {
      if (error instanceof ApiError) toast.error(error.message)
      else toast.error("Booking failed")
    }
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (serviceId && patientId) create.mutate()
  }

  return (
    <Sheet
      open={draft !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="New appointment"
    >
      {draft ? (
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1">
            <Label>Dentist</Label>
            <p className="text-sm">{draft.dentist.name}</p>
          </div>
          <div className="space-y-1">
            <Label>Starts</Label>
            <p className="text-sm tabular-nums">{fmtTime(draft.startsAt)}</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="create-service">Service</Label>
            <NativeSelect
              id="create-service"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
            >
              <option value="">Choose a service</option>
              {(services.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.durationMin} min
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="create-patient-search">Patient</Label>
            <Input
              id="create-patient-search"
              placeholder="Search by name or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-1">
              {(patients.data?.items ?? []).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPatientId(p.id)}
                  className={
                    p.id === patientId
                      ? "w-full rounded-sm bg-secondary px-2 py-1.5 text-left text-sm text-primary"
                      : "w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                  }
                >
                  {p.name} <span className="text-muted-foreground tabular-nums">{p.phone}</span>
                </button>
              ))}
            </div>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={!serviceId || !patientId || create.isPending}
          >
            Book appointment
          </Button>
        </form>
      ) : null}
    </Sheet>
  )
}
```

- [ ] **Step 3: Wire into the page**

In `timeline-page.tsx`: add `const [draft, setDraft] = useState<CreateDraft | null>(null)`. Build the per-column overlay via `columnOverlay={(dentist, ds) => <DragOverlay key={dentist.id} dentist={dentist} dayStart={ds} branchId={branchId!} onDraft={setDraft}/>}` where `DragOverlay` (a small component in `timeline-page.tsx` or its own file) uses `useDragCreate`, renders an absolutely positioned `inset-0` div with the pointer handlers plus the ghost (booking into an off-shift region is deliberately allowed — the API permits it and roster validation arrives in W7):

```tsx
const DragOverlay = ({ dentist, dayStart, branchId, onDraft }: DragOverlayProps) => {
  const { overlayProps, ghost } = useDragCreate({
    dayStart,
    onSelect: (range) => onDraft({ dentist, branchId, startsAt: range.start })
  })
  return (
    <div className="absolute inset-0" data-testid={`overlay-${dentist.id}`} {...overlayProps}>
      {ghost ? (
        <div
          className="pointer-events-none absolute inset-x-0.5 rounded-sm border-2 border-dashed"
          data-testid="ghost"
          style={{
            top: msToY(ghost.start, dayStart),
            height: msToY(ghost.end, dayStart) - msToY(ghost.start, dayStart),
            borderColor: "var(--color-primary)",
            background: "color-mix(in srgb, var(--color-primary) 10%, transparent)"
          }}
        />
      ) : null}
    </div>
  )
}
```

Overlay sits under the cards (`z-[5]` on cards, overlay default stacking) so clicking a card still opens the details drawer. Render `<CreateDrawer draft={draft} onClose={() => setDraft(null)}/>`.

- [ ] **Step 4: Tests**

`use-drag-create.test.tsx` — render a bare div wired to the hook (tiny harness component, height 1536px); fire `pointerDown` at y=576 then `pointerMove` to y=640 then `pointerUp` (use `fireEvent.pointerDown` etc. — jsdom lacks `setPointerCapture`, stub it on the element prototype in the test). Assert `onSelect` got `{ start: dayStart + 9h, end: dayStart + 10h }` (576px = 09:00, 640px = 10:00). Second case: pointerDown + pointerUp with no move → exactly one slot `{ start: 09:00, end: 09:15 }`.

Note for the implementer: jsdom's `getBoundingClientRect` returns zeros, so `clientY` maps 1:1 to local y — fire events with `clientY: 576` directly.

`create-drawer.test.tsx` — MSW: `GET /services` (two services), `GET /patients` (two patients), `POST /appointments` capturing the body and returning a full appointment fixture. Flow with `userEvent`: select service, click a patient, submit → assert POST body `{ serviceId, dentistId, patientId, branchId, startsAt }` matches the draft. Second case: MSW answers 409 `{ errorCode: "SLOT_CONFLICT", message: "Dentist is already booked at this time" }` → assert that message appears in the document (sonner renders it) and the drawer stays open.

Run: `pnpm --filter @dentalops/web test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): drag-to-create booking flow with conflict toasts"
```

---

### Task 8: /dev/ui gallery, perf fixture, pipeline, push

**Files:**
- Modify: `apps/web/src/pages/dev-ui-page.tsx`
- Test: `apps/web/src/pages/dev-ui-page.test.tsx`

**Interfaces:**
- Consumes: everything built this week.
- Produces: the gallery MASTER §6 asks for, scoped to the components that exist after W4: `AppointmentCard` (6 hues × confirmed/completed/no_show/cancelled), `TimeGrid` (empty / off-shift / overlapping cards / **1,000-card perf case**), `EmptyState`/`ErrorState` variants, primitives, tokens. `SlotPicker`, `CountdownBanner`, `ViolationList`, `ShiftBlock` arrive with W6/W7 and are listed as placeholders naming their week — a documented deviation from MASTER §6, which assumed the full set in W4.

- [ ] **Step 1: Extend the gallery**

Add to `dev-ui-page.tsx`:
- A `fixtureAppointment(overrides)` helper returning a complete `Appointment` and a grid section rendering `<AppointmentCard>` for all 6 hues × 4 statuses inside a `relative` container (static `dayStart`, spread starts so they do not overlap).
- A `<TimeGrid>` section: 2 fixture dentists, one shift each, 3 appointments where 2 overlap (proving lanes render side by side), `date` fixed to `"2026-08-03"`.
- A perf section: a button "Render 1,000 cards" that mounts a `<TimeGrid>` with 8 fixture dentists and 1,000 deterministic appointments (loop `i`: dentist `i % 8`, start `dayStart + (6 + (i % 56) * 0.25) * 3_600_000`, duration 30–60 min from `i % 3`) — deterministic, no `Math.random()`. The windowing hook keeps the mounted DOM small; scrolling stays smooth.
- A placeholder section: "SlotPicker · CountdownBanner — W6 · ViolationList · ShiftBlock — W7".

`dev-ui-page.test.tsx`: render the page, assert one card of each status is present (by aria-labels "Completed"/"No-show" and a struck-through cancelled title), click the perf button, assert the grid mounts with 8 columns (`getAllByTestId(/^col-/)`) and at least one card node renders. Do NOT assert a card-count upper bound here — jsdom has no layout, so the hook's `1600` fallback makes the whole 1536px day "visible" and all 1,000 cards mount; the windowing math itself is proven by `use-visible-range.test.tsx` (Task 5), and the browser is where the DOM saving is real.

- [ ] **Step 2: Full pipeline**

Run from repo root: `pnpm lint && pnpm typecheck && pnpm exec turbo run test --force && pnpm build`
Expected: all green — api 18 suites, availability 43 tests + 100% coverage, web suite grown to cover Tasks 1–8.

- [ ] **Step 3: Commit, push, CI**

```bash
git add apps/web
git commit -m "feat(web): dev ui gallery with perf fixture"
git push origin main
```

Watch CI to conclusion and report the result. Vercel auto-deploys `main` — after CI is green, note that https://trydentalops.vercel.app now needs a manual check of the demo-login flow (report the URL check as a user action, do not attempt to browse it).

---

## W4 exit criteria

- [ ] Landing page logs into the demo tenant as owner/receptionist/dentist and lands on the timeline
- [ ] Session survives a reload (silent refresh) and expires cleanly to the landing page
- [ ] Timeline renders the seeded day: dentist columns, off-shift hatching from real shifts, now line on today, cards with service hue + status treatments, overlapping cards in lanes
- [ ] Drag (or click) on empty grid opens the prefilled drawer; booking succeeds against the real API; a conflicting slot shows the API's 409 message as a toast and loses no input
- [ ] Status actions (complete / no-show / cancel) work from the details drawer
- [ ] `GET /staff` never exposes `passwordHash` or `email` (spec-enforced)
- [ ] All three directory routes classified in the isolation registry; api suite 18 suites green
- [ ] `/dev/ui` renders every W4 component state + the 1,000-card fixture stays smooth via windowing
- [ ] No hard-coded colors outside `app.css`; times use `tabular-nums`; no `body` horizontal scroll; `100dvh` only
- [ ] CI green; Vercel deploy renders the new app
