import { readFileSync } from "node:fs";

export type PackagedWebAuthnConfig = { keychainAccessGroup: string };

const TEAM_ID = /^[A-Z0-9]{10}$/;
const ACCESS_GROUP = /^[A-Z0-9]{10}\.app\.minimal\.browser\.webauthn$/;

export function keychainAccessGroup(teamId: string): string {
  const normalized = teamId.trim().toUpperCase();
  if (!TEAM_ID.test(normalized)) {
    throw new Error("MINIMAL_APPLE_TEAM_ID must be a 10-character Apple Team ID.");
  }
  return `${normalized}.app.minimal.browser.webauthn`;
}

export function readPackagedWebAuthnConfig(path: string): PackagedWebAuthnConfig | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const group = (parsed as { keychainAccessGroup?: unknown }).keychainAccessGroup;
    return typeof group === "string" && ACCESS_GROUP.test(group)
      ? { keychainAccessGroup: group }
      : null;
  } catch {
    return null;
  }
}
