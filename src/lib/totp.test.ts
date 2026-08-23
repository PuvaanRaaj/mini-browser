import assert from "node:assert/strict";

import {
  buildAccount,
  generateCode,
  isLikelySecret,
  normalizeSecret,
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
assert.equal(normalizeSecret(" jbsw y3dp ehpk 3pxp=== "), "JBSWY3DPEHPK3PXP");
assert.equal(isLikelySecret("JBSWY3DPEHPK3PXP"), true);
assert.equal(isLikelySecret("not-a-secret"), false);
assert.throws(() => buildAccount({ issuer: "", label: "", secret: "12345678" }), /base32/i);

const remaining = remainingSeconds(30, timestamp);
assert.ok(remaining >= 1 && remaining <= 30);
assert.equal(remainingSeconds(30, 30_000), 30);
assert.equal(remainingSeconds(30, 31_000), 29);

const uriAccount = buildAccount({
  issuer: "",
  label: "",
  secret: uri,
});
assert.equal(uriAccount.issuer, "GitHub");
assert.equal(generateCode(uriAccount, timestamp), code);
assert.throws(
  () => parseOtpAuthUri("otpauth://hotp/GitHub?secret=JBSWY3DPEHPK3PXP"),
  /TOTP/i,
);
assert.throws(
  () => parseOtpAuthUri("otpauth://totp/GitHub?issuer=GitHub"),
  /secret/i,
);

// RFC 6238 vectors: 8-digit TOTP at Unix time 59.
const rfcTimestamp = 59_000;
const sha1 = buildAccount({
  issuer: "",
  label: "",
  secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
  digits: 8,
});
const sha256 = buildAccount({
  issuer: "",
  label: "",
  secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA",
  algorithm: "SHA256",
  digits: 8,
});
const sha512 = buildAccount({
  issuer: "",
  label: "",
  secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNA",
  algorithm: "SHA512",
  digits: 8,
});
assert.equal(generateCode(sha1, rfcTimestamp), "94287082");
assert.equal(generateCode(sha256, rfcTimestamp), "46119246");
assert.equal(generateCode(sha512, rfcTimestamp), "90693936");

console.log("totp tests passed", { code, remaining });
