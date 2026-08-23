"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildAccount, type AuthenticatorAccount } from "@/lib/totp";

export function AddAccountDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (account: AuthenticatorAccount) => void;
}) {
  const [issuer, setIssuer] = useState("");
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setIssuer("");
    setLabel("");
    setSecret("");
    setError(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add authenticator</DialogTitle>
          <DialogDescription>
            Paste a TOTP setup URI, or type the issuer, account, and base32
            secret from the service you are signing in to.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              const account = buildAccount({ issuer, label, secret });
              onAdd(account);
              reset();
              onOpenChange(false);
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "Could not add account.");
            }
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="secret">Secret or otpauth URI</Label>
            <Input
              id="secret"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder="otpauth://totp/… or JBSWY3DPEHPK3PXP"
              autoFocus
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="issuer">Issuer</Label>
            <Input
              id="issuer"
              value={issuer}
              onChange={(event) => setIssuer(event.target.value)}
              placeholder="GitHub"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="label">Account</Label>
            <Input
              id="label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="you@example.com"
            />
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Save account</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
