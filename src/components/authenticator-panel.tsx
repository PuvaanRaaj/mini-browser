import { FileUpIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AddAccountDialog } from "@/components/add-account-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createDemoAccount, useAccounts } from "@/lib/accounts";
import { parseAuthenticatorBackup } from "@/lib/import-backup";
import { accountTitle, generateCode, remainingSeconds } from "@/lib/totp";

export function AuthenticatorPanel({ onClose }: { onClose: () => void }) {
  const [accounts, persist] = useAccounts();
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const importBackup = async (file: File) => {
    setImportMessage(null);
    try {
      const result = parseAuthenticatorBackup(await file.text());
      if (result.accounts.length === 0) {
        throw new Error(
          "No supported TOTP accounts found. Export an unencrypted JSON or otpauth backup.",
        );
      }

      const existing = new Set(accounts.map(accountKey));
      const newAccounts = result.accounts.filter((account) => {
        const key = accountKey(account);
        if (existing.has(key)) return false;
        existing.add(key);
        return true;
      });

      if (newAccounts.length > 0) persist([...accounts, ...newAccounts]);
      const skipped = result.skipped > 0 ? ` ${result.skipped} skipped.` : "";
      setImportMessage(
        newAccounts.length > 0
          ? `Imported ${newAccounts.length} account${newAccounts.length === 1 ? "" : "s"}.${skipped} Delete the backup file when finished.`
          : `All accounts were already present.${skipped}`,
      );
    } catch (caught) {
      setImportMessage(caught instanceof Error ? caught.message : "Could not import backup.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return accounts;
    return accounts.filter((account) =>
      accountTitle(account).toLowerCase().includes(needle),
    );
  }, [accounts, query]);

  return (
    <aside className="mini-sheet" data-agent="authenticator-panel">
      <div className="flex items-start justify-between px-4 pt-4 pb-2">
        <div>
          <p className="text-sm font-medium text-foreground">Authenticator</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            TOTP codes stay on this device.
          </p>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close">
          <XIcon />
        </Button>
      </div>

      <div className="flex gap-2 px-4 pb-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search accounts"
        />
        <input
          ref={fileInputRef}
          className="hidden"
          type="file"
          accept=".json,.txt,application/json,text/plain"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importBackup(file);
          }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          data-agent="import-2fa-backup"
          aria-label="Import authenticator backup"
          title="Import backup"
        >
          <FileUpIcon />
          Import
        </Button>
        <Button data-agent="add-2fa-account" size="icon-sm" onClick={() => setDialogOpen(true)} aria-label="Add account">
          <PlusIcon />
        </Button>
      </div>
      {importMessage ? (
        <p className="px-4 pb-3 text-[11px] leading-4 text-muted-foreground" role="status">
          {importMessage}
        </p>
      ) : null}

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
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-accent"
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
                      className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
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

function accountKey(account: {
  issuer: string;
  label: string;
  secret: string;
  algorithm: string;
  digits: number;
  period: number;
}): string {
  return [
    account.issuer.toLowerCase(),
    account.label.toLowerCase(),
    account.secret,
  ].join("\u0000");
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
        className="fill-none stroke-neutral-200"
        strokeWidth="2.5"
      />
      <circle
        cx="12"
        cy="12"
        r={radius}
        className={urgent ? "fill-none stroke-red-500" : "fill-none stroke-emerald-500"}
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
      <p className="text-sm font-medium text-foreground">
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
