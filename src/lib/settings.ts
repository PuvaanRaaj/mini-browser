import { useCallback, useSyncExternalStore } from "react";

import type { MiniSettings } from "@/lib/types";

const STORAGE_KEY = "mini.settings.v1";

export const DEFAULT_SETTINGS: MiniSettings = {
  tabPosition: "top",
  favoritesMode: "always",
  restoreSession: false,
  persistSession: false,
  cats: true,
};

function readRaw(): string {
  if (typeof window === "undefined") return "{}";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "{}";
  } catch {
    return "{}";
  }
}

function parseSettings(raw: string): MiniSettings {
  try {
    const parsed = JSON.parse(raw) as Partial<MiniSettings>;
    if (!parsed || typeof parsed !== "object") return DEFAULT_SETTINGS;
    return {
      tabPosition: parsed.tabPosition === "side" ? "side" : "top",
      favoritesMode:
        parsed.favoritesMode === "hover" || parsed.favoritesMode === "never"
          ? parsed.favoritesMode
          : "always",
      restoreSession: parsed.restoreSession === true,
      persistSession: parsed.persistSession === true,
      cats: parsed.cats !== false,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function subscribe(onStoreChange: () => void) {
  const handler = () => onStoreChange();
  window.addEventListener("storage", handler);
  window.addEventListener("mini-settings", handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("mini-settings", handler);
  };
}

export function useSettings(): [
  MiniSettings,
  <K extends keyof MiniSettings>(key: K, value: MiniSettings[K]) => void,
] {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "{}");
  const settings = parseSettings(raw);

  const set = useCallback(
    <K extends keyof MiniSettings>(key: K, value: MiniSettings[K]) => {
      const next = { ...parseSettings(readRaw()), [key]: value };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage can be refused; settings then last only for this session.
      }
      window.dispatchEvent(new Event("mini-settings"));
    },
    [],
  );

  return [settings, set];
}

const SESSION_KEY = "mini.session.v1";

/** URLs of the open tabs, so "continue where I left off" can rebuild them. */
export function saveSession(urls: string[]): void {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(urls));
  } catch {
    // Nothing to restore next launch; not worth surfacing.
  }
}

export function readSession(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}
