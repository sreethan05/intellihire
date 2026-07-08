import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { errorHandler } from "../../src/middleware/errorHandler.js";
import { AppError, NotFoundError, ValidationError, UnauthorizedError, ForbiddenError } from "../../src/lib/errors.js";

describe("Error handler middleware", () => {
  function createMockReq(options: any = {}) {
    return {
      id: options.requestId || "req-123",
      headers: {},
      ...options,
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

  it("returns structured error for AppError with status code", () => {
    const err = new AppError(409, "CONFLICT", "Duplicate entry", ["email already exists"]);
    const req = createMockReq();
    const res = createMockRes();
    errorHandler(err, req, res, next);
    assert.equal(res.statusCode, 409);
    assert.equal(res.jsonBody.success, false);
    assert.equal(res.jsonBody.error, "Duplicate entry");
    assert.equal(res.jsonBody.code, "CONFLICT");
    assert.deepEqual(res.jsonBody.details, ["email already exists"]);
    assert.equal(res.jsonBody.requestId, "req-123");
  });

  it("returns 404 for NotFoundError", () => {
    const err = new NotFoundError("User not found");
    const req = createMockReq();
    const res = createMockRes();
    errorHandler(err, req, res, next);
    assert.equal(res.statusCode, 404);
    assert.equal(res.jsonBody.code, "NOT_FOUND");
  });

  it("returns 400 for ValidationError", () => {
    const err = new ValidationError("Invalid email format");
    const req = createMockReq();
    const res = createMockRes();
    errorHandler(err, req, res, next);
    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonBody.code, "VALIDATION_ERROR");
  });

  it("returns 401 for UnauthorizedError", () => {
    const err = new UnauthorizedError();
    const req = createMockReq();
    const res = createMockRes();
    errorHandler(err, req, res, next);
    assert.equal(res.statusCode, 401);
    assert.equal(res.jsonBody.code, "UNAUTHORIZED");
  });

  it("returns 403 for ForbiddenError", () => {
    const err = new ForbiddenError();
    const req = createMockReq();
    const res = createMockRes();
    errorHandler(err, req, res, next);
    assert.equal(res.statusCode, 403);
    assert.equal(res.jsonBody.code, "FORBIDDEN");
  });

  it("returns 500 for unexpected errors without leaking stack in production", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const err = new Error("Database exploded");
    const req = createMockReq();
    const res = createMockRes();
    errorHandler(err, req, res, next);
    assert.equal(res.statusCode, 500);
    assert.equal(res.jsonBody.error, "Internal server error");
    assert.equal(res.jsonBody.code, "INTERNAL_ERROR");
    assert.ok(!res.jsonBody.details, "Should not leak stack traces in production");
    process.env.NODE_ENV = originalEnv;
  });

  it("includes stack trace details in development mode", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    const err = new Error("Debug failure");
    const req = createMockReq();
    const res = createMockRes();
    errorHandler(err, req, res, next);
    assert.equal(res.statusCode, 500);
    assert.ok(res.jsonBody.details, "Should include stack traces in development");
    assert.ok(Array.isArray(res.jsonBody.details));
    process.env.NODE_ENV = originalEnv;
  });

  it("preserves requestId in response even for unknown errors", () => {
    const err = new Error("Something broke");
    const req = createMockReq({ requestId: "trace-abc-789" });
    const res = createMockRes();
    errorHandler(err, req, res, next);
    assert.equal(res.jsonBody.requestId, "trace-abc-789");
  });
});
