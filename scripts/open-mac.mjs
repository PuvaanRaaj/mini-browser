import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cwd = process.cwd();

const candidates = [
  "mac-arm64/Minimal.app",
  "mac-x64/Minimal.app",
  "mac-universal/Minimal.app",
  "mac/Minimal.app",
  "release/mac-arm64/Minimal.app",
  "release/mac-x64/Minimal.app",
  "release/mac-universal/Minimal.app",
  "release/mac/Minimal.app",
  "mac-arm64/Mini.app",
  "mac/Mini.app",
  "release/mac-arm64/Mini.app",
  "release/mac/Mini.app",
].flatMap((relative) => [join(cwd, relative), join(repoRoot, relative)]);

const app = candidates.find((path) => existsSync(path));
if (!app) {
  console.error("Minimal.app not found. Build it first:\n  npm run dist:mac");
  process.exit(1);
}

console.log(`Opening ${app}`);
const result = spawnSync("open", [app], { stdio: "inherit" });
process.exit(result.status ?? 1);
