import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { keychainAccessGroup, readPackagedWebAuthnConfig } from "./webauthn";

assert.equal(keychainAccessGroup("abc123def4"), "ABC123DEF4.app.minimal.browser.webauthn");
assert.throws(() => keychainAccessGroup("not-a-team"), /Apple Team ID/);

const dir = join(tmpdir(), `minimal-webauthn-${process.pid}`);
mkdirSync(dir, { recursive: true });
const valid = join(dir, "valid.json");
const invalid = join(dir, "invalid.json");
writeFileSync(valid, JSON.stringify({ keychainAccessGroup: keychainAccessGroup("ABC123DEF4") }));
writeFileSync(invalid, JSON.stringify({ keychainAccessGroup: "app.minimal.browser.webauthn" }));
assert.deepEqual(readPackagedWebAuthnConfig(valid), {
  keychainAccessGroup: "ABC123DEF4.app.minimal.browser.webauthn",
});
assert.equal(readPackagedWebAuthnConfig(invalid), null);

console.log("webauthn tests passed");
