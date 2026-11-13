import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./test/browser",
  testMatch: "*.browser.ts",
  workers: 1,
  outputDir: "./test/browser/.results",
  use: { baseURL: "http://127.0.0.1:4178", browserName: "chromium", headless: true },
  webServer: {
    command: "pnpm exec vp dev --config apps/web/test/browser/vite.config.ts",
    cwd: "../..",
    url: "http://127.0.0.1:4178",
    timeout: 30000,
    reuseExistingServer: false,
  },
});
