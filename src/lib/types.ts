export type TabInfo = {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isStartPage: boolean;
  error: string | null;
};

export type BrowserState = {
  tabs: TabInfo[];
  activeTabId: string | null;
  sessionId: string;
  status: "idle" | "starting" | "ready" | "error";
  error: string | null;
  extensionLoaded: boolean;
};

export type FramePayload = {
  tabId: string;
  data: string;
};

export type BrowserCommand =
  | { type: "navigate"; url: string; tabId?: string }
  | { type: "back" }
  | { type: "forward" }
  | { type: "reload" }
  | { type: "stop" }
  | { type: "newTab" }
  | { type: "closeTab"; id: string }
  | { type: "switchTab"; id: string }
  | {
      type: "click";
      x: number;
      y: number;
      width: number;
      height: number;
      button?: "left" | "right" | "middle";
      clickCount?: number;
    }
  | {
      type: "move";
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      type: "wheel";
      x: number;
      y: number;
      width: number;
      height: number;
      deltaX: number;
      deltaY: number;
    }
  | { type: "type"; text: string }
  | {
      type: "key";
      key: string;
      code?: string;
      down: boolean;
      modifiers: {
        alt: boolean;
        ctrl: boolean;
        meta: boolean;
        shift: boolean;
      };
    }
  | { type: "resize"; width: number; height: number }
  | { type: "resetSession" }
  | { type: "copySelection" };

export type CopyResult = {
  text: string;
};

export type CommandResult = {
  state: BrowserState;
  copied?: string;
};
