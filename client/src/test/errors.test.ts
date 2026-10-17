import { describe, expect, it } from "vitest";
import { getApiErrorMessage } from "../lib/errors";

/** Build a value that axios.isAxiosError() accepts as an AxiosError. */
function axiosErrorWith(data: unknown) {
  return Object.assign(new Error("Request failed with status code 400"), {
    isAxiosError: true,
    response: { status: 400, statusText: "Bad Request", headers: {}, data, config: {} },
  });
}

describe("getApiErrorMessage", () => {
  it("prefers the backend `error` field", () => {
    expect(getApiErrorMessage(axiosErrorWith({ error: "Email already exists" }), "fallback"))
      .toBe("Email already exists");
  });

  it("falls back to `detail` when `error` is missing or blank", () => {
    expect(getApiErrorMessage(axiosErrorWith({ detail: "Validation failed" }), "fallback"))
      .toBe("Validation failed");
    expect(getApiErrorMessage(axiosErrorWith({ error: "   ", detail: "Validation failed" }), "fallback"))
      .toBe("Validation failed");
  });

  it("falls back to `message` inside the envelope", () => {
    expect(getApiErrorMessage(axiosErrorWith({ message: "Rate limited" }), "fallback"))
      .toBe("Rate limited");
  });

  it("ignores non-string envelope values", () => {
    expect(getApiErrorMessage(axiosErrorWith({ error: { nested: true }, detail: 42 }), "fallback"))
      .toBe("fallback");
  });

  it("returns the fallback for network errors without a response", () => {
    const network = Object.assign(new Error("Network Error"), { isAxiosError: true });
    expect(getApiErrorMessage(network, "fallback")).toBe("fallback");
  });

  it("uses Error messages for plain thrown errors", () => {
    expect(getApiErrorMessage(new Error("boom"), "fallback")).toBe("boom");
    expect(getApiErrorMessage("string throw", "fallback")).toBe("fallback");
    expect(getApiErrorMessage(null, "fallback")).toBe("fallback");
    expect(getApiErrorMessage(undefined, "fallback")).toBe("fallback");
  });
});
