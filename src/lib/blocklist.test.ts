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
  "! comment\n  ||ads.example.com^\n||tracker.test^\n@@||keep.example.com^\n||UPPER.example^\n",
);
assert.deepEqual(parsed, ["ads.example.com", "tracker.test", "upper.example"]);

// Narrower rules must never flatten to whole-host blocks: a path/wildcard rule
// for one endpoint (this took down all of x.com) or a context-scoped rule is
// not something a hostname blocker can express.
const narrowed = parseEasyListHosts(
  "||x.com^*/log.json\n||ads.example.com^$third-party\n||ads.example.com^$script\n||ads.example.com^$image,third-party\n",
);
assert.deepEqual(narrowed, []);

console.log("blocklist tests passed");
