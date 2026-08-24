import type { AuthenticatorAccount } from "./totp";
import type { VaultAPI } from "./vault-types";

const LEGACY_STORAGE_KEY = "mini.authenticator.accounts.v1";

export async function migrateLegacyAuthenticatorStorage(vault: VaultAPI): Promise<number> {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return 0;
  }
  if (!raw) return 0;
  let accounts: AuthenticatorAccount[];
  try {
    const parsed: unknown = JSON.parse(raw);
    accounts = Array.isArray(parsed) ? parsed.filter(isLegacyAccount) : [];
  } catch {
    return 0;
  }
  if (accounts.length === 0) return 0;
  const imported = await vault.importAuthenticatorAccounts(accounts);
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  return imported;
}

function isLegacyAccount(value: unknown): value is AuthenticatorAccount {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as AuthenticatorAccount).secret === "string",
  );
}
