import assert from "node:assert/strict";

import { parseAuthenticatorBackup } from "./import-backup";

const jsonBackup = JSON.stringify({
  "github-hash": {
    dataType: "OTPStorage",
    encrypted: false,
    hash: "github-hash",
    index: 0,
    issuer: "GitHub",
    account: "you@example.com",
    secret: "JBSWY3DPEHPK3PXP",
    type: "totp",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  },
  "encrypted-entry": {
    dataType: "EncOTPStorage",
    encrypted: true,
    keyId: "key-1",
    data: "ciphertext",
  },
  key: { dataType: "Key", id: "key-1", salt: "salt", hash: "hash" },
});

const jsonResult = parseAuthenticatorBackup(jsonBackup);
assert.equal(jsonResult.accounts.length, 1);
assert.equal(jsonResult.accounts[0].issuer, "GitHub");
assert.equal(jsonResult.accounts[0].label, "you@example.com");
assert.equal(jsonResult.skipped, 1);

const lineResult = parseAuthenticatorBackup(
  [
    "otpauth://totp/GitHub:you%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub",
    "not an account",
  ].join("\n"),
);
assert.equal(lineResult.accounts.length, 1);
assert.equal(lineResult.accounts[0].issuer, "GitHub");
assert.equal(lineResult.skipped, 1);

const unsupportedResult = parseAuthenticatorBackup(
  JSON.stringify({
    hotp: {
      secret: "JBSWY3DPEHPK3PXP",
      type: "hotp",
      account: "counter@example.com",
    },
  }),
);
assert.equal(unsupportedResult.accounts.length, 0);
assert.equal(unsupportedResult.skipped, 1);

const nestedResult = parseAuthenticatorBackup(
  JSON.stringify({
    accounts: [
      {
        issuer: "Vercel",
        label: "you@example.com",
        secret: "JBSWY3DPEHPK3PXP",
        algorithm: 2,
        digits: 8,
        period: 60,
        type: 1,
      },
      {
        issuer: "Vercel",
        account: "you@example.com",
        secret: "JBSWY3DPEHPK3PXP",
        type: "totp",
      },
    ],
  }),
);
assert.equal(nestedResult.accounts.length, 1);
assert.equal(nestedResult.accounts[0].algorithm, "SHA256");
assert.equal(nestedResult.accounts[0].digits, 8);
assert.equal(nestedResult.accounts[0].period, 60);

const uriRecordResult = parseAuthenticatorBackup(
  JSON.stringify({
    account: {
      secret:
        "otpauth://totp/Example:user%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example",
    },
  }),
);
assert.equal(uriRecordResult.accounts.length, 1);
assert.equal(uriRecordResult.accounts[0].issuer, "Example");

assert.throws(() => parseAuthenticatorBackup("  "), /empty/i);
assert.equal(parseAuthenticatorBackup("not a backup").accounts.length, 0);

console.log("backup import tests passed");
