import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  timeout: 60 * 1000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "npm run server:py",
      url: "http://127.0.0.1:5000/api/health",
      reuseExistingServer: true,
      timeout: 120 * 1000,
    },
    {
      command: "npm --prefix client run dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 120 * 1000,
      env: {
        DISABLE_RATE_LIMITS: "true",
        NODE_ENV: "test",
        NODE_OPTIONS: "--max-old-space-size=4096",
      },
    },
  ],
});
