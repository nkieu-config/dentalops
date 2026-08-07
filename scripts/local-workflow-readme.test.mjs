import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("portfolio README and development notes document the supported local workflow commands", async () => {
  const [readme, development] = await Promise.all([
    readFile("README.md", "utf8"),
    readFile("docs/development.md", "utf8")
  ])

  for (const command of ["pnpm setup", "pnpm demo:seed", "pnpm dev"]) {
    assert.match(readme, new RegExp(command.replace(":", "\\:")))
  }

  for (const command of ["pnpm infra:up", "pnpm infra:down", "pnpm db:reset"]) {
    assert.match(development, new RegExp(command.replace(":", "\\:")))
  }
})
