import { describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../src/app.js";

describe("GET /api/candidate/portfolio/:slug (public)", () => {
  it("returns 404 for a non-existent portfolio slug", async () => {
    const res = await request(app).get(
      "/api/candidate/portfolio/non-existent-slug-12345"
    );
    assert.equal(res.status, 404);
    assert.equal(res.body.error, "Portfolio not found");
  });

  it("returns 404 for a non-existent UUID slug", async () => {
    const res = await request(app).get(
      "/api/candidate/portfolio/00000000-0000-0000-0000-000000000000"
    );
    assert.equal(res.status, 404);
    assert.equal(res.body.error, "Portfolio not found");
  });

  it("does not require authentication (public endpoint)", async () => {
    // Should return 404 (not found) rather than 401 (unauthorized)
    const res = await request(app).get(
      "/api/candidate/portfolio/any-slug"
    );
    assert.notEqual(
      res.status,
      401,
      "Portfolio route should be publicly accessible without auth"
    );
    // Expect 404 since this slug doesn't exist
    assert.equal(res.status, 404);
  });

  it("does not expose internal error details", async () => {
    const res = await request(app).get(
      "/api/candidate/portfolio/test-slug"
    );
    assert.ok(!res.body.stack, "Response should not contain stack traces");
    // Ensure no sensitive fields leak
    assert.ok(
      !res.body.email,
      "Response should not contain email addresses"
    );
    assert.ok(
      !res.body.phone,
      "Response should not contain phone numbers"
    );
  });
});
