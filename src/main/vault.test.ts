import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildAccount } from "../lib/totp";
import { SecureVault, type VaultCipher } from "./vault";

const cipher: VaultCipher = {
  isEncryptionAvailable: () => true,
  backend: () => "test_keychain",
  encryptString: (value) => Buffer.from(Buffer.from(value).map((byte) => byte ^ 0xa5)),
  decryptString: (value) => Buffer.from(value.map((byte) => byte ^ 0xa5)).toString("utf8"),
};

async function main() {
  const dir = join(tmpdir(), `minimal-vault-${process.pid}`);
  await mkdir(dir, { recursive: true });
  const path = join(dir, "vault.bin");
  const vault = new SecureVault(path, cipher);

  const account = buildAccount({
    issuer: "Example",
    label: "person@example.com",
    secret: "JBSWY3DPEHPK3PXP",
  });
  assert.equal(await vault.importAuthenticatorAccounts([account]), 1);
  assert.equal(await vault.importAuthenticatorAccounts([account]), 0);
  const codes = await vault.listAuthenticatorCodes(1_700_000_000_000);
  assert.equal(codes.length, 1);
  assert.equal("secret" in codes[0]!, false);
  assert.match(codes[0]!.code, /^\d{6}$/);

  const password = await vault.savePassword({
    origin: "https://example.com",
    username: "person@example.com",
    password: "correct horse battery staple",
  });
  assert.equal("password" in password, false);
  assert.equal((await vault.listPasswords()).length, 1);
  assert.equal((await vault.passwordSecret(password.id))?.password, "correct horse battery staple");
  await vault.saveGoogleOAuth({
    accessToken: "access-token-secret",
    refreshToken: "refresh-token-secret",
    idToken: null,
    tokenType: "Bearer",
    scope: "openid email profile",
    expiresAt: Date.now() + 3_600_000,
  });
  assert.equal(await vault.hasGoogleOAuth(), true);
  const bytes = readFileSync(path);
  assert.equal(bytes.includes(Buffer.from("correct horse battery staple")), false);
  assert.equal(bytes.includes(Buffer.from("JBSWY3DPEHPK3PXP")), false);
  assert.equal(bytes.includes(Buffer.from("refresh-token-secret")), false);
  await vault.clearGoogleOAuth();
  assert.equal(await vault.hasGoogleOAuth(), false);
  await assert.rejects(
    vault.savePassword({ origin: "http://example.com", username: "user", password: "secret" }),
    /exact HTTPS origin/,
  );

  const locked = new SecureVault(join(dir, "locked.bin"), {
    ...cipher,
    isEncryptionAvailable: () => false,
  });
  await assert.rejects(locked.listPasswords(), /encryption is unavailable/);
  console.log("vault tests passed");
}

void main();
