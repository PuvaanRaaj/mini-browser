import { app } from "electron";
import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import type { MiniSession } from "./tabs";

export type BenchmarkResult = {
  browser: "Minimal";
  version: string;
  platform: string;
  arch: string;
  appReadyMs: number;
  firstNavigationMs: number;
  tenTabLoadMs: number;
  memoryMb: number;
  memoryPerTabMb: number;
  tenTabIdleCpuPercent: number;
  tabs: number;
  measuredAt: string;
};

export function benchmarkOutputPath(argv = process.argv): string | null {
  const prefix = "--benchmark-output=";
  return argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) || null;
}

export async function runBenchmark(
  mini: MiniSession,
  outputPath: string,
): Promise<BenchmarkResult> {
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end("<!doctype html><title>Minimal benchmark</title><main>ready</main>");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Benchmark server did not start.");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const appReadyMs = process.uptime() * 1_000;

    const firstStart = performance.now();
    await mini.handle({ type: "navigate", url: `${baseUrl}/tab-1` });
    const firstNavigationMs = performance.now() - firstStart;

    const loadStart = performance.now();
    for (let index = 2; index <= 10; index += 1) {
      await mini.handle({ type: "newTab" });
      await mini.handle({ type: "navigate", url: `${baseUrl}/tab-${index}` });
    }
    const tenTabLoadMs = performance.now() - loadStart;

    app.getAppMetrics();
    await delay(5_000);
    const metrics = app.getAppMetrics();
    const memoryMb = metrics.reduce(
      (total, metric) => total + metric.memory.workingSetSize / 1024,
      0,
    );
    const tenTabIdleCpuPercent = metrics.reduce(
      (total, metric) => total + metric.cpu.percentCPUUsage,
      0,
    );
    const result: BenchmarkResult = {
      browser: "Minimal",
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      appReadyMs: rounded(appReadyMs),
      firstNavigationMs: rounded(firstNavigationMs),
      tenTabLoadMs: rounded(tenTabLoadMs),
      memoryMb: rounded(memoryMb),
      memoryPerTabMb: rounded(memoryMb / 10),
      tenTabIdleCpuPercent: rounded(tenTabIdleCpuPercent),
      tabs: 10,
      measuredAt: new Date().toISOString(),
    };
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    return result;
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}
