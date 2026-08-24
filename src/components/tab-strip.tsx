import { PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";

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
  onMove,
}: {
  tabs: TabInfo[];
  activeTab: TabInfo | null;
  position: TabPosition;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onMove: (id: string, toIndex: number) => void;
}) {
  const visibleTabs = tabs.filter((tab) => !tab.isStartPage || tabs.length > 1);
  const side = position === "side";
  const mod = modLabel();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const drop = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    // Index into the full tab list, since the strip may hide the start tab.
    onMove(draggingId, tabs.findIndex((tab) => tab.id === targetId));
    setDraggingId(null);
    setOverId(null);
  };

  return (
    <div className={cn("mini-tabs", side && "mini-tabs-side")} data-agent="tabs">
      {visibleTabs.map((tab) => {
        const active = tab.id === activeTab?.id;
        return (
          <div
            key={tab.id}
            className={cn(
              "mini-tab",
              active && "mini-tab-active",
              side && "mini-tab-side",
              draggingId === tab.id && "mini-tab-dragging",
              overId === tab.id && draggingId !== tab.id && "mini-tab-drop-target",
            )}
            draggable
            onDragStart={(event) => {
              setDraggingId(tab.id);
              event.dataTransfer.effectAllowed = "move";
              // Firefox and Chromium both refuse to start a drag without data.
              event.dataTransfer.setData("text/plain", tab.id);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setOverId(tab.id);
            }}
            onDragLeave={() => setOverId((id) => (id === tab.id ? null : id))}
            onDrop={(event) => {
              event.preventDefault();
              drop(tab.id);
            }}
            onDragEnd={() => {
              setDraggingId(null);
              setOverId(null);
            }}
          >
            <button
              type="button"
              className="mini-tab-label"
              data-agent="tab"
              data-tab-id={tab.id}
              onClick={() => onSelect(tab.id)}
            >
              {!tab.isStartPage || side ? (
                <SiteIcon
                  favicon={tab.favicon}
                  url={tab.url}
                  title={tab.isStartPage ? "New tab" : tab.title}
                />
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
        {side ? <span className="mini-tab-title">New tab</span> : null}
      </button>
    </div>
  );
}
