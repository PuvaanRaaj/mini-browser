import { useCallback, useEffect, useState } from "react";

import type { BrowserCommand, BrowserState, TabInfo } from "@/lib/types";
import { hostnameOf, resolveNavigation } from "@/lib/url";

const emptyTab = (id: string): TabInfo => ({
  id,
  url: "",
  title: "New tab",
  loading: false,
  canGoBack: false,
  canGoForward: false,
  isStartPage: true,
  error: null,
});

function previewSeed(): BrowserState {
  const requested =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("preview")
      : null;
  const url = requested ? resolveNavigation(requested) : "";
  if (!url) {
    return {
      tabs: [emptyTab("preview")],
      activeTabId: "preview",
      sessionId: "preview",
      status: "ready",
      error: null,
      extensionLoaded: false,
    };
  }
  return {
    tabs: [
      {
        ...emptyTab("preview"),
        url,
        title: hostnameOf(url) || url,
        isStartPage: false,
      },
    ],
    activeTabId: "preview",
    sessionId: "preview",
    status: "ready",
    error: null,
    extensionLoaded: false,
  };
}

function applyPreviewCommand(state: BrowserState, command: BrowserCommand): BrowserState {
  switch (command.type) {
    case "navigate": {
      const url = resolveNavigation(command.url);
      if (!url) return state;
      const id = command.tabId ?? state.activeTabId ?? state.tabs[0]?.id;
      if (!id) return state;
      const exists = state.tabs.some((tab) => tab.id === id);
      const nextTab: TabInfo = {
        ...(state.tabs.find((tab) => tab.id === id) ?? emptyTab(id)),
        url,
        title: hostnameOf(url) || url,
        isStartPage: false,
        loading: false,
        error: null,
      };
      return {
        ...state,
        tabs: exists
          ? state.tabs.map((tab) => (tab.id === id ? nextTab : tab))
          : [...state.tabs, nextTab],
        activeTabId: id,
      };
    }
    case "newTab": {
      const id = crypto.randomUUID();
      return {
        ...state,
        tabs: [...state.tabs, emptyTab(id)],
        activeTabId: id,
      };
    }
    case "closeTab": {
      const tabs = state.tabs.filter((tab) => tab.id !== command.id);
      const next = tabs.length > 0 ? tabs : [emptyTab(crypto.randomUUID())];
      const activeTabId =
        state.activeTabId === command.id
          ? next.at(-1)!.id
          : (state.activeTabId ?? next[0].id);
      return { ...state, tabs: next, activeTabId };
    }
    case "switchTab":
      if (!state.tabs.some((tab) => tab.id === command.id)) return state;
      return { ...state, activeTabId: command.id };
    case "resetSession": {
      const id = crypto.randomUUID();
      return {
        ...state,
        tabs: [emptyTab(id)],
        activeTabId: id,
        sessionId: crypto.randomUUID(),
      };
    }
    default:
      return state;
  }
}

export function useMiniBrowser() {
  const [state, setState] = useState<BrowserState>(previewSeed);
  const native = typeof window !== "undefined" ? window.mini : undefined;

  useEffect(() => {
    if (!native) return;
    void native.ready().then((next) => {
      if (next) setState(next);
    });
    return native.onState(setState);
  }, [native]);

  const send = useCallback(async (command: BrowserCommand) => {
    if (native) {
      const next = await native.command(command);
      setState(next);
      return next;
    }
    let next: BrowserState | null = null;
    setState((current) => {
      next = applyPreviewCommand(current, command);
      return next;
    });
    return next ?? applyPreviewCommand(previewSeed(), command);
  }, [native]);

  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId) ?? null;
  return { state, activeTab, send, isNative: Boolean(native) };
}
