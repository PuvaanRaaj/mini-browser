import { PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AddAccountDialog } from "@/components/add-account-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createDemoAccount, useAccounts } from "@/lib/accounts";
import {
  accountTitle,
  generateCode,
  remainingSeconds,
} from "@/lib/totp";
import { cn } from "@/lib/utils";

export function AuthenticatorPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [accounts, persist] = useAccounts();
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return accounts;
    return accounts.filter((account) =>
      accountTitle(account).toLowerCase().includes(needle),
    );
  }, [accounts, query]);

  return (
    <aside
      className={cn(
        "flex h-full w-full flex-col border-l border-border bg-card sm:w-80",
        !open && "hidden",
      )}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <div>
          <p className="text-sm font-medium">Authenticator</p>
          <p className="text-[11px] text-muted-foreground">
            TOTP codes stay on this device.
          </p>
        </div>
        <Button variant="ghost" size="xs" onClick={onClose} className="sm:hidden">
          Close
        </Button>
      </div>

      <div className="flex gap-2 px-3 pb-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search accounts"
        />
        <Button size="icon-sm" onClick={() => setDialogOpen(true)} aria-label="Add account">
          <PlusIcon />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {filtered.length === 0 ? (
          <EmptyState
            hasAccounts={accounts.length > 0}
            onAdd={() => setDialogOpen(true)}
            onDemo={() => persist([...accounts, createDemoAccount()])}
          />
        ) : (
          <ul className="space-y-1 px-2 pb-4">
            {filtered.map((account) => {
              const code = generateCode(account, now);
              const remaining = remainingSeconds(account.period, now);
              return (
                <li key={account.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-muted/70"
                    onClick={async () => {
                      await navigator.clipboard.writeText(code);
                      setCopiedId(account.id);
                      window.setTimeout(
                        () => setCopiedId((id) => (id === account.id ? null : id)),
                        1200,
                      );
                    }}
                  >
                    <Countdown remaining={remaining} period={account.period} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-xs text-muted-foreground">
                        {accountTitle(account)}
                      </span>
                      <span className="font-mono text-lg tracking-[0.18em] text-foreground">
                        {formatCode(code)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {copiedId === account.id ? "Copied" : "Click to copy"}
                      </span>
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-destructive"
                      onClick={(event) => {
                        event.stopPropagation();
                        persist(accounts.filter((item) => item.id !== account.id));
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          persist(accounts.filter((item) => item.id !== account.id));
                        }
                      }}
                      aria-label={`Delete ${accountTitle(account)}`}
                    >
                      <Trash2Icon className="size-3.5" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>

      <AddAccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAdd={(account) => persist([...accounts, account])}
      />
    </aside>
  );
}

function formatCode(code: string): string {
  if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`;
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`;
  return code;
}

function Countdown({ remaining, period }: { remaining: number; period: number }) {
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - remaining / period);
  const urgent = remaining <= 5;

  return (
    <svg viewBox="0 0 24 24" className="size-7 shrink-0">
      <circle
        cx="12"
        cy="12"
        r={radius}
        className="fill-none stroke-white/10"
        strokeWidth="2.5"
      />
      <circle
        cx="12"
        cy="12"
        r={radius}
        className={urgent ? "fill-none stroke-red-400" : "fill-none stroke-emerald-400"}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 12 12)"
      />
    </svg>
  );
}

function EmptyState({
  hasAccounts,
  onAdd,
  onDemo,
}: {
  hasAccounts: boolean;
  onAdd: () => void;
  onDemo: () => void;
}) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-sm font-medium">
        {hasAccounts ? "No matching accounts" : "No codes yet"}
      </p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Paste an otpauth:// URI or a base32 secret from GitHub, Vercel, Google,
        or anywhere else that uses TOTP.
      </p>
      {!hasAccounts ? (
        <div className="mt-4 flex justify-center gap-2">
          <Button size="sm" onClick={onAdd}>
            Add account
          </Button>
          <Button size="sm" variant="outline" onClick={onDemo}>
            Load demo
          </Button>
        </div>
      ) : null}
    </div>
  );
}
