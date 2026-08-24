import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { AuthenticatorAccount } from "../lib/totp";
import { generateCode, remainingSeconds } from "../lib/totp";
import type {
  AuthenticatorCode,
  PasswordEntry,
  PasswordInput,
  VaultStatus,
} from "../lib/vault-types";

export type VaultCipher = {
  isEncryptionAvailable: () => boolean;
  encryptString: (value: string) => Buffer;
  decryptString: (value: Buffer) => string;
  backend: () => string;
};

type StoredPassword = PasswordEntry & { password: string };
type VaultData = {
  version: 1;
  authenticatorAccounts: AuthenticatorAccount[];
  passwords: StoredPassword[];
};

const EMPTY_VAULT: VaultData = { version: 1, authenticatorAccounts: [], passwords: [] };

export class SecureVault {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly path: string,
    private readonly cipher: VaultCipher,
  ) {}

  status(): VaultStatus {
    const backend = this.cipher.backend();
    const available = this.cipher.isEncryptionAvailable() && backend !== "basic_text";
    return {
      available,
      backend,
      message: available ? null : "OS-backed encryption is unavailable. The vault remains locked.",
    };
  }

  listAuthenticatorCodes(now = Date.now()): Promise<AuthenticatorCode[]> {
    return this.serial(async () => {
      const data = await this.read();
      return data.authenticatorAccounts.map((account) => ({
        id: account.id,
        issuer: account.issuer,
        label: account.label,
        algorithm: account.algorithm,
        digits: account.digits,
        period: account.period,
        createdAt: account.createdAt,
        code: generateCode(account, now),
        remaining: remainingSeconds(account.period, now),
      }));
    });
  }

  importAuthenticatorAccounts(accounts: AuthenticatorAccount[]): Promise<number> {
    return this.serial(async () => {
      const data = await this.read();
      const existing = new Set(data.authenticatorAccounts.map(accountKey));
      const accepted = accounts.filter(isAuthenticatorAccount).filter((account) => {
        const key = accountKey(account);
        if (existing.has(key)) return false;
        existing.add(key);
        return true;
      });
      if (accepted.length > 0) {
        data.authenticatorAccounts.push(...accepted);
        await this.write(data);
      }
      return accepted.length;
    });
  }

  deleteAuthenticatorAccount(id: string): Promise<void> {
    return this.serial(async () => {
      const data = await this.read();
      data.authenticatorAccounts = data.authenticatorAccounts.filter((account) => account.id !== id);
      await this.write(data);
    });
  }

  listPasswords(): Promise<PasswordEntry[]> {
    return this.serial(async () => {
      const data = await this.read();
      return data.passwords.map(publicPassword);
    });
  }

  savePassword(input: PasswordInput): Promise<PasswordEntry> {
    return this.serial(async () => {
      const normalized = normalizePasswordInput(input);
      const data = await this.read();
      const now = Date.now();
      const existing = data.passwords.find(
        (entry) => entry.origin === normalized.origin && entry.username === normalized.username,
      );
      const stored: StoredPassword = existing
        ? { ...existing, password: normalized.password, updatedAt: now }
        : { id: randomUUID(), ...normalized, createdAt: now, updatedAt: now };
      data.passwords = existing
        ? data.passwords.map((entry) => (entry.id === existing.id ? stored : entry))
        : [...data.passwords, stored];
      await this.write(data);
      return publicPassword(stored);
    });
  }

  deletePassword(id: string): Promise<void> {
    return this.serial(async () => {
      const data = await this.read();
      data.passwords = data.passwords.filter((entry) => entry.id !== id);
      await this.write(data);
    });
  }

  passwordSecret(id: string): Promise<StoredPassword | null> {
    return this.serial(async () => {
      const data = await this.read();
      return data.passwords.find((entry) => entry.id === id) ?? null;
    });
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  private assertAvailable(): void {
    if (!this.status().available) throw new Error("Secure vault encryption is unavailable.");
  }

  private async read(): Promise<VaultData> {
    this.assertAvailable();
    let encrypted: Buffer;
    try {
      encrypted = await readFile(this.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY_VAULT);
      throw error;
    }
    const parsed: unknown = JSON.parse(this.cipher.decryptString(encrypted));
    if (!isVaultData(parsed)) throw new Error("The secure vault is damaged or has an unsupported format.");
    return parsed;
  }

  private async write(data: VaultData): Promise<void> {
    this.assertAvailable();
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const encrypted = this.cipher.encryptString(JSON.stringify(data));
    const temporary = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, encrypted, { mode: 0o600 });
    await rename(temporary, this.path);
    await chmod(this.path, 0o600);
  }
}

function accountKey(account: AuthenticatorAccount): string {
  return `${account.issuer.toLowerCase()}\0${account.label.toLowerCase()}\0${account.secret}`;
}

function publicPassword(entry: StoredPassword): PasswordEntry {
  return {
    id: entry.id,
    origin: entry.origin,
    username: entry.username,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function isAuthenticatorAccount(value: AuthenticatorAccount): boolean {
  return Boolean(
    value &&
      typeof value.id === "string" &&
      typeof value.secret === "string" &&
      typeof value.issuer === "string" &&
      typeof value.label === "string" &&
      (value.digits === 6 || value.digits === 8) &&
      Number.isFinite(value.period),
  );
}

function normalizePasswordInput(input: PasswordInput): PasswordInput {
  if (!input || typeof input.origin !== "string" || typeof input.username !== "string" || typeof input.password !== "string") {
    throw new Error("Invalid password entry.");
  }
  let origin: URL;
  try {
    origin = new URL(input.origin);
  } catch {
    throw new Error("Enter a valid website origin.");
  }
  if (origin.protocol !== "https:" || origin.origin !== input.origin) {
    throw new Error("Passwords can only be saved for an exact HTTPS origin.");
  }
  if (!input.username.trim() || !input.password) throw new Error("Username and password are required.");
  return { origin: origin.origin, username: input.username.trim(), password: input.password };
}

function isVaultData(value: unknown): value is VaultData {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as VaultData).version === 1 &&
      Array.isArray((value as VaultData).authenticatorAccounts) &&
      Array.isArray((value as VaultData).passwords),
  );
}
