import { test, expect } from "@playwright/test";

test.describe("Login Flow", () => {
  test("admin can login and view dashboard", async ({ page }) => {
    await page.goto("/login");

    // Fill login form
    await page.fill('input[name="email"]', "admin@intellihire.com");
    await page.fill('input[name="password"]', "admin123");
    await page.click('button[type="submit"]');

    // Should redirect to admin dashboard
    await expect(page).toHaveURL(/admin\/overview/, { timeout: 15000 });

    // Dashboard should be visible
    await expect(page.getByRole("heading", { name: "Platform Control Console" })).toBeVisible();
  });

  test("shows error for invalid credentials", async ({ page }) => {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    await page.goto("/login");

    await page.fill('input[name="email"]', "wrong@example.com");
    await page.fill('input[name="password"]', "wrongpassword");
    await page.click('button[type="submit"]');

    // Should show error toast or message
    await expect(page.locator("text=Invalid credentials")).toBeVisible();
  });

  test("redirects authenticated user away from login", async ({ page }) => {
    // Login first
    await page.goto("/login");
    await page.fill('input[name="email"]', "admin@intellihire.com");
    await page.fill('input[name="password"]', "admin123");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/admin\/overview/, { timeout: 15000 });

    // Try to go back to login
    await page.goto("/login");

    // Should be redirected to dashboard
    await expect(page).toHaveURL(/admin\/overview/, { timeout: 15000 });
  });
});
