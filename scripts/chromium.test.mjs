import assert from "node:assert/strict";
import test from "node:test";
import { configuration, platformEnvironment, validateManifest } from "./chromium.mjs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("Chromium configuration keeps the checkout outside the application repository", () => {
  const config = configuration({ MINIMAL_CHROMIUM_WORKSPACE: "/tmp/minimal-chromium-test" });
  assert.equal(config.workspace, "/tmp/minimal-chromium-test");
  assert.equal(config.source, "/tmp/minimal-chromium-test/src");
  assert.match(config.argsFile, /chromium\/args\/performance\.gn$/);
});

test("Chromium manifest rejects floating or abbreviated revisions", () => {
  assert.throws(() => validateManifest({
    schemaVersion: 1,
    chromiumVersion: "latest",
    chromiumRevision: "24072c1",
    minimumFreeDiskGb: 180,
  }), /version must be exact/);
});

test("performance gates require repeated clean-profile measurements", () => {
  const gates = JSON.parse(readFileSync(resolve("chromium/performance-gates.json"), "utf8"));
  assert.ok(gates.measurement.measuredRuns >= 5);
  assert.equal(gates.measurement.cleanProfiles, true);
  assert.ok(gates.nonNegotiable.includes("sandbox_enabled"));
});

test("bootstrap initializes depot_tools before GN wrappers are used", () => {
  const source = readFileSync(resolve("scripts/chromium.mjs"), "utf8");
  assert.match(source, /ensureDepotTools\(config, options\)/);
  assert.match(source, /ensure_bootstrap/);
  assert.match(source, /bootstrap", "win_tools\.bat/);
});

test("macOS tooling automatically selects a standard full Xcode installation", () => {
  const environment = platformEnvironment({}, "darwin", (path) => path === "/Applications/Xcode.app/Contents/Developer");
  assert.equal(environment.DEVELOPER_DIR, "/Applications/Xcode.app/Contents/Developer");
});

test("macOS doctor checks for Xcode's separately installed Metal toolchain", () => {
  const source = readFileSync(resolve("scripts/chromium.mjs"), "utf8");
  assert.match(source, /xcrun", \["--find", "metal"\]/);
  assert.match(source, /xcodebuild -downloadComponent MetalToolchain/);
});
