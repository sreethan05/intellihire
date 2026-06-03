import test from "node:test";
import assert from "node:assert/strict";
import { getExamValidationError, getPasswordValidationError, isValidEmail } from "./validation";

test("validates email format", () => {
  assert.equal(isValidEmail("admin@recruitexam.com"), true);
  assert.equal(isValidEmail("bad-email"), false);
});

test("validates password strength", () => {
  assert.equal(getPasswordValidationError("Strong123"), "");
  assert.equal(getPasswordValidationError("short"), "Password must be at least 8 characters long");
  assert.equal(getPasswordValidationError("lowercase1"), "Password must include at least one uppercase letter");
});

test("validates exam settings", () => {
  assert.equal(getExamValidationError({ title: "Aptitude", duration: 30, total_marks: 100, pass_marks: 40 }), "");
  assert.equal(getExamValidationError({ title: "", duration: 30, total_marks: 100 }), "Exam title is required");
  assert.equal(getExamValidationError({ title: "Aptitude", duration: 3, total_marks: 100 }), "Duration must be at least 5 minutes");
  assert.equal(getExamValidationError({ title: "Aptitude", duration: 30, total_marks: 100, pass_marks: 120 }), "Pass marks cannot be greater than total marks");
});

