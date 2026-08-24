import { useCallback, useEffect, useState } from "react";

import { DEMO_ACCOUNT, type AuthenticatorAccount } from "@/lib/totp";
import type { AuthenticatorCode, VaultStatus } from "@/lib/vault-types";
import { migrateLegacyAuthenticatorStorage } from "@/lib/legacy-vault-migration";

const LOCKED: VaultStatus = {
  available: false,
  backend: "unavailable",
  message: "The secure vault is only available in the desktop app.",
};

export function useAccounts() {
  const [accounts, setAccounts] = useState<AuthenticatorCode[]>([]);
  const [status, setStatus] = useState<VaultStatus>(LOCKED);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const vault = window.mini?.vault;
    if (!vault) return;
    try {
      const nextStatus = await vault.status();
      setStatus(nextStatus);
      if (!nextStatus.available) {
        setAccounts([]);
        return;
      }
      setAccounts(await vault.listAuthenticatorCodes());
      setError(null);
    } catch (caught) {
      setError(messageOf(caught));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      const vault = window.mini?.vault;
      if (!vault) return;
      const nextStatus = await vault.status();
      if (cancelled) return;
      setStatus(nextStatus);
      if (nextStatus.available) await migrateLegacyAuthenticatorStorage(vault);
      if (!cancelled) await refresh();
    };
    void start().catch((caught) => !cancelled && setError(messageOf(caught)));
    const timer = window.setInterval(() => void refresh(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [refresh]);

  const importAccounts = useCallback(async (next: AuthenticatorAccount[]) => {
    const vault = window.mini?.vault;
    if (!vault) throw new Error(LOCKED.message!);
    const added = await vault.importAuthenticatorAccounts(next);
    await refresh();
    return added;
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    const vault = window.mini?.vault;
    if (!vault) throw new Error(LOCKED.message!);
    await vault.deleteAuthenticatorAccount(id);
    await refresh();
  }, [refresh]);

  return { accounts, status, error, importAccounts, remove };
}

export function createDemoAccount(): AuthenticatorAccount {
  return { ...DEMO_ACCOUNT, id: crypto.randomUUID(), createdAt: Date.now() };
}

function messageOf(value: unknown): string {
  return value instanceof Error ? value.message : "Could not open the secure vault.";
}
