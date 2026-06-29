import Tesseract from "tesseract.js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;

// ─── Types ───────────────────────────────────────────────────────────────────

type MarksheetFile = {
  name: string;
  mimeType: string;
  data: string; // base64
};

export type ScannedStudent = {
  roll_number: string;
  name: string;
  branch: string;
  cgpa: number;
  graduation_year: number;
  confidence: number;
  source_file: string;
  warnings: string[];
};

// ─── Branch Normalisation Map ─────────────────────────────────────────────────

const BRANCH_MAP: Record<string, string> = {
  "COMPUTER SCIENCE AND ENGINEERING": "CSE",
  "COMPUTER SCIENCE & ENGINEERING": "CSE",
  "COMPUTER SCIENCE AND ENGINEERING (AI&ML)": "CSE-AIML",
  "COMPUTER SCIENCE AND ENGINEERING (DATA SCIENCE)": "CSE-DS",
  "COMPUTER SCIENCE": "CSE",
  "CSE": "CSE",
  "INFORMATION TECHNOLOGY": "IT",
  "IT": "IT",
  "ELECTRONICS AND COMMUNICATION ENGINEERING": "ECE",
  "ELECTRONICS & COMMUNICATION ENGINEERING": "ECE",
  "ELECTRONICS AND COMMUNICATION": "ECE",
  "ECE": "ECE",
  "ELECTRICAL AND ELECTRONICS ENGINEERING": "EEE",
  "ELECTRICAL & ELECTRONICS ENGINEERING": "EEE",
  "ELECTRICAL AND ELECTRONICS": "EEE",
  "EEE": "EEE",
  "MECHANICAL ENGINEERING": "MECH",
  "MECHANICAL": "MECH",
  "MECH": "MECH",
  "CIVIL ENGINEERING": "CIVIL",
  "CIVIL": "CIVIL",
  "CHEMICAL ENGINEERING": "CHEM",
  "CHEMICAL": "CHEM",
  "BIOTECHNOLOGY": "BT",
  "BT": "BT",
  "COMPUTER SCIENCE AND BUSINESS SYSTEMS": "CSBS",
  "CSBS": "CSBS",
  "ARTIFICIAL INTELLIGENCE AND MACHINE LEARNING": "AIML",
  "ARTIFICIAL INTELLIGENCE & MACHINE LEARNING": "AIML",
  "AI AND ML": "AIML",
  "AI & ML": "AIML",
  "AIML": "AIML",
  "ARTIFICIAL INTELLIGENCE AND DATA SCIENCE": "AIDS",
  "AI AND DATA SCIENCE": "AIDS",
  "AIDS": "AIDS",
  "DATA SCIENCE": "DS",
  "DS": "DS",
  "ELECTRONICS AND COMPUTER ENGINEERING": "ECE",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeBranch(raw: string): string {
  const upper = raw.trim().toUpperCase().replace(/\s+/g, " ");

  // Exact match first
  if (BRANCH_MAP[upper]) return BRANCH_MAP[upper];

  // Partial / contains match
  for (const [key, val] of Object.entries(BRANCH_MAP)) {
    if (upper.includes(key)) return val;
  }

  // Truncate to max 10 chars as fallback
  return upper.slice(0, 10);
}

function inferGraduationYear(text: string): number | null {
  // "2022-23", "2023-2024" academic year patterns
  const rangeMatch = text.match(/\b(20\d{2})[–-](20\d{2}|\d{2})\b/);
  if (rangeMatch) {
    const second = rangeMatch[2];
    const end = second.length === 2
      ? parseInt("20" + second)
      : parseInt(second);
    return end;
  }

  // Semester / year of study clues  e.g. "III Year" in a 4-year B.Tech → grad = exam_year + remaining
  const semMap: Record<string, number> = {
    "I": 3, "II": 2, "III": 1, "IV": 0,
    "1ST": 3, "2ND": 2, "3RD": 1, "4TH": 0,
    "FIRST": 3, "SECOND": 2, "THIRD": 1, "FOURTH": 0,
  };
  const semMatch = text.toUpperCase().match(
    /\b(IV|III|II|I|4TH|3RD|2ND|1ST|FOURTH|THIRD|SECOND|FIRST)\s+(?:YEAR|B\.?TECH|B\.?E\.?)\b/
  );

  // Find any 4-digit years
  const years = (text.match(/\b20\d{2}\b/g) || []).map(Number).sort((a, b) => a - b);
  const latestYear = years.length ? years[years.length - 1] : new Date().getFullYear();

  if (semMatch) {
    const add = semMap[semMatch[1]] ?? 0;
    return latestYear + add;
  }

  // Fallback: return latest visible year
  return years.length ? latestYear : null;
}

// ─── Core Parser ─────────────────────────────────────────────────────────────

function parseMarksheetText(text: string, fileName: string): ScannedStudent {
  const warnings: string[] = [];
  const upper = text.toUpperCase();

  // ── Roll Number ────────────────────────────────────────
  let roll_number = "";
  const rollPatterns: RegExp[] = [
    // Labelled: Hall Ticket No, Roll No, Register No, Enrollment No
    /(?:hall\s*ticket\s*(?:no\.?|number|#)?|roll\s*(?:no\.?|number|#)?|register\s*(?:no\.?|number|#)?|regd\.?\s*(?:no\.?|number|#)?|enrollment\s*(?:no\.?|number|#)?)\s*[:\-.]?\s*([A-Z0-9]{6,15})/i,
    // Jntu-style: 21261A0522, 24CSE001
    /\b(\d{2}[A-Z]{2,4}\d{3,6})\b/,
    // 6-digit numeric like 220401
    /\b(\d{6,10})\b/,
  ];
  for (const pat of rollPatterns) {
    const m = text.match(pat);
    if (m) {
      roll_number = m[1].trim().toUpperCase();
      break;
    }
  }
  if (!roll_number) warnings.push("roll_number not detected");

  // ── Student Name ──────────────────────────────────────
  let name = "";
  const namePatterns: RegExp[] = [
    /(?:name\s+of\s+(?:the\s+)?student|student['']?s?\s+name|name)\s*[:\-.]?\s*([A-Z][A-Za-z\s.]{2,45})/i,
  ];
  for (const pat of namePatterns) {
    const m = text.match(pat);
    if (m) {
      const candidate = m[1].trim().replace(/\s+/g, " ");
      const skip = /university|college|institute|board|marks|grade|result|branch|dept|department|subject|course/i;
      if (!skip.test(candidate) && candidate.split(" ").length <= 6) {
        name = candidate;
        break;
      }
    }
  }

  // Fallback: look for ALL-CAPS line that looks like a person's name
  if (!name) {
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (/^[A-Z][A-Z\s.]{4,40}$/.test(t) && t.split(" ").length >= 2) {
        const skip = /UNIVERSITY|COLLEGE|INSTITUTE|BOARD|MARKS|GRADE|RESULT|BRANCH|DEPT|SUBJECT|COURSE|REPORT|SHEET/;
        if (!skip.test(t)) {
          name = t.replace(/\s+/g, " ").trim();
          break;
        }
      }
    }
  }
  if (!name) warnings.push("name not detected");

  // ── Branch / Department ───────────────────────────────
  let branch = "";
  const branchPatterns: RegExp[] = [
    /(?:branch|department|dept|programme|program|specialization|specialisation)\s*[:\-.]?\s*([A-Za-z\s&()]{3,60})/i,
  ];
  for (const pat of branchPatterns) {
    const m = text.match(pat);
    if (m) {
      branch = normalizeBranch(m[1].split("\n")[0].trim());
      break;
    }
  }
  // Fallback: keyword scan
  if (!branch) {
    for (const [key, val] of Object.entries(BRANCH_MAP)) {
      if (upper.includes(key)) {
        branch = val;
        break;
      }
    }
  }
  if (!branch) warnings.push("branch not detected");

  // ── CGPA ──────────────────────────────────────────────
  let cgpa = NaN;
  const cgpaPatterns: RegExp[] = [
    /(?:c\.?g\.?p\.?a\.?|cumulative\s+grade\s+point\s+average)\s*[:\-.]?\s*(\d{1,2}\.\d{1,2})/i,
    /(?:overall|total)\s+(?:cgpa|gpa)\s*[:\-.]?\s*(\d{1,2}\.\d{1,2})/i,
    /cgpa\D{0,10}?(\d{1,2}\.\d{1,2})/i,
  ];
  for (const pat of cgpaPatterns) {
    const m = text.match(pat);
    if (m) {
      const val = parseFloat(m[1]);
      if (val >= 1 && val <= 10) {
        cgpa = val;
        break;
      }
    }
  }
  if (isNaN(cgpa)) warnings.push("cgpa not detected");

  // ── Graduation Year ───────────────────────────────────
  let graduation_year = NaN;
  const inferred = inferGraduationYear(text);
  if (inferred) graduation_year = inferred;
  if (isNaN(graduation_year)) warnings.push("graduation_year not detected");

  // ── Confidence Score ──────────────────────────────────
  const fieldCount = [
    roll_number,
    name,
    branch,
    !isNaN(cgpa),
    !isNaN(graduation_year),
  ].filter(Boolean).length;
  const confidence = fieldCount / 5;

  return {
    roll_number,
    name,
    branch,
    cgpa,
    graduation_year,
    confidence,
    source_file: fileName,
    warnings,
  };
}

// ─── Text Extraction ──────────────────────────────────────────────────────────

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return data.text;
}

async function extractTextFromImage(buffer: Buffer): Promise<string> {
  const { data } = await Tesseract.recognize(buffer, "eng");
  return data.text;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function scanMarksheetOCR(file: MarksheetFile): Promise<ScannedStudent> {
  const buffer = Buffer.from(file.data, "base64");

  let text = "";
  if (file.mimeType === "application/pdf") {
    text = await extractTextFromPdf(buffer);
  } else {
    text = await extractTextFromImage(buffer);
  }

  if (!text || text.trim().length < 10) {
    throw new Error(`Could not extract any text from ${file.name}. Ensure the file is clear and not password-protected.`);
  }

  const result = parseMarksheetText(text, file.name);

  // If BOTH roll_number and name are missing → unusable result
  if (!result.roll_number && !result.name) {
    throw new Error(
      `Could not extract student data from ${file.name}. ` +
      `Make sure the marksheet is in English and is not blurry.`
    );
  }

  return result;
}
