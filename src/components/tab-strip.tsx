import { PlusIcon, XIcon } from "lucide-react";

import { SiteIcon } from "@/components/site-icon";
import { modLabel } from "@/lib/mod";
import type { TabInfo, TabPosition } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TabStrip({
  tabs,
  activeTab,
  position,
  onSelect,
  onClose,
  onNew,
}: {
  tabs: TabInfo[];
  activeTab: TabInfo | null;
  position: TabPosition;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}) {
  const visibleTabs = tabs.filter((tab) => !tab.isStartPage || tabs.length > 1);
  const side = position === "side";
  const mod = modLabel();

  return (
    <div className={cn("mini-tabs", side && "mini-tabs-side")} data-agent="tabs">
      {visibleTabs.map((tab) => {
        const active = tab.id === activeTab?.id;
        return (
          <div
            key={tab.id}
            className={cn("mini-tab", active && "mini-tab-active", side && "mini-tab-side")}
          >
            <button
              type="button"
              className="mini-tab-label"
              data-agent="tab"
              data-tab-id={tab.id}
              onClick={() => onSelect(tab.id)}
            >
              {!tab.isStartPage ? (
                <SiteIcon favicon={tab.favicon} url={tab.url} title={tab.title} />
              ) : null}
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
        className={cn("mini-icon-btn", side && "mini-new-tab-side")}
        data-agent="new-tab"
        onClick={onNew}
        title={`New tab (${mod}+T)`}
        aria-label="New tab"
      >
        <PlusIcon />
      </button>
    </div>
  );
}
