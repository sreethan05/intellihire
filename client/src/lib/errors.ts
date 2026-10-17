import axios from "axios";

interface ApiErrorBody {
  error?: unknown;
  detail?: unknown;
  message?: unknown;
}

/** Pick the first non-empty string message out of the backend error envelope. */
function pickMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const body = data as ApiErrorBody;
  for (const candidate of [body.error, body.detail, body.message]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return null;
}

/**
 * Turn an unknown thrown value into a user-facing message.
 *
 * Handles the backend's RFC 7807 envelope (`error` / `detail`), plain `Error`
 * instances, and anything else via the caller-supplied fallback. Using this
 * with `catch (err: unknown)` keeps error paths type-safe instead of relying
 * on `any`.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    return pickMessage(error.response?.data) ?? fallback;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}
