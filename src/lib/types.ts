export type TabInfo = {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isStartPage: boolean;
  /** The page's own icon, inlined as a data URL. */
  favicon: string | null;
  /** Page zoom as a percentage; 100 when untouched. */
  zoom: number;
  error: string | null;
};

export type TabPosition = "top" | "side";

export type FavoritesMode = "always" | "hover" | "never";

export type MiniSettings = {
  tabPosition: TabPosition;
  favoritesMode: FavoritesMode;
  restoreSession: boolean;
};

export type Bookmark = {
  id: string;
  url: string;
  title: string;
  favicon: string | null;
  createdAt: number;
};

export type BrowserState = {
  tabs: TabInfo[];
  activeTabId: string | null;
  sessionId: string;
  status: "ready" | "error";
  error: string | null;
  extensionLoaded: boolean;
  adblockEnabled: boolean;
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
  | { type: "moveTab"; id: string; toIndex: number }
  | { type: "zoomIn" }
  | { type: "zoomOut" }
  | { type: "zoomReset" }
  | { type: "resetSession" };

export type LayoutRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
};
