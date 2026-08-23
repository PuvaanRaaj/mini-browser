import { join } from "node:path";

import { app, BrowserWindow, ipcMain } from "electron";

import type { BrowserCommand, LayoutRect } from "../lib/types";
import { installMenu } from "./menu";
import { MiniSession, routeBrowserShortcut } from "./tabs";

if (process.platform === "linux") {
  app.commandLine.appendSwitch("no-sandbox");
}

let mainWindow: BrowserWindow | null = null;
let mini: MiniSession | null = null;

app.setName("Mini");
app.setAboutPanelOptions({
  applicationName: "Mini",
  applicationVersion: app.getVersion(),
  copyright: "A personal Chromium browser",
});

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    title: "Mini",
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
    mainWindow?.webContents.send("mini:state", mini?.getState());
  });

  mainWindow.on("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mini?.destroy();
    mini = null;
    mainWindow = null;
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
  app.setAppUserModelId("app.mini.browser");

  ipcMain.handle("mini:ready", () => mini?.getState() ?? null);
  ipcMain.handle("mini:command", async (_event, command: BrowserCommand) => {
    if (!mini) throw new Error("Mini is not running.");
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
