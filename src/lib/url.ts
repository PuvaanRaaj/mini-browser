const DOMAIN_LIKE =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+([/:?#].*)?$/i;
const LOCAL_HOST = /^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?([/?#].*)?$/i;

export function resolveNavigation(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  if (/^https?:/i.test(trimmed)) return trimmed;
  if (/^about:blank$/i.test(trimmed)) return "about:blank";
  // Never turn local-file or active-content schemes into browser navigation.
  // Unknown schemes are rejected instead of being passed to Chromium or the OS.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return "";
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (LOCAL_HOST.test(trimmed)) return `http://${trimmed}`;
  if (DOMAIN_LIKE.test(trimmed) && !/\s/.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
}

export function displayUrl(url: string): string {
  if (!url || url === "about:blank") return "";
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "duckduckgo.com" && parsed.searchParams.has("q")) {
      return parsed.searchParams.get("q") ?? url;
    }
    return url.replace(/^https:\/\//, "");
  } catch {
    return url;
  }
}

export function faviconFor(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname) return null;
    return `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(parsed.hostname)}`;
  } catch {
    return null;
  }
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
