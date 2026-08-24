import { ArrowLeftIcon, RefreshCwIcon } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";

const AuthenticatorPanel = lazy(() =>
  import("@/components/authenticator-panel").then(({ AuthenticatorPanel: panel }) => ({
    default: panel,
  })),
);
import { CompactChrome } from "@/components/compact-chrome";
import { FavoritesBar } from "@/components/favorites-bar";
import { FavoritesPanel } from "@/components/favorites-panel";
import { Omnibox } from "@/components/omnibox";
import { SettingsPanel } from "@/components/settings-panel";
import { StartPage } from "@/components/start-page";
import { TabStrip } from "@/components/tab-strip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useMiniBrowser } from "@/hooks/use-mini-browser";
import { useBookmarks } from "@/lib/bookmarks";
import { readSession, saveSession, useSettings } from "@/lib/settings";
import type { BrowserCommand, LayoutRect } from "@/lib/types";

export function MiniApp() {
  const { state, activeTab, send, isNative } = useMiniBrowser();
  const [settings, setSetting] = useSettings();
  const [focusMode, setFocusMode] = useState(false);
  const [omniboxOpen, setOmniboxOpen] = useState(false);
  const [authenticatorOpen, setAuthenticatorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [favoritesPanelOpen, setFavoritesPanelOpen] = useState(false);
  const [toolbarHover, setToolbarHover] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const { bookmarks, remove, update, toggle, isSaved } = useBookmarks();
  const urlRef = useRef<HTMLInputElement | null>(null);
  const slotRef = useRef<HTMLDivElement | null>(null);
  const restoredRef = useRef(false);
  const isMac = window.mini?.platform === "darwin";

  const dispatch = useCallback(
    (command: BrowserCommand) => {
      void send(command);
    },
    [send],
  );

  const anySheet = authenticatorOpen || settingsOpen || favoritesPanelOpen;
  const showStart = !activeTab || activeTab.isStartPage;
  const hasPageTabs = state.tabs.some((tab) => !tab.isStartPage);
  const showOmnibox = omniboxOpen && !showStart;
  const pageVisible = !showStart && !showOmnibox && !anySheet;
  const showChrome = !focusMode && !showOmnibox && !anySheet && hasPageTabs;

  const favoritesMode = settings.favoritesMode;
  const hasFavorites = bookmarks.length > 0;
  // "hover" keeps the bar mounted at zero height so it can slide open. Nothing
  // may paint over a native page view, so revealing it reflows the page instead.
  const showFavoritesBar = showChrome && hasFavorites && favoritesMode !== "never";
  const favoritesPeek = favoritesMode === "always" || toolbarHover;
  const activeSaved = activeTab ? isSaved(activeTab.url) : false;

  const toggleBookmark = useCallback(() => {
    if (!activeTab || activeTab.isStartPage) return;
    toggle(activeTab.url, activeTab.title, activeTab.favicon);
  }, [activeTab, toggle]);

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
  }, [publishLayout, showChrome, settings.tabPosition, showFavoritesBar, favoritesPeek]);

  // Rebuild last session's tabs once, and only into an untouched window.
  useEffect(() => {
    if (restoredRef.current || state.status !== "ready") return;
    restoredRef.current = true;

    const fresh = state.tabs.length === 1 && state.tabs[0]?.isStartPage;
    const urls = settings.restoreSession ? readSession() : [];
    if (!fresh || urls.length === 0) {
      setSessionReady(true);
      return;
    }

    void (async () => {
      for (const [index, url] of urls.entries()) {
        if (index > 0) await send({ type: "newTab" });
        await send({ type: "navigate", url });
      }
      setSessionReady(true);
    })();
  }, [state.status, state.tabs, settings.restoreSession, send]);

  useEffect(() => {
    if (!sessionReady || !settings.restoreSession) return;
    saveSession(state.tabs.filter((tab) => !tab.isStartPage).map((tab) => tab.url));
  }, [sessionReady, settings.restoreSession, state.tabs]);

  // The main process picks the session partition, so it needs to know.
  useEffect(() => {
    window.mini?.persistSession(settings.persistSession);
  }, [settings.persistSession]);

  // Keep the native caption buttons on the same surface the renderer shows.
  useEffect(() => {
    window.mini?.chromeTheme("dark");
  }, [showChrome]);

  useEffect(() => {
    if (showStart && showChrome) urlRef.current?.focus();
  }, [showStart, showChrome]);

  useEffect(() => {
    const api = window.mini;
    if (!api) return;
    const closeSheets = () => {
      setAuthenticatorOpen(false);
      setSettingsOpen(false);
      setFavoritesPanelOpen(false);
    };
    const stopFocus = api.onFocusUrl(() => {
      closeSheets();
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
        closeSheets();
        setFocusMode((value) => !value);
      }
      if (what === "authenticator") {
        setOmniboxOpen(false);
        setSettingsOpen(false);
        setFavoritesPanelOpen(false);
        setAuthenticatorOpen((value) => !value);
      }
      if (what === "settings") {
        setOmniboxOpen(false);
        setAuthenticatorOpen(false);
        setFavoritesPanelOpen(false);
        setSettingsOpen((value) => !value);
      }
      if (what === "sidebar") {
        setSetting("tabPosition", settings.tabPosition === "side" ? "top" : "side");
      }
      if (what === "bookmark") {
        toggleBookmark();
      }
      if (what === "favorites") {
        // Always the manager: where the bar sits is a Settings choice, so a
        // shortcut that silently changed it was doing two unrelated jobs.
        setOmniboxOpen(false);
        setAuthenticatorOpen(false);
        setSettingsOpen(false);
        setFavoritesPanelOpen((value) => !value);
      }
    });
    return () => {
      stopFocus();
      stopToggle();
    };
  }, [showStart, focusMode, toggleBookmark, favoritesMode, settings.tabPosition, setSetting]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (anySheet) {
          event.preventDefault();
          setAuthenticatorOpen(false);
          setSettingsOpen(false);
          setFavoritesPanelOpen(false);
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
      if (mod && key === ",") {
        event.preventDefault();
        setSettingsOpen((value) => !value);
      }
      if (mod && key === "d") {
        event.preventDefault();
        toggleBookmark();
      }
      if (mod && event.shiftKey && key === "b") {
        event.preventDefault();
        setFavoritesPanelOpen((value) => !value);
      }
      if (mod && event.shiftKey && key === "s") {
        event.preventDefault();
        setSetting("tabPosition", settings.tabPosition === "side" ? "top" : "side");
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
  }, [
    anySheet,
    omniboxOpen,
    showStart,
    focusMode,
    toggleBookmark,
    favoritesMode,
    settings.tabPosition,
    setSetting,
  ]);

  const navigate = (url: string) => {
    setOmniboxOpen(false);
    setFavoritesPanelOpen(false);
    dispatch({ type: "navigate", url });
  };

  return (
    <TooltipProvider delay={250}>
      <div className="mini-root" data-agent="browser-shell">
        {showChrome ? (
          <div
            className="mini-top"
            onMouseEnter={() => setToolbarHover(true)}
            onMouseLeave={() => setToolbarHover(false)}
          >
            <CompactChrome
              tabs={state.tabs}
              activeTab={activeTab}
              urlRef={urlRef}
              isMac={isMac}
              adblockEnabled={state.adblockEnabled}
              authenticatorOpen={authenticatorOpen}
              tabPosition={settings.tabPosition}
              bookmarked={activeSaved}
              favoritesMode={favoritesMode}
              onSelect={(id) => dispatch({ type: "switchTab", id })}
              onClose={(id) => dispatch({ type: "closeTab", id })}
              onNew={() => dispatch({ type: "newTab" })}
              onNavigate={navigate}
              onAuthenticator={() => setAuthenticatorOpen((value) => !value)}
              onTabPosition={() =>
                setSetting("tabPosition", settings.tabPosition === "side" ? "top" : "side")
              }
              onBookmark={toggleBookmark}
              onFavorites={() => setFavoritesPanelOpen((value) => !value)}
              onSettings={() => setSettingsOpen((value) => !value)}
              onBack={() => dispatch({ type: "back" })}
              onForward={() => dispatch({ type: "forward" })}
              onReload={() => dispatch({ type: "reload" })}
              onFocusMode={() => setFocusMode(true)}
              onZoomReset={() => dispatch({ type: "zoomReset" })}
              onMove={(id, toIndex) => dispatch({ type: "moveTab", id, toIndex })}
              cats={settings.cats}
            />

            {showFavoritesBar ? (
              <FavoritesBar
                bookmarks={bookmarks}
                hoverMode={favoritesMode === "hover"}
                revealed={favoritesPeek}
                onOpen={navigate}
                onRemove={remove}
              />
            ) : null}
          </div>
        ) : null}

        <div className="mini-body">
          {showChrome && settings.tabPosition === "side" ? (
            <aside className="mini-sidebar">
              <TabStrip
                tabs={state.tabs}
                activeTab={activeTab}
                position="side"
                onSelect={(id) => dispatch({ type: "switchTab", id })}
                onClose={(id) => dispatch({ type: "closeTab", id })}
                onNew={() => dispatch({ type: "newTab" })}
                onMove={(id, toIndex) => dispatch({ type: "moveTab", id, toIndex })}
              />
            </aside>
          ) : null}

          <div ref={slotRef} className="mini-slot">
            {showStart && !showChrome ? (
              <StartPage
                bookmarks={bookmarks}
                onNavigate={navigate}
                onAuthenticator={() => setAuthenticatorOpen(true)}
                onSettings={() => setSettingsOpen(true)}
              />
            ) : null}

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
              <NavigationError
                message={activeTab.error}
                url={activeTab.url}
                canGoBack={activeTab.canGoBack}
                onRetry={() => activeTab.url && navigate(activeTab.url)}
                onBack={() => dispatch({ type: "back" })}
              />
            ) : null}

            {anySheet ? (
              <div className="mini-sheet-backdrop">
                {authenticatorOpen ? (
                  <Suspense
                    fallback={<div className="mini-sheet-loading">Loading authenticator…</div>}
                  >
                    <AuthenticatorPanel onClose={() => setAuthenticatorOpen(false)} />
                  </Suspense>
                ) : null}
                {settingsOpen ? (
                  <SettingsPanel
                    settings={settings}
                    onChange={setSetting}
                    onClose={() => setSettingsOpen(false)}
                  />
                ) : null}
                {favoritesPanelOpen ? (
                  <FavoritesPanel
                    bookmarks={bookmarks}
                    onOpen={navigate}
                    onRemove={remove}
                    onUpdate={update}
                    onClose={() => setFavoritesPanelOpen(false)}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

function NavigationError({
  message,
  url,
  canGoBack,
  onRetry,
  onBack,
}: {
  message: string;
  url: string;
  canGoBack: boolean;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <div className="mini-error-page" role="alert">
      <div className="mini-error-mark">!</div>
      <h1>Couldn’t load this page</h1>
      <p>{message}</p>
      {url ? <code>{url}</code> : null}
      <div className="mini-error-actions">
        <button type="button" className="mini-error-action mini-error-action-primary" onClick={onRetry}>
          <RefreshCwIcon />
          Try again
        </button>
        {canGoBack ? (
          <button type="button" className="mini-error-action" onClick={onBack}>
            <ArrowLeftIcon />
            Go back
          </button>
        ) : null}
      </div>
    </div>
  );
}
