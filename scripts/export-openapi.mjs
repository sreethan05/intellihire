/**
 * Export the FastAPI OpenAPI schema to reports/openapi.json.
 *
 * Used by `npm run gen:api-types` so the TypeScript contract types
 * (client/src/lib/api-types.gen.ts) can be regenerated/verified without a
 * running server. Tries the project venv first, then PATH fallbacks — the
 * same resolution order as scripts/run-uvicorn.js.
 */
import { spawnSync, execSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const serverPyDir = path.join(projectRoot, "server_py");

const isWin = process.platform === "win32";
const venvPython = path.join(
  serverPyDir,
  ".venv",
  isWin ? "Scripts" : "bin",
  isWin ? "python.exe" : "python"
);

function resolvePython() {
  if (process.env.PYTHON) return process.env.PYTHON;
  if (fs.existsSync(venvPython)) return venvPython;
  const candidates = isWin ? ["python", "python3", "py"] : ["python3", "python"];
  for (const candidate of candidates) {
    try {
      execSync(`${candidate} --version`, { stdio: "ignore" });
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return isWin ? "python" : "python3";
}

const outFile = path.join(projectRoot, "reports", "openapi.json");
fs.mkdirSync(path.dirname(outFile), { recursive: true });

const env = { ...process.env };
// Importing app.main reads config; supply CI-safe defaults when unset so the
// schema can be generated on a bare machine (mirrors server_py/tests/conftest).
if (!env.JWT_SECRET) env.JWT_SECRET = "ci-secret-key-for-testing-purposes-only-1234567890";
if (!env.DATABASE_URL) env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/postgres";
if (!env.PYTHONPATH) env.PYTHONPATH = "server_py";

const python = resolvePython();
const scriptPath = path.join(projectRoot, "scripts", "export_openapi.py");

console.log(`[export-openapi] ${python} -> ${path.relative(projectRoot, outFile)}`);
const result = spawnSync(python, [scriptPath, outFile], {
  cwd: projectRoot,
  env,
  stdio: "inherit",
  // The venv interpreter is an absolute path; only plain command names need a
  // shell for PATH resolution on Windows. Avoid the shell otherwise — it
  // mangles quoted arguments.
  shell: isWin && !path.isAbsolute(python),
});

if (result.error) {
  console.error(`[export-openapi] Failed to run python: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
