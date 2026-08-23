"use client";

import { PlusIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { faviconFor } from "@/lib/url";
import type { TabInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TabStrip({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onNew,
}: {
  tabs: TabInfo[];
  activeTabId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex min-w-0 items-end gap-1">
      <div className="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          const favicon = tab.isStartPage ? null : faviconFor(tab.url);
          return (
            <div
              key={tab.id}
              className={cn(
                "group flex h-8 max-w-48 min-w-32 shrink-0 items-center gap-1.5 rounded-t-lg px-2 text-left text-xs transition-colors",
                active
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:bg-background/50 hover:text-foreground",
              )}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5"
                onClick={() => onSelect(tab.id)}
              >
                {tab.loading ? (
                  <span className="size-3 shrink-0 animate-spin rounded-full border border-muted-foreground/40 border-t-foreground" />
                ) : favicon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={favicon} alt="" className="size-3 shrink-0 rounded-sm" />
                ) : (
                  <span className="size-3 shrink-0 rounded-full border border-muted-foreground/40" />
                )}
                <span className="truncate">{tab.title || "New tab"}</span>
              </button>
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100"
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(tab.id);
                }}
                aria-label="Close tab"
              >
                <XIcon className="size-3" />
              </button>
            </div>
          );
        })}
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        className="mb-0.5 shrink-0"
        onClick={onNew}
        aria-label="New tab"
      >
        <PlusIcon />
      </Button>
    </div>
  );
}
