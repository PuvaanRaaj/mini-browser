"use client";

import { KeyRoundIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { modLabel } from "@/lib/mod";

export function StartPage({
  onNavigate,
  onOpenAuthenticator,
  extensionLoaded,
}: {
  onNavigate: (value: string) => void;
  onOpenAuthenticator: () => void;
  extensionLoaded: boolean;
}) {
  const mod = modLabel();

  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="w-full max-w-xl">
        <p className="text-center text-[11px] tracking-[0.28em] text-muted-foreground uppercase">
          Personal browser
        </p>
        <h1 className="mt-3 text-center text-5xl font-medium tracking-tight text-foreground">
          Mini
        </h1>
        <p className="mx-auto mt-3 max-w-md text-center text-sm leading-6 text-muted-foreground">
          A clean Chromium session for screen shares, streams, and tests. Nothing
          from your everyday browser comes along.
        </p>

        <form
          className="mt-8"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const q = String(data.get("q") ?? "");
            onNavigate(q);
          }}
        >
          <input
            name="q"
            autoFocus
            placeholder="Search the web or type a URL"
            className="h-12 w-full rounded-full border border-input bg-input/30 px-5 text-[15px] outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/40"
          />
        </form>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {[
            ["example.com", "https://example.com"],
            ["DuckDuckGo", "https://duckduckgo.com"],
            ["wikipedia.org", "https://wikipedia.org"],
          ].map(([label, url]) => (
            <Button
              key={label}
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => onNavigate(url)}
            >
              {label}
            </Button>
          ))}
          <Button
            variant="secondary"
            size="sm"
            className="rounded-full"
            onClick={onOpenAuthenticator}
          >
            <KeyRoundIcon />
            Authenticator
          </Button>
        </div>

        <dl className="mt-12 grid gap-3 text-center text-xs text-muted-foreground sm:grid-cols-3">
          <div>
            <dt className="font-medium text-foreground/80">Focus mode</dt>
            <dd className="mt-1">
              {mod}+Shift+F hides chrome, Orion-style.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground/80">Fresh session</dt>
            <dd className="mt-1">Cookies die when you reset or quit.</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground/80">2FA stays here</dt>
            <dd className="mt-1">
              {extensionLoaded
                ? "Built-in panel plus the Mini Authenticator extension."
                : "Codes live in Mini, not in the throwaway profile."}
            </dd>
          </div>
        </dl>

        <p className="mt-10 text-center text-[11px] text-muted-foreground/80">
          {mod}+L address · {mod}+T tab · {mod}+Shift+A authenticator
        </p>
      </div>
    </div>
  );
}
