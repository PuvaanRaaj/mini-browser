import type { BrowserCommand, BrowserState, LayoutRect } from "../lib/types";

declare global {
  interface Window {
    mini?: {
      platform: NodeJS.Platform;
      ready: () => Promise<BrowserState | null>;
      command: (command: BrowserCommand) => Promise<BrowserState>;
      layout: (rect: LayoutRect) => void;
      onState: (callback: (state: BrowserState) => void) => () => void;
      onFocusUrl: (callback: () => void) => () => void;
      onToggle: (callback: (what: "focus" | "authenticator") => void) => () => void;
    };
  }
}

export {};
