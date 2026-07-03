import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCode,
  calculateCosineSimilarity,
  calculateLevenshteinSimilarity,
  getSimilarityScore,
} from "../src/lib/plagiarism.js";

describe("plagiarism detection algorithms", () => {
  describe("normalizeCode", () => {
    it("removes single-line and multi-line comments", () => {
      const code = `
        // This is a comment
        /* Multi-line
           comment */
        const x = 42; # Python style comment
      `;
      const normalized = normalizeCode(code);
      assert.equal(normalized, "const x = 42;");
    });

    it("normalizes multiple whitespace characters to single spaces", () => {
      const code = "let    a   =    1;\n\nlet b = 2;";
      const normalized = normalizeCode(code);
      assert.equal(normalized, "let a = 1; let b = 2;");
    });
  });

  describe("calculateCosineSimilarity", () => {
    it("returns 1.0 for identical pieces of code", () => {
      const code = "function test() { return 42; }";
      assert.equal(calculateCosineSimilarity(code, code), 1.0);
    });

    it("returns 0.0 for completely disjoint tokens", () => {
      const code1 = "aaa";
      const code2 = "bbb";
      assert.equal(calculateCosineSimilarity(code1, code2), 0.0);
    });

    it("calculates structural similarity when keywordOnly is true", () => {
      const code1 = "if (true) { return let; }";
      const code2 = "if (false) { return const; }";
      // keywords shared: if, return. variables/literals differ.
      const sim = calculateCosineSimilarity(code1, code2, true);
      assert.ok(sim >= 0.5);
    });
  });

  describe("calculateLevenshteinSimilarity", () => {
    it("returns 1.0 for matching code strings", () => {
      assert.equal(calculateLevenshteinSimilarity("let x = 1;", "let x = 1;"), 1.0);
    });

    it("returns normalized distance similarity for slight variations", () => {
      const sim = calculateLevenshteinSimilarity("let x = 1;", "let y = 1;");
      assert.ok(sim > 0.8 && sim < 1.0);
    });
  });

  describe("getSimilarityScore", () => {
    it("generates score between 0 and 100", () => {
      const score = getSimilarityScore("let a = 1;", "let b = 1;");
      assert.ok(score >= 0 && score <= 100);
      assert.ok(score > 80); // Renaming a variable results in high similarity
    });
  });
});
