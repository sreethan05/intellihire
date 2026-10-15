import { test, expect } from "@playwright/test";

test.describe("Candidate Exam Flow", () => {
  test("candidate can view assigned exams", async ({ page }) => {
    // Login as candidate
    await page.goto("/login");
    await page.fill('input[name="email"]', "candidate@example.com");
    await page.fill('input[name="password"]', "candidate123");
    await page.click('button[type="submit"]');

    // Should redirect to candidate dashboard or onboarding
    await expect(page).toHaveURL(/candidate\/(overview|onboarding)/, { timeout: 15000 });

    // Navigate to My Exams
    await page.click('a[href="/candidate/my-exams"]');
    await expect(page).toHaveURL(/candidate\/my-exams/, { timeout: 15000 });
  });

  test("candidate onboarding flow", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "candidate@example.com");
    await page.fill('input[name="password"]', "candidate123");
    await page.click('button[type="submit"]');

    await page.waitForURL(/candidate\/(overview|onboarding)/, { timeout: 15000 });

    // If candidate needs onboarding, complete onboarding with actual fields
    if (page.url().includes("onboarding")) {
      await expect(page.getByRole("heading", { name: /Complete Your Profile/i })).toBeVisible({ timeout: 10000 });

      // Fill onboarding form fields
      await page.fill('input[type="password"]', "candidate123");
      const phoneInput = page.locator('input[placeholder*="Phone"], input[type="text"]').first();
      if (await phoneInput.isVisible()) {
        await phoneInput.fill("+91 9876543210");
      }
      const skillsField = page.locator("textarea");
      if (await skillsField.isVisible()) {
        await skillsField.fill("Python, JavaScript, React");
      }

      await page.click('button[type="submit"]');
      await expect(page).toHaveURL(/candidate\/overview/, { timeout: 15000 });
    } else {
      await expect(page).toHaveURL(/candidate\/overview/);
      await expect(page.getByRole("heading", { name: /Command Hub/i })).toBeVisible({ timeout: 15000 });
    }
  });
});
