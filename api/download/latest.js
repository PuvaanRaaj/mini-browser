const GITHUB_REPOSITORY =
  "https://github.com/PuvaanRaaj/mini-browser";
const RELEASES_API =
  "https://api.github.com/repos/PuvaanRaaj/mini-browser/releases/latest";

/** GitHub swaps spaces for periods in asset names, so match loosely. */
const MATCHERS = {
  mac: [/\.dmg$/i],
  // Prefer the installer; fall back to the portable build.
  win: [/setup.*\.exe$/i, /\.exe$/i],
};

function platformFrom(request) {
  const url = new URL(request.url ?? "/", "https://placeholder.invalid");
  const asked = (url.searchParams.get("platform") ?? "").toLowerCase();
  if (asked === "mac" || asked === "win") return asked;

  const agent = (request.headers?.["user-agent"] ?? "").toLowerCase();
  if (agent.includes("windows")) return "win";
  return "mac";
}

export default async function handler(request, response) {
  const platform = platformFrom(request);

  try {
    const releaseResponse = await fetch(RELEASES_API, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (releaseResponse.ok) {
      const release = await releaseResponse.json();
      const assets = release.assets ?? [];

      for (const matcher of MATCHERS[platform]) {
        const asset = assets.find((item) => matcher.test(item.name));
        if (asset?.browser_download_url) {
          response.writeHead(302, { Location: asset.browser_download_url });
          response.end();
          return;
        }
      }
    }
  } catch {
    // Fall through to the releases page when GitHub is unavailable.
  }

  // No build for this platform yet, or GitHub is down: let people choose.
  response.writeHead(302, { Location: `${GITHUB_REPOSITORY}/releases` });
  response.end();
}
