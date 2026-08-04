import { defineConfig } from "@playwright/test"

const webPort = Number(process.env.E2E_WEB_PORT ?? 4173)
const apiPort = Number(process.env.E2E_API_PORT ?? 3001)
const webOrigin = `http://localhost:${webPort}`
const apiOrigin = `http://localhost:${apiPort}`

export default defineConfig({
  testDir: "./e2e",
  projects: [
    { name: "functional", testIgnore: /visual\.spec\.ts/ },
    { name: "visual", testMatch: /visual\.spec\.ts/ }
  ],
  timeout: 60_000,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: webOrigin,
    trace: "retain-on-failure"
  },
  webServer: [
    {
      command: "pnpm --filter @dentalops/api start",
      url: `${apiOrigin}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
      env: { PORT: String(apiPort), WEB_ORIGIN: webOrigin }
    },
    {
      command: `pnpm --filter @dentalops/web preview --port ${webPort} --strictPort`,
      url: webOrigin,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000
    }
  ]
})
