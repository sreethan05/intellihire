import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatDate, monthsBack } from "../src/lib/dateUtils.js";

describe("date utility functions", () => {
  describe("formatDate", () => {
    it("formats a valid ISO date string correctly", () => {
      // Inputting 2026-07-03 to test standard Indian local formatting
      const date = "2026-07-03T12:00:00Z";
      const formatted = formatDate(date);
      // Depending on node environment, localization could yield different spacings/separators,
      // but standard en-IN generally translates to "03 Jul 2026" or "03-Jul-2026"
      assert.ok(formatted.includes("3") || formatted.includes("03"));
      assert.ok(formatted.includes("Jul"));
      assert.ok(formatted.includes("2026"));
    });

    it("returns empty string for null or undefined", () => {
      assert.equal(formatDate(null), "");
      assert.equal(formatDate(undefined), "");
    });
  });

  describe("monthsBack", () => {
    it("returns correct count of month objects", () => {
      const result = monthsBack(6);
      assert.equal(result.length, 6);
      assert.ok(result[0].key);
      assert.ok(result[0].label);
    });

    it("orders month items ascending chronologically", () => {
      const result = monthsBack(3);
      // Key format: YYYY-MM
      const key0 = result[0].key;
      const key1 = result[1].key;
      const key2 = result[2].key;
      assert.ok(key0 < key1);
      assert.ok(key1 < key2);
    });
  });
});
