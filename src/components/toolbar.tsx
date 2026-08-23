"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  KeyRoundIcon,
  RotateCwIcon,
  ScanSearchIcon,
} from "lucide-react";
import { useState, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { modLabel } from "@/lib/mod";
import type { TabInfo } from "@/lib/types";
import { displayUrl } from "@/lib/url";
import { cn } from "@/lib/utils";

export function Toolbar({
  tab,
  focusMode,
  authenticatorOpen,
  onBack,
  onForward,
  onReload,
  onNavigate,
  onToggleFocus,
  onToggleAuthenticator,
  urlRef,
}: {
  tab: TabInfo | null;
  focusMode: boolean;
  authenticatorOpen: boolean;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onNavigate: (value: string) => void;
  onToggleFocus: () => void;
  onToggleAuthenticator: () => void;
  urlRef: RefObject<HTMLInputElement | null>;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const mod = modLabel();
  const shown = focused ? draft : displayUrl(tab?.url ?? draft);

  return (
    <div className="flex items-center gap-1 px-2 py-1.5">
      <IconTip label="Back" shortcut="Alt+←">
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={!tab?.canGoBack}
          onClick={onBack}
        >
          <ArrowLeftIcon />
        </Button>
      </IconTip>
      <IconTip label="Forward" shortcut="Alt+→">
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={!tab?.canGoForward}
          onClick={onForward}
        >
          <ArrowRightIcon />
        </Button>
      </IconTip>
      <IconTip label="Reload" shortcut={`${mod}+R`}>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={!tab || tab.isStartPage}
          onClick={onReload}
        >
          <RotateCwIcon className={cn(tab?.loading && "animate-spin")} />
        </Button>
      </IconTip>

      <form
        className="relative mx-1 min-w-0 flex-1"
        onSubmit={(event) => {
          event.preventDefault();
          onNavigate(draft);
          urlRef.current?.blur();
        }}
      >
        <input
          ref={urlRef}
          value={shown}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => {
            setFocused(true);
            setDraft(tab?.url ?? draft);
            event.target.select();
          }}
          onBlur={() => setFocused(false)}
          placeholder="Search or enter address"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="h-8 w-full rounded-full border border-input bg-input/40 px-3.5 text-[13px] outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:bg-background focus:ring-3 focus:ring-ring/40"
        />
      </form>

      <span className="hidden items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-emerald-300 uppercase sm:inline-flex">
        Fresh
      </span>

      <IconTip label="Focus mode" shortcut={`${mod}+Shift+F`}>
        <Button
          variant={focusMode ? "secondary" : "ghost"}
          size="icon-xs"
          onClick={onToggleFocus}
          aria-pressed={focusMode}
        >
          <ScanSearchIcon />
        </Button>
      </IconTip>
      <IconTip label="Authenticator" shortcut={`${mod}+Shift+A`}>
        <Button
          variant={authenticatorOpen ? "secondary" : "ghost"}
          size="icon-xs"
          onClick={onToggleAuthenticator}
          aria-pressed={authenticatorOpen}
        >
          <KeyRoundIcon />
        </Button>
      </IconTip>
    </div>
  );
}

function IconTip({
  label,
  shortcut,
  children,
}: {
  label: string;
  shortcut: string;
  children: React.ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>
        {label}
        <kbd className="ml-1 rounded bg-background/20 px-1 font-mono text-[10px]">
          {shortcut}
        </kbd>
      </TooltipContent>
    </Tooltip>
  );
}
