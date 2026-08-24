import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  app,
  session as electronSession,
  shell,
  WebContentsView,
  type BrowserWindow,
  type Session,
} from "electron";

import { enableAdblock } from "./adblock";
import { navigationErrorCode, navigationErrorMessage } from "../lib/navigation-error";
import type { BrowserCommand, BrowserState, LayoutRect, TabInfo } from "../lib/types";
import { hostnameOf, resolveNavigation } from "../lib/url";
import {
  chromiumUserAgent,
  isAllowedExternalUrl,
  isAllowedWebUrl,
  rendererSandboxEnabled,
} from "./security";

const PERSISTENT_PARTITION = "persist:mini-signed-in";

function hostOf(url: string): string {
  return hostnameOf(url);
}

/**
 * Trust the bytes over the header. Plenty of servers hand back .ico as
 * application/octet-stream or with no type at all, and a login redirect arrives
 * as perfectly valid text/html.
 */
function imageTypeOf(bytes: Buffer, headerType: string | null): string | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") {
    return "image/png";
  }
  if (bytes.length >= 4 && bytes.subarray(0, 4).toString("hex") === "00000100") {
    return "image/x-icon";
  }
  if (bytes.length >= 3 && bytes.subarray(0, 3).toString("hex") === "ffd8ff") {
    return "image/jpeg";
  }
  if (bytes.length >= 6 && bytes.subarray(0, 6).toString("ascii") === "GIF89a") {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  const head = bytes.subarray(0, 256).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) return "image/svg+xml";
  // An HTML login page is the usual disguise; never inline that as an icon.
  if (head.startsWith("<!doctype html") || head.startsWith("<html")) return null;

  const declared = (headerType ?? "").split(";")[0].trim();
  return declared.startsWith("image/") ? declared : null;
}

type TabRecord = {
  id: string;
  view: WebContentsView | null;
  url: string;
  title: string;
  loading: boolean;
  error: string | null;
  isStartPage: boolean;
  favicon: string | null;
};

export class MiniSession {
  private tabs = new Map<string, TabRecord>();
  private order: string[] = [];
  private activeTabId: string | null = null;
  private sessionId = randomUUID();
  private guest: Session | null = null;
  private extensionLoaded = false;
  private adblockEnabled = false;
  private zoomByHost = new Map<string, number>();
  private persistSession = false;
  private layout: LayoutRect = { x: 0, y: 0, width: 1280, height: 720, visible: false };

  constructor(
    private readonly window: BrowserWindow,
    private readonly onState: () => void,
  ) {
    void this.loadZoomLevels();
    void this.loadPersistSession();
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
      adblockEnabled: this.adblockEnabled,
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
      case "moveTab":
        this.moveTab(command.id, command.toIndex);
        break;
      case "zoomIn":
        this.stepZoom(1);
        break;
      case "zoomOut":
        this.stepZoom(-1);
        break;
      case "zoomReset":
        this.stepZoom(0, true);
        break;
      case "resetSession":
        await this.reset();
        break;
    }
    this.onState();
    return this.getState();
  }

  async agentSnapshot(tabId?: string): Promise<unknown> {
    const view = this.agentView(tabId);
    return view.webContents.executeJavaScript(`(() => {
      const text = document.body?.innerText || "";
      const interactive = Array.from(document.querySelectorAll(
        "a,button,input,textarea,select,[role=button],[role=link]",
      )).slice(0, 200).map((element) => {
        const node = element;
        const isPassword = node instanceof HTMLInputElement && node.type === "password";
        return {
          tag: node.tagName.toLowerCase(),
          role: node.getAttribute("role"),
          label: node.getAttribute("aria-label"),
          text: (node.innerText || node.getAttribute("title") || "").trim().slice(0, 240),
          href: node instanceof HTMLAnchorElement ? node.href : undefined,
          value: isPassword ? undefined : node instanceof HTMLInputElement ? node.value : undefined,
          disabled: node instanceof HTMLButtonElement || node instanceof HTMLInputElement ? node.disabled : false,
        };
      });
      return {
        url: location.href,
        title: document.title,
        text: text.slice(0, 30000),
        interactive,
      };
    })()`, true);
  }

  async agentEvaluate(expression: string, tabId?: string): Promise<unknown> {
    if (!expression.trim() || expression.length > 100_000) {
      throw new Error("The evaluation expression is empty or too large.");
    }
    return this.agentView(tabId).webContents.executeJavaScript(expression, true);
  }

  async agentScreenshot(tabId?: string): Promise<Buffer> {
    const image = await this.agentView(tabId).webContents.capturePage();
    return image.toPNG();
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
    // "persist:" is what makes Chromium write the profile to disk. Without it
    // the partition lives in memory and dies with the window, which is the
    // default and the whole point of this browser.
    this.guest = electronSession.fromPartition(
      this.persistSession ? PERSISTENT_PARTITION : `mini-${this.sessionId}`,
    );
    this.guest.setPermissionCheckHandler(() => false);
    this.guest.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    // Google refuses sign-ins from embedded browsers ("This browser or app may
    // not be secure") when the UA carries tokens it does not recognise. Strip
    // both the Electron token and the app token ("Minimal/x.y.z", which sits
    // right before "Chrome/") so the UA matches the bundled Chromium exactly.
    this.guest.setUserAgent(chromiumUserAgent(this.guest.getUserAgent()));
    const session = this.guest;
    this.adblockEnabled = await enableAdblock(session);
    const sessionId = this.sessionId;
    void loadAuthenticatorExtension(session).then((loaded) => {
      if (this.sessionId !== sessionId || this.guest !== session) return;
      this.extensionLoaded = loaded;
      this.onState();
    });
    return session;
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
      favicon: null,
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
    this.layoutViews();
    this.onState();
    try {
      const view = await this.ensureView(tab);
      await view.webContents.loadURL(url);
    } catch (error) {
      if (this.tabs.get(id) !== tab || tab.url !== url) return;
      const code = navigationErrorCode(error);
      tab.error = navigationErrorMessage(code, url);
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
        // WSL2 kernels reject the shared-memory calls Chromium's renderer sandbox
        // needs, which crashes every tab. Keep the sandbox everywhere else.
        sandbox: rendererSandboxEnabled(),
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
      if (isAllowedWebUrl(url)) {
        const tab = this.createStartTab(true);
        void this.navigate(url, tab.id);
      } else if (isAllowedExternalUrl(url)) {
        void shell.openExternal(url);
      }
      return { action: "deny" };
    });
    wc.on("will-navigate", (details) => {
      if (!isAllowedWebUrl(details.url)) details.preventDefault();
    });
    wc.on("will-redirect", (details) => {
      if (details.isMainFrame && !isAllowedWebUrl(details.url)) details.preventDefault();
    });
    wc.on("page-favicon-updated", (_event, icons) => {
      void this.captureFavicon(tab, icons);
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
      tab.favicon = null;
      tab.url = url;
      this.applyZoom(tab);
      if (!tab.favicon) void this.captureFavicon(tab, []);
      tab.isStartPage = false;
      this.onState();
    });
    wc.on("did-navigate-in-page", (_event, url) => {
      tab.url = url;
      this.onState();
    });
    wc.on("did-fail-load", (_event, code, _desc, url, isMainFrame) => {
      if (!isMainFrame) return;
      tab.error = navigationErrorMessage(code, url);
      tab.loading = false;
      this.layoutViews();
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
    // An in-memory partition disappears on its own; a persistent one has to be
    // wiped, or "Reset Session" would quietly keep every cookie.
    if (this.persistSession && this.guest) {
      try {
        await this.guest.clearStorageData();
      } catch {
        // Best effort; a fresh partition name still follows below.
      }
    }
    for (const tab of this.tabs.values()) this.destroyView(tab);
    this.tabs.clear();
    this.order = [];
    this.guest = null;
    this.extensionLoaded = false;
    this.adblockEnabled = false;
    this.sessionId = randomUUID();
    this.createStartTab(true);
  }

  private destroyView(tab: TabRecord): void {
    const view = tab.view;
    tab.view = null;
    if (!view || this.window.isDestroyed()) return;

    const { webContents } = view;
    if (webContents.isDestroyed()) return;

    this.window.contentView.removeChildView(view);
    if (!webContents.isDestroyed()) webContents.close();
  }

  private layoutViews(): void {
    for (const [id, tab] of this.tabs) {
      if (!tab.view || tab.view.webContents.isDestroyed()) continue;
      const show =
        this.layout.visible &&
        id === this.activeTabId &&
        !tab.isStartPage &&
        !tab.error &&
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

  private agentView(tabId?: string): WebContentsView {
    const view = this.viewFor(tabId);
    if (!view) throw new Error("The requested tab has no loaded page.");
    return view;
  }

  private viewFor(tabId?: string): WebContentsView | null {
    const id = tabId ?? this.activeTabId;
    const tab = id ? this.tabs.get(id) : undefined;
    if (!tab?.view || tab.view.webContents.isDestroyed()) return null;
    return tab.view;
  }

  private activeView(): WebContentsView | null {
    return this.viewFor();
  }

  /**
   * Inline the page's own icon as a data URL. Fetched in the guest session from
   * a site the user just loaded, so this tells no one anything new — unlike
   * asking a favicon service, which would hand over the browsing history.
   */
  private async captureFavicon(tab: TabRecord, icons: string[]): Promise<void> {
    if (tab.isStartPage) return;

    // The reported icons first, then the conventional path. A site whose
    // declared icon 404s or redirects usually still serves /favicon.ico.
    const candidates = [...icons];
    try {
      const root = new URL(tab.url);
      candidates.push(new URL("/favicon.ico", root).href);
    } catch {
      // Not a URL we can resolve against; the declared icons are all we have.
    }

    for (const candidate of candidates) {
      const data = await this.fetchIcon(candidate);
      if (!data || tab.view?.webContents.isDestroyed()) continue;
      if (tab.favicon === data) return;
      tab.favicon = data;
      this.onState();
      return;
    }
  }

  private async fetchIcon(iconUrl: string): Promise<string | null> {
    try {
      const ses = await this.guestSession();
      // Without credentials the session's cookies are left out, so an icon
      // behind a login redirects to HTML and looks like a broken image.
      const response = await ses.fetch(iconUrl, { credentials: "include" });
      if (!response.ok) return null;

      const bytes = Buffer.from(await response.arrayBuffer());
      // Keeps a stray multi-megabyte "icon" out of the state we ship to the
      // renderer and out of saved bookmarks.
      if (bytes.byteLength === 0 || bytes.byteLength > 64 * 1024) return null;

      const type = imageTypeOf(bytes, response.headers.get("content-type"));
      if (!type) return null;

      return `data:${type};base64,${bytes.toString("base64")}`;
    } catch {
      // A missing icon is not worth surfacing; the letter badge covers it.
      return null;
    }
  }


  /** Chromium writes cookies lazily; quitting can outrun it. */
  async flush(): Promise<void> {
    if (!this.persistSession || !this.guest) return;
    try {
      await this.guest.cookies.flushStore();
    } catch {
      // Nothing useful to do if the store is already gone.
    }
  }

  async setPersistSession(enabled: boolean): Promise<void> {
    if (enabled === this.persistSession) return;

    // Turning this off has to wipe what was kept. Otherwise the profile sits on
    // disk looking deleted, and switching back on silently restores logins the
    // user believed they had discarded. Addressed by partition name rather than
    // through this.guest, which is null until the first tab creates it.
    if (!enabled) {
      try {
        const stored = electronSession.fromPartition(PERSISTENT_PARTITION);
        await stored.clearStorageData();
        await stored.clearCache();
        await stored.cookies.flushStore();
      } catch {
        // Best effort; the partition is abandoned either way.
      }
    }

    this.persistSession = enabled;
    try {
      await writeFile(
        join(app.getPath("userData"), "persist-session.json"),
        JSON.stringify({ persistSession: enabled }),
      );
    } catch {
      // The renderer re-sends this on every launch, so a failed write only
      // costs correctness for tabs opened before it reports.
    }
    // The partition is chosen when the session is built, so it has to be rebuilt.
    await this.reset();
    this.onState();
  }

  private async loadPersistSession(): Promise<void> {
    try {
      const raw = await readFile(
        join(app.getPath("userData"), "persist-session.json"),
        "utf8",
      );
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        this.persistSession = (parsed as { persistSession?: unknown }).persistSession === true;
      }
    } catch {
      // Never set; the in-memory default stands.
    }
  }

  private moveTab(id: string, toIndex: number): void {
    const from = this.order.indexOf(id);
    if (from === -1) return;
    const to = Math.max(0, Math.min(this.order.length - 1, toIndex));
    if (from === to) return;
    this.order.splice(from, 1);
    this.order.splice(to, 0, id);
    this.onState();
  }

  /**
   * Chromium's own zoom ladder: each step is a factor of 1.2, which is what
   * setZoomLevel counts in. Clamped to the range Chrome itself offers.
   */
  private stepZoom(direction: number, reset = false): void {
    const view = this.activeView();
    const tab = this.activeTabId ? this.tabs.get(this.activeTabId) : null;
    if (!view || !tab) return;

    const next = reset
      ? 0
      : Math.max(-4, Math.min(6, view.webContents.getZoomLevel() + direction * 0.5));
    view.webContents.setZoomLevel(next);

    const host = hostOf(tab.url);
    if (host) {
      if (next === 0) this.zoomByHost.delete(host);
      else this.zoomByHost.set(host, next);
      void this.saveZoomLevels();
    }
    this.onState();
  }

  /** Re-apply a host's remembered zoom once its page has committed. */
  private applyZoom(tab: TabRecord): void {
    if (!tab.view || tab.view.webContents.isDestroyed()) return;
    const level = this.zoomByHost.get(hostOf(tab.url)) ?? 0;
    tab.view.webContents.setZoomLevel(level);
  }

  private zoomPercent(tab: TabRecord): number {
    const wc = tab.view?.webContents;
    if (!wc || wc.isDestroyed()) return 100;
    return Math.round(1.2 ** wc.getZoomLevel() * 100);
  }

  private async saveZoomLevels(): Promise<void> {
    try {
      await writeFile(
        join(app.getPath("userData"), "zoom-levels.json"),
        JSON.stringify(Object.fromEntries(this.zoomByHost)),
      );
    } catch {
      // Zoom falling back to 100% next launch is not worth surfacing.
    }
  }

  private async loadZoomLevels(): Promise<void> {
    try {
      const raw = await readFile(
        join(app.getPath("userData"), "zoom-levels.json"),
        "utf8",
      );
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        for (const [host, level] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof level === "number") this.zoomByHost.set(host, level);
        }
      }
    } catch {
      // No saved levels yet.
    }
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
      favicon: tab.favicon,
      zoom: this.zoomPercent(tab),
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
  // "+" needs shift on most layouts, and the numpad sends its own keys.
  if (cmd && (key === "=" || key === "+" || key === "add")) {
    void session.handle({ type: "zoomIn" });
    return true;
  }
  if (cmd && (key === "-" || key === "_" || key === "subtract")) {
    void session.handle({ type: "zoomOut" });
    return true;
  }
  if (cmd && key === "0") {
    void session.handle({ type: "zoomReset" });
    return true;
  }
  if (cmd && key === ",") {
    window.webContents.send("mini:toggle", "settings");
    return true;
  }
  if (cmd && key === "d") {
    window.webContents.send("mini:toggle", "bookmark");
    return true;
  }
  if (cmd && input.shift && key === "b") {
    window.webContents.send("mini:toggle", "favorites");
    return true;
  }
  if (cmd && input.shift && key === "s") {
    window.webContents.send("mini:toggle", "sidebar");
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
