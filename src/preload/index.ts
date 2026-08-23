import { contextBridge, ipcRenderer } from "electron";

import type { BrowserCommand, BrowserState, LayoutRect } from "../lib/types";

const mini = {
  platform: process.platform as NodeJS.Platform,
  ready: (): Promise<BrowserState | null> => ipcRenderer.invoke("mini:ready"),
  command: (command: BrowserCommand): Promise<BrowserState> =>
    ipcRenderer.invoke("mini:command", command),
  layout: (rect: LayoutRect): void => {
    ipcRenderer.send("mini:layout", rect);
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
