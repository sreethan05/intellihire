import axios from "axios";
import { logger } from "./logger.js";

const PYTHON_SERVER_URL = "http://127.0.0.1:5000";

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

export type SnapshotAnalysis = {
  single_person: boolean;
  multiple_people: boolean;
  looking_away: boolean;
  phone_detected: boolean;
  summary: string;
};

export function hasAiKey(): boolean {
  // Python server handles actual API key check, return true here to let Express delegate to Python
  return true;
}

export async function generateGroqText(prompt: string | { systemPrompt?: string; userPrompt: string }): Promise<string> {
  try {
    const payload = typeof prompt === "object" 
      ? { prompt: prompt.userPrompt, systemPrompt: prompt.systemPrompt }
      : { prompt };

    const { data } = await axios.post(`${PYTHON_SERVER_URL}/internal/ai/generate-text`, payload, { timeout: 45000 });
    return data.text;
  } catch (err: any) {
    logger.error({ err: err.message }, "[AI] Text generation call to Python backend failed");
    throw new Error(err.response?.data?.detail || err.message || "AI text generation failed");
  }
}

export async function generateGroqJson<T>(prompt: string | { systemPrompt?: string; userPrompt: string }): Promise<T> {
  try {
    const payload = typeof prompt === "object" 
      ? { prompt: prompt.userPrompt, systemPrompt: prompt.systemPrompt }
      : { prompt };

    const { data } = await axios.post(`${PYTHON_SERVER_URL}/internal/ai/generate-json`, payload, { timeout: 45000 });
    return data as T;
  } catch (err: any) {
    logger.error({ err: err.message }, "[AI] JSON generation call to Python backend failed");
    throw new Error(err.response?.data?.detail || err.message || "AI JSON generation failed");
  }
}

export async function generateAiText(prompt: string | { systemPrompt?: string; userPrompt: string }): Promise<string> {
  return generateGroqText(prompt);
}

export async function generateAiJson<T>(prompt: string | { systemPrompt?: string; userPrompt: string }): Promise<T> {
  return generateGroqJson<T>(prompt);
}

export async function scanMarksheet(file: MarksheetFile): Promise<ScannedStudent> {
  try {
    const { data } = await axios.post(`${PYTHON_SERVER_URL}/internal/ocr`, file, { timeout: 45000 });
    return data as ScannedStudent;
  } catch (err: any) {
    logger.error({ err: err.message }, "[AI] Marksheet scanning call to Python backend failed");
    throw new Error(err.response?.data?.detail || err.message || "Marksheet scanning failed");
  }
}

export async function verifyWebcamSnapshot(base64DataUrl: string): Promise<SnapshotAnalysis> {
  try {
    const { data } = await axios.post(
      `${PYTHON_SERVER_URL}/internal/proctoring/verify`, 
      { base64DataUrl }, 
      { timeout: 35000 }
    );
    return data as SnapshotAnalysis;
  } catch (err: any) {
    logger.error({ err: err.message }, "[AI] Proctoring snapshot verification call to Python backend failed");
    throw new Error(err.response?.data?.detail || err.message || "Webcam snapshot verification failed");
  }
}

export const aiService = {
  generateAiJson,
  generateAiText,
  hasAiKey,
};
