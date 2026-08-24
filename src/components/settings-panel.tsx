import { XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { FavoritesMode, MiniSettings, TabPosition } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { GoogleAuthStatus } from "@/lib/vault-types";

const FAVORITES_MODES: { value: FavoritesMode; label: string; hint: string }[] = [
  { value: "always", label: "Always", hint: "Pinned under the address bar." },
  { value: "hover", label: "On hover", hint: "Slides in when you reach the toolbar." },
  { value: "never", label: "Never", hint: "Reach them from the star instead." },
];

const TAB_POSITIONS: { value: TabPosition; label: string }[] = [
  { value: "top", label: "Top" },
  { value: "side", label: "Side" },
];

function Row({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-border px-4 py-3 first:border-t-0">
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="inline-flex gap-1 rounded-lg bg-muted p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-[7px] px-3 py-1 text-[12px] transition-colors",
            option.value === value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsPanel({
  settings,
  onChange,
  onClose,
}: {
  settings: MiniSettings;
  onChange: <K extends keyof MiniSettings>(key: K, value: MiniSettings[K]) => void;
  onClose: () => void;
}) {
  const activeMode = FAVORITES_MODES.find((mode) => mode.value === settings.favoritesMode);
  const [google, setGoogle] = useState<GoogleAuthStatus>({ configured: false, signedIn: false });
  const [googleMessage, setGoogleMessage] = useState<string | null>(null);

  useEffect(() => {
    void window.mini?.googleAuth.status().then(setGoogle);
  }, []);

  const toggleGoogle = async () => {
    const api = window.mini?.googleAuth;
    if (!api) return;
    setGoogleMessage(google.signedIn ? "Signing out…" : "Continue in your system browser…");
    try {
      const next = google.signedIn ? await api.signOut() : await api.signIn();
      setGoogle(next);
      setGoogleMessage(next.signedIn ? "Google account connected." : "Google account disconnected.");
    } catch (caught) {
      setGoogleMessage(caught instanceof Error ? caught.message : "Google sign-in failed.");
    }
  };

  return (
    <aside className="mini-sheet">
      <div className="flex items-start justify-between px-4 pt-4 pb-2">
        <div>
          <p className="text-sm font-medium text-foreground">Settings</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Kept on this device.
          </p>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close">
          <XIcon />
        </Button>
      </div>

      <div className="overflow-y-auto pb-2">
        <Row title="Favorites bar" hint={activeMode?.hint ?? ""}>
          <Segmented
            options={FAVORITES_MODES}
            value={settings.favoritesMode}
            onChange={(next) => onChange("favoritesMode", next)}
          />
        </Row>

        <Row title="Tabs" hint="Across the top, or stacked down the side.">
          <Segmented
            options={TAB_POSITIONS}
            value={settings.tabPosition}
            onChange={(next) => onChange("tabPosition", next)}
          />
        </Row>

        <Row
          title="Toolbar cats"
          hint="A cat and a kitten pad along the toolbar now and then. They stay behind the controls, so they never cover the address bar."
        >
          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-foreground">
            <input
              type="checkbox"
              className="size-3.5 accent-foreground"
              checked={settings.cats}
              onChange={(event) => onChange("cats", event.target.checked)}
            />
            Let them wander
          </label>
        </Row>

        <Row
          title="Stay signed in"
          hint="Keeps cookies and logins on disk so sites remember you next launch. Off by default: a throwaway in-memory profile is what makes this browser private. Switching either way signs you out and reopens your tabs."
        >
          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-foreground">
            <input
              type="checkbox"
              className="size-3.5 accent-foreground"
              checked={settings.persistSession}
              onChange={(event) => onChange("persistSession", event.target.checked)}
            />
            Remember logins between launches
          </label>
        </Row>

        <Row
          title="Minimal Google account"
          hint="App-owned sign-in opens your system browser and uses OAuth with PKCE. It is separate from website cookies and user-agent handling."
        >
          <Button size="sm" variant={google.signedIn ? "outline" : "default"} disabled={!google.configured} onClick={() => void toggleGoogle()}>
            {google.signedIn ? "Disconnect Google" : "Connect Google"}
          </Button>
          {!google.configured ? (
            <p className="mt-2 text-[11px] text-muted-foreground">Set MINIMAL_GOOGLE_OAUTH_CLIENT_ID to enable this build.</p>
          ) : null}
          {googleMessage ? <p className="mt-2 text-[11px] text-muted-foreground" role="status">{googleMessage}</p> : null}
        </Row>

        <Row
          title="Continue where you left off"
          hint="Reopen last session's tabs at launch. Pages reload fresh — cookies and logins are never kept."
        >
          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-foreground">
            <input
              type="checkbox"
              className="size-3.5 accent-neutral-900"
              checked={settings.restoreSession}
              onChange={(event) => onChange("restoreSession", event.target.checked)}
            />
            Restore tabs on launch
          </label>
        </Row>
      </div>
    </aside>
  );
}
