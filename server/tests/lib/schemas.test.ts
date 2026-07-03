import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loginSchema,
  createExamSchema,
} from "../../src/lib/schemas.js";

describe("loginSchema", () => {
  it("accepts valid login", () => {
    const result = loginSchema.safeParse({ email: "test@example.com", password: "password123" });
    assert.ok(result.success);
  });
  it("rejects empty email", () => {
    const result = loginSchema.safeParse({ email: "", password: "pass" });
    assert.ok(!result.success);
  });
});

describe("createExamSchema", () => {
  it("accepts valid exam", () => {
    const result = createExamSchema.safeParse({
      title: "Test Exam",
      duration: 60,
      total_marks: 100,
      pass_marks: 40,
    });
    assert.ok(result.success);
  });
  it("rejects pass_marks > total_marks", () => {
    const result = createExamSchema.safeParse({
      title: "Test",
      duration: 60,
      total_marks: 100,
      pass_marks: 150,
    });
    assert.ok(!result.success);
  });
});
