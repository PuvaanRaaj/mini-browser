export function navigationErrorCode(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error);
  if (/ERR_ABORTED|-3/.test(message)) return -3;
  if (/ERR_NAME_NOT_RESOLVED|-105/.test(message)) return -105;
  if (/ERR_INTERNET_DISCONNECTED|-106/.test(message)) return -106;
  if (/ERR_CONNECTION_REFUSED|-102/.test(message)) return -102;
  if (/ERR_CONNECTION_TIMED_OUT|-118/.test(message)) return -118;
  if (/ERR_BLOCKED_BY_CLIENT|-20/.test(message)) return -20;
  return -2;
}

export function navigationErrorMessage(code: number, url: string): string {
  const host = hostname(url) || "this page";
  switch (code) {
    case -3:
      return "The page stopped loading before it finished. Try again.";
    case -105:
      return `We could not find ${host}. Check the address and try again.`;
    case -106:
      return "There is no internet connection. Check your network and try again.";
    case -102:
      return `${host} refused the connection. Try again in a moment.`;
    case -118:
      return `${host} took too long to respond. Try again.`;
    case -20:
      return "This request was blocked by the browser's protection rules.";
    default:
      return `We could not load ${host}. Try again or check the address.`;
  }
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
