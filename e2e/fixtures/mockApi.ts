import { Page } from "@playwright/test";

/**
 * Playwright Route Interception Fixtures for Offline / Deterministic E2E Testing
 */
export async function setupMockApiFixtures(page: Page) {
  // Mock health check endpoint with all required service keys
  await page.route("**/api/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "healthy",
        timestamp: new Date().toISOString() + "Z",
        environment: "test",
        services: {
          postgres: true,
          groq: true,
          judge0: { endpoint: "http://localhost:2358", isPrivate: true },
          email: true,
          sentry: true,
          pipeline: { healthy: true, totalMcq: 100, totalCoding: 20 },
        },
      }),
    });
  });

  // Mock slow AI question generation endpoint for deterministic testing
  await page.route("**/api/ai/generate**", async (route) => {
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

  // Mock code compiler execution endpoint
  await page.route("**/api/compiler/run", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "accepted",
        output: "Test Output",
        passed: true,
        executionTime: 0.05,
      }),
    });
  });
}
