import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isValidEmail, getPasswordValidationError, getExamValidationError } from "../src/lib/validation.js";

describe("validation helpers", () => {
  describe("isValidEmail", () => {
    it("returns true for correct formats", () => {
      assert.ok(isValidEmail("test@example.com"));
      assert.ok(isValidEmail("user.name+tag@sub.domain.co"));
    });

    it("returns false for incorrect formats", () => {
      assert.ok(!isValidEmail("test"));
      assert.ok(!isValidEmail("test@"));
      assert.ok(!isValidEmail("test@example"));
      assert.ok(!isValidEmail("@example.com"));
    });
  });

  describe("getPasswordValidationError", () => {
    it("returns error for short password", () => {
      assert.equal(getPasswordValidationError("Short1"), "Password must be at least 8 characters long");
    });

    it("returns error for missing uppercase letter", () => {
      assert.equal(getPasswordValidationError("lowercase123!"), "Password must include at least one uppercase letter");
    });

    it("returns error for missing lowercase letter", () => {
      assert.equal(getPasswordValidationError("UPPERCASE123!"), "Password must include at least one lowercase letter");
    });

    it("returns error for missing number", () => {
      assert.equal(getPasswordValidationError("NoNumberPresent!"), "Password must include at least one number");
    });

    it("returns empty string for valid passwords", () => {
      assert.equal(getPasswordValidationError("StrongPass123!"), "");
    });
  });

  describe("getExamValidationError", () => {
    it("returns error for empty title", () => {
      assert.equal(getExamValidationError({ title: "" }), "Exam title is required");
    });

    it("returns error for short duration", () => {
      assert.equal(
        getExamValidationError({ title: "Exam 1", duration: 3 }),
        "Duration must be at least 5 minutes"
      );
    });

    it("returns error for invalid total marks", () => {
      assert.equal(
        getExamValidationError({ title: "Exam 1", duration: 10, total_marks: 0 }),
        "Total marks must be greater than 0"
      );
    });

    it("returns error for negative pass marks", () => {
      assert.equal(
        getExamValidationError({ title: "Exam 1", duration: 10, total_marks: 100, pass_marks: -5 }),
        "Pass marks cannot be negative"
      );
    });

    it("returns error for pass marks exceeding total marks", () => {
      assert.equal(
        getExamValidationError({ title: "Exam 1", duration: 10, total_marks: 100, pass_marks: 110 }),
        "Pass marks cannot be greater than total marks"
      );
    });

    it("returns error for available_until before available_from", () => {
      assert.equal(
        getExamValidationError({
          title: "Exam 1",
          duration: 10,
          total_marks: 100,
          pass_marks: 50,
          available_from: "2026-07-03T12:00:00Z",
          available_until: "2026-07-03T11:00:00Z",
        }),
        "Attempt until time must be after the start time"
      );
    });

    it("returns empty string for a valid exam config", () => {
      assert.equal(
        getExamValidationError({
          title: "Exam 1",
          duration: 10,
          total_marks: 100,
          pass_marks: 50,
          available_from: "2026-07-03T12:00:00Z",
          available_until: "2026-07-03T13:00:00Z",
        }),
        ""
      );
    });
  });
});
