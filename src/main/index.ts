import { join } from "node:path";

import {
  app,
  BrowserWindow,
  ipcMain,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from "electron";

import type { BrowserCommand, LayoutRect } from "../lib/types";
import { AgentServer } from "./agent-server";
import { installMenu } from "./menu";
import { MiniSession, routeBrowserShortcut } from "./tabs";

if (process.platform === "linux") {
  app.commandLine.appendSwitch("no-sandbox");
  // WSL2 hands out a /dev/shm that Chromium's renderers cannot map; fall back to
  // temp files so pages render instead of dying on startup.
  app.commandLine.appendSwitch("disable-dev-shm-usage");
}

let mainWindow: BrowserWindow | null = null;
let mini: MiniSession | null = null;
let agentServer: AgentServer | null = null;

app.setName("Minimal");
app.setAboutPanelOptions({
  applicationName: "Minimal",
  applicationVersion: app.getVersion(),
  copyright: "A personal Chromium browser",
});

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    title: "Minimal",
    backgroundColor: "#0a0a0b",
    show: false,
    autoHideMenuBar: process.platform !== "darwin",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    trafficLightPosition: { x: 16, y: 14 },
    titleBarOverlay:
      process.platform === "darwin"
        ? undefined
        : // Matches the start page the window opens on; the renderer flips it
          // back to white once a page is showing.
          { color: "#0a0a0b", symbolColor: "#fafafa", height: 44 },
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      // The local chrome renderer needs no Node privileges. Keep it sandboxed
      // everywhere Chromium can support it; Linux/WSL already opts out above
      // because its shared-memory setup cannot start a sandboxed renderer.
      sandbox: process.platform !== "linux",
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mini = new MiniSession(mainWindow, () => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
    mainWindow.webContents.send("mini:state", mini?.getState());
  });

  const port = requestedAgentPort();
  if (port !== null) {
    agentServer = new AgentServer(mini);
    void agentServer.start(port).catch((error) => {
      console.error("Could not start the agent control API.", error);
      agentServer = null;
    });
  }

  mainWindow.on("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mini?.destroy();
    mini = null;
    mainWindow = null;
    void agentServer?.close();
    agentServer = null;
  });

  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (!mini || !mainWindow) return;
    if (routeBrowserShortcut(input, mainWindow, mini)) event.preventDefault();
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId("app.minimal.browser");

  // Electron ships the Touch ID / Secure Enclave platform authenticator dark
  // by default: until this is called, passkey prompts never appear and sites
  // like Google hang on "Complete sign-in using your passkey". The access
  // group must also be listed in resources/entitlements.mac.plist so signed
  // release builds can store credentials.
  app.configureWebAuthn({
    touchID: {
      keychainAccessGroup: "app.minimal.browser.webauthn",
      promptReason: "verify your identity on $1",
    },
  });

  ipcMain.handle("mini:ready", (event) => {
    if (!isTrustedRenderer(event)) return null;
    return mini?.getState() ?? null;
  });
  ipcMain.handle("mini:command", async (event, command: BrowserCommand) => {
    if (!isTrustedRenderer(event)) throw new Error("Untrusted renderer.");
    if (!mini) throw new Error("Minimal is not running.");
    return mini.handle(command);
  });
  ipcMain.on("mini:layout", (event, rect: LayoutRect) => {
    if (!isTrustedRenderer(event)) return;
    mini?.applyLayout(rect);
  });
  ipcMain.on("mini:persist-session", (event, enabled: boolean) => {
    if (!isTrustedRenderer(event)) return;
    void mini?.setPersistSession(enabled === true);
  });
  ipcMain.on("mini:chrome-theme", (event, theme: "light" | "dark") => {
    if (!isTrustedRenderer(event)) return;
    // Both surfaces are dark now, but keep the hook so a light theme can
    // repaint the caption strip without new plumbing.
    if (process.platform === "darwin") return;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.setTitleBarOverlay(
      theme === "light"
        ? { color: "#ffffff", symbolColor: "#111111", height: 44 }
        : { color: "#0a0a0b", symbolColor: "#fafafa", height: 44 },
    );
  });

  installMenu(
    () => mini,
    () => mainWindow,
  );
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

/** Only the local app renderer may call privileged Mini IPC handlers. */
function isTrustedRenderer(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const window = mainWindow;
  return Boolean(window && !window.isDestroyed() && event.sender === window.webContents);
}

// Give the cookie store a chance to land before the process goes away, or a
// login made seconds earlier is lost despite "Stay signed in".
let flushed = false;
app.on("before-quit", (event) => {
  if (flushed || !mini) return;
  event.preventDefault();
  flushed = true;
  void mini.flush().finally(() => app.quit());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function requestedAgentPort(): number | null {
  const flag = process.argv.find((argument) => argument === "--agent" || argument.startsWith("--agent-port="));
  const configured = process.env.MINIMAL_AGENT_PORT;
  if (!flag && !process.env.MINIMAL_AGENT) return null;

  const value = flag?.startsWith("--agent-port=")
    ? flag.slice("--agent-port=".length)
    : configured ?? "32123";
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    console.error("MINIMAL_AGENT_PORT must be an integer between 0 and 65535.");
    return null;
  }
  return port;
}
