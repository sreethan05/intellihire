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

  it("injects Authorization header if token is in localStorage", async () => {
    localStorage.setItem("token", "my-test-token");
    
    const config = { headers: {} as any } as any;
    const interceptor = (api.interceptors.request as any).handlers[0].fulfilled;
    const result = interceptor(config);

    expect(result.headers.Authorization).toBe("Bearer my-test-token");
  });

  it("clears localStorage and redirects on 401 response status", async () => {
    localStorage.setItem("token", "my-test-token");
    localStorage.setItem("user", "test-user");

    const error = {
      response: { status: 401 },
      config: { url: "/api/candidate/profile" },
    };

    const interceptor = (api.interceptors.response as any).handlers[0].rejected;
    
    await expect(interceptor(error)).rejects.toEqual(error);

    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
    expect(window.location.href).toBe("/login");
  });
});
