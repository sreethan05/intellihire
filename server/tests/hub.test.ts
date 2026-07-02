import { describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../src/app.js";

describe("GET /api/hub/overview", () => {
  it("returns 401 when no auth token is provided", async () => {
    const res = await request(app).get("/api/hub/overview");
    assert.equal(res.status, 401);
  });

  it("returns 401 when an invalid auth token is provided", async () => {
    const res = await request(app)
      .get("/api/hub/overview")
      .set("Authorization", "Bearer invalid-token-12345");
    assert.equal(res.status, 401);
  });

  it("returns 401 when authorization header format is wrong", async () => {
    const res = await request(app)
      .get("/api/hub/overview")
      .set("Authorization", "InvalidScheme token123");
    assert.equal(res.status, 401);
  });

  it("rejects requests without Bearer prefix", async () => {
    const res = await request(app)
      .get("/api/hub/overview")
      .set("Authorization", "some-token-value");
    assert.equal(res.status, 401);
  });
});

describe("Hub overview response structure", () => {
  // These tests verify the expected JSON shape for valid responses.
  // In a test environment without a seeded database, we can only test
  // auth rejection. If a valid JWT token is available in the future,
  // add tests that verify:
  //   - res.body.role is one of: candidate, recruiter, tpo, admin
  //   - res.body.stats is an object
  //   - res.body.actionItems is an array
  //   - res.body.recentActivity is an array
  //   - res.body.upcomingSchedule is an array
  //   - res.body.insights is an object
  //   - res.body.quickLinks is an array with {label, path, color} shape

  it("does not expose stack traces on error", async () => {
    const res = await request(app).get("/api/hub/overview");
    // Even on auth failure, response should not leak internals
    assert.ok(!res.body.stack, "Response should not contain stack traces");
  });
});
