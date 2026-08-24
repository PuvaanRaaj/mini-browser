import { mkdir, readFile, rm, writeFile, cp } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "public");
const packageJson = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
);
const version = packageJson.version ?? "1.0.0";
const siteUrl = (process.env.SITE_URL ?? "https://mini-browser-v2.vercel.app").replace(/\/$/, "");
const hydrate = (value) =>
  value
    .replaceAll("__OS__", "mac")
    .replaceAll("__VERSION__", version)
    .replaceAll("__SITE_URL__", siteUrl);
const template = await readFile(join(root, "website/index.html"), "utf8");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await writeFile(join(output, "index.html"), hydrate(template));
await cp(join(root, "resources/icon.svg"), join(output, "icon.svg"));
await cp(join(root, "resources/icon.png"), join(output, "icon.png"));
await cp(join(root, "website/og.png"), join(output, "og.png"));
await writeFile(
  join(output, "robots.txt"),
  hydrate(await readFile(join(root, "website/robots.txt"), "utf8")),
);
await writeFile(
  join(output, "sitemap.xml"),
  hydrate(await readFile(join(root, "website/sitemap.xml"), "utf8")),
);

console.log(`Built the Minimal landing page for Vercel (v${version}) at ${siteUrl}.`);
