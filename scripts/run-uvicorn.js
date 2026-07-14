import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const serverPyDir = path.join(projectRoot, "server_py");

const isWin = process.platform === "win32";
const venvBinDir = isWin ? "Scripts" : "bin";
const uvicornName = isWin ? "uvicorn" : "uvicorn"; // shell: true handles extension automatically

const uvicornPath = path.join(serverPyDir, ".venv", venvBinDir, uvicornName);

// Fallback to global uvicorn if local venv one is missing (useful for some dev / container setups)
let binToRun = uvicornPath;
if (!fs.existsSync(uvicornPath) && !fs.existsSync(uvicornPath + ".exe")) {
  console.warn(`Local virtualenv uvicorn not found at: ${uvicornPath}. Falling back to system uvicorn...`);
  binToRun = "uvicorn";
}

const args = process.argv.slice(2);

console.log(`Launching: ${binToRun} ${args.join(" ")}`);

const child = spawn(binToRun, args, {
  cwd: projectRoot,
  stdio: "inherit",
  shell: true,
});

child.on("close", (code) => {
  process.exit(code || 0);
});
