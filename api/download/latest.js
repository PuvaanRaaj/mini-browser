const GITHUB_REPOSITORY =
  "https://github.com/PuvaanRaaj/mini-browser";
const RELEASES_API =
  "https://api.github.com/repos/PuvaanRaaj/mini-browser/releases/latest";

export default async function handler(_request, response) {
  try {
    const releaseResponse = await fetch(RELEASES_API, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (releaseResponse.ok) {
      const release = await releaseResponse.json();
      const asset = release.assets?.find((item) => /\.dmg$/i.test(item.name));
      if (asset?.browser_download_url) {
        response.writeHead(302, { Location: asset.browser_download_url });
        response.end();
        return;
      }
    }
  } catch {
    // Fall through to the releases page when GitHub is unavailable.
  }

  response.writeHead(302, { Location: `${GITHUB_REPOSITORY}/releases` });
  response.end();
}
