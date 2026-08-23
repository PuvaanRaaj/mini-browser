import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BookmarkIcon,
  EyeIcon,
  KeyRoundIcon,
  PanelLeftIcon,
  PanelTopIcon,
  RotateCwIcon,
  SettingsIcon,
  ShieldCheckIcon,
  StarIcon,
} from "lucide-react";
import { useState, type RefObject } from "react";

import { TabStrip } from "@/components/tab-strip";
import { modLabel } from "@/lib/mod";
import type { FavoritesMode, TabInfo, TabPosition } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CompactChrome({
  tabs,
  activeTab,
  urlRef,
  isMac,
  adblockEnabled,
  authenticatorOpen,
  tabPosition,
  bookmarked,
  favoritesMode,
  onSelect,
  onClose,
  onNew,
  onNavigate,
  onAuthenticator,
  onTabPosition,
  onBookmark,
  onFavorites,
  onSettings,
  onBack,
  onForward,
  onReload,
  onFocusMode,
}: {
  tabs: TabInfo[];
  activeTab: TabInfo | null;
  urlRef: RefObject<HTMLInputElement | null>;
  isMac: boolean;
  adblockEnabled: boolean;
  authenticatorOpen: boolean;
  tabPosition: TabPosition;
  bookmarked: boolean;
  favoritesMode: FavoritesMode;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onNavigate: (value: string) => void;
  onAuthenticator: () => void;
  onTabPosition: () => void;
  onBookmark: () => void;
  onFavorites: () => void;
  onSettings: () => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onFocusMode: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const shown = focused ? draft : (activeTab?.isStartPage ? "" : (activeTab?.url ?? ""));
  const mod = modLabel();

  return (
    <header className={cn("mini-chrome", isMac && "mini-chrome-mac")}>
      {tabPosition === "top" ? (
        <TabStrip
          tabs={tabs}
          activeTab={activeTab}
          position="top"
          onSelect={onSelect}
          onClose={onClose}
          onNew={onNew}
        />
      ) : null}

      <div className="mini-nav">
        <button
          type="button"
          className="mini-icon-btn"
          onClick={onBack}
          disabled={!activeTab?.canGoBack}
          title={`Back (${mod}+[)`}
          aria-label="Back"
        >
          <ArrowLeftIcon />
        </button>
        <button
          type="button"
          className="mini-icon-btn"
          onClick={onForward}
          disabled={!activeTab?.canGoForward}
          title={`Forward (${mod}+])`}
          aria-label="Forward"
        >
          <ArrowRightIcon />
        </button>
        <button
          type="button"
          className="mini-icon-btn"
          onClick={onReload}
          title={`Reload (${mod}+R)`}
          aria-label="Reload"
        >
          <RotateCwIcon />
        </button>
      </div>

      <form
        className="mini-url-form"
        onSubmit={(event) => {
          event.preventDefault();
          onNavigate(draft || shown);
          urlRef.current?.blur();
        }}
      >
        <input
          ref={urlRef}
          className="mini-url"
          data-agent="address-bar"
          aria-label="Address bar"
          value={shown}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => {
            setFocused(true);
            setDraft(activeTab?.url ?? draft);
            event.target.select();
          }}
          onBlur={() => setFocused(false)}
          placeholder="Enter URL or search..."
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
        />
      </form>

      <div className="mini-ext-tray">
        <button
          type="button"
          className={cn("mini-icon-btn", bookmarked && "mini-icon-btn-active")}
          onClick={onBookmark}
          title={bookmarked ? `Remove favorite (${mod}+D)` : `Add favorite (${mod}+D)`}
          aria-label="Favorite this page"
          aria-pressed={bookmarked}
        >
          <StarIcon fill={bookmarked ? "currentColor" : "none"} />
        </button>
        {favoritesMode === "never" ? (
          <button
            type="button"
            className="mini-icon-btn"
            onClick={onFavorites}
            title={`Favorites (${mod}+Shift+B)`}
            aria-label="Favorites"
          >
            <BookmarkIcon />
          </button>
        ) : null}
        <button
          type="button"
          className="mini-icon-btn"
          onClick={onTabPosition}
          title={
            tabPosition === "side"
              ? `Tabs on top (${mod}+Shift+S)`
              : `Tabs on the side (${mod}+Shift+S)`
          }
          aria-label="Toggle tab position"
        >
          {tabPosition === "side" ? <PanelTopIcon /> : <PanelLeftIcon />}
        </button>
        <button
          type="button"
          className="mini-icon-btn"
          data-agent="ad-blocker-status"
          title={adblockEnabled ? "Blocking ads and trackers" : "Ad blocker starting…"}
          aria-label="Ad blocker"
        >
          <ShieldCheckIcon />
        </button>
        <button
          type="button"
          className={cn("mini-icon-btn", authenticatorOpen && "mini-icon-btn-active")}
          data-agent="authenticator"
          onClick={onAuthenticator}
          title={`Authenticator (${mod}+Shift+A)`}
          aria-label="Authenticator"
        >
          <KeyRoundIcon />
        </button>
        <button
          type="button"
          className="mini-icon-btn"
          onClick={onFocusMode}
          title={`Focus mode — hides this bar, ${mod}+Shift+F to bring it back`}
          aria-label="Focus mode"
        >
          <EyeIcon />
        </button>
        <button
          type="button"
          className="mini-icon-btn"
          onClick={onSettings}
          title={`Settings (${mod}+,)`}
          aria-label="Settings"
        >
          <SettingsIcon />
        </button>
      </div>
    </header>
  );
}
