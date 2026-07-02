import { test, expect } from "@playwright/test";

test.describe("HubPage Smoke Tests per Role", () => {
  test("Admin can view admin overview hub", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "admin@intellihire.com");
    await page.fill('input[name="password"]', "admin123");
    await page.click('button[type="submit"]');

    // Should redirect to admin/overview
    await expect(page).toHaveURL(/admin\/overview/);

    // Dashboard header check
    await expect(page.getByRole("heading", { name: "Platform Control Overview" })).toBeVisible();

    // Check dashboard blocks
    await expect(page.getByText("Action Center")).toBeVisible();
    await expect(page.getByText("Recent Activities")).toBeVisible();
    await expect(page.getByText("Platform Orchestration Analytics")).toBeVisible();
  });

  test("Recruiter can view recruiter overview hub", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "recruiter@example.com");
    await page.fill('input[name="password"]', "recruiter123");
    await page.click('button[type="submit"]');

    // Should redirect to recruiter/overview
    await expect(page).toHaveURL(/recruiter\/overview/);

    // Dashboard header check
    await expect(page.getByRole("heading", { name: "Test Recruiter's Command Hub" })).toBeVisible();

    // Check dashboard blocks
    await expect(page.getByText("Action Center")).toBeVisible();
    await expect(page.getByText("Recent Activities")).toBeVisible();
    await expect(page.getByText("Hiring War Room Insights")).toBeVisible();
  });

  test("TPO can view TPO overview hub", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "tpo@example.com");
    await page.fill('input[name="password"]', "tpo123");
    await page.click('button[type="submit"]');

    // Should redirect to tpo/overview
    await expect(page).toHaveURL(/tpo\/overview/);

    // Dashboard header check
    await expect(page.getByRole("heading", { name: "Test TPO's Command Hub" })).toBeVisible();

    // Check dashboard blocks
    await expect(page.getByText("Action Center")).toBeVisible();
    await expect(page.getByText("Recent Activities")).toBeVisible();
    await expect(page.getByText("College Placement Funnel")).toBeVisible();
  });

  test("Candidate can view candidate overview hub", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "candidate@example.com");
    await page.fill('input[name="password"]', "candidate123");
    await page.click('button[type="submit"]');

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

    await expect(page).toHaveURL(/candidate\/overview/);

    // Dashboard header check
    await expect(page.getByRole("heading", { name: "Test Candidate's Command Hub" })).toBeVisible();

    // Check dashboard blocks
    await expect(page.getByText("Action Center")).toBeVisible();
    await expect(page.getByText("Recent Activities")).toBeVisible();
    await expect(page.getByText("Evaluation Skill Radar")).toBeVisible();
  });
});
