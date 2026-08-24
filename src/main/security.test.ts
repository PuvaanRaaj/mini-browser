import assert from "node:assert/strict";

import {
  chromiumUserAgent,
  isAllowedExternalUrl,
  isAllowedWebUrl,
  isWsl,
  rendererSandboxEnabled,
} from "./security";

assert.equal(isAllowedWebUrl("https://accounts.google.com/"), true);
assert.equal(isAllowedWebUrl("http://127.0.0.1:3000/callback"), true);
assert.equal(isAllowedWebUrl("file:///etc/passwd"), false);
assert.equal(isAllowedWebUrl("javascript:alert(1)"), false);
assert.equal(isAllowedWebUrl("data:text/html,hello"), false);

assert.equal(isAllowedExternalUrl("mailto:hello@example.com"), true);
assert.equal(isAllowedExternalUrl("tel:+60123456789"), true);
assert.equal(isAllowedExternalUrl("file:///tmp/secret"), false);
assert.equal(isAllowedExternalUrl("custom-scheme://payload"), false);

const bundled =
  "Mozilla/5.0 Minimal/1.0.0 Chrome/150.0.0.0 Safari/537.36 Electron/43.4.1";
assert.equal(
  chromiumUserAgent(bundled),
  "Mozilla/5.0 Chrome/150.0.0.0 Safari/537.36",
);

assert.equal(isWsl("linux", { WSL_DISTRO_NAME: "Ubuntu" }), true);
assert.equal(isWsl("linux", {}), false);
assert.equal(rendererSandboxEnabled("linux", { WSL_INTEROP: "/run/WSL/1_interop" }), false);
assert.equal(rendererSandboxEnabled("linux", {}), true);
assert.equal(rendererSandboxEnabled("darwin", {}), true);
assert.equal(rendererSandboxEnabled("win32", {}), true);

console.log("security tests passed");
