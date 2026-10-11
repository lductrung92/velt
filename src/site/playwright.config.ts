import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4175",
    reducedMotion: "reduce",
    permissions: ["clipboard-read", "clipboard-write"],
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: {
    command: "node server.mjs --production",
    url: "http://127.0.0.1:4175",
    env: { PORT: "4175" },
    reuseExistingServer: false,
  },
});
