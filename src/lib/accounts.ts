import { useCallback, useSyncExternalStore } from "react";

import { DEMO_ACCOUNT, type AuthenticatorAccount } from "@/lib/totp";

const STORAGE_KEY = "mini.authenticator.accounts.v1";

function readRaw(): string {
  if (typeof window === "undefined") return "[]";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function parseAccounts(raw: string): AuthenticatorAccount[] {
  try {
    const parsed = JSON.parse(raw) as AuthenticatorAccount[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.secret === "string");
  } catch {
    return [];
  }
}

function subscribe(onStoreChange: () => void) {
  const handler = () => onStoreChange();
  window.addEventListener("storage", handler);
  window.addEventListener("mini-accounts", handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("mini-accounts", handler);
  };
}

export function useAccounts(): [
  AuthenticatorAccount[],
  (next: AuthenticatorAccount[]) => void,
] {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "[]");
  const accounts = parseAccounts(raw);

  const setAccounts = useCallback((next: AuthenticatorAccount[]) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("mini-accounts"));
  }, []);

  return [accounts, setAccounts];
}

export function createDemoAccount(): AuthenticatorAccount {
  return {
    ...DEMO_ACCOUNT,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
}
