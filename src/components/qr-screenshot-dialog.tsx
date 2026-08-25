import jsQR from "jsqr";
import { useRef, useState, type PointerEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PageCapture } from "@/lib/types";
import { selectionToImageRect, type Point, type Selection } from "@/lib/qr-selection";
import { accountTitle, buildAccount, type AuthenticatorAccount } from "@/lib/totp";

export function QrScreenshotDialog({
  capture,
  onClose,
  onImport,
}: {
  capture: PageCapture;
  onClose: () => void;
  onImport: (account: AuthenticatorAccount) => Promise<void>;
}) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [account, setAccount] = useState<AuthenticatorAccount | null>(null);
  const [message, setMessage] = useState("Drag a rectangle around the QR code.");
  const [importing, setImporting] = useState(false);

  const pointOf = (event: PointerEvent<HTMLDivElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(bounds.width, Math.max(0, event.clientX - bounds.left)),
      y: Math.min(bounds.height, Math.max(0, event.clientY - bounds.top)),
    };
  };

  const decode = (next: Selection) => {
    const image = imageRef.current;
    if (!image) return;
    const bounds = image.getBoundingClientRect();
    if (Math.abs(next.end.x - next.start.x) < 12 || Math.abs(next.end.y - next.start.y) < 12) {
      setMessage("Select a larger rectangle around the QR code.");
      setAccount(null);
      return;
    }

    const crop = selectionToImageRect(
      next,
      { width: bounds.width, height: bounds.height },
      { width: image.naturalWidth, height: image.naturalHeight },
    );
    const canvas = document.createElement("canvas");
    canvas.width = crop.width;
    canvas.height = crop.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      setMessage("Could not read the selected image.");
      return;
    }
    context.drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height,
    );
    const pixels = context.getImageData(0, 0, crop.width, crop.height);
    const result = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "attemptBoth" });
    canvas.width = 1;
    canvas.height = 1;

    if (!result) {
      setAccount(null);
      setMessage("No QR code found in that rectangle. Try including its white border.");
      return;
    }
    try {
      const parsed = buildAccount({ issuer: "", label: "", secret: result.data });
      setAccount(parsed);
      setMessage(`Found ${accountTitle(parsed)}. Review it before importing.`);
    } catch (caught) {
      setAccount(null);
      setMessage(caught instanceof Error ? caught.message : "The QR code is not a supported TOTP account.");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto bg-[#121214] text-foreground sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Scan authenticator QR code</DialogTitle>
          <DialogDescription>
            The active page was captured locally. Select only the QR code; the image is discarded when this dialog closes.
          </DialogDescription>
        </DialogHeader>

        <div
          className="relative mx-auto w-fit max-h-[62vh] max-w-full touch-none cursor-crosshair select-none overflow-hidden rounded-lg border border-white/15 bg-black"
          onPointerDown={(event) => {
            const start = pointOf(event);
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragStart(start);
            setSelection({ start, end: start });
            setAccount(null);
            setMessage("Release when the QR code is inside the rectangle.");
          }}
          onPointerMove={(event) => {
            if (!dragStart) return;
            setSelection({ start: dragStart, end: pointOf(event) });
          }}
          onPointerUp={(event) => {
            if (!dragStart) return;
            const next = { start: dragStart, end: pointOf(event) };
            setDragStart(null);
            setSelection(next);
            decode(next);
          }}
          onPointerCancel={() => setDragStart(null)}
        >
          <img
            ref={imageRef}
            src={capture.dataUrl}
            alt="Captured active page"
            className="block max-h-[62vh] max-w-full object-contain"
            draggable={false}
          />
          {selection ? <SelectionBox selection={selection} /> : null}
        </div>

        <p className="text-xs text-muted-foreground" role="status">{message}</p>
        {account ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
            <p className="font-medium text-foreground">{account.issuer || "Authenticator account"}</p>
            <p className="mt-1 text-muted-foreground">{account.label}</p>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!account || importing}
            onClick={() => {
              if (!account) return;
              setImporting(true);
              void onImport(account)
                .catch((caught) => setMessage(caught instanceof Error ? caught.message : "Could not import the account."))
                .finally(() => setImporting(false));
            }}
          >
            {importing ? "Importing…" : "Import account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SelectionBox({ selection }: { selection: Selection }) {
  const left = Math.min(selection.start.x, selection.end.x);
  const top = Math.min(selection.start.y, selection.end.y);
  const width = Math.abs(selection.end.x - selection.start.x);
  const height = Math.abs(selection.end.y - selection.start.y);
  return (
    <div
      className="pointer-events-none absolute border-2 border-emerald-400 bg-emerald-400/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
      style={{ left, top, width, height }}
    />
  );
}
