import type { BrowserCommand, BrowserState, LayoutRect, PageCapture } from "../lib/types";
import type { GoogleAuthAPI, VaultAPI } from "../lib/vault-types";

declare global {
  interface Window {
    mini?: {
      platform: NodeJS.Platform;
      vault: VaultAPI;
      googleAuth: GoogleAuthAPI;
      ready: () => Promise<BrowserState | null>;
      command: (command: BrowserCommand) => Promise<BrowserState>;
      captureActivePage: () => Promise<PageCapture>;
      layout: (rect: LayoutRect) => void;
      chromeTheme: (theme: "light" | "dark") => void;
      persistSession: (enabled: boolean) => void;
      onState: (callback: (state: BrowserState) => void) => () => void;
      onFocusUrl: (callback: () => void) => () => void;
      onToggle: (callback: (what: "focus" | "authenticator" | "sidebar" | "bookmark" | "favorites" | "settings") => void) => () => void;
    };
  }
}

export {};
