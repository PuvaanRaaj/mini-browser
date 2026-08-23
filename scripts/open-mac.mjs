import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const candidates = [
  "release/mac-arm64/Mini.app",
  "release/mac-x64/Mini.app",
  "release/mac-universal/Mini.app",
  "release/mac/Mini.app",
];

const app = candidates.find((path) => existsSync(path));
if (!app) {
  console.error("Mini.app not found. Build it first:\n  npm run dist:mac");
  process.exit(1);
}

const result = spawnSync("open", [app], { stdio: "inherit" });
process.exit(result.status ?? 1);
