import { contextBridge, ipcRenderer } from "electron";

import type { BrowserCommand, BrowserState, LayoutRect } from "../lib/types";
import type { AuthenticatorAccount } from "../lib/totp";
import type { PasswordInput, VaultAPI } from "../lib/vault-types";

const vault: VaultAPI = {
  status: () => ipcRenderer.invoke("mini:vault-status"),
  listAuthenticatorCodes: () => ipcRenderer.invoke("mini:vault-list-totp"),
  importAuthenticatorAccounts: (accounts: AuthenticatorAccount[]) =>
    ipcRenderer.invoke("mini:vault-import-totp", accounts),
  deleteAuthenticatorAccount: (id: string) => ipcRenderer.invoke("mini:vault-delete-totp", id),
  listPasswords: () => ipcRenderer.invoke("mini:vault-list-passwords"),
  savePassword: (input: PasswordInput) => ipcRenderer.invoke("mini:vault-save-password", input),
  deletePassword: (id: string) => ipcRenderer.invoke("mini:vault-delete-password", id),
  fillPassword: (id: string) => ipcRenderer.invoke("mini:vault-fill-password", id),
};

const mini = {
  platform: process.platform as NodeJS.Platform,
  vault,
  ready: (): Promise<BrowserState | null> => ipcRenderer.invoke("mini:ready"),
  command: (command: BrowserCommand): Promise<BrowserState> =>
    ipcRenderer.invoke("mini:command", command),
  layout: (rect: LayoutRect): void => {
    ipcRenderer.send("mini:layout", rect);
  },
  chromeTheme: (theme: "light" | "dark"): void => {
    ipcRenderer.send("mini:chrome-theme", theme);
  },
  persistSession: (enabled: boolean): void => {
    ipcRenderer.send("mini:persist-session", enabled);
  },
  onState: (callback: (state: BrowserState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: BrowserState) => callback(state);
    ipcRenderer.on("mini:state", listener);
    return () => ipcRenderer.removeListener("mini:state", listener);
  },
  onFocusUrl: (callback: () => void): (() => void) => {
    const listener = () => callback();
    ipcRenderer.on("mini:focus-url", listener);
    return () => ipcRenderer.removeListener("mini:focus-url", listener);
  },
  onToggle: (callback: (what: "focus" | "authenticator" | "sidebar" | "bookmark" | "favorites" | "settings") => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, what: "focus" | "authenticator" | "sidebar" | "bookmark" | "favorites" | "settings") =>
      callback(what);
    ipcRenderer.on("mini:toggle", listener);
    return () => ipcRenderer.removeListener("mini:toggle", listener);
  },
};

contextBridge.exposeInMainWorld("mini", mini);

export type MiniAPI = typeof mini;
