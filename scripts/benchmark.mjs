import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const outputDir = resolve(process.env.MINIMAL_BENCHMARK_DIR ?? ".benchmarks");
await mkdir(outputDir, { recursive: true });
const profile = await mkdtemp(resolve(tmpdir(), "minimal-benchmark-"));
const electron = resolve("node_modules/.bin/electron");

const cold = await run("cold");
const warm = await run("warm");
const report = {
  methodology: "Cold and warm runs use the same profile. Navigation uses a local no-store HTTP page. CPU is sampled after five idle seconds with ten loaded tabs.",
  cold,
  warm,
};
const reportPath = resolve(outputDir, "minimal-latest.json");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(`Benchmark report: ${reportPath}`);
console.table([
  row("Minimal cold", cold),
  row("Minimal warm", warm),
]);

async function run(label) {
  const path = resolve(outputDir, `${label}.json`);
  await mkdir(dirname(path), { recursive: true });
  await new Promise((resolvePromise, reject) => {
    const child = spawn(electron, [".", `--benchmark-output=${path}`, `--benchmark-profile=${profile}`], {
      stdio: "inherit",
      env: { ...process.env, MINIMAL_AGENT: "" },
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`Benchmark exited with ${code}.`)));
  });
  return JSON.parse(await readFile(path, "utf8"));
}

function row(label, result) {
  return {
    browser: label,
    start_ms: result.appReadyMs,
    first_nav_ms: result.firstNavigationMs,
    memory_mb: result.memoryMb,
    memory_per_tab_mb: result.memoryPerTabMb,
    idle_cpu_percent: result.tenTabIdleCpuPercent,
  };
}
