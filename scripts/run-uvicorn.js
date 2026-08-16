import { spawn } from "child_process";
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

let binToRun = pythonPath;
if (!fs.existsSync(pythonPath)) {
  binToRun = "python";
}

const args = ["-m", "uvicorn", ...process.argv.slice(2)];

console.log(`Launching: ${binToRun} ${args.join(" ")}`);

const child = spawn(binToRun, args, {
  cwd: projectRoot,
  stdio: "inherit",
  env: process.env,
});

child.on("close", (code) => {
  process.exit(code || 0);
});
