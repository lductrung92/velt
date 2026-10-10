import { defineConfig, devices } from "@playwright/test";

// Console E2E. The app is built in `e2e` mode (VITE_API_BASE_URL=/api, see
// .env.e2e) and served by `vite preview`; every /api/** call is intercepted by
// the per-test mocks (e2e/mocks/api.ts), so the suite needs no real backend.
const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build:e2e && npm run preview -- --port 4173 --strictPort",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
