"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { BrowserCommand, BrowserState, CommandResult, FramePayload } from "@/lib/types";

const emptyState: BrowserState = {
  tabs: [],
  activeTabId: null,
  sessionId: "",
  status: "idle",
  error: null,
  extensionLoaded: false,
};

export function useMiniBrowser() {
  const [state, setState] = useState<BrowserState>(emptyState);
  const [frames, setFrames] = useState<Record<string, string>>({});
  const [connected, setConnected] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const sendLock = useRef(Promise.resolve());

  useEffect(() => {
    const source = new EventSource("/api/stream");

    source.addEventListener("state", (event) => {
      setState(JSON.parse((event as MessageEvent).data) as BrowserState);
      setConnected(true);
      setStreamError(null);
    });

    source.addEventListener("frame", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as FramePayload;
      setFrames((current) => ({ ...current, [payload.tabId]: payload.data }));
    });

    source.onerror = () => {
      setConnected(false);
      setStreamError("Lost the Chromium session. Retrying…");
    };

    return () => source.close();
  }, []);

  const send = useCallback(async (command: BrowserCommand): Promise<CommandResult> => {
    const run = sendLock.current.then(async () => {
      const response = await fetch("/api/browser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const json = (await response.json()) as CommandResult & { error?: string };
      if (json.state) setState(json.state);
      if (!response.ok) {
        throw new Error(json.error || "Command failed.");
      }
      return json;
    });

    sendLock.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, []);

  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId) ?? null;
  const frame = activeTab ? frames[activeTab.id] ?? null : null;

  return { state, activeTab, frame, connected, streamError, send };
}
