import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUN_SCRIPT = path.resolve(__dirname, "../../../science/run.py");
const SCIENCE_DIR = path.resolve(__dirname, "../../../science");
const SCIENCE_PYTHON = process.platform === "win32"
  ? path.join(SCIENCE_DIR, ".venv", "Scripts", "python.exe")
  : path.join(SCIENCE_DIR, ".venv", "bin", "python");

export function executePythonMarketForecast(payload) {
  return new Promise((resolve, reject) => {
    const python = process.env.PYTHON || (existsSync(SCIENCE_PYTHON) ? SCIENCE_PYTHON : "python");
    const child = spawn(python, [RUN_SCRIPT, "market-forecast", "--input", "-"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => reject(new Error(`Failed to start market price model: ${error.message}`)));
    child.on("close", (code) => {
      let result;
      try { result = JSON.parse(stdout); }
      catch (error) { return reject(new Error(`Could not read market model result: ${error.message}; ${stderr}`)); }
      if (code !== 0 && result?.success !== false) return reject(new Error(stderr || "Market model failed."));
      resolve(result);
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(payload));
  });
}
