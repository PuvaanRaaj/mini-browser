#!/usr/bin/env bun
/**
 * Minimal — local landing page server:
 *
 *   npm run site
 *
 * Zero dependencies. Detects the visitor's OS from the User-Agent,
 * serves the landing page with the right platform preselected, and
 * streams the newest local release artifact from ./release (falling
 * back to GitHub Releases when no artifact exists yet).
 *
 * Env:
 *   PORT  — listen port (default 3000)
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const PORT = Number(process.env.PORT ?? 3000);

const pkg = await Bun.file(join(ROOT, "package.json")).json();
const VERSION: string = pkg.version ?? "0.1.0";
const GITHUB = "https://github.com/PuvaanRaaj/mini-browser";
const RELEASES_URL = `${GITHUB}/releases`;
const RELEASES_DIR = join(ROOT, "release");

export type Platform = "mac" | "windows" | "linux";

export function detectPlatform(userAgent: string): Platform {
  const ua = userAgent.toLowerCase();
  if (ua.includes("android")) return "linux";
  if (ua.includes("mac os x") || ua.includes("macintosh")) return "mac";
  if (ua.includes("windows")) return "windows";
  return "linux";
}

function newestArtifact(pattern: RegExp): string | null {
  try {
    const files = readdirSync(RELEASES_DIR).filter((f) => pattern.test(f));
    if (files.length === 0) return null;
    return files.sort(
      (a, b) =>
        statSync(join(RELEASES_DIR, b)).mtimeMs -
        statSync(join(RELEASES_DIR, a)).mtimeMs,
    )[0];
  } catch {
    return null;
  }
}

// Newest build output in ./release, picked up automatically after `npm run dist`.
const ARTIFACTS: Record<Platform, string | null> = {
  mac: newestArtifact(/\.dmg$/i),
  windows: newestArtifact(/\.(exe|msi)$/i),
  linux: newestArtifact(/\.appimage$/i),
};

const HTML_TEMPLATE = await Bun.file(join(import.meta.dir, "index.html")).text();

function pageFor(userAgent: string, override: string | null): Response {
  const os =
    override === "mac" || override === "windows" || override === "linux"
      ? override // ?os= preview — lets anyone see another platform's state
      : detectPlatform(userAgent);
  const html = HTML_TEMPLATE.replaceAll("__OS__", os).replaceAll(
    "__VERSION__",
    VERSION,
  );
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function downloadFor(req: Request): Response {
  const url = new URL(req.url);
  const override = url.searchParams.get("platform");
  const platform: Platform =
    override === "mac" || override === "windows" || override === "linux"
      ? override
      : detectPlatform(req.headers.get("user-agent") ?? "");

  const artifact = ARTIFACTS[platform];
  if (artifact) {
    return new Response(Bun.file(join(RELEASES_DIR, artifact)), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${artifact}"`,
      },
    });
  }

  // No local artifact for this platform — point curl/browsers at GitHub.
  const ghAsset =
    platform === "mac"
      ? `${GITHUB}/releases/download/v${VERSION}/Minimal-${VERSION}-mac-arm64.dmg`
      : RELEASES_URL;
  return new Response(null, {
    status: 302,
    headers: { Location: ghAsset },
  });
}

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;
    switch (pathname) {
      case "/":
        return pageFor(
          req.headers.get("user-agent") ?? "",
          url.searchParams.get("os"),
        );
      case "/icon.svg":
        return new Response(Bun.file(join(ROOT, "resources/icon.svg")), {
          headers: { "Content-Type": "image/svg+xml" },
        });
      case "/api/os":
        return Response.json({
          os: detectPlatform(req.headers.get("user-agent") ?? ""),
          version: VERSION,
          artifacts: ARTIFACTS,
        });
      case "/download/latest":
        return downloadFor(req);
      default:
        return new Response("Not found", { status: 404 });
    }
  },
});

console.log(
  `▲ Minimal landing page → http://localhost:${PORT}\n` +
    `  mac: ${ARTIFACTS.mac ?? "no local .dmg — /download falls back to GitHub"}\n` +
    `  windows: ${ARTIFACTS.windows ?? "no local .exe — falls back to GitHub"}\n` +
    `  linux: ${ARTIFACTS.linux ?? "no local .AppImage — falls back to GitHub"}`,
);
