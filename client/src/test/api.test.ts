import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios, { type AxiosResponse } from "axios";
import api from "../lib/api";

interface AxiosLikeError extends Error {
  config?: unknown;
  isAxiosError?: boolean;
  response?: {
    status: number;
    statusText: string;
    headers: Record<string, unknown>;
    data: Record<string, unknown>;
    config?: unknown;
  };
}

function make401(config: unknown): AxiosLikeError {
  const error = new Error("Request failed with status code 401") as AxiosLikeError;
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
    api.defaults.adapter = undefined;
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

    const interceptor = api.interceptors.response.handlers?.[0]?.rejected;
    
    await expect(interceptor!(error)).rejects.toEqual(error);

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
    api.defaults.adapter = undefined;
  });

  interface StubRequestConfig {
    _retry?: boolean;
    url?: string;
  }

  function stubAdapter(handler: (config: StubRequestConfig) => unknown) {
    api.defaults.adapter = async (config) => handler(config) as AxiosResponse;
  }

  it("refreshes once and replays the original request", async () => {
    const postSpy = vi
      .spyOn(axios, "post")
      .mockResolvedValue({ status: 200, data: {} } as unknown as AxiosResponse);

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
      () => refreshGate.then(() => ({ status: 200, data: {} }) as unknown as AxiosResponse)
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
      .mockResolvedValue({ status: 200, data: {} } as unknown as AxiosResponse);
    stubAdapter((config) => {
      throw make401(config);
    });

    await expect(api.get("/auth/me")).rejects.toBeTruthy();

    expect(postSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem("user")).toBe("test-user");
    expect(window.location.href).not.toBe("/login");
  });
});
