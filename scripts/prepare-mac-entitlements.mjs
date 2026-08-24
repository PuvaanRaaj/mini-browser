import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const teamId = (process.env.MINIMAL_APPLE_TEAM_ID ?? "").trim().toUpperCase();
if (!/^[A-Z0-9]{10}$/.test(teamId)) {
  throw new Error("Set MINIMAL_APPLE_TEAM_ID to the 10-character Team ID used to sign Minimal.");
}

const outputDir = resolve(".build");
const group = `${teamId}.app.minimal.browser.webauthn`;
const entitlements = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>keychain-access-groups</key>
    <array>
      <string>${group}</string>
    </array>
  </dict>
</plist>
`;

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDir, "entitlements.mac.plist"), entitlements, { mode: 0o600 }),
  writeFile(
    resolve(outputDir, "webauthn.json"),
    `${JSON.stringify({ keychainAccessGroup: group }, null, 2)}\n`,
    { mode: 0o600 },
  ),
]);

console.log(`Prepared signed WebAuthn configuration for ${group}.`);
