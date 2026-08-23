import { XIcon } from "lucide-react";

import { SiteIcon } from "@/components/site-icon";
import type { Bookmark } from "@/lib/types";
import { hostnameOf } from "@/lib/url";
import { cn } from "@/lib/utils";

export function FavoritesBar({
  bookmarks,
  hoverMode,
  revealed,
  onOpen,
  onRemove,
}: {
  bookmarks: Bookmark[];
  hoverMode: boolean;
  revealed: boolean;
  onOpen: (url: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "mini-favorites",
        hoverMode && "mini-favorites-hover",
        hoverMode && revealed && "mini-favorites-peek",
      )}
      aria-hidden={hoverMode && !revealed}
    >
      {bookmarks.map((bookmark) => (
        <div key={bookmark.id} className="mini-fav">
          <button
            type="button"
            className="mini-fav-label"
            onClick={() => onOpen(bookmark.url)}
            title={bookmark.url}
          >
            <SiteIcon
              favicon={bookmark.favicon}
              url={bookmark.url}
              title={bookmark.title}
              className="mini-fav-badge"
            />
            <span className="mini-fav-title">
              {bookmark.title || hostnameOf(bookmark.url)}
            </span>
          </button>
          <button
            type="button"
            className="mini-fav-remove"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(bookmark.id);
            }}
            aria-label={`Remove ${bookmark.title}`}
          >
            <XIcon />
          </button>
        </div>
      ))}
    </div>
  );
}
