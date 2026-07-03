import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loginSchema,
  createUserSchema,
  createExamSchema,
  proctoringEventSchema,
} from "../src/lib/schemas.js";

describe("Zod schema schemas validation", () => {
  describe("loginSchema", () => {
    it("passes for valid login data", () => {
      const result = loginSchema.safeParse({
        email: "candidate@example.com",
        password: "Password123!",
      });
      assert.ok(result.success);
    });

    it("fails for missing email or password", () => {
      const result = loginSchema.safeParse({ email: "" });
      assert.ok(!result.success);
    });
  });

  describe("createUserSchema", () => {
    it("passes for valid user data", () => {
      const result = createUserSchema.safeParse({
        name: "Alice",
        email: "alice@example.com",
        password: "alicePassword123",
        role: "candidate",
      });
      assert.ok(result.success);
    });

    it("fails for invalid role", () => {
      const result = createUserSchema.safeParse({
        name: "Alice",
        email: "alice@example.com",
        password: "alicePassword123",
        role: "super-user",
      });
      assert.ok(!result.success);
    });
  });

  describe("createExamSchema", () => {
    it("passes for valid exam config", () => {
      const result = createExamSchema.safeParse({
        title: "Database Systems",
        duration: 30,
        total_marks: 100,
        pass_marks: 40,
      });
      assert.ok(result.success);
    });

    it("fails if pass marks exceed total marks", () => {
      const result = createExamSchema.safeParse({
        title: "Database Systems",
        duration: 30,
        total_marks: 100,
        pass_marks: 110,
      });
      assert.ok(!result.success);
    });
  });

  describe("proctoringEventSchema", () => {
    it("passes for valid proctoring events", () => {
      const result = proctoringEventSchema.safeParse({
        attempt_id: "00000000-0000-0000-0000-000000000000",
        event_type: "tab_switch",
        severity: "high",
        details: "Switched tab to look up code",
      });
      assert.ok(result.success);
    });

    it("fails for invalid event type", () => {
      const result = proctoringEventSchema.safeParse({
        attempt_id: "00000000-0000-0000-0000-000000000000",
        event_type: "illegal_helper",
      });
      assert.ok(!result.success);
    });
  });
});
