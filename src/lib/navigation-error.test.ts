import assert from "node:assert/strict";

import { navigationErrorCode, navigationErrorMessage } from "./navigation-error";

assert.equal(
  navigationErrorCode(new Error("Failed: ERR_ABORTED (-3)")),
  -3,
);
assert.equal(navigationErrorCode("net::ERR_NAME_NOT_RESOLVED"), -105);
assert.equal(navigationErrorCode("ERR_INTERNET_DISCONNECTED"), -106);
assert.equal(navigationErrorCode("ERR_CONNECTION_REFUSED"), -102);
assert.equal(navigationErrorCode("ERR_CONNECTION_TIMED_OUT"), -118);
assert.equal(navigationErrorCode("ERR_BLOCKED_BY_CLIENT"), -20);
assert.equal(navigationErrorCode("unknown failure"), -2);
assert.equal(
  navigationErrorMessage(-3, "https://example.com"),
  "The page stopped loading before it finished. Try again.",
);
assert.match(
  navigationErrorMessage(-105, "https://missing.example.com"),
  /could not find missing\.example\.com/i,
);
assert.match(navigationErrorMessage(-106, ""), /internet connection/i);
assert.match(
  navigationErrorMessage(-102, "https://example.com"),
  /refused the connection/i,
);
assert.match(navigationErrorMessage(-118, "https://example.com"), /too long/i);
assert.match(navigationErrorMessage(-20, "https://example.com"), /blocked/i);
assert.match(navigationErrorMessage(-2, "bad url"), /could not load this page/i);

console.log("navigation error tests passed");
