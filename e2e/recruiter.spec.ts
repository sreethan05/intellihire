import { test, expect } from "@playwright/test";

test.describe("Recruiter Drive & Exam Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "admin@intellihire.com");
    await page.fill('input[name="password"]', "admin123");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/admin\/overview/);
  });

  test("admin can create recruiter and recruiter can login", async ({ page }) => {
    // Create recruiter as admin
    await page.goto("/admin/create-recruiter");
    await page.fill('input[name="name"]', "Test Recruiter");
    await page.fill('input[name="email"]', `recruiter-${Date.now()}@test.com`);
    await page.fill('input[name="password"]', "Recruiter123");
    await page.click('button[type="submit"]');

    await expect(page.getByText(/Recruiter created/i)).toBeVisible();
  });

  test("recruiter can create an exam", async ({ page }) => {
    // Admin is currently logged in due to beforeEach, log out first
    await page.click('button:has-text("Logout")');
    await expect(page).toHaveURL(/login/);

    // First login as a recruiter
    await page.goto("/login");
    await page.fill('input[name="email"]', "recruiter@example.com");
    await page.fill('input[name="password"]', "recruiter123");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/recruiter\/overview/, { timeout: 15000 });

    // Navigate to create exam
    await page.click('a[href="/recruiter/create-exam"]');
    await expect(page).toHaveURL(/recruiter\/create-exam/);

    // Fill exam form Step 1
    await page.fill('input[name="title"]', `E2E Test Exam ${Date.now()}`);
    await page.fill('[name="description"]', "This is an E2E test exam");
    await page.fill('input[name="duration"]', "30");
    await page.fill('input[name="totalMarks"]', "100");
    await page.fill('input[name="passMarks"]', "40");

    // Click Next to go to Step 2
    await page.click('button:has-text("Next")');

    // Click MCQ tab in Step 2
    await page.click('button[role="tab"]:has-text("MCQ")');

    // Add an MCQ question under Create New tab
    await page.click('button:has-text("Add MCQ Question")');
    await page.fill('textarea', 'What is 2 + 2?');
    await page.getByLabel('Option a').fill('4');
    await page.getByLabel('Option b').fill('3');
    await page.getByLabel('Option c').fill('5');
    await page.getByLabel('Option d').fill('6');

    // Click Save Questions to go to Step 3
    await page.click('button:has-text("Save Questions")');

    // Should show success message
    await expect(page.getByText(/Exam Created Successfully/i)).toBeVisible();
  });
});


