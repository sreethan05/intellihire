import { defineConfig, devices } from "@playwright/test";

// E2E uses a dedicated client port so it can never reuse (or collide with) a
// developer's own dev server on the default port 3000 — an unrelated app on
// that port previously made every browser spec run against the wrong site.
const E2E_CLIENT_PORT = process.env.E2E_CLIENT_PORT || "3100";
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${E2E_CLIENT_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 60 * 1000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["github"], ["html", { open: "never" }]] : "html",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
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
      // strictPort makes the run fail fast instead of silently drifting to
      // another port if the E2E port is already occupied.
      command: `npm --prefix client run dev -- --port ${E2E_CLIENT_PORT} --strictPort`,
      url: BASE_URL,
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
