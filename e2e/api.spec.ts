import { test, expect } from "@playwright/test";

test.describe("Health & API Checks", () => {
  test("health endpoint returns correct structure", async ({ request }) => {
    const response = await request.get("http://localhost:5000/api/health");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("environment");
    expect(body).toHaveProperty("services");
    expect(body.services).toHaveProperty("postgres");
    expect(body.services).toHaveProperty("gemini");
    expect(body.services).toHaveProperty("groq");
    expect(body.services).toHaveProperty("judge0");
    expect(body.services).toHaveProperty("email");
    expect(body.services).toHaveProperty("sentry");
  });

  test("login endpoint rejects invalid credentials", async ({ request }) => {
    const response = await request.post("http://localhost:5000/api/auth/login", {
      data: {
        email: "nonexistent@example.com",
        password: "wrongpassword",
      },
    });
    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body).toHaveProperty("error");
  });

  test("login endpoint validates input", async ({ request }) => {
    const response = await request.post("http://localhost:5000/api/auth/login", {
      data: {},
    });
    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body).toHaveProperty("error");
  });

  test("protected routes require authentication", async ({ request }) => {
    const response = await request.get("http://localhost:5000/api/admin/dashboard");
    expect(response.status()).toBe(401);
  });
});
