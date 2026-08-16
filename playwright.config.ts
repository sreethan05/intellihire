import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 60 * 1000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["github"], ["html", { open: "never" }]] : "html",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
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
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
      env: {
        DISABLE_RATE_LIMITS: "true",
        NODE_ENV: "test",
        DATABASE_URL: process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/intellihire",
        JWT_SECRET: process.env.JWT_SECRET || "ci-secret-key-for-testing-purposes-only-1234567890",
        PYTHONPATH: "server_py",
      },
    },
    {
      command: "npm --prefix client run dev",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
      env: {
        DISABLE_RATE_LIMITS: "true",
        NODE_ENV: "test",
        NODE_OPTIONS: "--max-old-space-size=4096",
      },
    },
  ],
});
