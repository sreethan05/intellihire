import { test, expect } from "@playwright/test";

test.describe("Admin Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "admin@intellihire.com");
    await page.fill('input[name="password"]', "admin123");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/admin\/overview/);
  });

  test("can view and navigate admin pages", async ({ page }) => {
    // Overview page
    await expect(page.locator("text=Platform Overview")).toBeVisible();

    // Navigate to manage
    await page.click('a[href="/admin/manage"]');
    await expect(page).toHaveURL(/admin\/manage/);

    // Navigate to create recruiter
    await page.goto("/admin/create-recruiter");
    await expect(page).toHaveURL(/admin\/create-recruiter/);
  });

  test("can create a recruiter", async ({ page }) => {
    await page.goto("/admin/create-recruiter");

    await page.fill('input[name="name"]', "Test Recruiter");
    await page.fill('input[name="email"]', `recruiter-${Date.now()}@test.com`);
    await page.fill('input[name="password"]', "TestPass123");
    await page.click('button[type="submit"]');

    // Should show success message
    await expect(page.locator("text=Recruiter created")).toBeVisible();
  });
});
