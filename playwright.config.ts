import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.e2e.ts",
  outputDir: "test-results",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["line"], ["./tests/e2e/macros-status-reporter.ts"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://lakitchen-2.vercel.app",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
