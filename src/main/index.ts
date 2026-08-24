import { join } from "node:path";

import {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from "electron";

import type { BrowserCommand, LayoutRect } from "../lib/types";
import type { AuthenticatorAccount } from "../lib/totp";
import type { PasswordInput } from "../lib/vault-types";
import { AgentServer } from "./agent-server";
import { benchmarkOutputPath, runBenchmark } from "./benchmark";
import { installMenu } from "./menu";
import { runGoogleOAuth } from "./oauth";
import { isWsl, rendererSandboxEnabled } from "./security";
import { MiniSession, routeBrowserShortcut } from "./tabs";
import { SecureVault } from "./vault";
import { readPackagedWebAuthnConfig } from "./webauthn";

if (isWsl()) {
  app.commandLine.appendSwitch("no-sandbox");
  // WSL2 hands out a /dev/shm that Chromium's renderers cannot map; fall back to
  // temp files so pages render instead of dying on startup.
  app.commandLine.appendSwitch("disable-dev-shm-usage");
}

const benchmarkOutput = benchmarkOutputPath();
const benchmarkProfile = process.argv.find((argument) => argument.startsWith("--benchmark-profile="))?.slice("--benchmark-profile=".length);
if (benchmarkProfile) app.setPath("userData", benchmarkProfile);

let mainWindow: BrowserWindow | null = null;
let mini: MiniSession | null = null;
let agentServer: AgentServer | null = null;
let vault: SecureVault | null = null;
let googleOAuthInFlight: Promise<void> | null = null;

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
      sandbox: rendererSandboxEnabled(),
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
  vault = new SecureVault(join(app.getPath("userData"), "vault.bin"), {
    isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
    encryptString: (value) => safeStorage.encryptString(value),
    decryptString: (value) => safeStorage.decryptString(value),
    backend: () => process.platform === "linux" ? safeStorage.getSelectedStorageBackend() : "os_keychain",
  });

  // Electron ships the Touch ID / Secure Enclave platform authenticator dark
  // by default: until this is called, passkey prompts never appear and sites
  // like Google hang on "Complete sign-in using your passkey". The access
  // group must also be listed in resources/entitlements.mac.plist so signed
  // release builds can store credentials.
  if (process.platform === "darwin") {
    const config = app.isPackaged
      ? readPackagedWebAuthnConfig(join(process.resourcesPath, "webauthn.json"))
      : process.env.MINIMAL_DEV_WEBAUTHN === "1"
        ? { keychainAccessGroup: "app.minimal.browser.webauthn" }
        : null;
    if (config) {
      app.configureWebAuthn({
        touchID: {
          keychainAccessGroup: config.keychainAccessGroup,
          promptReason: "verify your identity on $1",
        },
      });
    } else if (app.isPackaged) {
      console.error("Touch ID passkeys are disabled: signed WebAuthn configuration is missing.");
    }
  }

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
  ipcMain.handle("mini:vault-status", (event) => {
    assertTrustedRenderer(event);
    return requiredVault().status();
  });
  ipcMain.handle("mini:vault-list-totp", (event) => {
    assertTrustedRenderer(event);
    return requiredVault().listAuthenticatorCodes();
  });
  ipcMain.handle("mini:vault-import-totp", (event, accounts: AuthenticatorAccount[]) => {
    assertTrustedRenderer(event);
    if (!Array.isArray(accounts) || accounts.length > 500) throw new Error("Invalid account import.");
    return requiredVault().importAuthenticatorAccounts(accounts);
  });
  ipcMain.handle("mini:vault-delete-totp", (event, id: string) => {
    assertTrustedRenderer(event);
    if (typeof id !== "string") throw new Error("Invalid account ID.");
    return requiredVault().deleteAuthenticatorAccount(id);
  });
  ipcMain.handle("mini:vault-list-passwords", (event) => {
    assertTrustedRenderer(event);
    return requiredVault().listPasswords();
  });
  ipcMain.handle("mini:vault-save-password", (event, input: PasswordInput) => {
    assertTrustedRenderer(event);
    return requiredVault().savePassword(input);
  });
  ipcMain.handle("mini:vault-delete-password", (event, id: string) => {
    assertTrustedRenderer(event);
    if (typeof id !== "string") throw new Error("Invalid password ID.");
    return requiredVault().deletePassword(id);
  });
  ipcMain.handle("mini:vault-fill-password", async (event, id: string) => {
    assertTrustedRenderer(event);
    if (typeof id !== "string") throw new Error("Invalid password ID.");
    const entry = await requiredVault().passwordSecret(id);
    if (!entry) throw new Error("Password entry not found.");
    if (!mini) throw new Error("Minimal is not running.");
    await mini.fillPassword(entry);
  });
  ipcMain.handle("mini:google-auth-status", async (event) => {
    assertTrustedRenderer(event);
    const configured = Boolean(process.env.MINIMAL_GOOGLE_OAUTH_CLIENT_ID?.trim());
    return { configured, signedIn: configured && await requiredVault().hasGoogleOAuth() };
  });
  ipcMain.handle("mini:google-auth-sign-in", async (event) => {
    assertTrustedRenderer(event);
    const clientId = process.env.MINIMAL_GOOGLE_OAUTH_CLIENT_ID?.trim() ?? "";
    if (!clientId) throw new Error("MINIMAL_GOOGLE_OAUTH_CLIENT_ID is not configured.");
    if (googleOAuthInFlight) throw new Error("Google sign-in is already in progress.");
    googleOAuthInFlight = (async () => {
      const tokens = await runGoogleOAuth(
        { clientId },
        { openExternal: (url) => shell.openExternal(url) },
      );
      await requiredVault().saveGoogleOAuth(tokens);
    })();
    try {
      await googleOAuthInFlight;
    } finally {
      googleOAuthInFlight = null;
    }
    return { configured: true, signedIn: true };
  });
  ipcMain.handle("mini:google-auth-sign-out", async (event) => {
    assertTrustedRenderer(event);
    await requiredVault().clearGoogleOAuth();
    return {
      configured: Boolean(process.env.MINIMAL_GOOGLE_OAUTH_CLIENT_ID?.trim()),
      signedIn: false,
    };
  });

  installMenu(
    () => mini,
    () => mainWindow,
  );
  createWindow();
  if (benchmarkOutput && mini) {
    void runBenchmark(mini, benchmarkOutput).then(
      (result) => {
        console.log(JSON.stringify(result));
        app.quit();
      },
      (error) => {
        console.error("Benchmark failed.", error);
        app.exit(1);
      },
    );
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

/** Only the local app renderer may call privileged Mini IPC handlers. */
function isTrustedRenderer(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const window = mainWindow;
  return Boolean(window && !window.isDestroyed() && event.sender === window.webContents);
}

function assertTrustedRenderer(event: IpcMainEvent | IpcMainInvokeEvent): void {
  if (!isTrustedRenderer(event)) throw new Error("Untrusted renderer.");
}

function requiredVault(): SecureVault {
  if (!vault) throw new Error("Secure vault is not ready.");
  return vault;
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
