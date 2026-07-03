import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseMarksheetText } from "../src/lib/ocr.js";

describe("ocr parsing rules", () => {
  it("extracts JNTU-style roll numbers and student names", () => {
    const text = `
      JAWAHARLAL NEHRU TECHNOLOGICAL UNIVERSITY
      Name of the Student: SREETHAN KUMAR REDDY
      Roll No: 21261A0522
      Branch: Computer Science & Engineering
      CGPA: 8.45
      Academic Year: 2023-2024
    `;

    const result = parseMarksheetText(text, "marksheet.pdf");

    assert.equal(result.roll_number, "21261A0522");
    assert.equal(result.name, "SREETHAN KUMAR REDDY");
    assert.equal(result.branch, "CSE");
    assert.equal(result.cgpa, 8.45);
    assert.equal(result.graduation_year, 2024);
  });

  it("handles fallback name detection and various labels", () => {
    const text = `
      TRANSCRIPT OF ACADEMIC RECORD
      STUDENT NAME: John Doe
      REGD. NO: 220401
      Cumulative Grade Point Average: 9.1
      Year of study: III Year B.Tech 2025
    `;

    const result = parseMarksheetText(text, "grades.png");

    assert.equal(result.roll_number, "220401");
    assert.equal(result.name, "John Doe");
    assert.equal(result.cgpa, 9.1);
    // III Year in B.Tech 2025 + 1 year remaining = 2026 graduation
    assert.equal(result.graduation_year, 2026);
  });
});
