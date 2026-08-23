import assert from "node:assert/strict";

import { hostIsBlocked, parseEasyListHosts } from "../main/blocklist";

assert.equal(hostIsBlocked("pagead2.googlesyndication.com", ["googlesyndication.com"]), true);
assert.equal(hostIsBlocked("fiuu.com", ["googlesyndication.com"]), false);
assert.equal(hostIsBlocked("notdoubleclick.net", ["doubleclick.net"]), false);
assert.equal(hostIsBlocked("ADS.GOOGLESYNDICATION.COM.", ["googlesyndication.com"]), true);
assert.equal(hostIsBlocked("example.com", ["", "example.com/path"]), false);
assert.equal(hostIsBlocked("example.com", ["", "example.com"]), true);
assert.equal(hostIsBlocked("example.com.evil.test", ["example.com"]), false);
assert.equal(hostIsBlocked("", ["example.com"]), false);

const parsed = parseEasyListHosts(
  "! comment\n  ||ads.example.com^\n||tracker.test^\n@@||keep.example.com^\n||UPPER.example^\n||invalid.example/path\n",
);
assert.deepEqual(parsed, ["ads.example.com", "tracker.test", "upper.example"]);

console.log("blocklist tests passed");
