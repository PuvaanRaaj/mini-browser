import assert from "node:assert/strict";

import { hostIsBlocked, parseEasyListHosts } from "../main/blocklist";

assert.equal(hostIsBlocked("pagead2.googlesyndication.com", ["googlesyndication.com"]), true);
assert.equal(hostIsBlocked("fiuu.com", ["googlesyndication.com"]), false);
assert.equal(hostIsBlocked("notdoubleclick.net", ["doubleclick.net"]), false);

const parsed = parseEasyListHosts("! comment\n||ads.example.com^\n||tracker.test^\n@@||keep.example.com^\n");
assert.deepEqual(parsed, ["ads.example.com", "tracker.test"]);

console.log("blocklist tests passed");
