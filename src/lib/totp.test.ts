import assert from "node:assert/strict";

import {
  buildAccount,
  generateCode,
  parseOtpAuthUri,
  remainingSeconds,
} from "./totp";

const uri =
  "otpauth://totp/GitHub:demo@mini.local?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&algorithm=SHA1&digits=6&period=30";

const parsed = parseOtpAuthUri(uri);
assert.equal(parsed.issuer, "GitHub");
assert.equal(parsed.label, "demo@mini.local");
assert.equal(parsed.secret, "JBSWY3DPEHPK3PXP");
assert.equal(parsed.digits, 6);
assert.equal(parsed.period, 30);

const fromSecret = buildAccount({
  issuer: "Minimal",
  label: "demo@minimal.local",
  secret: "jbswy3dpehpk3pxp",
});
assert.equal(fromSecret.secret, "JBSWY3DPEHPK3PXP");

const timestamp = 1_700_000_000_000;
const code = generateCode(fromSecret, timestamp);
assert.match(code, /^\d{6}$/);
assert.equal(generateCode(fromSecret, timestamp), code);

const remaining = remainingSeconds(30, timestamp);
assert.ok(remaining >= 1 && remaining <= 30);

const uriAccount = buildAccount({
  issuer: "",
  label: "",
  secret: uri,
});
assert.equal(uriAccount.issuer, "GitHub");
assert.equal(generateCode(uriAccount, timestamp), code);

console.log("totp tests passed", { code, remaining });
