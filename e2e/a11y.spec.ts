import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Accessibility smoke tests: run axe-core (WCAG 2.0/2.1 A + AA) against the
 * entry page of every role. Any violation fails the run, so an inaccessible
 * regression in a core screen fails CI instead of shipping.
 */

type ViolationSummary = {
  id: string;
  impact: string | null | undefined;
  help: string;
  nodes: number;
  details: string[];
};

async function scan(page: Page): Promise<ViolationSummary[]> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.length,
    details: violation.nodes.slice(0, 12).map((node) => {
      const summary = (node.failureSummary || "").split("\n").slice(-2).join(" ").trim();
      return `${node.target.join(" ")} :: ${summary}`;
    }),
  }));
}

function describeViolations(violations: ViolationSummary[]): string {
  return violations
    .map(
      (v) =>
        `- [${v.impact ?? "unknown"}] ${v.id}: ${v.help} (${v.nodes} node(s))\n` +
        v.details.map((d) => `    ${d}`).join("\n")
    )
    .join("\n");
}

async function login(page: Page, email: string, password: string, landing: RegExp): Promise<void> {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(landing, { timeout: 20000 });
  await page.waitForTimeout(1200); // let dashboards settle after the auth redirect
}

test.describe("Accessibility (axe core, WCAG A/AA)", () => {
  test.slow(); // Triples test timeout to 180s for deep full-page axe-core scans in CI

  test("login page has no violations", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('button[type="submit"]')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1200); // allow framer-motion entry transitions to settle
    const violations = await scan(page);
    expect(describeViolations(violations)).toBe("");
  });

  test("admin overview has no violations", async ({ page }) => {
    await login(page, "admin@intellihire.com", "admin123", /admin\/overview/);
    const violations = await scan(page);
    expect(describeViolations(violations)).toBe("");
  });

  test("recruiter overview has no violations", async ({ page }) => {
    await login(page, "recruiter@example.com", "recruiter123", /recruiter\/overview/);
    const violations = await scan(page);
    expect(describeViolations(violations)).toBe("");
  });

  test("tpo overview has no violations", async ({ page }) => {
    await login(page, "tpo@example.com", "tpo123", /tpo\/overview/);
    const violations = await scan(page);
    expect(describeViolations(violations)).toBe("");
  });

  test("candidate overview has no violations", async ({ page }) => {
    await login(page, "candidate@example.com", "candidate123", /candidate\/(overview|onboarding)/);
    const violations = await scan(page);
    expect(describeViolations(violations)).toBe("");
  });
});
