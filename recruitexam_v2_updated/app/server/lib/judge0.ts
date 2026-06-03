import axios from "axios";

const JUDGE0_API = "https://ce.judge0.com";

export const LANGUAGE_MAP: Record<string, number> = {
  c:          50,
  python:     71,
  python3:    71,
  javascript: 63,
  js:         63,
  cpp:        54,
  "c++":      54,
  java:       62,
};

export const b64encode = (str: string) => Buffer.from(str).toString("base64");
export const b64decode = (str: string) => (str ? Buffer.from(str, "base64").toString("utf-8") : "");

export async function runWithJudge0(code: string, language: string, stdin: string = "") {
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
