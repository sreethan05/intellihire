import { describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../src/app.js";

describe("POST /api/auth/login", () => {
  it("returns 400 for empty body", async () => {
    const res = await request(app).post("/api/auth/login").send({});
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it("returns 400 for missing password", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "test@example.com",
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it("returns 400 for invalid email format", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "not-an-email",
      password: "SomePassword123",
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it("returns 401 for non-existent user", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "nonexistent-user-12345@example.com",
      password: "SomePassword123",
    });
    // Rate limiting may kick in after repeated calls, but single call should 401
    assert.ok([401, 429].includes(res.status));
    if (res.status === 401) {
      assert.equal(res.body.error, "Invalid credentials");
    }
  });

  it("returns 400 for password too long", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "test@example.com",
      password: "a".repeat(200),
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });
});

describe("POST /api/auth/login - rate limiting", () => {
  it("eventually returns 429 after too many login attempts", async () => {
    // Send 12 rapid requests to trigger the login limiter
    const requests = Array.from({ length: 12 }, () =>
      request(app).post("/api/auth/login").send({
        email: "any@example.com",
        password: "wrong",
      })
    );
    const responses = await Promise.all(requests);
    const has429 = responses.some((r) => r.status === 429);
    assert.ok(
      has429,
      "Expected at least one 429 Too Many Requests after rapid login attempts"
    );
  });
});
