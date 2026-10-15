import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Cross-boundary contract checks: these assert the exact HTTP envelopes the
 * React client consumes. They exist because client/server field drift was the
 * single largest source of bugs in this codebase — a rename here now fails CI
 * instead of breaking the UI at runtime.
 */

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:5000";

async function login(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<{ csrfToken: string; user: { id: string; role: string } }> {
  const response = await request.post(`${BACKEND_URL}/api/auth/login`, {
    data: { email, password },
  });
  expect(response.status(), `login failed for ${email}`).toBe(200);
  return response.json();
}

test.describe("Client/server response contracts", () => {
  test("candidate interview endpoints keep their envelopes", async ({ request }) => {
    await login(request, "candidate@example.com", "candidate123");

    const pending = await request.get(`${BACKEND_URL}/api/interview/pending`);
    expect(pending.status()).toBe(200);
    const pendingBody = await pending.json();
    expect(Object.keys(pendingBody)).toContain("interviews");
    expect(Array.isArray(pendingBody.interviews)).toBe(true);

    const eligibility = await request.get(`${BACKEND_URL}/api/interview/eligibility`);
    expect(eligibility.status()).toBe(200);
    const eligibilityBody = await eligibility.json();
    expect(eligibilityBody).toHaveProperty("eligible");
    if (eligibilityBody.eligible) {
      expect(Array.isArray(eligibilityBody.attempts)).toBe(true);
    }
  });

  test("recruiter interview feeds return 200 envelopes", async ({ request }) => {
    await login(request, "recruiter@example.com", "recruiter123");

    for (const path of ["/api/interview/summaries", "/api/interview/recruiter/pending"]) {
      const response = await request.get(`${BACKEND_URL}${path}`);
      expect(response.status(), path).toBe(200);
      const body = await response.json();
      expect(Object.keys(body), path).toContain("interviews");
      expect(Array.isArray(body.interviews), path).toBe(true);
    }
  });

  test("unknown interview id returns 404, not 500", async ({ request }) => {
    await login(request, "candidate@example.com", "candidate123");

    const response = await request.get(
      `${BACKEND_URL}/api/interview/${crypto.randomUUID()}`
    );
    expect(response.status()).toBe(404);
  });

  test("tpo marksheet scan endpoint is mounted and role-guarded", async ({ request }) => {
    // Unauthenticated call must be rejected, never 404 (the route must exist).
    const anonymous = await request.post(`${BACKEND_URL}/api/tpo/scan-marksheets`, {
      data: { files: [] },
    });
    expect([401, 403]).toContain(anonymous.status());

    // Authenticated TPO reaches validation (400 for an empty payload).
    const { csrfToken } = await login(request, "tpo@example.com", "tpo123");
    const authenticated = await request.post(`${BACKEND_URL}/api/tpo/scan-marksheets`, {
      data: { files: [] },
      headers: { "x-csrf-token": csrfToken },
    });
    expect(authenticated.status()).toBe(400);
  });

  test("health timestamp is a valid, unambiguous datetime", async ({ request }) => {
    const response = await request.get(`${BACKEND_URL}/api/health`);
    expect([200, 503]).toContain(response.status());
    const body = await response.json();
    expect(typeof body.timestamp).toBe("string");
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });
});
