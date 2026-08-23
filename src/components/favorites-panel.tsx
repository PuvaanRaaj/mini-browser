import { Trash2Icon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Bookmark } from "@/lib/types";
import { hostnameOf } from "@/lib/url";

export function FavoritesPanel({
  bookmarks,
  onOpen,
  onRemove,
  onClose,
}: {
  bookmarks: Bookmark[];
  onOpen: (url: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <aside className="mini-sheet">
      <div className="flex items-start justify-between px-4 pt-4 pb-2">
        <div>
          <p className="text-sm font-medium text-foreground">Favorites</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {bookmarks.length === 0
              ? "Nothing saved yet."
              : `${bookmarks.length} saved page${bookmarks.length === 1 ? "" : "s"}.`}
          </p>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close">
          <XIcon />
        </Button>
      </div>

      <div className="overflow-y-auto px-2 pb-3">
        {bookmarks.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] text-muted-foreground">
            Press the star in the toolbar to save the page you are on.
          </p>
        ) : (
          bookmarks.map((bookmark) => (
            <div
              key={bookmark.id}
              className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent"
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 flex-col items-start text-left"
                onClick={() => onOpen(bookmark.url)}
              >
                <span className="w-full truncate text-[13px] text-foreground">
                  {bookmark.title || hostnameOf(bookmark.url)}
                </span>
                <span className="w-full truncate text-[11px] text-muted-foreground">
                  {hostnameOf(bookmark.url)}
                </span>
              </button>
              <Button
                variant="ghost"
                size="icon-xs"
                className="opacity-0 group-hover:opacity-100"
                onClick={() => onRemove(bookmark.id)}
                aria-label={`Remove ${bookmark.title}`}
              >
                <Trash2Icon />
              </Button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
