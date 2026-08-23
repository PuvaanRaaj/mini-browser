import { useCallback, useEffect, useRef, useState } from "react";

import { AuthenticatorPanel } from "@/components/authenticator-panel";
import { Omnibox } from "@/components/omnibox";
import { StartPage } from "@/components/start-page";
import { TabStrip } from "@/components/tab-strip";
import { Toolbar } from "@/components/toolbar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useMiniBrowser } from "@/hooks/use-mini-browser";
import type { BrowserCommand, LayoutRect } from "@/lib/types";
import { displayUrl } from "@/lib/url";
import { cn } from "@/lib/utils";

export function MiniApp() {
  const { state, activeTab, send } = useMiniBrowser();
  const [chromeVisible, setChromeVisible] = useState(false);
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
  const showOmnibox = omniboxOpen && !showStart;
  const pageVisible = !showStart && !showOmnibox && !authenticatorOpen;
  const showChrome = chromeVisible && !showStart && !showOmnibox && !authenticatorOpen;

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
    const api = window.mini;
    if (!api) return;
    const stopFocus = api.onFocusUrl(() => {
      if (showStart) return;
      setAuthenticatorOpen(false);
      setOmniboxOpen(true);
    });
    const stopToggle = api.onToggle((what) => {
      if (what === "focus") {
        setOmniboxOpen(false);
        setAuthenticatorOpen(false);
        setChromeVisible((value) => !value);
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
  }, [showStart]);

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
        setChromeVisible((value) => !value);
      }
      if (mod && key === "l" && !showStart) {
        event.preventDefault();
        setAuthenticatorOpen(false);
        setOmniboxOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [authenticatorOpen, omniboxOpen, showStart]);

  const navigate = (url: string) => {
    setOmniboxOpen(false);
    dispatch({ type: "navigate", url });
  };

  return (
    <TooltipProvider delay={250}>
      <div className="mini-root">
        {showChrome ? (
          <header className={cn("mini-chrome", isMac && "mini-chrome-mac")}>
            <div className="no-drag flex items-center gap-2 px-2 pt-1.5">
              <TabStrip
                tabs={state.tabs}
                activeTabId={state.activeTabId}
                onSelect={(id) => dispatch({ type: "switchTab", id })}
                onClose={(id) => dispatch({ type: "closeTab", id })}
                onNew={() => dispatch({ type: "newTab" })}
              />
            </div>
            <div className="no-drag">
              <Toolbar
                tab={activeTab}
                focusMode={!chromeVisible}
                authenticatorOpen={authenticatorOpen}
                onBack={() => dispatch({ type: "back" })}
                onForward={() => dispatch({ type: "forward" })}
                onReload={() => dispatch({ type: "reload" })}
                onNavigate={navigate}
                onToggleFocus={() => setChromeVisible((value) => !value)}
                onToggleAuthenticator={() => setAuthenticatorOpen((value) => !value)}
                urlRef={urlRef}
              />
            </div>
          </header>
        ) : null}

        <div ref={slotRef} className="mini-slot">
          {showStart ? <StartPage onNavigate={navigate} /> : null}

          {showOmnibox ? (
            <div className="mini-overlay">
              <Omnibox
                defaultValue={displayUrl(activeTab?.url ?? "")}
                onSubmit={navigate}
              />
            </div>
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
