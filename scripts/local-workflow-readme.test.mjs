import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("README documents the supported local workflow commands", async () => {
  const readme = await readFile("README.md", "utf8")

  for (const command of ["pnpm setup", "pnpm dev", "pnpm infra:up", "pnpm infra:down", "pnpm demo:seed", "pnpm db:reset"]) {
    assert.match(readme, new RegExp(command.replace(":", "\\:")))
  }
})
