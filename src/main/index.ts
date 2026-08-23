import { join } from "node:path";

import { app, BrowserWindow, ipcMain } from "electron";

import type { BrowserCommand, LayoutRect } from "../lib/types";
import { AgentServer } from "./agent-server";
import { installMenu } from "./menu";
import { MiniSession, routeBrowserShortcut } from "./tabs";

if (process.platform === "linux") {
  app.commandLine.appendSwitch("no-sandbox");
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
    backgroundColor: "#ffffff",
    show: false,
    autoHideMenuBar: process.platform !== "darwin",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    trafficLightPosition: { x: 16, y: 14 },
    titleBarOverlay:
      process.platform === "darwin"
        ? undefined
        : { color: "#ffffff", symbolColor: "#111111", height: 44 },
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
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

  ipcMain.handle("mini:ready", () => mini?.getState() ?? null);
  ipcMain.handle("mini:command", async (_event, command: BrowserCommand) => {
    if (!mini) throw new Error("Minimal is not running.");
    return mini.handle(command);
  });
  ipcMain.on("mini:layout", (_event, rect: LayoutRect) => {
    mini?.applyLayout(rect);
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
