import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateToken, verifyToken, refreshToken } from "../../src/middleware/auth.js";

describe("JWT token lifecycle", () => {
  const user = { id: "user-123", email: "test@example.com", role: "candidate" };

  it("generates and verifies token", () => {
    const token = generateToken(user);
    const decoded = verifyToken(token);
    assert.equal(decoded.id, user.id);
    assert.equal(decoded.email, user.email);
    assert.equal(decoded.role, user.role);
  });

  it("refreshToken returns new token", () => {
    const token = generateToken(user);
    const originalNow = Date.now;
    Date.now = () => originalNow() + 2000;
    try {
      const fresh = refreshToken(token);
      assert.ok(fresh);
      assert.notEqual(fresh, token);
    } finally {
      Date.now = originalNow;
    }
  });

  it("refreshToken rejects invalid token", () => {
    const result = refreshToken("invalid-token");
    assert.equal(result, null);
  });
});
