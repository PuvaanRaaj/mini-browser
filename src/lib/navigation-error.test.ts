import assert from "node:assert/strict";

import { navigationErrorCode, navigationErrorMessage } from "./navigation-error";

assert.equal(
  navigationErrorCode(new Error("Failed: ERR_ABORTED (-3)")),
  -3,
);
assert.equal(
  navigationErrorMessage(-3, "https://example.com"),
  "The page stopped loading before it finished. Try again.",
);
assert.match(
  navigationErrorMessage(-105, "https://missing.example.com"),
  /could not find missing\.example\.com/i,
);

console.log("navigation error tests passed");
