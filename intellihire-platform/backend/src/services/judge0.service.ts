import axios from "axios";

const api = axios.create({
  baseURL: process.env.JUDGE0_API_URL,
  headers: process.env.JUDGE0_API_KEY ? { "X-Auth-Token": process.env.JUDGE0_API_KEY } : undefined
});

export const languageIds: Record<string, number> = {
  python3: 71,
  java: 62,
  cpp: 54,
  javascript: 63,
  c: 50
};

export async function submitCode(languageId: number, sourceCode: string, stdin: string, expectedOutput?: string, timeLimit?: number, memoryLimit?: number) {
  const { data } = await api.post("/submissions", {
    language_id: languageId,
    source_code: sourceCode,
    stdin,
    expected_output: expectedOutput,
    cpu_time_limit: timeLimit ? timeLimit / 1000 : undefined,
    memory_limit: memoryLimit
  }, { params: { base64_encoded: false, wait: false } });
  return data.token as string;
}

export async function getSubmission(token: string) {
  const { data } = await api.get(`/submissions/${token}`, { params: { base64_encoded: false } });
  return data;
}

export async function batchSubmit(submissions: Array<Record<string, unknown>>) {
  const { data } = await api.post("/submissions/batch", { submissions }, { params: { base64_encoded: false } });
  return data;
}

export async function getLanguageList() {
  const { data } = await api.get("/languages");
  return data;
}

