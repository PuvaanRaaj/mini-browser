import { randomUUID } from "node:crypto";
import { join } from "node:path";

import {
  app,
  session as electronSession,
  shell,
  WebContentsView,
  type BrowserWindow,
  type Session,
} from "electron";

import type { BrowserCommand, BrowserState, LayoutRect, TabInfo } from "../lib/types";
import { resolveNavigation } from "../lib/url";

type TabRecord = {
  id: string;
  view: WebContentsView | null;
  url: string;
  title: string;
  loading: boolean;
  error: string | null;
  isStartPage: boolean;
};

export class MiniSession {
  private tabs = new Map<string, TabRecord>();
  private order: string[] = [];
  private activeTabId: string | null = null;
  private sessionId = randomUUID();
  private guest: Session | null = null;
  private extensionLoaded = false;
  private layout: LayoutRect = { x: 0, y: 0, width: 1280, height: 720, visible: false };

  constructor(
    private readonly window: BrowserWindow,
    private readonly onState: () => void,
  ) {
    this.createStartTab(true);
  }

  getState(): BrowserState {
    return {
      tabs: this.order.map((id) => this.toInfo(this.tabs.get(id)!)),
      activeTabId: this.activeTabId,
      sessionId: this.sessionId,
      status: "ready",
      error: null,
      extensionLoaded: this.extensionLoaded,
    };
  }

  applyLayout(rect: LayoutRect): void {
    this.layout = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.max(0, Math.round(rect.width)),
      height: Math.max(0, Math.round(rect.height)),
      visible: rect.visible,
    };
    this.layoutViews();
  }

  async handle(command: BrowserCommand): Promise<BrowserState> {
    switch (command.type) {
      case "navigate":
        await this.navigate(command.url, command.tabId);
        break;
      case "back":
        this.activeView()?.webContents.navigationHistory.goBack();
        break;
      case "forward":
        this.activeView()?.webContents.navigationHistory.goForward();
        break;
      case "reload":
        this.activeView()?.webContents.reload();
        break;
      case "stop":
        this.activeView()?.webContents.stop();
        break;
      case "newTab":
        this.createStartTab(true);
        this.layoutViews();
        break;
      case "closeTab":
        this.closeTab(command.id);
        break;
      case "switchTab":
        this.switchTab(command.id);
        break;
      case "resetSession":
        await this.reset();
        break;
    }
    this.onState();
    return this.getState();
  }

  destroy(): void {
    for (const tab of this.tabs.values()) {
      this.destroyView(tab);
    }
    this.tabs.clear();
    this.order = [];
  }

  private async guestSession(): Promise<Session> {
    if (this.guest) return this.guest;
    this.guest = electronSession.fromPartition(`mini-${this.sessionId}`);
    this.guest.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    this.guest.setUserAgent(this.guest.getUserAgent().replace(/Electron\/\S+\s/g, ""));
    this.extensionLoaded = await loadAuthenticatorExtension(this.guest);
    return this.guest;
  }

  private createStartTab(activate: boolean): TabRecord {
    const tab: TabRecord = {
      id: randomUUID(),
      view: null,
      url: "",
      title: "New tab",
      loading: false,
      error: null,
      isStartPage: true,
    };
    this.tabs.set(tab.id, tab);
    this.order.push(tab.id);
    if (activate) this.activeTabId = tab.id;
    return tab;
  }

  private async navigate(input: string, tabId?: string): Promise<void> {
    const url = resolveNavigation(input);
    if (!url) return;
    const id = tabId ?? this.activeTabId ?? this.createStartTab(true).id;
    this.activeTabId = id;
    const tab = this.tabs.get(id) ?? this.createStartTab(true);
    tab.isStartPage = false;
    tab.loading = true;
    tab.error = null;
    tab.url = url;
    tab.title = hostname(url) || "Loading";
    this.onState();
    const view = await this.ensureView(tab);
    try {
      await view.webContents.loadURL(url);
    } catch (error) {
      tab.error = error instanceof Error ? error.message : "Navigation failed.";
      tab.loading = false;
    }
    this.layoutViews();
  }

  private async ensureView(tab: TabRecord): Promise<WebContentsView> {
    if (tab.view && !tab.view.webContents.isDestroyed()) return tab.view;
    const ses = await this.guestSession();
    const view = new WebContentsView({
      webPreferences: {
        session: ses,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    tab.view = view;
    view.setBackgroundColor("#ffffff");
    this.window.contentView.addChildView(view);
    this.bind(tab, view);
    return view;
  }

  private bind(tab: TabRecord, view: WebContentsView): void {
    const wc = view.webContents;
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) {
        const tab = this.createStartTab(true);
        void this.navigate(url, tab.id);
      } else {
        void shell.openExternal(url);
      }
      return { action: "deny" };
    });
    wc.on("page-title-updated", (_event, title) => {
      tab.title = title || tab.title;
      this.onState();
    });
    wc.on("did-start-loading", () => {
      tab.loading = true;
      this.onState();
    });
    wc.on("did-stop-loading", () => {
      tab.loading = false;
      tab.url = wc.getURL();
      tab.title = wc.getTitle() || tab.title;
      this.onState();
    });
    wc.on("did-navigate", (_event, url) => {
      tab.url = url;
      tab.isStartPage = false;
      this.onState();
    });
    wc.on("did-navigate-in-page", (_event, url) => {
      tab.url = url;
      this.onState();
    });
    wc.on("did-fail-load", (_event, code, desc, url, isMainFrame) => {
      if (!isMainFrame || code === -3) return;
      tab.error = desc || `Failed to load ${url}`;
      tab.loading = false;
      this.onState();
    });
    wc.on("before-input-event", (event, input) => {
      if (routeBrowserShortcut(input, this.window, this)) event.preventDefault();
    });
  }

  private closeTab(id: string): void {
    const tab = this.tabs.get(id);
    if (!tab) return;
    this.destroyView(tab);
    this.tabs.delete(id);
    this.order = this.order.filter((item) => item !== id);
    if (this.activeTabId === id) {
      this.activeTabId = this.order.at(-1) ?? null;
    }
    if (this.tabs.size === 0) this.createStartTab(true);
    this.layoutViews();
  }

  private switchTab(id: string): void {
    if (!this.tabs.has(id)) return;
    this.activeTabId = id;
    this.layoutViews();
    const view = this.tabs.get(id)?.view;
    if (view && this.layout.visible) view.webContents.focus();
  }

  private async reset(): Promise<void> {
    for (const tab of this.tabs.values()) this.destroyView(tab);
    this.tabs.clear();
    this.order = [];
    this.guest = null;
    this.extensionLoaded = false;
    this.sessionId = randomUUID();
    this.createStartTab(true);
  }

  private destroyView(tab: TabRecord): void {
    if (!tab.view) return;
    if (!tab.view.webContents.isDestroyed()) {
      this.window.contentView.removeChildView(tab.view);
      tab.view.webContents.close();
    }
    tab.view = null;
  }

  private layoutViews(): void {
    for (const [id, tab] of this.tabs) {
      if (!tab.view || tab.view.webContents.isDestroyed()) continue;
      const show =
        this.layout.visible &&
        id === this.activeTabId &&
        !tab.isStartPage &&
        this.layout.width > 0 &&
        this.layout.height > 0;
      tab.view.setVisible(show);
      if (show) {
        tab.view.setBounds({
          x: this.layout.x,
          y: this.layout.y,
          width: this.layout.width,
          height: this.layout.height,
        });
      }
    }
  }

  private activeView(): WebContentsView | null {
    const tab = this.activeTabId ? this.tabs.get(this.activeTabId) : undefined;
    if (!tab?.view || tab.view.webContents.isDestroyed()) return null;
    return tab.view;
  }

  private toInfo(tab: TabRecord): TabInfo {
    const history = tab.view?.webContents.navigationHistory;
    return {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      loading: tab.loading,
      canGoBack: history?.canGoBack() ?? false,
      canGoForward: history?.canGoForward() ?? false,
      isStartPage: tab.isStartPage,
      error: tab.error,
    };
  }
}

export function routeBrowserShortcut(
  input: Electron.Input,
  window: BrowserWindow,
  session: MiniSession,
): boolean {
  if (input.type !== "keyDown") return false;
  const cmd = process.platform === "darwin" ? input.meta : input.control;
  const key = input.key.toLowerCase();

  if (cmd && key === "l") {
    window.webContents.focus();
    window.webContents.send("mini:focus-url");
    return true;
  }
  if (cmd && key === "t") {
    void session.handle({ type: "newTab" });
    return true;
  }
  if (cmd && key === "w") {
    const state = session.getState();
    if (state.activeTabId) void session.handle({ type: "closeTab", id: state.activeTabId });
    return true;
  }
  if (cmd && key === "r") {
    void session.handle({ type: "reload" });
    return true;
  }
  if (cmd && input.shift && key === "f") {
    window.webContents.send("mini:toggle", "focus");
    return true;
  }
  if (cmd && input.shift && key === "a") {
    window.webContents.send("mini:toggle", "authenticator");
    return true;
  }
  if (cmd && key === "[") {
    void session.handle({ type: "back" });
    return true;
  }
  if (cmd && key === "]") {
    void session.handle({ type: "forward" });
    return true;
  }
  if (input.alt && key === "arrowleft") {
    void session.handle({ type: "back" });
    return true;
  }
  if (input.alt && key === "arrowright") {
    void session.handle({ type: "forward" });
    return true;
  }
  return false;
}

async function loadAuthenticatorExtension(ses: Session): Promise<boolean> {
    const dir = app.isPackaged
      ? join(process.resourcesPath, "extension")
      : join(process.cwd(), "extension");
  try {
    await ses.loadExtension(dir, { allowFileAccess: true });
    return true;
  } catch {
    return false;
  }
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
