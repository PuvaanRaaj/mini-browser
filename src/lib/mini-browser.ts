import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  chromium,
  type BrowserContext,
  type CDPSession,
  type Page,
} from "playwright";

import type {
  BrowserCommand,
  BrowserState,
  CommandResult,
  FramePayload,
  TabInfo,
} from "@/lib/types";
import { resolveNavigation } from "@/lib/url";

type TabRecord = {
  id: string;
  page: Page | null;
  cdp: CDPSession | null;
  url: string;
  title: string;
  loading: boolean;
  error: string | null;
  isStartPage: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
};

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/local/bin/google-chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter((value): value is string => Boolean(value));

function randomId(): string {
  return crypto.randomUUID();
}

function mapKey(key: string, code?: string): string {
  const special: Record<string, string> = {
    Escape: "Escape",
    Enter: "Enter",
    Tab: "Tab",
    Backspace: "Backspace",
    Delete: "Delete",
    ArrowUp: "ArrowUp",
    ArrowDown: "ArrowDown",
    ArrowLeft: "ArrowLeft",
    ArrowRight: "ArrowRight",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    " ": "Space",
  };
  if (special[key]) return special[key];
  if (key.length === 1) return key;
  if (code?.startsWith("Key") && code.length === 4) return code.slice(3).toLowerCase();
  return key;
}

export class MiniBrowser extends EventEmitter {
  private context: BrowserContext | null = null;
  private userDataDir: string | null = null;
  private tabs = new Map<string, TabRecord>();
  private order: string[] = [];
  private activeTabId: string | null = null;
  private sessionId = randomId();
  private status: BrowserState["status"] = "idle";
  private error: string | null = null;
  private extensionLoaded = false;
  private viewport = { width: 1280, height: 800 };
  private starting: Promise<void> | null = null;
  private expectingPage = false;

  getState(): BrowserState {
    return {
      tabs: this.order.map((id) => this.toTabInfo(this.tabs.get(id)!)),
      activeTabId: this.activeTabId,
      sessionId: this.sessionId,
      status: this.status,
      error: this.error,
      extensionLoaded: this.extensionLoaded,
    };
  }

  async ensureStarted(): Promise<void> {
    if (this.context) return;
    if (this.starting) return this.starting;
    this.starting = this.start();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  async handle(command: BrowserCommand): Promise<CommandResult> {
    await this.ensureStarted();

    switch (command.type) {
      case "navigate":
        await this.navigate(command.url, command.tabId);
        break;
      case "back":
        await this.activePage()?.goBack().catch(() => undefined);
        break;
      case "forward":
        await this.activePage()?.goForward().catch(() => undefined);
        break;
      case "reload":
        await this.activePage()?.reload().catch(() => undefined);
        break;
      case "stop":
        await this.activePage()?.evaluate(() => window.stop()).catch(() => undefined);
        break;
      case "newTab":
        this.createStartTab(true);
        break;
      case "closeTab":
        await this.closeTab(command.id);
        break;
      case "switchTab":
        await this.switchTab(command.id);
        break;
      case "click":
        await this.mouseClick(command);
        break;
      case "move":
        await this.mouseMove(command);
        break;
      case "wheel":
        await this.mouseWheel(command);
        break;
      case "type":
        await this.activePage()?.keyboard.type(command.text);
        break;
      case "key":
        await this.handleKey(command);
        break;
      case "resize":
        await this.resize(command.width, command.height);
        break;
      case "resetSession":
        await this.resetSession();
        break;
      case "copySelection": {
        const copied = await this.copySelection();
        this.emitState();
        return { state: this.getState(), copied };
      }
    }

    this.emitState();
    return { state: this.getState() };
  }

  private async start(): Promise<void> {
    this.status = "starting";
    this.error = null;
    this.emitState();

    try {
      await this.launchContext();
      this.status = "ready";
      if (this.tabs.size === 0) this.createStartTab(true);
      this.emitState();
    } catch (error) {
      this.status = "error";
      this.error =
        error instanceof Error
          ? error.message
          : "Chromium failed to start. Install Chrome or run `npx playwright install chromium`.";
      this.emitState();
      throw error;
    }
  }

  private async launchContext(): Promise<void> {
    this.userDataDir = await mkdtemp(path.join(os.tmpdir(), "mini-profile-"));
    const extensionPath = path.join(process.cwd(), "extension");
    const commonArgs = [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--hide-scrollbars",
      "--disable-blink-features=AutomationControlled",
    ];

    const attempts: Array<{
      name: string;
      options: Parameters<typeof chromium.launchPersistentContext>[1];
      extension: boolean;
    }> = [];

    for (const executablePath of CHROME_CANDIDATES) {
      attempts.push({
        name: `chrome+extension:${executablePath}`,
        extension: true,
        options: {
          executablePath,
          headless: true,
          viewport: this.viewport,
          ignoreDefaultArgs: ["--disable-extensions", "--enable-automation"],
          args: [
            ...commonArgs,
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
          ],
        },
      });
      attempts.push({
        name: `chrome:${executablePath}`,
        extension: false,
        options: {
          executablePath,
          headless: true,
          viewport: this.viewport,
          ignoreDefaultArgs: ["--enable-automation"],
          args: commonArgs,
        },
      });
    }

    attempts.push({
      name: "playwright-chromium",
      extension: false,
      options: {
        headless: true,
        viewport: this.viewport,
        ignoreDefaultArgs: ["--enable-automation"],
        args: commonArgs,
      },
    });

    let lastError: unknown;
    for (const attempt of attempts) {
      try {
        this.context = await chromium.launchPersistentContext(
          this.userDataDir,
          attempt.options,
        );
        this.extensionLoaded = attempt.extension;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!this.context) {
      throw lastError instanceof Error
        ? lastError
        : new Error("Could not launch Chromium.");
    }

    this.context.setDefaultTimeout(15_000);
    this.context.on("page", (page) => {
      void this.adoptPopup(page);
    });

    for (const page of this.context.pages()) {
      await page.close().catch(() => undefined);
    }
  }

  private async resetSession(): Promise<void> {
    const oldDir = this.userDataDir;
    const oldContext = this.context;
    this.context = null;
    this.userDataDir = null;
    this.tabs.clear();
    this.order = [];
    this.activeTabId = null;
    this.sessionId = randomId();
    this.extensionLoaded = false;
    this.status = "idle";

    await oldContext?.close().catch(() => undefined);
    if (oldDir) {
      await rm(oldDir, { recursive: true, force: true }).catch(() => undefined);
    }

    await this.ensureStarted();
  }

  private createStartTab(activate: boolean): TabRecord {
    const id = randomId();
    const tab: TabRecord = {
      id,
      page: null,
      cdp: null,
      url: "",
      title: "New tab",
      loading: false,
      error: null,
      isStartPage: true,
      canGoBack: false,
      canGoForward: false,
    };
    this.tabs.set(id, tab);
    this.order.push(id);
    if (activate) this.activeTabId = id;
    return tab;
  }

  private async navigate(input: string, tabId?: string): Promise<void> {
    const url = resolveNavigation(input);
    if (!url) return;

    const id = tabId ?? this.activeTabId ?? this.createStartTab(true).id;
    this.activeTabId = id;
    let tab = this.tabs.get(id);
    if (!tab) {
      tab = this.createStartTab(true);
    }

    tab.loading = true;
    tab.error = null;
    tab.isStartPage = false;
    tab.url = url;
    tab.title = hostnameOfSafe(url) || "Loading";
    this.emitState();

    try {
      const page = await this.ensurePage(tab);
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await this.refreshTab(tab);
      if (this.activeTabId === tab.id) await this.startScreencast(tab);
    } catch (error) {
      tab.error = error instanceof Error ? error.message : "Navigation failed.";
      tab.loading = false;
    }
  }

  private async ensurePage(tab: TabRecord): Promise<Page> {
    if (tab.page && !tab.page.isClosed()) return tab.page;
    if (!this.context) throw new Error("Chromium is not running.");
    this.expectingPage = true;
    try {
      const page = await this.context.newPage();
      await page.setViewportSize(this.viewport);
      this.bindPage(tab, page);
      return page;
    } finally {
      this.expectingPage = false;
    }
  }

  private bindPage(tab: TabRecord, page: Page): void {
    tab.page = page;

    page.on("load", () => {
      void this.refreshTab(tab).then(() => this.emitState());
    });
    page.on("domcontentloaded", () => {
      void this.refreshTab(tab).then(() => this.emitState());
    });
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        tab.url = page.url();
        tab.isStartPage = false;
        this.emitState();
      }
    });
    page.on("close", () => {
      if (this.tabs.get(tab.id)?.page === page) {
        tab.page = null;
        tab.cdp = null;
      }
    });
  }

  private async adoptPopup(page: Page): Promise<void> {
    if (this.expectingPage) return;
    if ([...this.tabs.values()].some((tab) => tab.page === page)) return;
    const tab = this.createStartTab(true);
    tab.isStartPage = false;
    tab.loading = true;
    this.bindPage(tab, page);
    await page.setViewportSize(this.viewport).catch(() => undefined);
    await this.refreshTab(tab);
    await this.startScreencast(tab);
    this.emitState();
  }

  private async refreshTab(tab: TabRecord): Promise<void> {
    const page = tab.page;
    if (!page || page.isClosed()) return;
    tab.url = page.url() === "about:blank" ? tab.url : page.url();
    tab.title = (await page.title().catch(() => tab.title)) || tab.title;
    tab.loading = false;
    tab.isStartPage = false;
    await this.updateHistoryFlags(tab);
  }

  private async updateHistoryFlags(tab: TabRecord): Promise<void> {
    const page = tab.page;
    if (!page || page.isClosed()) {
      tab.canGoBack = false;
      tab.canGoForward = false;
      return;
    }
    try {
      const cdp = tab.cdp ?? (await page.context().newCDPSession(page));
      const history = await cdp.send("Page.getNavigationHistory");
      tab.canGoBack = history.currentIndex > 0;
      tab.canGoForward = history.currentIndex < history.entries.length - 1;
      if (!tab.cdp) await cdp.detach().catch(() => undefined);
    } catch {
      tab.canGoBack = Boolean(tab.url);
      tab.canGoForward = false;
    }
  }

  private async closeTab(id: string): Promise<void> {
    const tab = this.tabs.get(id);
    if (!tab) return;
    await this.stopScreencast(tab);
    await tab.page?.close().catch(() => undefined);
    this.tabs.delete(id);
    this.order = this.order.filter((item) => item !== id);
    if (this.activeTabId === id) {
      this.activeTabId = this.order.at(-1) ?? null;
      if (this.activeTabId) {
        const next = this.tabs.get(this.activeTabId);
        if (next) await this.startScreencast(next);
      }
    }
    if (this.tabs.size === 0) this.createStartTab(true);
  }

  private async switchTab(id: string): Promise<void> {
    if (!this.tabs.has(id)) return;
    const previous = this.activeTab();
    if (previous && previous.id !== id) await this.stopScreencast(previous);
    this.activeTabId = id;
    const tab = this.tabs.get(id);
    if (tab) await this.startScreencast(tab);
  }

  private async resize(width: number, height: number): Promise<void> {
    const next = {
      width: Math.max(320, Math.round(width)),
      height: Math.max(240, Math.round(height)),
    };
    if (next.width === this.viewport.width && next.height === this.viewport.height) {
      return;
    }
    this.viewport = next;
    for (const tab of this.tabs.values()) {
      if (tab.page && !tab.page.isClosed()) {
        await tab.page.setViewportSize(next).catch(() => undefined);
      }
    }
    const active = this.activeTab();
    if (active?.page) await this.startScreencast(active);
  }

  private toCoords(
    x: number,
    y: number,
    width: number,
    height: number,
  ): { x: number; y: number } {
    return {
      x: Math.min(this.viewport.width - 1, Math.max(0, (x / width) * this.viewport.width)),
      y: Math.min(this.viewport.height - 1, Math.max(0, (y / height) * this.viewport.height)),
    };
  }

  private async mouseClick(command: Extract<BrowserCommand, { type: "click" }>) {
    const page = this.activePage();
    if (!page) return;
    const point = this.toCoords(command.x, command.y, command.width, command.height);
    await page.mouse.click(point.x, point.y, {
      button: command.button ?? "left",
      clickCount: command.clickCount ?? 1,
    });
  }

  private async mouseMove(command: Extract<BrowserCommand, { type: "move" }>) {
    const page = this.activePage();
    if (!page) return;
    const point = this.toCoords(command.x, command.y, command.width, command.height);
    await page.mouse.move(point.x, point.y);
  }

  private async mouseWheel(command: Extract<BrowserCommand, { type: "wheel" }>) {
    const page = this.activePage();
    if (!page) return;
    const point = this.toCoords(command.x, command.y, command.width, command.height);
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(command.deltaX, command.deltaY);
  }

  private async handleKey(command: Extract<BrowserCommand, { type: "key" }>) {
    const page = this.activePage();
    if (!page) return;
    const key = mapKey(command.key, command.code);
    const mods = [
      command.modifiers.alt ? "Alt" : null,
      command.modifiers.ctrl ? "Control" : null,
      command.modifiers.meta ? "Meta" : null,
      command.modifiers.shift ? "Shift" : null,
    ].filter((value): value is string => Boolean(value));

    if (command.down) {
      for (const mod of mods) await page.keyboard.down(mod);
      if (key.length === 1 && command.modifiers.ctrl && key.toLowerCase() === "c") {
        return;
      }
      await page.keyboard.down(key);
    } else {
      await page.keyboard.up(key);
      for (const mod of mods.slice().reverse()) await page.keyboard.up(mod);
    }
  }

  private async copySelection(): Promise<string> {
    const page = this.activePage();
    if (!page) return "";
    return page.evaluate(() => window.getSelection()?.toString() ?? "");
  }

  private async startScreencast(tab: TabRecord): Promise<void> {
    if (!tab.page || tab.page.isClosed() || tab.isStartPage) return;
    await this.stopScreencast(tab);
    try {
      const cdp = await tab.page.context().newCDPSession(tab.page);
      tab.cdp = cdp;
      cdp.on("Page.screencastFrame", (event) => {
        if (this.activeTabId !== tab.id) return;
        const payload: FramePayload = { tabId: tab.id, data: event.data };
        this.emit("frame", payload);
        void cdp.send("Page.screencastFrameAck", { sessionId: event.sessionId });
      });
      await cdp.send("Page.startScreencast", {
        format: "jpeg",
        quality: 55,
        maxWidth: this.viewport.width,
        maxHeight: this.viewport.height,
        everyNthFrame: 1,
      });
    } catch (error) {
      tab.error =
        error instanceof Error ? error.message : "Could not stream this tab.";
    }
  }

  private async stopScreencast(tab: TabRecord): Promise<void> {
    if (!tab.cdp) return;
    await tab.cdp.send("Page.stopScreencast").catch(() => undefined);
    await tab.cdp.detach().catch(() => undefined);
    tab.cdp = null;
  }

  private activeTab(): TabRecord | undefined {
    return this.activeTabId ? this.tabs.get(this.activeTabId) : undefined;
  }

  private activePage(): Page | null {
    const page = this.activeTab()?.page;
    if (!page || page.isClosed()) return null;
    return page;
  }

  private toTabInfo(tab: TabRecord): TabInfo {
    return {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      loading: tab.loading,
      canGoBack: tab.canGoBack,
      canGoForward: tab.canGoForward,
      isStartPage: tab.isStartPage,
      error: tab.error,
    };
  }

  private emitState(): void {
    this.emit("state", this.getState());
  }
}

function hostnameOfSafe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
