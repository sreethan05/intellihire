// Local Ollama LLM client for exam generation (no API keys needed)
// Requires Ollama running locally: http://localhost:11434

import { logger } from "./logger.js";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:3b";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || "120000");

export interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OllamaGenerateOptions {
  model?: string;
  system?: string;
  temperature?: number;
  format?: "json";
  raw?: boolean;
}

export interface OllamaStatus {
  available: boolean;
  model: string;
  models: string[];
  error?: string;
}

/**
 * Check if Ollama is running and which models are available.
 */
export async function checkOllamaStatus(): Promise<OllamaStatus> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { available: false, model: OLLAMA_MODEL, models: [], error: `Ollama returned ${res.status}` };
    }
    const body = await res.json();
    const models = (body?.models || []).map((m: any) => m.name || m.model || "").filter(Boolean) as string[];
    const available = models.includes(OLLAMA_MODEL);
    return { available, model: OLLAMA_MODEL, models };
  } catch (err: any) {
    return { available: false, model: OLLAMA_MODEL, models: [], error: err.message || "Ollama not reachable" };
  }
}

/**
 * Generate text using Ollama's /api/generate endpoint.
 * Good for structured prompts where we need raw text output.
 */
export async function ollamaGenerateText(
  prompt: string,
  options?: OllamaGenerateOptions
): Promise<string> {
  const model = options?.model || OLLAMA_MODEL;
  const url = `${OLLAMA_BASE_URL}/api/generate`;

  const payload: any = {
    model,
    prompt,
    stream: false,
    options: {
      temperature: options?.temperature ?? 0.35,
      num_predict: 4096,
    },
  };

  if (options?.system) {
    payload.system = options.system;
  }
  if (options?.format === "json") {
    payload.format = "json";
  }

  logger.info({ model, promptLength: prompt.length }, "Ollama generate request");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error || `Ollama generation failed: ${res.status}`);
  }

  const text = body?.response || "";
  if (!text) {
    throw new Error("Ollama returned empty response");
  }

  logger.info({ model, responseLength: text.length }, "Ollama generate success");
  return text;
}

/**
 * Generate structured JSON using Ollama's /api/chat endpoint with JSON mode.
 * This is the primary method for exam generation (MCQs, coding questions).
 */
export async function ollamaGenerateJson<T>(
  messages: OllamaMessage[],
  options?: { model?: string; temperature?: number }
): Promise<T> {
  const model = options?.model || OLLAMA_MODEL;
  const url = `${OLLAMA_BASE_URL}/api/chat`;

  const payload = {
    model,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    stream: false,
    format: { type: "json_object" },
    options: {
      temperature: options?.temperature ?? 0.2,
      num_predict: 4096,
    },
  };

  logger.info({ model, messageCount: messages.length }, "Ollama chat JSON request");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error || `Ollama chat failed: ${res.status}`);
  }

  const text = body?.message?.content || "";
  if (!text) {
    throw new Error("Ollama chat returned empty response");
  }

  logger.info({ model, responseLength: text.length }, "Ollama chat JSON success");
  return parseOllamaJson(text) as T;
}

/**
 * Generate JSON from a single prompt string using /api/generate with JSON mode.
 * Simpler interface for one-shot generation.
 */
export async function ollamaGeneratePromptJson<T>(
  prompt: string,
  system?: string,
  options?: { model?: string; temperature?: number }
): Promise<T> {
  const model = options?.model || OLLAMA_MODEL;
  const url = `${OLLAMA_BASE_URL}/api/generate`;

  const payload: any = {
    model,
    prompt,
    stream: false,
    format: { type: "json_object" },
    options: {
      temperature: options?.temperature ?? 0.2,
      num_predict: 4096,
    },
  };

  if (system) {
    payload.system = system;
  }

  logger.info({ model, promptLength: prompt.length }, "Ollama prompt JSON request");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error || `Ollama prompt JSON failed: ${res.status}`);
  }

  const text = body?.response || "";
  if (!text) {
    throw new Error("Ollama prompt JSON returned empty response");
  }

  logger.info({ model, responseLength: text.length }, "Ollama prompt JSON success");
  return parseOllamaJson(text) as T;
}

/**
 * Robust JSON parser for local LLM output.
 * Local models are less reliable at pure JSON than commercial APIs.
 */
function parseOllamaJson(text: string): any {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to extract the first JSON object or array
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch {
        // continue
      }
    }
    if (arrMatch) {
      try {
        return JSON.parse(arrMatch[0]);
      } catch {
        // continue
      }
    }
    throw new Error("Ollama returned unparseable JSON");
  }
}

/**
 * Check if Ollama is available for use.
 */
export async function isOllamaAvailable(): Promise<boolean> {
  const status = await checkOllamaStatus();
  return status.available;
}
