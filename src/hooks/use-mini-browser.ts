import { useCallback, useEffect, useState } from "react";

import type { BrowserCommand, BrowserState } from "@/lib/types";

const previewState: BrowserState = {
  tabs: [
    {
      id: "preview",
      url: "",
      title: "New tab",
      loading: false,
      canGoBack: false,
      canGoForward: false,
      isStartPage: true,
      error: null,
    },
  ],
  activeTabId: "preview",
  sessionId: "preview",
  status: "ready",
  error: null,
  extensionLoaded: false,
};

export function useMiniBrowser() {
  const [state, setState] = useState<BrowserState>(previewState);
  const native = typeof window !== "undefined" ? window.mini : undefined;

  useEffect(() => {
    if (!native) return;
    void native.ready().then((next) => {
      if (next) setState(next);
    });
    return native.onState(setState);
  }, [native]);

  const send = useCallback(
    async (command: BrowserCommand) => {
      if (!native) return state;
      const next = await native.command(command);
      setState(next);
      return next;
    },
    [native, state],
  );

  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId) ?? null;
  return { state, activeTab, send, isNative: Boolean(native) };
}
