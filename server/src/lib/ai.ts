import { scanMarksheetOCR } from "./ocr.js";

type MarksheetFile = {
  name: string;
  mimeType: string;
  data: string;
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

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

function getKeys() {
  return {
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GROQ_MODEL: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  };
}

async function fetchWithRetry(url: string, init?: RequestInit, retries = 3, delay = 100): Promise<Response> {
  try {
    const res = await fetch(url, init);
    if (!res.ok && retries > 0) {
      if (res.status >= 500 || res.status === 429) {
        await new Promise((r) => setTimeout(r, delay));
        return fetchWithRetry(url, init, retries - 1, delay * 5);
      }
    }
    return res;
  } catch (err) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, delay));
      return fetchWithRetry(url, init, retries - 1, delay * 5);
    }
    throw err;
  }
}

const extractionPrompt = `
You are extracting student account data from an Indian college semester grade report.
Return only valid JSON. Do not wrap it in markdown.

Extract:
- roll_number: use Hall Ticket No. if present. If not, use Roll Number/Register Number.
- name: student name exactly as shown, title case if possible.
- branch: normalize to a short code, e.g. COMPUTER SCIENCE AND ENGINEERING -> CSE, INFORMATION TECHNOLOGY -> IT, ELECTRONICS AND COMMUNICATION ENGINEERING -> ECE, ELECTRICAL AND ELECTRONICS ENGINEERING -> EEE, MECHANICAL ENGINEERING -> MECH, CIVIL ENGINEERING -> CIVIL.
- cgpa: use Cumulative Grade Point Average (CGPA), not SGPA.
- graduation_year: infer from examination date/year if needed. If the report says semester in 2026 and it is B.Tech III semester, use 2028. If unsure, use the visible exam year.
- confidence: number from 0 to 1.
- warnings: array of short strings for missing/uncertain fields.

Schema:
{
  "roll_number": "24261A0522",
  "name": "Student Name",
  "branch": "CSE",
  "cgpa": 8.72,
  "graduation_year": 2028,
  "confidence": 0.94,
  "warnings": []
}
`;

export function hasAiKey() {
  const { GROQ_API_KEY } = getKeys();
  return Boolean(GROQ_API_KEY);
}

export async function generateGroqText(prompt: string | { systemPrompt?: string; userPrompt: string }): Promise<string> {
  const { GROQ_API_KEY, GROQ_MODEL } = getKeys();
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const systemPrompt = typeof prompt === "object" ? prompt.systemPrompt : undefined;
  const userPrompt = typeof prompt === "object" ? prompt.userPrompt : prompt;

  const messages: any[] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: userPrompt });

  const response = await fetchWithRetry("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.35,
    }),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error?.message || "Groq request failed");
  }

  const text = body?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("Groq returned an empty response");
  }

  return text;
}

export async function generateGroqJson<T>(prompt: string | { systemPrompt?: string; userPrompt: string }): Promise<T> {
  const { GROQ_API_KEY, GROQ_MODEL } = getKeys();
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const systemPrompt = typeof prompt === "object" ? prompt.systemPrompt : undefined;
  const userPrompt = typeof prompt === "object" ? prompt.userPrompt : prompt;

  const messages: any[] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: userPrompt });

  const response = await fetchWithRetry("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error?.message || "Groq JSON request failed");
  }

  const text = body?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("Groq returned an empty response");
  }

  return parseJson(text) as T;
}

export async function generateAiText(prompt: string | { systemPrompt?: string; userPrompt: string }): Promise<string> {
  const { GROQ_API_KEY } = getKeys();
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not configured");
  }
  return generateGroqText(prompt);
}

export async function generateAiJson<T>(prompt: string | { systemPrompt?: string; userPrompt: string }): Promise<T> {
  const { GROQ_API_KEY } = getKeys();
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not configured");
  }
  return generateGroqJson<T>(prompt);
}


export async function scanMarksheet(file: MarksheetFile): Promise<ScannedStudent> {
  const { GROQ_API_KEY } = getKeys();
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is required for marksheet scanning");
  }

  try {
    const ocrResult = await scanMarksheetOCR(file);
    if (ocrResult.confidence >= 0.95) {
      return ocrResult;
    }

    const prompt = `
      ${extractionPrompt}
      
      Below is the raw text extracted via OCR from the marksheet file "${file.name}":
      ---
      ${ocrResult.roll_number ? `Detected Roll Number: ${ocrResult.roll_number}\n` : ""}
      ${ocrResult.name ? `Detected Name: ${ocrResult.name}\n` : ""}
      ${ocrResult.branch ? `Detected Branch: ${ocrResult.branch}\n` : ""}
      ${!isNaN(ocrResult.cgpa) ? `Detected CGPA: ${ocrResult.cgpa}\n` : ""}
      ${ocrResult.graduation_year ? `Detected Graduation Year: ${ocrResult.graduation_year}\n` : ""}
      ---
      Please verify the fields, correct any typographical OCR errors, and output the clean JSON object matching the schema.
    `;

    const parsed = await generateGroqJson<any>(prompt);
    const roll_number = String(parsed.roll_number || ocrResult.roll_number || "").trim().toUpperCase();
    const name = String(parsed.name || ocrResult.name || "").trim();
    const branch = String(parsed.branch || ocrResult.branch || "").trim().toUpperCase();
    const cgpa = Number(parsed.cgpa ?? ocrResult.cgpa);
    const graduation_year = Number(parsed.graduation_year ?? ocrResult.graduation_year);

    return {
      roll_number,
      name,
      branch,
      cgpa,
      graduation_year,
      confidence: Number(parsed.confidence || 0.85),
      source_file: file.name,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : ocrResult.warnings,
    };
  } catch (err) {
    console.warn("Groq marksheet correction failed, returning raw OCR:", err);
    return scanMarksheetOCR(file);
  }
}

export type SnapshotAnalysis = {
  single_person: boolean;
  multiple_people: boolean;
  looking_away: boolean;
  phone_detected: boolean;
  summary: string;
};

export async function verifyWebcamSnapshotGroq(base64DataUrl: string): Promise<SnapshotAnalysis> {
  const { GROQ_API_KEY } = getKeys();
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not configured for webcam snapshot analysis.");
  }

  // Ensure standard data URL formatting
  const dataUrl = base64DataUrl.startsWith("data:") 
    ? base64DataUrl 
    : `data:image/jpeg;base64,${base64DataUrl}`;

  const prompt = `
You are an expert remote proctoring AI auditing agent.
Analyze the webcam snapshot taken during a high-stakes exam and check for security violations.
Provide your evaluation on the following fields:
1. single_person: Is there EXACTLY ONE candidate visible in the frame? If the frame is empty, dark, or no candidate face is visible, set to false.
2. multiple_people: Are there multiple faces or people visible in the frame? (Potential cheating/collusion/external help).
3. looking_away: Is the candidate looking completely away from the screen, down at their lap, or sideways to talk to someone?
4. phone_detected: Is there a smartphone, secondary screen, tablet, or cheat-sheet book/notes visible?

Return ONLY valid JSON matching this schema:
{
  "single_person": true,
  "multiple_people": false,
  "looking_away": false,
  "phone_detected": false,
  "summary": "Brief 1-sentence observation, e.g., 'Candidate is focused on screen.'"
}
`;

  const response = await fetchWithRetry("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.2-11b-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
            {
              type: "image_url",
              image_url: {
                url: dataUrl,
              },
            },
          ],
        },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error?.message || "Groq vision request failed");
  }

  const text = body?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("Groq returned empty webcam analysis");
  }

  return parseJson(text) as SnapshotAnalysis;
}

export async function verifyWebcamSnapshot(base64DataUrl: string): Promise<SnapshotAnalysis> {
  const { GROQ_API_KEY } = getKeys();
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not configured for webcam snapshot analysis.");
  }
  return verifyWebcamSnapshotGroq(base64DataUrl);
}

function parseJson(text: string) {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI provider returned invalid JSON");
    return JSON.parse(match[0]);
  }
}

export const aiService = {
  generateAiJson,
  generateAiText,
  hasAiKey,
};
