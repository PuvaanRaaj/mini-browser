"use client";

import { EraserIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AuthenticatorPanel } from "@/components/authenticator-panel";
import { StartPage } from "@/components/start-page";
import { TabStrip } from "@/components/tab-strip";
import { Toolbar } from "@/components/toolbar";
import { Viewport } from "@/components/viewport";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useMiniBrowser } from "@/hooks/use-mini-browser";
import type { BrowserCommand } from "@/lib/types";
import { cn } from "@/lib/utils";

export function MiniApp() {
  const { state, activeTab, frame, connected, streamError, send } = useMiniBrowser();
  const [focusMode, setFocusMode] = useState(false);
  const [authenticatorOpen, setAuthenticatorOpen] = useState(false);
  const [chromeRevealed, setChromeRevealed] = useState(false);
  const urlRef = useRef<HTMLInputElement | null>(null);

  const dispatch = useCallback((command: BrowserCommand) => {
    void send(command);
  }, [send]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (mod && key === "l") {
        event.preventDefault();
        setFocusMode(false);
        urlRef.current?.focus();
        urlRef.current?.select();
        return;
      }
      if (mod && key === "t") {
        event.preventDefault();
        dispatch({ type: "newTab" });
        return;
      }
      if (mod && key === "w") {
        event.preventDefault();
        if (activeTab) dispatch({ type: "closeTab", id: activeTab.id });
        return;
      }
      if (mod && key === "r") {
        event.preventDefault();
        dispatch({ type: "reload" });
        return;
      }
      if (mod && event.shiftKey && key === "f") {
        event.preventDefault();
        setFocusMode((value) => !value);
        return;
      }
      if (mod && event.shiftKey && key === "a") {
        event.preventDefault();
        setAuthenticatorOpen((value) => !value);
        setFocusMode(false);
        return;
      }
      if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        dispatch({ type: "back" });
        return;
      }
      if (event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        dispatch({ type: "forward" });
        return;
      }
      if (event.key === "Escape" && (focusMode || authenticatorOpen)) {
        if (authenticatorOpen) setAuthenticatorOpen(false);
        else setFocusMode(false);
      }
      if (!typing && event.key === "?" && !mod) {
        event.preventDefault();
        setFocusMode(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTab, authenticatorOpen, dispatch, focusMode]);

  const showStart = !activeTab || activeTab.isStartPage;
  const hideChrome = focusMode && !chromeRevealed && !showStart;

  return (
    <TooltipProvider delay={250}>
      <div className="flex h-dvh flex-col bg-[#111113] text-foreground">
        <header
          className={cn(
            "z-20 border-b border-white/5 bg-[#161618]",
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
                  className="ml-auto hidden shrink-0 text-[11px] text-muted-foreground sm:inline-flex"
                  onClick={() => dispatch({ type: "resetSession" })}
                >
                  <EraserIcon />
                  Reset session
                </Button>
              </div>
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
            </>
          ) : (
            <div className="h-3" />
          )}
        </header>

        <div className="flex min-h-0 flex-1">
          <main className="relative min-w-0 flex-1">
            {state.status === "error" || streamError ? (
              <ErrorPane
                message={state.error || streamError || "Chromium is unavailable."}
                onRetry={() => dispatch({ type: "resetSession" })}
              />
            ) : state.status === "starting" || (!connected && state.status !== "ready") ? (
              <LoadingPane />
            ) : showStart ? (
              <StartPage
                onNavigate={(url) => dispatch({ type: "navigate", url })}
                onOpenAuthenticator={() => setAuthenticatorOpen(true)}
                extensionLoaded={state.extensionLoaded}
              />
            ) : (
              <Viewport tab={activeTab} frame={frame} onCommand={dispatch} />
            )}
          </main>
          <AuthenticatorPanel
            open={authenticatorOpen}
            onClose={() => setAuthenticatorOpen(false)}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}

function LoadingPane() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
      <span className="size-5 animate-spin rounded-full border border-muted-foreground/30 border-t-foreground" />
      Starting a fresh Chromium session…
    </div>
  );
}

function ErrorPane({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-medium">Chromium did not start</p>
      <p className="mt-2 max-w-md text-xs leading-5 text-muted-foreground">{message}</p>
      <Button className="mt-4" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
