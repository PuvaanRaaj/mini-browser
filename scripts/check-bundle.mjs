import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const assetsDir = join(process.cwd(), "out", "renderer", "assets");
const files = await readdir(assetsDir);
const entry = files.find((file) => /^index-[^/]+\.js$/.test(file));
const stylesheet = files.find((file) => /^index-[^/]+\.css$/.test(file));
if (!entry || !stylesheet) {
  throw new Error("Could not find the renderer entry assets.");
}

const [entryStats, cssStats] = await Promise.all([
  stat(join(assetsDir, entry)),
  stat(join(assetsDir, stylesheet)),
]);
const maxEntryBytes = 1_100_000;
const maxCssBytes = 80_000;
console.log(`renderer entry: ${entryStats.size} bytes`);
console.log(`renderer CSS: ${cssStats.size} bytes`);
if (entryStats.size > maxEntryBytes) {
  throw new Error(`Renderer entry exceeds ${maxEntryBytes} bytes.`);
}
if (cssStats.size > maxCssBytes) {
  throw new Error(`Renderer CSS exceeds ${maxCssBytes} bytes.`);
}
