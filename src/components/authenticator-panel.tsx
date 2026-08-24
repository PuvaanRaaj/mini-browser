import { FileUpIcon, KeyRoundIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AddAccountDialog } from "@/components/add-account-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createDemoAccount, useAccounts } from "@/lib/accounts";
import { parseAuthenticatorBackup } from "@/lib/import-backup";
import { accountTitle } from "@/lib/totp";
import type { PasswordEntry } from "@/lib/vault-types";

export function AuthenticatorPanel({ onClose, activeUrl }: { onClose: () => void; activeUrl: string }) {
  const { accounts, status, error, importAccounts, remove } = useAccounts();
  const [section, setSection] = useState<"codes" | "passwords">("codes");
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const importBackup = async (file: File) => {
    setImportMessage(null);
    try {
      const result = parseAuthenticatorBackup(await file.text());
      if (result.accounts.length === 0) {
        throw new Error(
          "No supported TOTP accounts found. Export an unencrypted JSON or otpauth backup.",
        );
      }

      const imported = await importAccounts(result.accounts);
      const skipped = result.skipped > 0 ? ` ${result.skipped} skipped.` : "";
      setImportMessage(
        imported > 0
          ? `Imported ${imported} account${imported === 1 ? "" : "s"}.${skipped} Delete the backup file when finished.`
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
            Passwords and TOTP secrets use your OS keychain.
          </p>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close">
          <XIcon />
        </Button>
      </div>

      <div className="flex gap-1 px-4 pb-3" role="tablist">
        <Button size="sm" variant={section === "codes" ? "default" : "outline"} onClick={() => setSection("codes")}>Codes</Button>
        <Button size="sm" variant={section === "passwords" ? "default" : "outline"} onClick={() => setSection("passwords")}>Passwords</Button>
      </div>

      {!status.available ? (
        <p className="px-4 pb-3 text-[11px] leading-4 text-destructive" role="alert">
          {status.message}
        </p>
      ) : null}
      {error ? <p className="px-4 pb-3 text-[11px] text-destructive" role="alert">{error}</p> : null}

      {section === "codes" ? <><div className="flex gap-2 px-4 pb-3">
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
          disabled={!status.available}
          data-agent="import-2fa-backup"
          aria-label="Import authenticator backup"
          title="Import backup"
        >
          <FileUpIcon />
          Import
        </Button>
        <Button data-agent="add-2fa-account" size="icon-sm" disabled={!status.available} onClick={() => setDialogOpen(true)} aria-label="Add account">
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
            onDemo={() => void importAccounts([createDemoAccount()])}
          />
        ) : (
          <ul className="space-y-1 px-2 pb-4">
            {filtered.map((account) => {
              const code = account.code;
              const remaining = account.remaining;
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
                        void remove(account.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          void remove(account.id);
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
        onAdd={(account) => void importAccounts([account])}
      />
      </> : <PasswordManager activeUrl={activeUrl} available={status.available} />}
    </aside>
  );
}

function PasswordManager({ activeUrl, available }: { activeUrl: string; available: boolean }) {
  const [entries, setEntries] = useState<PasswordEntry[]>([]);
  const [origin, setOrigin] = useState(() => originOf(activeUrl));
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async () => {
    if (!available || !window.mini) return;
    setEntries(await window.mini.vault.listPasswords());
  };

  useEffect(() => {
    void refresh().catch((caught) => setMessage(messageOf(caught)));
  }, [available]);

  useEffect(() => {
    const current = originOf(activeUrl);
    if (current) setOrigin(current);
  }, [activeUrl]);

  const save = async () => {
    if (!window.mini) return;
    try {
      await window.mini.vault.savePassword({ origin, username, password });
      setPassword("");
      setMessage("Password saved in the OS-backed vault.");
      await refresh();
    } catch (caught) {
      setMessage(messageOf(caught));
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 px-4 pb-4">
        <Input value={origin} onChange={(event) => setOrigin(event.target.value)} placeholder="https://example.com" disabled={!available} />
        <Input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username or email" autoComplete="off" disabled={!available} />
        <Input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" autoComplete="new-password" disabled={!available} />
        <Button className="w-full" disabled={!available || !origin || !username || !password} onClick={() => void save()}>
          <KeyRoundIcon /> Save password
        </Button>
        {message ? <p className="text-[11px] leading-4 text-muted-foreground" role="status">{message}</p> : null}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {entries.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-muted-foreground">No saved passwords.</p>
        ) : (
          <ul className="space-y-1 px-2 pb-4">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-accent">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => void window.mini?.vault.fillPassword(entry.id).then(
                    () => setMessage(`Filled ${entry.username} on ${entry.origin}.`),
                    (caught) => setMessage(messageOf(caught)),
                  )}
                >
                  <span className="block truncate text-xs text-foreground">{entry.username}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{entry.origin}</span>
                </button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Delete password for ${entry.username}`}
                  onClick={() => void window.mini?.vault.deletePassword(entry.id).then(refresh)}
                >
                  <Trash2Icon />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}

function originOf(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.origin : "";
  } catch {
    return "";
  }
}

function messageOf(value: unknown): string {
  return value instanceof Error ? value.message : "The secure vault operation failed.";
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
