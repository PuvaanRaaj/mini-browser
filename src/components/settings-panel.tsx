import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { FavoritesMode, MiniSettings, TabPosition } from "@/lib/types";
import { cn } from "@/lib/utils";

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
    <div className="border-t border-neutral-100 px-4 py-3 first:border-t-0">
      <p className="text-[13px] font-medium text-neutral-900">{title}</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-500">{hint}</p>
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
    <div className="inline-flex gap-1 rounded-lg bg-neutral-100 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-[7px] px-3 py-1 text-[12px] transition-colors",
            option.value === value
              ? "bg-white text-neutral-900 shadow-sm"
              : "text-neutral-500 hover:text-neutral-800",
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

  return (
    <aside className="mini-sheet">
      <div className="flex items-start justify-between px-4 pt-4 pb-2">
        <div>
          <p className="text-sm font-medium text-neutral-900">Settings</p>
          <p className="mt-0.5 text-[11px] text-neutral-500">
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
          title="Continue where you left off"
          hint="Reopen last session's tabs at launch. Pages reload fresh — cookies and logins are never kept."
        >
          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-neutral-700">
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
