import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    globals: true,
    // Playwright specs live in e2e/ and must not be collected by vitest.
    exclude: [...configDefaults.exclude, "e2e/**"],
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    env: { VITE_API_BASE_URL: "http://localhost/api" },
    coverage: { provider: "v8", reporter: ["text", "lcov"] },
  },
});
