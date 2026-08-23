import { XIcon } from "lucide-react";
import { useState, type RefObject } from "react";

import type { TabInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CompactChrome({
  tabs,
  activeTab,
  urlRef,
  isMac,
  onSelect,
  onClose,
  onNavigate,
}: {
  tabs: TabInfo[];
  activeTab: TabInfo | null;
  urlRef: RefObject<HTMLInputElement | null>;
  isMac: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNavigate: (value: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const shown = focused ? draft : (activeTab?.isStartPage ? "" : (activeTab?.url ?? ""));
  const visibleTabs = tabs.filter((tab) => !tab.isStartPage || tabs.length > 1);

  return (
    <header className={cn("mini-chrome", isMac && "mini-chrome-mac")}>
      <div className="mini-tabs">
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
    </header>
  );
}
