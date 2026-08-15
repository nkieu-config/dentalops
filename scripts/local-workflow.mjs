import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { copyFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { stdin, stdout } from "node:process"
import { createInterface } from "node:readline/promises"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm"

export const envFiles = [
  ["apps/api/.env.example", "apps/api/.env"],
  ["apps/web/.env.example", "apps/web/.env"]
]

export const messages = {
  missingEnv: "Missing apps/api/.env. Run pnpm setup to create it from apps/api/.env.example.",
  docker: "Docker Compose is unavailable. Start Docker Desktop, then run pnpm infra:up.",
  usage: "Usage: node scripts/local-workflow.mjs <setup|dev|infra-up|infra-down|infra-logs|demo-seed|db-reset>"
}

export const actions = {
  setup: "setup",
  dev: "dev",
  "infra-up": "infraUp",
  "infra-down": "infraDown",
  "infra-logs": "infraLogs",
  "demo-seed": "demoSeed",
  "db-reset": "dbReset"
}

export const createWorkflow = ({ run, exists, copy, confirm, pnpmCommand = "pnpm" }) => {
  const requireEnv = () => {
    if (!exists("apps/api/.env")) throw new Error(messages.missingEnv)
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
      for (const [example, target] of envFiles) {
        if (!exists(target)) await copy(example, target)
      }
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
const method = workflow[actions[action]]

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
