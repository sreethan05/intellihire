import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAuth } from "../context/AuthContext";

describe("useAuth hook", () => {
  it("throws error when used outside AuthProvider", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      renderHook(() => useAuth());
    }).toThrow("useAuth must be used within AuthProvider");

    consoleErrorSpy.mockRestore();
  });
});
