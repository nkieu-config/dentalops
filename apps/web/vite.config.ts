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
      include: [/packages\/availability/, /node_modules/]
    },
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return undefined
          if (id.includes("socket.io") || id.includes("engine.io")) return "realtime"
          return "vendor"
        }
      }
    }
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"]
  }
})
