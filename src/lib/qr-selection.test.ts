import assert from "node:assert/strict";

import { selectionToImageRect } from "./qr-selection";

assert.deepEqual(
  selectionToImageRect(
    { start: { x: 300, y: 200 }, end: { x: 100, y: 50 } },
    { width: 400, height: 300 },
    { width: 800, height: 600 },
  ),
  { x: 200, y: 100, width: 400, height: 300 },
);

assert.deepEqual(
  selectionToImageRect(
    { start: { x: -20, y: 20 }, end: { x: 500, y: 320 } },
    { width: 400, height: 300 },
    { width: 800, height: 600 },
  ),
  { x: 0, y: 40, width: 800, height: 560 },
);

assert.throws(
  () => selectionToImageRect(
    { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
    { width: 0, height: 1 },
    { width: 1, height: 1 },
  ),
  /positive/,
);

console.log("QR selection tests passed");
