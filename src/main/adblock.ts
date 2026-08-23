import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import { app, net, type Session } from "electron";

import {
  BLOCKED_HOST_SUFFIXES,
  EASYLIST_SOURCES,
  hostIsBlocked,
  parseEasyListHosts,
} from "./blocklist";

const CACHE_FILE = "easylist-hosts.json";

export async function enableAdblock(ses: Session): Promise<boolean> {
  const blocked = new Set<string>(BLOCKED_HOST_SUFFIXES);

  ses.webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (details, callback) => {
    try {
      const host = new URL(details.url).hostname;
      callback({ cancel: hostIsBlocked(host, blocked) });
    } catch {
      callback({});
    }
  });

  void enrichFromEasyList(blocked);
  return true;
}

async function enrichFromEasyList(blocked: Set<string>): Promise<void> {
  const cached = await readCachedHosts();
  for (const host of cached) blocked.add(host);

  try {
    const lists = await Promise.all(
      EASYLIST_SOURCES.map(async (url) => {
        // Chromium's stack, not Node's undici: undici asserts on its own
        // internals when a large body's socket ends mid-parse, and that throws
        // from a socket event where this try/catch cannot reach it.
        const response = await net.fetch(url);
        if (!response.ok) throw new Error(response.statusText);
        return parseEasyListHosts(await response.text());
      }),
    );
    const next = [...new Set(lists.flat())];
    for (const host of next) blocked.add(host);
    await writeCachedHosts(next);
  } catch {
    // Built-in list already covers common ads if EasyList cannot be fetched.
  }
}

function cachePath(): string {
  return join(app.getPath("userData"), CACHE_FILE);
}

async function readCachedHosts(): Promise<string[]> {
  try {
    const raw = await readFile(cachePath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

async function writeCachedHosts(hosts: string[]): Promise<void> {
  try {
    await mkdir(app.getPath("userData"), { recursive: true });
    await writeFile(cachePath(), JSON.stringify(hosts));
  } catch {
    // Cache is optional.
  }
}
