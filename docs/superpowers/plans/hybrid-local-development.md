# Hybrid Local Development Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `pnpm dev` start healthy Docker infrastructure and the native API/Web watch processes without mutating a developer's database.

**Architecture:** A dependency-free Node runner at the repository root owns the local workflow. It starts only Compose infrastructure and delegates long-running application work to the existing Turbo tasks filtered to `@dentalops/api` and `@dentalops/web`. The runner is dependency-injected so unit tests can assert commands and destructive-action confirmations without starting Docker.

**Tech Stack:** Node 22 built-ins (`node:child_process`, `node:fs`, `node:readline/promises`, `node:test`), pnpm 10, Turborepo 2, Docker Compose.

## Global Constraints

- Do not add API or web services, bind mounts, or Node dependencies to `docker-compose.yml`.
- `pnpm dev` must call `docker compose up -d --wait`, then run only API and web watch processes.
- `pnpm dev`, `pnpm infra:up`, and `pnpm setup` must never reset or seed clinic data.
- `.env` is copied from `.env.example` only when missing and must never be overwritten.
- `pnpm demo:seed` and `pnpm db:reset` require an interactive confirmation before they mutate data.
- New file names must not include dates.
- Do not add code comments.

---

## File structure

| File | Responsibility |
|---|---|
| `scripts/local-workflow.mjs` | Cross-platform command runner, Compose readiness, environment bootstrap, explicit destructive confirmations |
| `scripts/local-workflow.test.mjs` | Node unit tests for command ordering, `.env` safety, and confirmation gates |
| `package.json` | Stable developer-facing command aliases |
| `.github/workflows/ci.yml` | Runs the workflow-runner unit tests in CI |
| `README.md` | First-run, daily-development, infrastructure, and reset instructions |

---

### Task 1: Build the testable local-workflow runner

**Files:**

- Create: `scripts/local-workflow.mjs`
- Create: `scripts/local-workflow.test.mjs`

**Interfaces:**

- Produces `createWorkflow({ run, exists, copy, confirm, pnpmCommand })`, returning async methods `setup`, `dev`, `infraUp`, `infraDown`, `infraLogs`, `demoSeed`, and `dbReset`.
- `run(command, args)` resolves only for exit code 0 and rejects with the child command's error otherwise.
- The CLI maps `setup`, `dev`, `infra-up`, `infra-down`, `infra-logs`, `demo-seed`, and `db-reset` to those methods.

- [ ] **Step 1: Write the failing workflow tests**

```js
import assert from "node:assert/strict"
import test from "node:test"
import { createWorkflow, messages } from "./local-workflow.mjs"

const harness = ({ envExists = true, confirmed = true } = {}) => {
  const calls = []
  return {
    calls,
    workflow: createWorkflow({
      exists: () => envExists,
      copy: async () => calls.push(["copy", ".env.example", ".env"]),
      confirm: async () => confirmed,
      run: async (command, args) => calls.push([command, args])
    })
  }
}

test("dev waits for Compose health before starting only the API and web", async () => {
  const { calls, workflow } = harness()
  await workflow.dev()
  assert.deepEqual(calls, [
    ["docker", ["compose", "version"]],
    ["docker", ["compose", "up", "-d", "--wait"]],
    ["pnpm", ["exec", "turbo", "run", "dev", "--filter=@dentalops/api", "--filter=@dentalops/web"]]
  ])
})

test("setup copies a missing environment file without seeding data", async () => {
  const { calls, workflow } = harness({ envExists: false })
  await workflow.setup()
  assert.deepEqual(calls, [
    ["copy", ".env.example", ".env"],
    ["docker", ["compose", "version"]],
    ["docker", ["compose", "up", "-d", "--wait"]],
    ["pnpm", ["install", "--frozen-lockfile"]],
    ["pnpm", ["--filter", "@dentalops/api", "db:generate"]],
    ["pnpm", ["--filter", "@dentalops/api", "db:deploy"]]
  ])
})

test("a declined demo seed does not execute Prisma", async () => {
  const { calls, workflow } = harness({ confirmed: false })
  await workflow.demoSeed()
  assert.deepEqual(calls, [])
})

test("dev refuses to start when .env is missing", async () => {
  const { workflow } = harness({ envExists: false })
  await assert.rejects(workflow.dev(), { message: messages.missingEnv })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/local-workflow.test.mjs`

Expected: FAIL because `scripts/local-workflow.mjs` does not exist.

- [ ] **Step 3: Implement the workflow factory and CLI**

```js
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { copyFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { createInterface } from "node:readline/promises"
import { stdin, stdout } from "node:process"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm"

export const messages = {
  missingEnv: "Missing .env. Run pnpm setup to create it from .env.example.",
  docker: "Docker Compose is unavailable. Start Docker Desktop, then run pnpm infra:up.",
  usage: "Usage: node scripts/local-workflow.mjs <setup|dev|infra-up|infra-down|infra-logs|demo-seed|db-reset>"
}

export const createWorkflow = ({ run, exists, copy, confirm, pnpmCommand = "pnpm" }) => {
  const requireEnv = () => {
    if (!exists(".env")) throw new Error(messages.missingEnv)
  }
  const requireDocker = () => run("docker", ["compose", "version"])
  const infraUp = async () => {
    try {
      await requireDocker()
    } catch {
      throw new Error(messages.docker)
    }
    await run("docker", ["compose", "up", "-d", "--wait"])
  }

  return {
    infraUp,
    infraDown: () => run("docker", ["compose", "down"]),
    infraLogs: () => run("docker", ["compose", "logs", "--follow"]),
    setup: async () => {
      if (!exists(".env")) await copy(".env.example", ".env")
      await infraUp()
      await run(pnpmCommand, ["install", "--frozen-lockfile"])
      await run(pnpmCommand, ["--filter", "@dentalops/api", "db:generate"])
      await run(pnpmCommand, ["--filter", "@dentalops/api", "db:deploy"])
    },
    dev: async () => {
      requireEnv()
      await infraUp()
      await run(pnpmCommand, ["exec", "turbo", "run", "dev", "--filter=@dentalops/api", "--filter=@dentalops/web"])
    },
    demoSeed: async () => {
      requireEnv()
      if (!await confirm("This replaces the demo tenant and all of its demo data. Continue?")) return
      await infraUp()
      await run(pnpmCommand, ["--filter", "@dentalops/api", "db:seed"])
    },
    dbReset: async () => {
      requireEnv()
      if (!await confirm("This deletes every local database record and recreates the demo data. Continue?")) return
      await infraUp()
      await run(pnpmCommand, ["--filter", "@dentalops/api", "db:reset"])
    }
  }
}

const run = (command, args) => new Promise((resolveRun, rejectRun) => {
  const child = spawn(command, args, { cwd: root, stdio: "inherit" })
  child.once("error", rejectRun)
  child.once("exit", (code) => code === 0 ? resolveRun() : rejectRun(new Error(`${command} exited with ${code}`)))
})

const confirm = async (question) => {
  const prompt = createInterface({ input: stdin, output: stdout })
  const answer = await prompt.question(`${question} [y/N] `)
  prompt.close()
  return answer.trim().toLowerCase() === "y"
}

const copy = (from, to) => copyFile(resolve(root, from), resolve(root, to))
const action = process.argv[2]
const workflow = createWorkflow({ run, exists: (path) => existsSync(resolve(root, path)), copy, confirm, pnpmCommand: pnpm })
const method = {
  setup: workflow.setup,
  dev: workflow.dev,
  "infra-up": workflow.infraUp,
  "infra-down": workflow.infraDown,
  "infra-logs": workflow.infraLogs,
  "demo-seed": workflow.demoSeed,
  "db-reset": workflow.dbReset
}[action]

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!method) {
    console.error(messages.usage)
    process.exitCode = 1
  } else {
    method().catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
  }
}
```

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `node --test scripts/local-workflow.test.mjs`

Expected: PASS with four workflow tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/local-workflow.mjs scripts/local-workflow.test.mjs
git commit -m "feat: add safe local workflow runner"
```

### Task 2: Expose stable root commands and gate the runner in CI

**Files:**

- Modify: `package.json:7-14`
- Modify: `.github/workflows/ci.yml:56-60`

**Interfaces:**

- Consumes `scripts/local-workflow.mjs` actions from Task 1.
- Produces `pnpm setup`, `pnpm dev`, `pnpm infra:up`, `pnpm infra:down`, `pnpm infra:logs`, `pnpm demo:seed`, `pnpm db:reset`, and `pnpm test:local-workflow`.

- [ ] **Step 1: Extend the failing test with every intended CLI action**

```js
import { actions } from "./local-workflow.mjs"

test("the runner exposes every documented action", () => {
  assert.deepEqual(Object.keys(actions).sort(), [
    "db-reset", "demo-seed", "dev", "infra-down", "infra-logs", "infra-up", "setup"
  ])
})
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test scripts/local-workflow.test.mjs`

Expected: FAIL because the action registry is not exported for the test.

- [ ] **Step 3: Export the action registry and add root scripts**

```json
{
  "scripts": {
    "setup": "node scripts/local-workflow.mjs setup",
    "dev": "node scripts/local-workflow.mjs dev",
    "infra:up": "node scripts/local-workflow.mjs infra-up",
    "infra:down": "node scripts/local-workflow.mjs infra-down",
    "infra:logs": "node scripts/local-workflow.mjs infra-logs",
    "demo:seed": "node scripts/local-workflow.mjs demo-seed",
    "db:reset": "node scripts/local-workflow.mjs db-reset",
    "test:local-workflow": "node --test scripts/local-workflow.test.mjs",
    "build": "turbo run build",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "lint": "turbo run lint"
  }
}
```

Expose `actions` from `scripts/local-workflow.mjs` and construct the CLI lookup from that export:

```js
export const actions = {
  setup: "setup",
  dev: "dev",
  "infra-up": "infraUp",
  "infra-down": "infraDown",
  "infra-logs": "infraLogs",
  "demo-seed": "demoSeed",
  "db-reset": "dbReset"
}
```

Add this CI step immediately after `pnpm install --frozen-lockfile`:

```yaml
      - run: pnpm test:local-workflow
```

- [ ] **Step 4: Run focused tests and CI-equivalent checks**

Run: `pnpm test:local-workflow`

Expected: PASS with five workflow tests.

Run: `pnpm lint`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json .github/workflows/ci.yml scripts/local-workflow.mjs scripts/local-workflow.test.mjs
git commit -m "chore: simplify local development commands"
```

### Task 3: Document first-run, daily, and destructive workflows

**Files:**

- Modify: `README.md:94-142`
- Modify: `package.json:7-21`

**Interfaces:**

- Consumes the root commands from Task 2.
- Produces one canonical onboarding section with no manual `docker compose up -d` prerequisite.

- [ ] **Step 1: Add a README command-contract test fixture**

Create `scripts/local-workflow-readme.test.mjs`:

```js
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("README documents the supported local workflow commands", async () => {
  const readme = await readFile("README.md", "utf8")
  for (const command of ["pnpm setup", "pnpm dev", "pnpm infra:up", "pnpm infra:down", "pnpm demo:seed", "pnpm db:reset"]) {
    assert.match(readme, new RegExp(command.replace(":", "\\:")))
  }
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/local-workflow-readme.test.mjs`

Expected: FAIL because the current README only documents the old manual Compose sequence.

- [ ] **Step 3: Replace the README development section**

Replace the first-run block with:

````markdown
### First run

```bash
pnpm setup
pnpm demo:seed
pnpm dev
```

`pnpm setup` installs dependencies, creates `.env` only when it is absent, waits for Docker
infrastructure and applies Prisma migrations. `pnpm demo:seed` asks before recreating the demo tenant.

### Daily development

```bash
pnpm dev
```

This waits for Postgres, MongoDB and Redis in Docker, then starts NestJS on
`http://localhost:3001/api/v1/health` and Vite on `http://localhost:5173`. Ctrl-C stops only API and
web; Docker services keep their named volumes and continue running.

```bash
pnpm infra:up
pnpm infra:logs
pnpm infra:down
pnpm db:reset
```

`pnpm db:reset` deletes all local Prisma data and reseeds it after confirmation. It is never run by
`pnpm setup` or `pnpm dev`.
````

Extend the root test script so the existing CI step runs both workflow tests:

```json
"test:local-workflow": "node --test scripts/local-workflow.test.mjs scripts/local-workflow-readme.test.mjs"
```

- [ ] **Step 4: Run documentation, unit, and smoke validation**

Run: `node --test scripts/local-workflow-readme.test.mjs && pnpm test:local-workflow`

Expected: PASS.

Run: `pnpm infra:up`

Expected: Compose reports Postgres, MongoDB and Redis healthy.

Run: `pnpm dev`

Expected: API health responds on port 3001 and Vite responds on port 5173; Ctrl-C leaves `docker compose ps` services running.

- [ ] **Step 5: Commit**

```bash
git add README.md package.json scripts/local-workflow-readme.test.mjs
git commit -m "docs: clarify local development workflow"
```

### Task 4: Final verification

**Files:**

- Verify only: `package.json`, `scripts/local-workflow.mjs`, `scripts/local-workflow.test.mjs`, `scripts/local-workflow-readme.test.mjs`, `.github/workflows/ci.yml`, `README.md`

- [ ] **Step 1: Run repository checks**

Run: `pnpm lint`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

Run: `pnpm test:local-workflow && node --test scripts/local-workflow-readme.test.mjs`

Expected: PASS.

- [ ] **Step 2: Verify data safety manually**

Run: `pnpm demo:seed`, answer `n`, then inspect the command output.

Expected: The command exits without invoking the API seed script.

Run: `pnpm db:reset`, answer `n`, then inspect the command output.

Expected: The command exits without invoking Prisma reset.

- [ ] **Step 3: Confirm a clean worktree and commit if documentation changed during verification**

Run: `git status --short`

Expected: no unexpected files. Do not commit generated `.env`, Docker volumes, `dist`, or Playwright output.

---

## Plan self-review

- Spec coverage: Tasks 1–2 implement command behavior, health waiting, environment safety, Docker failures and CI coverage; Task 3 documents first-run and daily usage; Task 4 verifies data safety and process lifecycle.
- Placeholder scan: no unresolved placeholders or deferred implementation instructions remain.
- Type consistency: `createWorkflow` method names, CLI actions and package scripts use the same seven action names throughout.
