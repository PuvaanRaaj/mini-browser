import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import { app, net, type Session } from "electron";

import {
  BLOCKED_HOST_SUFFIXES,
  EASYLIST_SOURCES,
  hostIsBlocked,
  parseEasyListHosts,
} from "./blocklist";

// Bump when the parser's rule acceptance changes so stale caches written by
// older, buggier parsers (e.g. one that blocked all of x.com from a
// ||x.com^*/log.json rule) are discarded instead of reused.
const CACHE_VERSION = 2;
const CACHE_FILE = "easylist-hosts.json";

export async function enableAdblock(ses: Session): Promise<boolean> {
  const blocked = new Set<string>(BLOCKED_HOST_SUFFIXES);

  ses.webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (details, callback) => {
    // Hostname blocking is for subresources only. Cancelling main frames would
    // let one bad list entry take down a whole page, so navigation always
    // passes through here untouched.
    if (details.resourceType === "mainFrame") {
      callback({});
      return;
    }
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
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    const record = parsed as { version?: unknown; hosts?: unknown };
    if (record.version !== CACHE_VERSION || !Array.isArray(record.hosts)) return [];
    return record.hosts.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

async function writeCachedHosts(hosts: string[]): Promise<void> {
  try {
    await mkdir(app.getPath("userData"), { recursive: true });
    await writeFile(cachePath(), JSON.stringify({ version: CACHE_VERSION, hosts }));
  } catch {
    // Cache is optional.
  }
}
