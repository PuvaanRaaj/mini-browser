export function isMacClient(): boolean {
  if (typeof window !== "undefined" && window.mini?.platform === "darwin") return true;
  if (typeof navigator === "undefined") return false;
  return /mac/i.test(navigator.platform) || /mac/i.test(navigator.userAgent);
}

export function modLabel(): string {
  return isMacClient() ? "⌘" : "Ctrl";
}
