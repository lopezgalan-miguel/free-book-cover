import { defineConfig } from "@playwright/test";

// El servidor de desarrollo expone el gancho de pruebas (import.meta.env.DEV).
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://localhost:5199", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: { command: "pnpm exec vite --port 5199 --strictPort", url: "http://localhost:5199", reuseExistingServer: false, timeout: 60_000 },
});
