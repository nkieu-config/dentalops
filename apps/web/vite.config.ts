import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ["@dentalops/contracts"]
  },
  build: {
    commonjsOptions: {
      include: [/packages\/contracts/, /node_modules/]
    }
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"]
  }
})
