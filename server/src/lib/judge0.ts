import axios from "axios";
import { logger } from "./logger.js";

const JUDGE0_API = process.env.JUDGE0_API_URL || "https://ce.judge0.com";
const isPrivateInstance = !JUDGE0_API.includes("ce.judge0.com");

if (!isPrivateInstance) {
  logger.warn(
    { endpoint: JUDGE0_API },
    "Using public Judge0 CE endpoint. For production, set JUDGE0_API_URL to a private instance."
  );
}

export const LANGUAGE_MAP: Record<string, number> = {
  c: 50,
  python: 71,
  python3: 71,
  javascript: 63,
  js: 63,
  cpp: 54,
  "c++": 54,
  java: 62,
};

export const b64encode = (str: string) => Buffer.from(str).toString("base64");
export const b64decode = (str: string) =>
  str ? Buffer.from(str, "base64").toString("utf-8") : "";

export async function runWithJudge0(
  code: string,
  language: string,
  stdin: string = ""
) {
  const languageId = LANGUAGE_MAP[language.toLowerCase()];
  if (!languageId) throw new Error(`Unsupported language: ${language}`);

  const { data } = await axios.post(
    `${JUDGE0_API}/submissions?base64_encoded=true&wait=true`,
    {
      source_code: b64encode(code),
      language_id: languageId,
      stdin: b64encode(stdin),
    },
    { headers: { "Content-Type": "application/json" }, timeout: 30000 }
  );

  return {
    stdout: b64decode(data.stdout),
    stderr: b64decode(data.stderr),
    compile_output: b64decode(data.compile_output),
    status: data.status?.description || "Unknown",
  };
}

export function getJudge0Status() {
  return {
    endpoint: JUDGE0_API,
    isPrivate: isPrivateInstance,
    warning: isPrivateInstance
      ? undefined
      : "Public endpoint — not recommended for production",
  };
}
