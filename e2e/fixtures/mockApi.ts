import { Page } from "@playwright/test";

/**
 * Playwright Route Interception Fixtures for Offline / Deterministic E2E Testing
 */
export async function setupMockApiFixtures(page: Page) {
  // Mock health check endpoint
  await page.route("**/api/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "healthy",
        timestamp: new Date().toISOString(),
        environment: "test",
        services: { postgres: true, groq: true, email: true },
      }),
    });
  });

  // Mock slow AI endpoint for offline testing
  await page.route("**/api/ai/generate", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        questions: [
          {
            question_text: "Mocked AI Question for Offline E2E?",
            option_a: "A",
            option_b: "B",
            option_c: "C",
            option_d: "D",
            correct_option: "A",
            marks: 1,
          },
        ],
      }),
    });
  });
}
