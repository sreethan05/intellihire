import { describe, it, expect } from "vitest";
import {
  UserSchema,
  AuthMeResponseSchema,
  ProfileStatsResponseSchema,
} from "../lib/apiSchemas";

const validUser = {
  id: "u-1",
  name: "Test User",
  email: "test@intellihire.com",
  role: "candidate",
};

describe("UserSchema", () => {
  it("accepts a valid user with only required fields", () => {
    const parsed = UserSchema.safeParse(validUser);
    expect(parsed.success).toBe(true);
  });

  it("accepts nullable/optional fields including null roll_number and college_id", () => {
    const parsed = UserSchema.safeParse({
      ...validUser,
      roll_number: null,
      college_id: null,
      profile_complete: false,
      must_change_password: true,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown role", () => {
    const parsed = UserSchema.safeParse({ ...validUser, role: "superadmin" });
    expect(parsed.success).toBe(false);
  });

  it("rejects a malformed email", () => {
    const parsed = UserSchema.safeParse({ ...validUser, email: "not-an-email" });
    expect(parsed.success).toBe(false);
  });

  it("rejects a missing required field", () => {
    const { id: _id, ...withoutId } = validUser;
    expect(UserSchema.safeParse(withoutId).success).toBe(false);
  });
});

describe("AuthMeResponseSchema", () => {
  it("accepts the /auth/me envelope", () => {
    expect(AuthMeResponseSchema.safeParse({ user: validUser }).success).toBe(true);
  });

  it("rejects a payload without the user key", () => {
    expect(AuthMeResponseSchema.safeParse({ token: "x" }).success).toBe(false);
  });

  it("rejects an envelope whose user is invalid", () => {
    expect(
      AuthMeResponseSchema.safeParse({ user: { ...validUser, email: "bad" } })
        .success
    ).toBe(false);
  });
});

describe("ProfileStatsResponseSchema", () => {
  it("accepts a title with label/value stats", () => {
    expect(
      ProfileStatsResponseSchema.safeParse({
        title: "Profile Strength",
        stats: [{ label: "Assessments", value: "12" }],
      }).success
    ).toBe(true);
  });

  it("rejects non-string stat values (backend contract guard)", () => {
    expect(
      ProfileStatsResponseSchema.safeParse({
        title: "Profile Strength",
        stats: [{ label: "Assessments", value: 12 }],
      }).success
    ).toBe(false);
  });

  it("rejects a missing stats array", () => {
    expect(
      ProfileStatsResponseSchema.safeParse({ title: "Profile Strength" }).success
    ).toBe(false);
  });
});
