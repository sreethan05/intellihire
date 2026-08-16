import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const serverPyDir = path.join(projectRoot, "server_py");

const isWin = process.platform === "win32";
const venvBinDir = isWin ? "Scripts" : "bin";
const pythonName = isWin ? "python.exe" : "python";
const pythonPath = path.join(serverPyDir, ".venv", venvBinDir, pythonName);

function resolvePython() {
  if (process.env.PYTHON) {
    return process.env.PYTHON;
  }
  if (fs.existsSync(pythonPath)) {
    return pythonPath;
  }
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

const binToRun = resolvePython();
const args = ["-m", "uvicorn", ...process.argv.slice(2)];

console.log(`[run-uvicorn] Launching: ${binToRun} ${args.join(" ")}`);

const child = spawn(binToRun, args, {
  cwd: projectRoot,
  stdio: "inherit",
  // On Windows, shell: true is required for PATH resolution of bare "python".
  // On POSIX, we avoid shell: true so args are passed directly to execvp.
  shell: isWin,
});

child.on("error", (err) => {
  console.error(`Failed to start python process: ${err.message}`);
  process.exit(1);
});

child.on("close", (code) => {
  process.exit(code || 0);
});
