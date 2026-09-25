import { spawnSync } from "node:child_process";

// On Windows, the Python interpreter is typically 'python'. On Linux/macOS, it is usually 'python3'.
const primaryCmd = process.platform === "win32" ? "python" : "python3";
const result = spawnSync(primaryCmd, ["scripts/validate_workspace.py"], { stdio: "inherit" });

if (result.error?.code === "ENOENT") {
  const fallbackCmd = process.platform === "win32" ? "python3" : "python";
  const fallbackResult = spawnSync(fallbackCmd, ["scripts/validate_workspace.py"], { stdio: "inherit" });
  if (fallbackResult.error) throw fallbackResult.error;
  process.exit(fallbackResult.status ?? 1);
} else {
  if (result.error) throw result.error;
  process.exit(result.status ?? 0);
}
