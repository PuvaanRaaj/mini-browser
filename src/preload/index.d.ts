import type { BrowserCommand, BrowserState, LayoutRect } from "../lib/types";

declare global {
  interface Window {
    mini?: {
      platform: NodeJS.Platform;
      ready: () => Promise<BrowserState | null>;
      command: (command: BrowserCommand) => Promise<BrowserState>;
      layout: (rect: LayoutRect) => void;
      chromeTheme: (theme: "light" | "dark") => void;
      onState: (callback: (state: BrowserState) => void) => () => void;
      onFocusUrl: (callback: () => void) => () => void;
      onToggle: (callback: (what: "focus" | "authenticator" | "sidebar" | "bookmark" | "favorites" | "settings") => void) => () => void;
    };
  }
}

export {};
