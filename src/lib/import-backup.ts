import { buildAccount, type AuthenticatorAccount, type TotpAlgorithm } from "./totp";

export type BackupImportResult = {
  accounts: AuthenticatorAccount[];
  skipped: number;
};

type BackupRecord = Record<string, unknown>;

/**
 * Reads the unencrypted JSON and one-URI-per-line formats exported by the
 * Authenticator browser extension. Everything is parsed locally; no backup
 * contents leave the renderer.
 */
export function parseAuthenticatorBackup(text: string): BackupImportResult {
  const source = text.trim();
  if (!source) throw new Error("The backup file is empty.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return parseOtpAuthLines(source);
  }

  const records = collectRecords(parsed);
  const accounts: AuthenticatorAccount[] = [];
  let skipped = 0;

  for (const record of records) {
    if (isEncryptedRecord(record) || !isTotpRecord(record)) {
      skipped += 1;
      continue;
    }

    const account = accountFromRecord(record);
    if (!account) {
      skipped += 1;
      continue;
    }
    accounts.push(account);
  }

  return { accounts: dedupe(accounts), skipped };
}

function parseOtpAuthLines(source: string): BackupImportResult {
  const accounts: AuthenticatorAccount[] = [];
  let skipped = 0;

  for (const line of source.split(/\r?\n/)) {
    const value = line.trim();
    if (!value) continue;
    if (!value.toLowerCase().startsWith("otpauth://")) {
      skipped += 1;
      continue;
    }

    try {
      accounts.push(
        buildAccount({
          issuer: "",
          label: "",
          secret: value,
        }),
      );
    } catch {
      skipped += 1;
    }
  }

  return { accounts: dedupe(accounts), skipped };
}

function collectRecords(value: unknown): BackupRecord[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectRecords(item));
  }
  if (!isRecord(value)) return [];

  if (typeof value.secret === "string" || value.dataType === "EncOTPStorage") {
    return [value];
  }

  return Object.values(value).flatMap((item) => collectRecords(item));
}

function accountFromRecord(record: BackupRecord): AuthenticatorAccount | null {
  const secret = firstString(record.secret, record.key, record.token);
  if (!secret || secret.toLowerCase().startsWith("otpauth://")) {
    if (secret?.toLowerCase().startsWith("otpauth://")) {
      try {
        return buildAccount({ issuer: "", label: "", secret });
      } catch {
        return null;
      }
    }
    return null;
  }

  const issuer = firstString(record.issuer, record.service, record.provider) ?? "";
  const label =
    firstString(record.account, record.label, record.name, record.title) ??
    "Account";
  const type = String(record.type ?? "totp").toLowerCase();
  if (type === "hotp" || type === "hhex" || type === "steam" || type === "battle") {
    return null;
  }

  try {
    return buildAccount({
      issuer,
      label,
      secret,
      algorithm: algorithmOf(record.algorithm),
      digits: digitsOf(record.digits),
      period: periodOf(record.period),
    });
  } catch {
    return null;
  }
}

function isTotpRecord(record: BackupRecord): boolean {
  const type = record.type;
  if (type === undefined || type === null) return true;
  if (typeof type === "number") return type === 1;
  return String(type).toLowerCase() === "totp";
}

function isEncryptedRecord(record: BackupRecord): boolean {
  return (
    record.dataType === "EncOTPStorage" ||
    record.encrypted === true ||
    typeof record.data === "string" && !record.secret
  );
}

function algorithmOf(value: unknown): TotpAlgorithm {
  if (typeof value === "number") {
    if (value === 2) return "SHA256";
    if (value === 3) return "SHA512";
    return "SHA1";
  }
  const normalized = String(value ?? "SHA1").toUpperCase();
  if (normalized === "SHA256") return "SHA256";
  if (normalized === "SHA512") return "SHA512";
  return "SHA1";
}

function digitsOf(value: unknown): 6 | 8 {
  return Number(value) === 8 ? 8 : 6;
}

function periodOf(value: unknown): number {
  const period = Number(value);
  return Number.isFinite(period) && period > 0 ? period : 30;
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim() !== "")?.trim();
}

function dedupe(accounts: AuthenticatorAccount[]): AuthenticatorAccount[] {
  const seen = new Set<string>();
  return accounts.filter((account) => {
    const key = [
      account.issuer.toLowerCase(),
      account.label.toLowerCase(),
      account.secret,
      account.algorithm,
      account.digits,
      account.period,
    ].join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isRecord(value: unknown): value is BackupRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
