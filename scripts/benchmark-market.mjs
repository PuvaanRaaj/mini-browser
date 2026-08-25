import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { access, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import { spawn } from "node:child_process";

const execFileAsync = promisify(execFile);
const outputDir = resolve(process.env.MINIMAL_BENCHMARK_DIR ?? ".benchmarks");
await mkdir(outputDir, { recursive: true });

const candidates = [
  ...(process.env.MINIMAL_CHROMIUM_EXECUTABLE ? [{
    browser: "Minimal Chromium",
    executable: resolve(process.env.MINIMAL_CHROMIUM_EXECUTABLE),
    args: (profile, urls) => [
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--disable-default-apps",
      "--disable-background-networking",
      ...urls,
    ],
  }] : []),
  {
    browser: "Google Chrome",
    executable: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: (profile, urls) => [
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--disable-default-apps",
      "--disable-background-networking",
      ...urls,
    ],
  },
  {
    browser: "Firefox",
    executable: "/Applications/Firefox.app/Contents/MacOS/firefox",
    args: (profile, urls) => ["-no-remote", "-profile", profile, ...urls],
  },
];

const available = [];
for (const candidate of candidates) {
  try {
    await access(candidate.executable);
    available.push(candidate);
  } catch {
    // Browser is not installed on this machine.
  }
}
if (available.length === 0) throw new Error("No supported comparison browsers are installed.");

const results = [];
for (const candidate of available) {
  const profile = await mkdtemp(resolve(tmpdir(), "minimal-market-benchmark-"));
  results.push(await measure(candidate, profile, "cold"));
  results.push(await measure(candidate, profile, "warm"));
}

const reportPath = resolve(outputDir, "market-latest.json");
await writeFile(reportPath, `${JSON.stringify({
  methodology: "Fresh isolated profiles; local no-store pages; startup is process spawn to first page request; CPU is cumulative process-tree CPU over five idle seconds.",
  results,
}, null, 2)}\n`, { mode: 0o600 });
console.log(`Market benchmark report: ${reportPath}`);
console.table(results);

async function measure(candidate, profile, run) {
  const requests = new Set();
  let firstRequestAt = null;
  let allRequestsAt = null;
  let resolveAll;
  const allRequests = new Promise((resolvePromise) => { resolveAll = resolvePromise; });
  const server = createServer((request, response) => {
    if (firstRequestAt === null) firstRequestAt = performance.now();
    const match = request.url?.match(/^\/tab-(\d+)/);
    if (match) requests.add(match[1]);
    if (requests.size === 10 && allRequestsAt === null) {
      allRequestsAt = performance.now();
      resolveAll();
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end("<!doctype html><title>Browser benchmark</title><main>ready</main>");
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Benchmark server did not start.");
  const urls = Array.from({ length: 10 }, (_, index) => `http://127.0.0.1:${address.port}/tab-${index + 1}`);
  const started = performance.now();
  const child = spawn(candidate.executable, candidate.args(profile, urls), { stdio: "ignore" });
  try {
    await withTimeout(allRequests, 20_000, `${candidate.browser} did not load ten tabs.`);
    const before = await processTree(child.pid, profile);
    await delay(5_000);
    const after = await processTree(child.pid, profile);
    const elapsed = 5_000;
    const cpuDeltaMs = Math.max(0, after.cpuMs - before.cpuMs);
    return {
      browser: candidate.browser,
      run,
      start_ms: rounded(firstRequestAt - started),
      ten_tab_load_ms: rounded(allRequestsAt - firstRequestAt),
      memory_mb: rounded(after.rssKb / 1024),
      memory_per_tab_mb: rounded(after.rssKb / 1024 / 10),
      idle_cpu_percent: rounded(cpuDeltaMs / elapsed * 100),
    };
  } finally {
    await terminateTree(child.pid, profile);
    server.closeAllConnections();
    await new Promise((resolvePromise) => server.close(resolvePromise));
  }
}

async function processTree(rootPid, profile) {
  const { stdout } = await execFileAsync("ps", ["-axo", "pid=,ppid=,rss=,time=,command="]);
  const rows = stdout.trim().split("\n").map((line) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
    return match ? { pid: Number(match[1]), ppid: Number(match[2]), rss: Number(match[3]), cpuMs: cpuTimeMs(match[4]), command: match[5] } : null;
  }).filter(Boolean);
  const pids = new Set([rootPid, ...rows.filter((row) => row.command.includes(profile)).map((row) => row.pid)]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (pids.has(row.ppid) && !pids.has(row.pid)) {
        pids.add(row.pid);
        changed = true;
      }
    }
  }
  return rows.filter((row) => pids.has(row.pid)).reduce(
    (total, row) => ({ rssKb: total.rssKb + row.rss, cpuMs: total.cpuMs + row.cpuMs }),
    { rssKb: 0, cpuMs: 0 },
  );
}

function cpuTimeMs(value) {
  const [minutesPart, secondsPart] = value.trim().split(":");
  const minutes = Number(minutesPart);
  const seconds = Number(secondsPart);
  return (minutes * 60 + seconds) * 1_000;
}

async function terminateTree(rootPid, profile) {
  const snapshot = await processTreePids(rootPid, profile);
  for (const pid of [...snapshot].reverse()) {
    try { process.kill(pid, "SIGTERM"); } catch { /* already exited */ }
  }
  await delay(250);
}

async function processTreePids(rootPid, profile) {
  const { stdout } = await execFileAsync("ps", ["-axo", "pid=,ppid=,command="]);
  const rows = stdout.trim().split("\n").map((line) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
    return match ? { pid: Number(match[1]), ppid: Number(match[2]), command: match[3] } : null;
  }).filter(Boolean);
  const pids = new Set([rootPid, ...rows.filter((row) => row.command.includes(profile)).map((row) => row.pid)]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const { pid, ppid } of rows) if (pids.has(ppid) && !pids.has(pid)) { pids.add(pid); changed = true; }
  }
  return pids;
}

function withTimeout(promise, milliseconds, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); }),
  ]).finally(() => clearTimeout(timer));
}
function delay(milliseconds) { return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)); }
function rounded(value) { return Math.round(value * 100) / 100; }
