import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isValidEmail,
  getPasswordValidationError,
  getExamValidationError,
} from "../../src/lib/validation.js";

describe("isValidEmail", () => {
  it("accepts valid emails", () => {
    assert.ok(isValidEmail("test@example.com"));
    assert.ok(isValidEmail("user+tag@domain.co.in"));
  });
  it("rejects invalid emails", () => {
    assert.ok(!isValidEmail("not-an-email"));
    assert.ok(!isValidEmail("@nodomain.com"));
    assert.ok(!isValidEmail("spaces in@email.com"));
  });
});

describe("getPasswordValidationError", () => {
  it("accepts strong passwords", () => {
    assert.equal(getPasswordValidationError("StrongPass123!"), "");
  });
  it("rejects short passwords", () => {
    assert.ok(getPasswordValidationError("short").includes("8 characters"));
  });
  it("requires uppercase", () => {
    assert.ok(getPasswordValidationError("lowercase123").includes("uppercase"));
  });
  it("requires number", () => {
    assert.ok(getPasswordValidationError("NoNumbersHere!").includes("number"));
  });
});

describe("getExamValidationError", () => {
  it("validates exam input correctly", () => {
    assert.equal(getExamValidationError({ title: "Test", duration: 30, total_marks: 100, pass_marks: 40 }), "");
    assert.ok(getExamValidationError({ title: "", duration: 30, total_marks: 100 }).includes("title"));
    assert.ok(getExamValidationError({ title: "Test", duration: 3, total_marks: 100 }).includes("5 minutes"));
    assert.ok(getExamValidationError({ title: "Test", duration: 30, total_marks: 100, pass_marks: 150 }).includes("greater than total"));
  });
});
