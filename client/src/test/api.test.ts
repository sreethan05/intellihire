import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import api from "../lib/api";

describe("api network client", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("location", { href: "" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("has xsrf cookie and header configurations set", () => {
    expect(api.defaults.xsrfCookieName).toBe("csrf_token");
    expect(api.defaults.xsrfHeaderName).toBe("x-csrf-token");
  });

  it("clears localStorage user and redirects on 401 response status", async () => {
    localStorage.setItem("user", "test-user");

    const error = {
      response: { status: 401 },
      config: { url: "/api/candidate/profile" },
    };

    const interceptor = (api.interceptors.response as any).handlers[0].rejected;
    
    await expect(interceptor(error)).rejects.toEqual(error);

    expect(localStorage.getItem("user")).toBeNull();
    expect(window.location.href).toBe("/login");
  });
});
