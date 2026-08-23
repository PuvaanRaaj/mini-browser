import { useCallback, useEffect, useRef, useState } from "react";

import { AuthenticatorPanel } from "@/components/authenticator-panel";
import { CompactChrome } from "@/components/compact-chrome";
import { Omnibox } from "@/components/omnibox";
import { StartPage } from "@/components/start-page";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useMiniBrowser } from "@/hooks/use-mini-browser";
import type { BrowserCommand, LayoutRect } from "@/lib/types";

export function MiniApp() {
  const { state, activeTab, send, isNative } = useMiniBrowser();
  const [focusMode, setFocusMode] = useState(false);
  const [omniboxOpen, setOmniboxOpen] = useState(false);
  const [authenticatorOpen, setAuthenticatorOpen] = useState(false);
  const urlRef = useRef<HTMLInputElement | null>(null);
  const slotRef = useRef<HTMLDivElement | null>(null);
  const isMac = window.mini?.platform === "darwin";

  const dispatch = useCallback(
    (command: BrowserCommand) => {
      void send(command);
    },
    [send],
  );

  const showStart = !activeTab || activeTab.isStartPage;
  const hasPageTabs = state.tabs.some((tab) => !tab.isStartPage);
  const showOmnibox = omniboxOpen && !showStart;
  const pageVisible = !showStart && !showOmnibox && !authenticatorOpen;
  const showChrome =
    !focusMode && !showOmnibox && !authenticatorOpen && hasPageTabs;

  const publishLayout = useCallback(() => {
    const node = slotRef.current;
    if (!node || !window.mini) return;
    const rect = node.getBoundingClientRect();
    const payload: LayoutRect = {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      visible: pageVisible,
    };
    window.mini.layout(payload);
  }, [pageVisible]);

  useEffect(() => {
    publishLayout();
    const node = slotRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => publishLayout());
    observer.observe(node);
    window.addEventListener("resize", publishLayout);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", publishLayout);
    };
  }, [publishLayout, showChrome]);

  useEffect(() => {
    if (showStart && showChrome) urlRef.current?.focus();
  }, [showStart, showChrome]);

  useEffect(() => {
    const api = window.mini;
    if (!api) return;
    const stopFocus = api.onFocusUrl(() => {
      setAuthenticatorOpen(false);
      if (showStart) return;
      if (focusMode) {
        setOmniboxOpen(true);
        return;
      }
      urlRef.current?.focus();
      urlRef.current?.select();
    });
    const stopToggle = api.onToggle((what) => {
      if (what === "focus") {
        setOmniboxOpen(false);
        setAuthenticatorOpen(false);
        setFocusMode((value) => !value);
      }
      if (what === "authenticator") {
        setOmniboxOpen(false);
        setAuthenticatorOpen((value) => !value);
      }
    });
    return () => {
      stopFocus();
      stopToggle();
    };
  }, [showStart, focusMode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (authenticatorOpen) {
          event.preventDefault();
          setAuthenticatorOpen(false);
          return;
        }
        if (omniboxOpen && !showStart) {
          event.preventDefault();
          setOmniboxOpen(false);
          return;
        }
        if (focusMode) return;
      }

      if (window.mini) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && event.shiftKey && key === "a") {
        event.preventDefault();
        setOmniboxOpen(false);
        setAuthenticatorOpen((value) => !value);
      }
      if (mod && event.shiftKey && key === "f") {
        event.preventDefault();
        setOmniboxOpen(false);
        setAuthenticatorOpen(false);
        setFocusMode((value) => !value);
      }
      if (mod && key === "l" && !showStart) {
        event.preventDefault();
        setAuthenticatorOpen(false);
        if (focusMode) setOmniboxOpen(true);
        else {
          urlRef.current?.focus();
          urlRef.current?.select();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [authenticatorOpen, omniboxOpen, showStart, focusMode]);

  const navigate = (url: string) => {
    setOmniboxOpen(false);
    dispatch({ type: "navigate", url });
  };

  return (
    <TooltipProvider delay={250}>
      <div className="mini-root">
        {showChrome ? (
          <CompactChrome
            tabs={state.tabs}
            activeTab={activeTab}
            urlRef={urlRef}
            isMac={isMac}
            onSelect={(id) => dispatch({ type: "switchTab", id })}
            onClose={(id) => dispatch({ type: "closeTab", id })}
            onNavigate={navigate}
          />
        ) : null}

        <div ref={slotRef} className="mini-slot">
          {showStart && !showChrome ? <StartPage onNavigate={navigate} /> : null}

          {showOmnibox ? (
            <div className="mini-overlay">
              <Omnibox defaultValue={activeTab?.url ?? ""} onSubmit={navigate} />
            </div>
          ) : null}

          {!isNative && pageVisible && activeTab?.url ? (
            <iframe
              className="mini-preview-frame"
              src={activeTab.url}
              title={activeTab.title}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          ) : null}

          {!showStart && !showOmnibox && activeTab?.error ? (
            <div className="mini-error">{activeTab.error}</div>
          ) : null}

          {authenticatorOpen ? (
            <div className="mini-sheet-backdrop">
              <AuthenticatorPanel onClose={() => setAuthenticatorOpen(false)} />
            </div>
          ) : null}
        </div>
      </div>
    </TooltipProvider>
  );
}
