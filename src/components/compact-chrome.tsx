import { KeyRoundIcon, PlusIcon, ShieldCheckIcon, XIcon } from "lucide-react";
import { useState, type RefObject } from "react";

import { modLabel } from "@/lib/mod";
import type { TabInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CompactChrome({
  tabs,
  activeTab,
  urlRef,
  isMac,
  adblockEnabled,
  authenticatorOpen,
  onSelect,
  onClose,
  onNew,
  onNavigate,
  onAuthenticator,
}: {
  tabs: TabInfo[];
  activeTab: TabInfo | null;
  urlRef: RefObject<HTMLInputElement | null>;
  isMac: boolean;
  adblockEnabled: boolean;
  authenticatorOpen: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onNavigate: (value: string) => void;
  onAuthenticator: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const shown = focused ? draft : (activeTab?.isStartPage ? "" : (activeTab?.url ?? ""));
  const visibleTabs = tabs.filter((tab) => !tab.isStartPage || tabs.length > 1);
  const mod = modLabel();

  return (
    <header className={cn("mini-chrome", isMac && "mini-chrome-mac")}>
      <div className="mini-tabs" data-agent="tabs">
        {visibleTabs.map((tab) => {
          const active = tab.id === activeTab?.id;
          return (
            <div
              key={tab.id}
              className={cn("mini-tab", active && "mini-tab-active")}
            >
              <button
                type="button"
                className="mini-tab-label"
                data-agent="tab"
                data-tab-id={tab.id}
                onClick={() => onSelect(tab.id)}
              >
                <span className="mini-tab-title">
                  {tab.loading ? "Loading…" : tab.title || "New tab"}
                </span>
              </button>
              {tabs.length > 1 ? (
                <button
                  type="button"
                  className="mini-tab-close"
                  data-agent="close-tab"
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose(tab.id);
                  }}
                  aria-label="Close tab"
                >
                  <XIcon />
                </button>
              ) : null}
            </div>
          );
        })}
        <button
          type="button"
          className="mini-icon-btn"
          data-agent="new-tab"
          onClick={onNew}
          title={`New tab (${mod}+T)`}
          aria-label="New tab"
        >
          <PlusIcon />
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
      </div>
    </header>
  );
}
