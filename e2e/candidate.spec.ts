import { test, expect } from "@playwright/test";

test.describe("Candidate Exam Flow", () => {
  test("candidate can view assigned exams", async ({ page }) => {
    // Login as candidate
    await page.goto("/login");
    await page.fill('input[name="email"]', "candidate@example.com");
    await page.fill('input[name="password"]', "candidate123");
    await page.click('button[type="submit"]');

    // Should redirect to candidate dashboard or onboarding
    await expect(page).toHaveURL(/candidate/);

    // Navigate to My Exams
    await page.click('a[href="/candidate/my-exams"]');
    await expect(page).toHaveURL(/candidate\/my-exams/);
  });

  test("candidate onboarding flow", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "candidate@example.com");
    await page.fill('input[name="password"]', "candidate123");
    await page.click('button[type="submit"]');

    // If candidate needs onboarding, redirect to onboarding page
    if (page.url().includes("onboarding")) {
      await expect(page.locator("text=Onboarding")).toBeVisible();

      // Fill onboarding form
      await page.fill('input[name="rollNumber"]', "ROLL001");
      await page.fill('input[name="branch"]', "CSE");
      await page.fill('input[name="cgpa"]', "8.5");
      await page.fill('input[name="graduationYear"]', "2025");
      await page.fill('input[name="phone"]', "+91 9876543210");

      await page.click('button[type="submit"]');
      await expect(page).toHaveURL(/candidate\/overview/);
    }
  });
});
