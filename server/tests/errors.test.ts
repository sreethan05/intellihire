import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AppError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
} from "../src/lib/errors.js";

describe("error classes", () => {
  it("initializes AppError with correct properties", () => {
    const error = new AppError(500, "INTERNAL_ERROR", "Something broke", ["detail1"]);
    assert.equal(error.statusCode, 500);
    assert.equal(error.code, "INTERNAL_ERROR");
    assert.equal(error.message, "Something broke");
    assert.deepEqual(error.details, ["detail1"]);
    assert.ok(error instanceof Error);
  });

  it("initializes NotFoundError with status 404", () => {
    const error = new NotFoundError("User not found");
    assert.equal(error.statusCode, 404);
    assert.equal(error.code, "NOT_FOUND");
    assert.equal(error.message, "User not found");
  });

  it("initializes ValidationError with status 400", () => {
    const error = new ValidationError("Invalid name");
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, "VALIDATION_ERROR");
    assert.equal(error.message, "Invalid name");
  });

  it("initializes UnauthorizedError with status 401", () => {
    const error = new UnauthorizedError();
    assert.equal(error.statusCode, 401);
    assert.equal(error.code, "UNAUTHORIZED");
  });

  it("initializes ForbiddenError with status 403", () => {
    const error = new ForbiddenError();
    assert.equal(error.statusCode, 403);
    assert.equal(error.code, "FORBIDDEN");
  });
});
