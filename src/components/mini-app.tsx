import { EraserIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AuthenticatorPanel } from "@/components/authenticator-panel";
import { StartPage } from "@/components/start-page";
import { TabStrip } from "@/components/tab-strip";
import { Toolbar } from "@/components/toolbar";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useMiniBrowser } from "@/hooks/use-mini-browser";
import type { BrowserCommand, LayoutRect } from "@/lib/types";
import { cn } from "@/lib/utils";

export function MiniApp() {
  const { state, activeTab, send, isNative } = useMiniBrowser();
  const [focusMode, setFocusMode] = useState(false);
  const [authenticatorOpen, setAuthenticatorOpen] = useState(false);
  const [chromeRevealed, setChromeRevealed] = useState(false);
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
  const hideChrome = focusMode && !chromeRevealed && !showStart;

  const publishLayout = useCallback(() => {
    const node = slotRef.current;
    if (!node || !window.mini) return;
    const rect = node.getBoundingClientRect();
    const payload: LayoutRect = {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      visible: !showStart,
    };
    window.mini.layout(payload);
  }, [showStart]);

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
  }, [publishLayout, authenticatorOpen, hideChrome, focusMode]);

  useEffect(() => {
    const api = window.mini;
    if (!api) return;
    const stopFocus = api.onFocusUrl(() => {
      setFocusMode(false);
      urlRef.current?.focus();
      urlRef.current?.select();
    });
    const stopToggle = api.onToggle((what) => {
      if (what === "focus") setFocusMode((value) => !value);
      if (what === "authenticator") {
        setAuthenticatorOpen((value) => !value);
        setFocusMode(false);
      }
    });
    return () => {
      stopFocus();
      stopToggle();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (window.mini) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && event.shiftKey && key === "a") {
        event.preventDefault();
        setAuthenticatorOpen((value) => !value);
      }
      if (mod && event.shiftKey && key === "f") {
        event.preventDefault();
        setFocusMode((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <TooltipProvider delay={250}>
      <div className="flex h-full flex-col bg-[#111113] text-foreground">
        <header
          className={cn(
            "drag-region z-20 border-b border-white/5 bg-[#161618]",
            isMac && "pl-[68px]",
            hideChrome && "absolute inset-x-0 top-0 border-b-transparent bg-transparent opacity-0 hover:opacity-100",
          )}
          onMouseEnter={() => focusMode && setChromeRevealed(true)}
          onMouseLeave={() => setChromeRevealed(false)}
        >
          {!hideChrome || chromeRevealed ? (
            <>
              <div className="flex items-center gap-2 px-2 pt-1.5">
                <TabStrip
                  tabs={state.tabs}
                  activeTabId={state.activeTabId}
                  onSelect={(id) => dispatch({ type: "switchTab", id })}
                  onClose={(id) => dispatch({ type: "closeTab", id })}
                  onNew={() => dispatch({ type: "newTab" })}
                />
                <Button
                  variant="ghost"
                  size="xs"
                  className="no-drag ml-auto hidden shrink-0 text-[11px] text-muted-foreground sm:inline-flex"
                  onClick={() => dispatch({ type: "resetSession" })}
                >
                  <EraserIcon />
                  Reset session
                </Button>
              </div>
              <div className="no-drag">
                <Toolbar
                  tab={activeTab}
                  focusMode={focusMode}
                  authenticatorOpen={authenticatorOpen}
                  onBack={() => dispatch({ type: "back" })}
                  onForward={() => dispatch({ type: "forward" })}
                  onReload={() => dispatch({ type: "reload" })}
                  onNavigate={(url) => dispatch({ type: "navigate", url })}
                  onToggleFocus={() => setFocusMode((value) => !value)}
                  onToggleAuthenticator={() => setAuthenticatorOpen((value) => !value)}
                  urlRef={urlRef}
                />
              </div>
            </>
          ) : (
            <div className="h-3" />
          )}
        </header>

        <div className="flex min-h-0 flex-1">
          <main className="relative min-w-0 flex-1">
            <div ref={slotRef} className="h-full min-h-0">
              {showStart ? (
                <StartPage
                  onNavigate={(url) => dispatch({ type: "navigate", url })}
                  onOpenAuthenticator={() => setAuthenticatorOpen(true)}
                  extensionLoaded={state.extensionLoaded}
                  isNative={isNative}
                />
              ) : (
                <div className="h-full bg-[#0b0b0c]">
                  {activeTab?.error ? (
                    <div className="absolute inset-x-0 bottom-0 z-10 bg-destructive/15 px-4 py-2 text-center text-xs text-destructive">
                      {activeTab.error}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </main>
          <div className="no-drag">
            <AuthenticatorPanel
              open={authenticatorOpen}
              onClose={() => setAuthenticatorOpen(false)}
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
