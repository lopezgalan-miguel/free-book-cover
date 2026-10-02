import { defineConfig } from "@playwright/test";

// El servidor de desarrollo expone el gancho de pruebas (import.meta.env.DEV).
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://localhost:5199", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  projects: [
    // Escritorio: todas las pruebas.
    { name: "chromium", use: { browserName: "chromium" } },
    // Móvil (390 × 844, táctil): solo los flujos que existen en ambos diseños.
    {
      name: "mobile",
      testMatch: /(flows|a11y)\.spec\.ts$/,
      use: { browserName: "chromium", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
    },
  ],
  webServer: [
    { command: "pnpm exec vite --port 5199 --strictPort", url: "http://localhost:5199", reuseExistingServer: false, timeout: 60_000 },
    // Companion real (Paso 7): origen del editor de pruebas y token fijo. Requiere gs, poppler y qpdf instalados.
    {
      command: "pnpm --dir ../companion start",
      url: "http://127.0.0.1:47399/health",
      reuseExistingServer: false,
      timeout: 60_000,
      env: { FBC_PORT: "47399", FBC_TOKEN: "e2e-token", FBC_ALLOWED_ORIGIN: "http://localhost:5199" },
    },
  ],
});
