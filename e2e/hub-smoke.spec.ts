import { test, expect } from "@playwright/test";

test.describe("HubPage Smoke Tests per Role", () => {
  test("Admin can view admin overview hub", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "admin@intellihire.com");
    await page.fill('input[name="password"]', "admin123");
    await page.click('button[type="submit"]');

    // Should redirect to admin/overview
    await expect(page).toHaveURL(/admin\/overview/, { timeout: 15000 });

    // Dashboard header check
    await expect(page.getByRole("heading", { name: "Platform Control Console" })).toBeVisible();

    // Check dashboard blocks
    await expect(page.getByText("Active Action Center")).toBeVisible();
    await expect(page.getByText("Recent Activities")).toBeVisible();
    await expect(page.getByText("Orchestration Telemetry Diagnostics")).toBeVisible();
  });

  test("Recruiter can view recruiter overview hub", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "recruiter@example.com");
    await page.fill('input[name="password"]', "recruiter123");
    await page.click('button[type="submit"]');

    // Should redirect to recruiter/overview
    await expect(page).toHaveURL(/recruiter\/overview/, { timeout: 15000 });

    // Dashboard header check
    await expect(page.getByRole("heading", { name: "Test Recruiter's Command Hub" })).toBeVisible({ timeout: 15000 });

    // Check dashboard blocks
    await expect(page.getByText("Recent Activities")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Recruitment Insights Summary")).toBeVisible({ timeout: 15000 });
  });

  test("TPO can view TPO overview hub", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "tpo@example.com");
    await page.fill('input[name="password"]', "tpo123");
    await page.click('button[type="submit"]');

    // Should redirect to tpo/overview
    await expect(page).toHaveURL(/tpo\/overview/, { timeout: 15000 });

    // Dashboard header check
    await expect(page.getByRole("heading", { name: "Test TPO's Command Hub" })).toBeVisible({ timeout: 15000 });

    // Check dashboard blocks
    await expect(page.getByText("Recent Activities")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("College Recruitment Funnel")).toBeVisible({ timeout: 15000 });
  });

  test("Candidate can view candidate overview hub", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "candidate@example.com");
    await page.fill('input[name="password"]', "candidate123");
    await page.click('button[type="submit"]');

    // Wait for initial redirect away from login
    await page.waitForURL(/candidate\/(overview|onboarding)/, { timeout: 15000 });

    // Should redirect to candidate/overview or onboarding
    if (page.url().includes("onboarding")) {
      // If onboarded is needed, fill form to reach candidate overview
      await page.fill('input[name="rollNumber"]', "CAND001");
      await page.fill('input[name="branch"]', "CSE");
      await page.fill('input[name="cgpa"]', "9.5");
      await page.fill('input[name="graduationYear"]', "2026");
      await page.fill('input[name="phone"]', "+91 9876543210");
      await page.click('button[type="submit"]');
    }

    await expect(page).toHaveURL(/candidate\/overview/, { timeout: 15000 });

    // Dashboard header check
    await expect(page.getByRole("heading", { name: "Test Candidate's Command Hub" })).toBeVisible({ timeout: 15000 });

    // Check dashboard blocks
    await expect(page.getByText("Active Action Center")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Recent Activities")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Evaluation Skill Radar")).toBeVisible({ timeout: 15000 });
  });
});
