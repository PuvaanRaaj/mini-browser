import assert from "node:assert/strict";
import test from "node:test";
import { configuration, validateManifest } from "./chromium.mjs";
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
