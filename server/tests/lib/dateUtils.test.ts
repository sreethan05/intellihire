import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatDate, monthsBack } from "../../src/lib/dateUtils.js";

describe("formatDate", () => {
  it("formats ISO date to en-IN", () => {
    const formatted = formatDate("2024-01-15");
    // Depending on node environment, locales might format with spacing/comma differences,
    // let's ensure it contains the correct day, month, and year values.
    assert.ok(formatted.includes("15"));
    assert.ok(formatted.includes("Jan"));
    assert.ok(formatted.includes("2024"));
  });
  it("returns empty string for null/undefined", () => {
    assert.equal(formatDate(null), "");
    assert.equal(formatDate(undefined), "");
  });
});

describe("monthsBack", () => {
  it("returns correct number of months", () => {
    const result = monthsBack(6);
    assert.equal(result.length, 6);
  });
  it("returns objects with key and label", () => {
    const result = monthsBack(1);
    assert.ok(result[0].key);
    assert.ok(result[0].label);
  });
});
