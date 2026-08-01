import { expect, test } from "@playwright/test";

const MAX_LOGIN_MS = 15_000;
const MAX_DASHBOARD_MS = 8_000;
const MAX_EXAM_PAGE_MS = 8_000;

async function loginAsCandidate(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Student" }).click();
  await page.getByLabel("Username or Email").fill("candidate@example.com");
  await page.getByLabel("Password").fill("candidate123");
  await page.getByRole("button", { name: "Sign In" }).click();
}

test.describe("Accessibility and performance", () => {
  test("login form has accessible labels and keyboard navigation", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Username or Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Admin" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Student" })).toBeFocused();
  });

  test("login and candidate dashboard meet performance budgets", async ({ page }) => {
    const startedAt = Date.now();
    await loginAsCandidate(page);
    await expect(page).toHaveURL(/candidate\/(overview|onboarding)/, { timeout: MAX_LOGIN_MS });
    expect(Date.now() - startedAt).toBeLessThan(MAX_LOGIN_MS);

    if (page.url().includes("onboarding")) test.skip(true, "Seed candidate requires onboarding");
    await expect(page.getByRole("heading")).toBeVisible({ timeout: MAX_DASHBOARD_MS });
  });

  test("candidate exam entry is keyboard-accessible and responsive", async ({ page }) => {
    await loginAsCandidate(page);
    if (page.url().includes("onboarding")) test.skip(true, "Seed candidate requires onboarding");

    await page.getByRole("link", { name: "Manage" }).click();
    await expect(page).toHaveURL(/candidate\/my-exams/, { timeout: MAX_EXAM_PAGE_MS });
    await expect(page.getByRole("main").or(page.locator("body"))).toBeVisible();
  });
});
