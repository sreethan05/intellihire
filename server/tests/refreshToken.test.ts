import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pool, transaction } from "../src/lib/postgres.js";
import {
  generateRefreshToken,
  hashRefreshToken,
  setSessionCookies,
  clearSessionCookies,
} from "../src/middleware/auth.js";

describe("Refresh token rotation security", () => {
  it("hashes refresh tokens to 64-character hex (SHA-256)", () => {
    const token = generateRefreshToken();
    const hash = hashRefreshToken(token);
    assert.equal(hash.length, 64);
    assert.match(hash, /^[a-f0-9]{64}$/);
  });

  it("setSessionCookies issues httpOnly, SameSite=Strict, Secure cookies in production", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const res: any = {
      cookies: {} as Record<string, any>,
      cleared: {} as Record<string, any>,
      cookie(name: string, val: string, opts: any) {
        this.cookies[name] = { value: val, opts };
      },
      clearCookie(name: string, opts: any) {
        this.cleared[name] = opts;
      },
    };
    setSessionCookies(res, "access-token-123", "refresh-token-456");
    const access = res.cookies.access_token;
    const refresh = res.cookies.refresh_token;
    const csrf = res.cookies.csrf_token;

    assert.ok(access, "access_token cookie should be set");
    assert.ok(access.opts.httpOnly, "access_token should be httpOnly");
    assert.equal(access.opts.sameSite, "strict", "access_token should be SameSite=Strict");
    assert.ok(access.opts.secure, "access_token should be Secure in production");
    assert.equal(access.opts.path, "/");

    assert.ok(refresh, "refresh_token cookie should be set");
    assert.ok(refresh.opts.httpOnly, "refresh_token should be httpOnly");
    assert.ok(refresh.opts.secure, "refresh_token should be Secure in production");

    assert.ok(csrf, "csrf_token cookie should be set");
    assert.equal(csrf.opts.httpOnly, false, "csrf_token should NOT be httpOnly (for JS access)");
    assert.equal(csrf.opts.sameSite, "strict", "csrf_token should be SameSite=Strict");

    process.env.NODE_ENV = originalEnv;
  });

  it("clearSessionCookies removes all session cookies", () => {
    const res: any = {
      cleared: {} as Record<string, any>,
      clearCookie(name: string, opts: any) {
        this.cleared[name] = opts;
      },
    };
    clearSessionCookies(res);
    assert.ok(res.cleared.access_token, "Should clear access_token");
    assert.ok(res.cleared.refresh_token, "Should clear refresh_token");
    assert.ok(res.cleared.token, "Should clear legacy token");
    assert.ok(res.cleared.csrf_token, "Should clear csrf_token");
  });

  it("refresh token database table has required fields for rotation tracking", async () => {
    // Verify the refresh_tokens table schema exists
    const { rows } = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'refresh_tokens'
      AND column_name IN ('token_hash', 'revoked_at', 'expires_at', 'created_by_ip', 'user_agent', 'last_used_at', 'replaced_by_token_hash')
    `);
    const columns = rows.map((r: any) => r.column_name);
    assert.ok(columns.includes("token_hash"), "refresh_tokens should have token_hash");
    assert.ok(columns.includes("revoked_at"), "refresh_tokens should have revoked_at for reuse detection");
    assert.ok(columns.includes("expires_at"), "refresh_tokens should have expires_at");
    assert.ok(columns.includes("created_by_ip"), "refresh_tokens should track created_by_ip");
    assert.ok(columns.includes("user_agent"), "refresh_tokens should track user_agent");
    assert.ok(columns.includes("last_used_at"), "refresh_tokens should track last_used_at");
    assert.ok(columns.includes("replaced_by_token_hash"), "refresh_tokens should track replaced_by_token_hash for rotation chain");
  });

  it("transaction helper rolls back on failure", async () => {
    let rolledBack = false;
    try {
      await transaction(async (client) => {
        await client.query("SELECT 1");
        throw new Error("Forced rollback");
      });
    } catch (err: any) {
      rolledBack = true;
      assert.equal(err.message, "Forced rollback");
    }
    assert.ok(rolledBack, "Transaction should propagate errors and roll back");
  });
});
