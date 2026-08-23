import { mkdir, readFile, rm, writeFile, cp } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "public");
const packageJson = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
);
const version = packageJson.version ?? "0.1.0";
const template = await readFile(join(root, "website/index.html"), "utf8");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await writeFile(
  join(output, "index.html"),
  template.replaceAll("__OS__", "mac").replaceAll("__VERSION__", version),
);
await cp(join(root, "resources/icon.svg"), join(output, "icon.svg"));

console.log(`Built the Minimal landing page for Vercel (v${version}).`);
