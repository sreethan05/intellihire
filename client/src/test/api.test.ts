import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios from "axios";
import api from "../lib/api";

function make401(config: unknown) {
  const error: any = new Error("Request failed with status code 401");
  error.config = config;
  error.isAxiosError = true;
  error.response = {
    status: 401,
    statusText: "Unauthorized",
    headers: {},
    data: {},
    config,
  };
  return error;
}

function ok(config: unknown) {
  return { data: { ok: true }, status: 200, statusText: "OK", headers: {}, config };
}

describe("api network client", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("location", { href: "" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (api.defaults as any).adapter = undefined;
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

describe("api 401 refresh-and-retry", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("location", { href: "" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (api.defaults as any).adapter = undefined;
  });

  function stubAdapter(handler: (config: any) => unknown) {
    (api.defaults as any).adapter = async (config: any) => handler(config);
  }

  it("refreshes once and replays the original request", async () => {
    const postSpy = vi
      .spyOn(axios, "post")
      .mockResolvedValue({ status: 200, data: {} } as any);

    let firstAttempts = 0;
    stubAdapter((config) => {
      if (config._retry) return ok(config);
      firstAttempts += 1;
      throw make401(config);
    });

    const res = await api.get("/candidate/dashboard");

    expect(res.data).toEqual({ ok: true });
    expect(firstAttempts).toBe(1);
    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy.mock.calls[0][0]).toBe("/api/auth/refresh");
  });

  it("deduplicates concurrent refreshes across parallel 401s", async () => {
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    const postSpy = vi.spyOn(axios, "post").mockImplementation(
      () => refreshGate.then(() => ({ status: 200, data: {} })) as any
    );

    stubAdapter((config) => {
      if (config._retry) return ok(config);
      throw make401(config);
    });

    const p1 = api.get("/a");
    const p2 = api.get("/b");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(postSpy).toHaveBeenCalledTimes(1);

    releaseRefresh();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.data).toEqual({ ok: true });
    expect(r2.data).toEqual({ ok: true });
  });

  it("clears the session and redirects when refresh fails", async () => {
    localStorage.setItem("user", "test-user");
    vi.spyOn(axios, "post").mockRejectedValue(new Error("refresh failed"));
    stubAdapter((config) => {
      throw make401(config);
    });

    await expect(api.get("/candidate/dashboard")).rejects.toBeTruthy();

    expect(localStorage.getItem("user")).toBeNull();
    expect(window.location.href).toBe("/login");
  });

  it("does not refresh or redirect for auth endpoints", async () => {
    localStorage.setItem("user", "test-user");
    const postSpy = vi
      .spyOn(axios, "post")
      .mockResolvedValue({ status: 200, data: {} } as any);
    stubAdapter((config) => {
      throw make401(config);
    });

    await expect(api.get("/auth/me")).rejects.toBeTruthy();

    expect(postSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem("user")).toBe("test-user");
    expect(window.location.href).not.toBe("/login");
  });
});
