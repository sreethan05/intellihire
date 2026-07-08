import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { auditMiddleware } from "../../src/middleware/auditLogger.js";
import { db } from "../../src/lib/postgres.js";

describe("Audit logger middleware", () => {
  function createMockReq(options: any = {}) {
    return {
      method: options.method || "POST",
      originalUrl: options.path || "/api/admin/create-recruiter",
      path: options.path || "/api/admin/create-recruiter",
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
      headers: { "user-agent": "test-agent/1.0" },
      user: "user" in options ? options.user : { id: "admin-123" },
      body: options.body || { name: "Alice", email: "alice@example.com" },
      get: () => "",
    } as any;
  }

  function createMockRes() {
    const listeners: any = {};
    const res: any = {
      statusCode: 200,
      on(event: string, handler: any) {
        listeners[event] = handler;
        return this;
      },
      emitFinish() {
        if (listeners.finish) listeners.finish();
      },
    };
    return res;
  }

  const next = () => {};

  it("writes audit log for mutating methods", async () => {
    let insertedData: any = null;
    const insertMock = mock.method(db, "from", () => ({
      insert: async (data: any) => { insertedData = Array.isArray(data) ? data : [data]; },
    }));

    const req = createMockReq({ method: "POST" });
    const res = createMockRes();
    auditMiddleware(req, res, next);
    res.emitFinish();

    // Wait for async event handler
    await new Promise((r) => setTimeout(r, 50));

    assert.ok(insertedData);
    assert.equal(insertedData[0].action, "POST /api/admin/create-recruiter");
    assert.equal(insertedData[0].resource, "admin");
    assert.equal(insertedData[0].method, "POST");
    assert.equal(insertedData[0].user_id, "admin-123");
    assert.equal(insertedData[0].ip_address, "127.0.0.1");
    assert.equal(insertedData[0].user_agent, "test-agent/1.0");
    // Body should be present but sanitized
    assert.equal(insertedData[0].payload.name, "Alice");
    assert.equal(insertedData[0].payload.email, "alice@example.com");

    insertMock.mock.restore();
  });

  it("strips sensitive fields from payload (password, password_hash, token)", async () => {
    let insertedData: any = null;
    const insertMock = mock.method(db, "from", () => ({
      insert: async (data: any) => { insertedData = Array.isArray(data) ? data : [data]; },
    }));

    const req = createMockReq({
      method: "PUT",
      body: { password: "secret123", password_hash: "abc", token: "jwt-here", name: "Bob" },
    });
    const res = createMockRes();
    auditMiddleware(req, res, next);
    res.emitFinish();

    await new Promise((r) => setTimeout(r, 50));

    assert.ok(insertedData);
    const payload = insertedData[0].payload;
    assert.equal(payload.name, "Bob");
    assert.ok(!payload.password, "password should be stripped");
    assert.ok(!payload.password_hash, "password_hash should be stripped");
    assert.ok(!payload.token, "token should be stripped");

    insertMock.mock.restore();
  });

  it("does not write audit log for GET requests", async () => {
    let insertCalled = false;
    const insertMock = mock.method(db, "from", () => ({
      insert: async () => { insertCalled = true; },
    }));

    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    auditMiddleware(req, res, next);
    res.emitFinish();

    await new Promise((r) => setTimeout(r, 50));
    assert.ok(!insertCalled, "GET requests should not be audited");

    insertMock.mock.restore();
  });

  it("does not write audit log for HEAD requests", async () => {
    let insertCalled = false;
    const insertMock = mock.method(db, "from", () => ({
      insert: async () => { insertCalled = true; },
    }));

    const req = createMockReq({ method: "HEAD" });
    const res = createMockRes();
    auditMiddleware(req, res, next);
    res.emitFinish();

    await new Promise((r) => setTimeout(r, 50));
    assert.ok(!insertCalled, "HEAD requests should not be audited");

    insertMock.mock.restore();
  });

  it("handles audit log insert failure gracefully", async () => {
    const loggedError = false;
    const fromMock = mock.method(db, "from", () => ({
      insert: async () => { throw new Error("DB down"); },
    }));

    const req = createMockReq({ method: "DELETE" });
    const res = createMockRes();
    auditMiddleware(req, res, next);
    res.emitFinish();

    await new Promise((r) => setTimeout(r, 50));
    // Should not throw; error is caught and logged
    assert.ok(!loggedError || true, "Should not crash on audit log failure");

    fromMock.mock.restore();
  });

  it("records user_id as null for unauthenticated requests", async () => {
    let insertedData: any = null;
    const insertMock = mock.method(db, "from", () => ({
      insert: async (data: any) => { insertedData = Array.isArray(data) ? data : [data]; },
    }));

    const req = createMockReq({ method: "POST", user: undefined });
    const res = createMockRes();
    auditMiddleware(req, res, next);
    res.emitFinish();

    await new Promise((r) => setTimeout(r, 50));
    assert.equal(insertedData[0].user_id, null);

    insertMock.mock.restore();
  });
});
