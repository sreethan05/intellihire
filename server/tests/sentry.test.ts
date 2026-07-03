import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { initSentry } from "../src/lib/sentry.js";

describe("Sentry error tracking integration", () => {
  it("returns false if SENTRY_DSN env var is missing", () => {
    const originalDsn = process.env.SENTRY_DSN;
    delete process.env.SENTRY_DSN;
    
    const result = initSentry();
    assert.equal(result, false);

    if (originalDsn) {
      process.env.SENTRY_DSN = originalDsn;
    }
  });
});
