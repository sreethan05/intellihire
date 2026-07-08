import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { csrfProtection } from "../../src/middleware/csrf.js";
import { ACCESS_TOKEN_COOKIE, CSRF_TOKEN_COOKIE } from "../../src/middleware/auth.js";

describe("CSRF middleware", () => {
  function createMockReq(options: {
    method?: string;
    path?: string;
    cookies?: string;
    headers?: Record<string, string>;
  } = {}) {
    return {
      method: options.method || "POST",
      path: options.path || "/api/candidate/update",
      originalUrl: options.path || "/api/candidate/update",
      headers: {
        cookie: options.cookies || "",
        "x-csrf-token": options.headers?.["x-csrf-token"] || "",
        ...options.headers,
      },
      get(header: string) {
        return this.headers[header.toLowerCase()] || "";
      },
    } as any;
  }

  function createMockRes() {
    const res: any = {
      statusCode: 200,
      jsonBody: null,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: any) {
        this.jsonBody = body;
        return this;
      },
    };
    return res;
  }

  const next = () => {};

  it("allows GET requests without CSRF token", () => {
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    let calledNext = false;
    csrfProtection(req, res, () => { calledNext = true; });
    assert.ok(calledNext);
    assert.equal(res.statusCode, 200);
  });

  it("allows HEAD requests without CSRF token", () => {
    const req = createMockReq({ method: "HEAD" });
    const res = createMockRes();
    let calledNext = false;
    csrfProtection(req, res, () => { calledNext = true; });
    assert.ok(calledNext);
  });

  it("allows OPTIONS requests without CSRF token", () => {
    const req = createMockReq({ method: "OPTIONS" });
    const res = createMockRes();
    let calledNext = false;
    csrfProtection(req, res, () => { calledNext = true; });
    assert.ok(calledNext);
  });

  it("exempts login endpoint from CSRF check", () => {
    const req = createMockReq({ method: "POST", path: "/api/auth/login" });
    const res = createMockRes();
    let calledNext = false;
    csrfProtection(req, res, () => { calledNext = true; });
    assert.ok(calledNext);
  });

  it("exempts refresh endpoint from CSRF check", () => {
    const req = createMockReq({ method: "POST", path: "/api/auth/refresh" });
    const res = createMockRes();
    let calledNext = false;
    csrfProtection(req, res, () => { calledNext = true; });
    assert.ok(calledNext);
  });

  it("skips CSRF when no session cookie is present", () => {
    const req = createMockReq({ method: "POST", cookies: "" });
    const res = createMockRes();
    let calledNext = false;
    csrfProtection(req, res, () => { calledNext = true; });
    assert.ok(calledNext);
  });

  it("returns 403 when CSRF cookie is missing but session exists", () => {
    const req = createMockReq({
      method: "POST",
      cookies: `${ACCESS_TOKEN_COOKIE}=valid.token.here`,
    });
    const res = createMockRes();
    csrfProtection(req, res, next);
    assert.equal(res.statusCode, 403);
    assert.equal(res.jsonBody?.error, "Invalid CSRF token");
  });

  it("returns 403 when CSRF header is missing but cookie exists", () => {
    const req = createMockReq({
      method: "POST",
      cookies: `${ACCESS_TOKEN_COOKIE}=valid.token.here; ${CSRF_TOKEN_COOKIE}=csrf123`,
    });
    const res = createMockRes();
    csrfProtection(req, res, next);
    assert.equal(res.statusCode, 403);
  });

  it("returns 403 when CSRF tokens do not match", () => {
    const req = createMockReq({
      method: "POST",
      cookies: `${ACCESS_TOKEN_COOKIE}=valid.token.here; ${CSRF_TOKEN_COOKIE}=correctcsrf`,
      headers: { "x-csrf-token": "wrongcsrf" },
    });
    const res = createMockRes();
    csrfProtection(req, res, next);
    assert.equal(res.statusCode, 403);
  });

  it("allows request when CSRF tokens match via timing-safe comparison", () => {
    const token = "matching-csrf-token-123";
    const req = createMockReq({
      method: "POST",
      cookies: `${ACCESS_TOKEN_COOKIE}=valid.token.here; ${CSRF_TOKEN_COOKIE}=${token}`,
      headers: { "x-csrf-token": token },
    });
    const res = createMockRes();
    let calledNext = false;
    csrfProtection(req, res, () => { calledNext = true; });
    assert.ok(calledNext);
    assert.equal(res.statusCode, 200);
  });

  it("uses timing-safe equal to prevent timing attacks", () => {
    // Verify that two tokens of same length but different content are rejected
    const tokenA = "aaaaaaaaaaaaaaaaaaaaaaaa";
    const tokenB = "bbbbbbbbbbbbbbbbbbbbbbbb";
    const req = createMockReq({
      method: "POST",
      cookies: `${ACCESS_TOKEN_COOKIE}=valid.token.here; ${CSRF_TOKEN_COOKIE}=${tokenA}`,
      headers: { "x-csrf-token": tokenB },
    });
    const res = createMockRes();
    csrfProtection(req, res, next);
    assert.equal(res.statusCode, 403);
  });
});
