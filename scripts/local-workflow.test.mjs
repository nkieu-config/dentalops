import assert from "node:assert/strict"
import test from "node:test"
import { actions, createWorkflow, envFiles, messages } from "./local-workflow.mjs"

const harness = ({ envExists = true, confirmed = true } = {}) => {
  const calls = []
  return {
    calls,
    workflow: createWorkflow({
      exists: () => envExists,
      copy: async (from, to) => calls.push(["copy", from, to]),
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

test("setup gives every app the environment file it reads, without seeding data", async () => {
  const { calls, workflow } = harness({ envExists: false })

  await workflow.setup()

  assert.deepEqual(calls, [
    ...envFiles.map(([example, target]) => ["copy", example, target]),
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

test("dev refuses to start when the API environment file is missing", async () => {
  const { workflow } = harness({ envExists: false })

  await assert.rejects(workflow.dev(), { message: messages.missingEnv })
})

test("the runner exposes every documented action", () => {
  assert.deepEqual(Object.keys(actions).sort(), [
    "db-reset", "demo-seed", "dev", "infra-down", "infra-logs", "infra-up", "setup"
  ])
})
