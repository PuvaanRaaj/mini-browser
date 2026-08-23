import assert from "node:assert/strict";

import { displayUrl, faviconFor, resolveNavigation } from "./url";

assert.equal(resolveNavigation("https://example.com/path"), "https://example.com/path");
assert.equal(resolveNavigation("http://localhost:4321"), "http://localhost:4321");
assert.equal(resolveNavigation("127.0.0.1:3000/test"), "http://127.0.0.1:3000/test");
assert.equal(resolveNavigation("//example.com"), "https://example.com");
assert.equal(resolveNavigation("example.com/docs"), "https://example.com/docs");
assert.equal(resolveNavigation("electron browser"), "https://duckduckgo.com/?q=electron%20browser");
assert.equal(resolveNavigation("   "), "");

assert.equal(displayUrl(""), "");
assert.equal(displayUrl("about:blank"), "");
assert.equal(displayUrl("https://duckduckgo.com/?q=electron%20browser"), "electron browser");
assert.equal(displayUrl("https://www.example.com/path"), "www.example.com/path");
assert.equal(displayUrl("not a URL"), "not a URL");

assert.equal(
  faviconFor("https://example.com/path"),
  "https://www.google.com/s2/favicons?sz=32&domain=example.com",
);
assert.equal(faviconFor("not a URL"), null);

console.log("url tests passed");
