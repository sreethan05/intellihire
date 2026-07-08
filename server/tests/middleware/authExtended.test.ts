import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { authMiddleware, roleMiddleware, getCookie, generateToken, generateCsrfToken, generateRefreshToken, hashRefreshToken } from "../../src/middleware/auth.js";

describe("Auth middleware - direct function tests", () => {
  function createMockReq(options: any = {}) {
    return {
      headers: {
        cookie: options.cookie || "",
        authorization: options.authorization || "",
        ...options.headers,
      },
      user: options.user || undefined,
      get(header: string) {
        return this.headers[header.toLowerCase()] || "";
      },
    } as any;
  }

  function createMockRes() {
    const res: any = {
      statusCode: 200,
      jsonBody: null,
      clearedCookies: {} as Record<string, any>,
      cookie(name: string, val: string, opts: any) {
        this.clearedCookies[name] = { value: val, opts };
      },
      clearCookie(name: string, opts: any) {
        this.clearedCookies[name] = { cleared: true, opts };
      },
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

  describe("authMiddleware", () => {
    it("returns 401 when no access_token cookie is present", () => {
      const req = createMockReq({ cookie: "" });
      const res = createMockRes();
      authMiddleware(req, res, next);
      assert.equal(res.statusCode, 401);
      assert.equal(res.jsonBody.error, "Unauthorized");
    });

    it("returns 401 when token is invalid", () => {
      const req = createMockReq({ cookie: "access_token=invalid.token.here" });
      const res = createMockRes();
      authMiddleware(req, res, next);
      assert.equal(res.statusCode, 401);
      assert.equal(res.jsonBody.error, "Invalid token");
    });

    it("attaches user to request when token is valid", () => {
      const user = { id: "user-123", email: "test@example.com", role: "candidate" };
      const token = generateToken(user);
      const req = createMockReq({ cookie: `access_token=${token}` });
      const res = createMockRes();
      let calledNext = false;
      authMiddleware(req, res, () => { calledNext = true; });
      assert.ok(calledNext);
      assert.ok(req.user);
      assert.equal(req.user.id, "user-123");
      assert.equal(req.user.email, "test@example.com");
      assert.equal(req.user.role, "candidate");
    });
  });

  describe("roleMiddleware", () => {
    it("returns 403 when user role is not allowed", () => {
      const req = createMockReq({ user: { id: "u1", email: "a@b.com", role: "candidate" } });
      const res = createMockRes();
      const middleware = roleMiddleware(["admin"]);
      middleware(req, res, next);
      assert.equal(res.statusCode, 403);
      assert.equal(res.jsonBody.error, "Forbidden - Insufficient permissions");
    });

    it("returns 401 when req.user is missing", () => {
      const req = createMockReq();
      const res = createMockRes();
      const middleware = roleMiddleware(["admin"]);
      middleware(req, res, next);
      assert.equal(res.statusCode, 401);
      assert.equal(res.jsonBody.error, "Unauthorized");
    });

    it("allows request when role is in allowed list", () => {
      const req = createMockReq({ user: { id: "u1", email: "a@b.com", role: "recruiter" } });
      const res = createMockRes();
      let calledNext = false;
      const middleware = roleMiddleware(["recruiter", "admin"]);
      middleware(req, res, () => { calledNext = true; });
      assert.ok(calledNext);
      assert.equal(res.statusCode, 200);
    });
  });

  describe("getCookie", () => {
    it("extracts a cookie value by name", () => {
      const value = getCookie("a=1; b=2; c=3", "b");
      assert.equal(value, "2");
    });

    it("returns null for missing cookie", () => {
      const value = getCookie("a=1; b=2", "c");
      assert.equal(value, null);
    });

    it("returns null for empty cookie header", () => {
      const value = getCookie("", "a");
      assert.equal(value, null);
    });

    it("handles URL-encoded cookie values", () => {
      const value = getCookie("token=hello%20world", "token");
      assert.equal(value, "hello world");
    });

    it("handles cookie names with special regex characters", () => {
      const value = getCookie("a.b=1", "a.b");
      assert.equal(value, "1");
    });
  });

  describe("generateCsrfToken", () => {
    it("generates base64url tokens of expected length", () => {
      const token = generateCsrfToken();
      assert.ok(token.length > 30);
      assert.ok(!token.includes("+"));
      assert.ok(!token.includes("/"));
      assert.ok(!token.includes("="));
    });
  });

  describe("generateRefreshToken", () => {
    it("generates tokens of sufficient entropy (48 bytes = 64 base64url chars)", () => {
      const token = generateRefreshToken();
      assert.ok(token.length >= 60, "Should be ~64 chars from 48 bytes base64url");
    });
  });

  describe("hashRefreshToken", () => {
    it("produces deterministic SHA-256 hashes", () => {
      const hash1 = hashRefreshToken("abc");
      const hash2 = hashRefreshToken("abc");
      assert.equal(hash1, hash2);
      assert.equal(hash1.length, 64);
    });

    it("produces different hashes for different inputs", () => {
      const hash1 = hashRefreshToken("abc");
      const hash2 = hashRefreshToken("def");
      assert.notEqual(hash1, hash2);
    });
  });
});
