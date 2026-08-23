import * as OTPAuth from "otpauth";

export type TotpAlgorithm = "SHA1" | "SHA256" | "SHA512";

export type AuthenticatorAccount = {
  id: string;
  issuer: string;
  label: string;
  secret: string;
  algorithm: TotpAlgorithm;
  digits: 6 | 8;
  period: number;
  createdAt: number;
};

const BASE32_RE = /^[A-Z2-7]+=*$/i;

export function normalizeSecret(secret: string): string {
  return secret.replace(/\s+/g, "").replace(/=+$/g, "").toUpperCase();
}

export function isLikelySecret(value: string): boolean {
  const normalized = normalizeSecret(value);
  return normalized.length >= 8 && BASE32_RE.test(normalized);
}

export function createTotp(account: Pick<AuthenticatorAccount, "issuer" | "label" | "secret" | "algorithm" | "digits" | "period">) {
  return new OTPAuth.TOTP({
    issuer: account.issuer || undefined,
    label: account.label || "Account",
    algorithm: account.algorithm,
    digits: account.digits,
    period: account.period,
    secret: OTPAuth.Secret.fromBase32(normalizeSecret(account.secret)),
  });
}

export function generateCode(
  account: Pick<AuthenticatorAccount, "issuer" | "label" | "secret" | "algorithm" | "digits" | "period">,
  timestamp = Date.now(),
): string {
  return createTotp(account).generate({ timestamp });
}

export function remainingSeconds(period: number, timestamp = Date.now()): number {
  const elapsed = Math.floor(timestamp / 1000) % period;
  return period - elapsed;
}

export function parseOtpAuthUri(uri: string): Omit<AuthenticatorAccount, "id" | "createdAt"> {
  const parsed = OTPAuth.URI.parse(uri.trim());
  if (!(parsed instanceof OTPAuth.TOTP)) {
    throw new Error("Only TOTP authenticator URIs are supported.");
  }

  const algorithm = (parsed.algorithm || "SHA1").toUpperCase() as TotpAlgorithm;
  const digits = parsed.digits === 8 ? 8 : 6;

  return {
    issuer: parsed.issuer ?? "",
    label: parsed.label || "Account",
    secret: parsed.secret.base32,
    algorithm: algorithm === "SHA256" || algorithm === "SHA512" ? algorithm : "SHA1",
    digits,
    period: parsed.period || 30,
  };
}

export function buildAccount(input: {
  issuer: string;
  label: string;
  secret: string;
  algorithm?: TotpAlgorithm;
  digits?: 6 | 8;
  period?: number;
}): AuthenticatorAccount {
  const secret = input.secret.trim();
  if (secret.toLowerCase().startsWith("otpauth://")) {
    const parsed = parseOtpAuthUri(secret);
    return {
      ...parsed,
      issuer: input.issuer.trim() || parsed.issuer,
      label: input.label.trim() || parsed.label,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
  }

  if (!isLikelySecret(secret)) {
    throw new Error("Enter a base32 secret or an otpauth:// URI.");
  }

  return {
    id: crypto.randomUUID(),
    issuer: input.issuer.trim(),
    label: input.label.trim() || "Account",
    secret: normalizeSecret(secret),
    algorithm: input.algorithm ?? "SHA1",
    digits: input.digits ?? 6,
    period: input.period ?? 30,
    createdAt: Date.now(),
  };
}

/** RFC 6238 demo secret so the panel is usable before you add real accounts. */
export const DEMO_ACCOUNT: Omit<AuthenticatorAccount, "id" | "createdAt"> = {
  issuer: "Minimal",
  label: "demo@minimal.local",
  secret: "JBSWY3DPEHPK3PXP",
  algorithm: "SHA1",
  digits: 6,
  period: 30,
};

export function accountTitle(account: Pick<AuthenticatorAccount, "issuer" | "label">): string {
  if (account.issuer && account.label) return `${account.issuer} — ${account.label}`;
  return account.issuer || account.label || "Account";
}
