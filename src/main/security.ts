const WEB_PROTOCOLS = new Set(["http:", "https:"]);
const EXTERNAL_PROTOCOLS = new Set(["mailto:", "tel:", "sms:"]);

export function isWsl(
  platform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return platform === "linux" && Boolean(environment.WSL_DISTRO_NAME || environment.WSL_INTEROP);
}

export function rendererSandboxEnabled(
  platform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return !isWsl(platform, environment);
}

export function isAllowedWebUrl(value: string): boolean {
  try {
    return WEB_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function isAllowedExternalUrl(value: string): boolean {
  try {
    return EXTERNAL_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** Present the bundled Chromium accurately without Electron/app identity tokens. */
export function chromiumUserAgent(value: string): string {
  return value
    .replace(/\sElectron\/\S+/g, "")
    .replace(/\s[A-Za-z][\w.-]*\/\d[\d.]*\s+(?=Chrome\/)/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
