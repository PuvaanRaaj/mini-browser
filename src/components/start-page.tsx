import { KeyRoundIcon, SettingsIcon } from "lucide-react";

import { Omnibox } from "@/components/omnibox";
import { modLabel } from "@/lib/mod";
import type { Bookmark } from "@/lib/types";
import { hostnameOf } from "@/lib/url";

function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function StartPage({
  bookmarks,
  onNavigate,
  onAuthenticator,
  onSettings,
}: {
  bookmarks: Bookmark[];
  onNavigate: (value: string) => void;
  onAuthenticator: () => void;
  onSettings: () => void;
}) {
  const mod = modLabel();
  const tiles = bookmarks.slice(0, 8);

  return (
    <div className="mini-start">
      <div className="mini-start-inner">
        <div className="mini-start-mark">
          <span className="mini-start-ring" aria-hidden="true" />
          <span className="mini-start-word">Minimal</span>
        </div>

        <p className="mini-start-greeting">{greeting()}</p>

        <Omnibox onSubmit={onNavigate} />

        {tiles.length > 0 ? (
          <div className="mini-start-tiles">
            {tiles.map((bookmark) => (
              <button
                key={bookmark.id}
                type="button"
                className="mini-start-tile"
                onClick={() => onNavigate(bookmark.url)}
                title={bookmark.url}
              >
                <span className="mini-start-tile-badge">
                  {(hostnameOf(bookmark.url) || bookmark.title || "?")
                    .trim()[0]
                    ?.toUpperCase() ?? "?"}
                </span>
                <span className="mini-start-tile-title">
                  {bookmark.title || hostnameOf(bookmark.url)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mini-start-empty">
            Save a page with {mod}+D and it shows up here.
          </p>
        )}

        <div className="mini-start-hints">
          <span>
            <kbd>{mod}+T</kbd> new tab
          </span>
          <span>
            <kbd>{mod}+Shift+F</kbd> focus mode
          </span>
          <span>
            <kbd>{mod}+Shift+A</kbd> authenticator
          </span>
        </div>
      </div>

      <div className="mini-start-corner">
        <button
          type="button"
          className="mini-corner-ext"
          onClick={onSettings}
          title={`Settings (${mod}+,)`}
          aria-label="Settings"
        >
          <SettingsIcon />
        </button>
        <button
          type="button"
          className="mini-corner-ext"
          onClick={onAuthenticator}
          title={`Authenticator (${mod}+Shift+A)`}
          aria-label="Authenticator"
        >
          <KeyRoundIcon />
        </button>
      </div>
    </div>
  );
}
