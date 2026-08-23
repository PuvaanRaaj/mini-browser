import { useCallback, useSyncExternalStore } from "react";

import type { Bookmark } from "@/lib/types";
import { hostnameOf } from "@/lib/url";

const STORAGE_KEY = "mini.bookmarks.v1";

function readRaw(): string {
  if (typeof window === "undefined") return "[]";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function parseBookmarks(raw: string): Bookmark[] {
  try {
    const parsed = JSON.parse(raw) as Bookmark[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.url === "string")
      .map((item) => ({ ...item, favicon: item.favicon ?? null }));
  } catch {
    return [];
  }
}

function subscribe(onStoreChange: () => void) {
  const handler = () => onStoreChange();
  window.addEventListener("storage", handler);
  window.addEventListener("mini-bookmarks", handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("mini-bookmarks", handler);
  };
}

/** Bookmarks compare by URL, so the same page saved twice stays one entry. */
export function useBookmarks(): {
  bookmarks: Bookmark[];
  add: (url: string, title: string, favicon?: string | null) => void;
  remove: (id: string) => void;
  toggle: (url: string, title: string, favicon?: string | null) => void;
  isSaved: (url: string) => boolean;
} {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "[]");
  const bookmarks = parseBookmarks(raw);

  const write = useCallback((next: Bookmark[]) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage can be refused; the bar still reflects this session.
    }
    window.dispatchEvent(new Event("mini-bookmarks"));
  }, []);

  const add = useCallback(
    (url: string, title: string, favicon: string | null = null) => {
      if (!url || url === "about:blank") return;
      const current = parseBookmarks(readRaw());
      if (current.some((item) => item.url === url)) return;
      write([
        ...current,
        {
          id: crypto.randomUUID(),
          url,
          title: title || hostnameOf(url) || url,
          favicon,
          createdAt: Date.now(),
        },
      ]);
    },
    [write],
  );

  const remove = useCallback(
    (id: string) => {
      write(parseBookmarks(readRaw()).filter((item) => item.id !== id));
    },
    [write],
  );

  const toggle = useCallback(
    (url: string, title: string, favicon: string | null = null) => {
      const current = parseBookmarks(readRaw());
      const existing = current.find((item) => item.url === url);
      if (existing) write(current.filter((item) => item.id !== existing.id));
      else add(url, title, favicon);
    },
    [add, write],
  );

  const isSaved = useCallback(
    (url: string) => bookmarks.some((item) => item.url === url),
    [bookmarks],
  );

  return { bookmarks, add, remove, toggle, isSaved };
}
