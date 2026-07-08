import { describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../src/app.js";

describe("Security headers", () => {
  it("sets X-Request-Id on all responses", async () => {
    const res = await request(app).get("/api/health");
    assert.ok(res.headers["x-request-id"]);
    assert.match(res.headers["x-request-id"], /^[0-9a-f-]{36}$/i, "Should be a valid UUID format");
  });

  it("does not expose X-Powered-By", async () => {
    const res = await request(app).get("/api/health");
    assert.ok(!res.headers["x-powered-by"], "Should not leak server framework info");
  });

  it("sets Content-Security-Policy header", async () => {
    const res = await request(app).get("/api/health");
    assert.ok(res.headers["content-security-policy"] || res.headers["content-security-policy-report-only"]);
    const csp = String(res.headers["content-security-policy"] || "");
    assert.ok(csp.includes("default-src 'self'"), "CSP should restrict default-src to self");
    assert.ok(csp.includes("frame-ancestors 'none'"), "CSP should prevent clickjacking via frame-ancestors");
  });

  it("sets X-Content-Type-Options to nosniff", async () => {
    const res = await request(app).get("/api/health");
    assert.equal(res.headers["x-content-type-options"], "nosniff");
  });

  it("sets Referrer-Policy header", async () => {
    const res = await request(app).get("/api/health");
    const policy = String(res.headers["referrer-policy"] || "").toLowerCase();
    assert.ok(
      policy.includes("strict-origin-when-cross-origin") || policy.includes("no-referrer"),
      "Should have strict referrer policy"
    );
  });

  it("sets Permissions-Policy header restricting camera and geolocation", async () => {
    const res = await request(app).get("/api/health");
    const pp = String(res.headers["permissions-policy"] || "").toLowerCase();
    assert.ok(
      pp.includes("camera=(self)") || pp.includes("camera=self"),
      "Should restrict camera to self"
    );
    assert.ok(
      pp.includes("geolocation=()") || pp.includes("geolocation=none"),
      "Should disable geolocation"
    );
  });

  it("does not expose stack traces in production-like error responses", async () => {
    const res = await request(app).get("/api/candidate/portfolio/test-slug");
    // 404 response should not contain stack trace
    assert.ok(!res.body.stack, "Error responses should not leak stack traces");
  });

  it("does not leak email or password in error responses", async () => {
    const res = await request(app).get("/api/candidate/portfolio/test-slug");
    const bodyStr = JSON.stringify(res.body);
    assert.ok(!bodyStr.includes("@"), "Should not leak email addresses in error responses");
    assert.ok(!bodyStr.includes("password"), "Should not mention password in error responses");
  });

  it("returns generic error message on 401 to prevent user enumeration", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "nonexistent@example.com",
      password: "wrongpassword",
    });
    if (res.status === 401) {
      assert.equal(res.body.error, "Invalid credentials", "Should use generic message to prevent user enumeration");
    }
  });
});

describe("Auth rate limiting", () => {
  it("returns 429 after excessive login attempts", async () => {
    const requests = Array.from({ length: 15 }, () =>
      request(app).post("/api/auth/login").send({
        email: "ratelimit-test@example.com",
        password: "wrong",
      })
    );
    const responses = await Promise.all(requests);
    const has429 = responses.some((r) => r.status === 429);
    assert.ok(has429, "Should rate limit excessive login attempts");
  });
});
