"use client";

import { useEffect, useRef } from "react";

import type { BrowserCommand, TabInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Viewport({
  tab,
  frame,
  onCommand,
  className,
}: {
  tab: TabInfo | null;
  frame: string | null;
  onCommand: (command: BrowserCommand) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastMove = useRef(0);
  const resizeTimer = useRef<number | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width < 40 || height < 40) return;
      if (resizeTimer.current) window.clearTimeout(resizeTimer.current);
      resizeTimer.current = window.setTimeout(() => {
        onCommand({ type: "resize", width, height });
      }, 120);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (resizeTimer.current) window.clearTimeout(resizeTimer.current);
    };
  }, [onCommand]);

  const point = (event: React.MouseEvent | React.WheelEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    };
  };

  return (
    <div
      ref={ref}
      tabIndex={0}
      className={cn(
        "relative min-h-0 flex-1 overflow-hidden bg-[#0b0b0c] outline-none",
        className,
      )}
      onMouseMove={(event) => {
        const coords = point(event);
        if (!coords) return;
        const now = performance.now();
        if (now - lastMove.current < 40) return;
        lastMove.current = now;
        onCommand({ type: "move", ...coords });
      }}
      onClick={(event) => {
        const coords = point(event);
        if (coords) onCommand({ type: "click", ...coords, button: "left" });
      }}
      onDoubleClick={(event) => {
        const coords = point(event);
        if (coords) {
          onCommand({ type: "click", ...coords, button: "left", clickCount: 2 });
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        const coords = point(event);
        if (coords) onCommand({ type: "click", ...coords, button: "right" });
      }}
      onWheel={(event) => {
        const coords = point(event);
        if (coords) {
          onCommand({
            type: "wheel",
            ...coords,
            deltaX: event.deltaX,
            deltaY: event.deltaY,
          });
        }
      }}
      onKeyDown={(event) => {
        if (isChromeShortcut(event)) return;
        event.preventDefault();
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
          void (async () => {
            const result = await fetch("/api/browser", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "copySelection" }),
            });
            const json = (await result.json()) as { copied?: string };
            if (json.copied) await navigator.clipboard.writeText(json.copied);
          })();
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") {
          return;
        }
        onCommand({
          type: "key",
          key: event.key,
          code: event.code,
          down: true,
          modifiers: {
            alt: event.altKey,
            ctrl: event.ctrlKey,
            meta: event.metaKey,
            shift: event.shiftKey,
          },
        });
      }}
      onKeyUp={(event) => {
        if (isChromeShortcut(event)) return;
        event.preventDefault();
        onCommand({
          type: "key",
          key: event.key,
          code: event.code,
          down: false,
          modifiers: {
            alt: event.altKey,
            ctrl: event.ctrlKey,
            meta: event.metaKey,
            shift: event.shiftKey,
          },
        });
      }}
      onPaste={(event) => {
        const text = event.clipboardData.getData("text");
        if (text) {
          event.preventDefault();
          onCommand({ type: "type", text });
        }
      }}
    >
      {frame ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`data:image/jpeg;base64,${frame}`}
          alt={tab?.title || "Page"}
          draggable={false}
          className="pointer-events-none size-full object-fill select-none"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
          {tab?.loading ? "Loading…" : "Waiting for Chromium…"}
        </div>
      )}
      {tab?.error ? (
        <div className="absolute inset-x-0 bottom-0 bg-destructive/15 px-4 py-2 text-center text-xs text-destructive">
          {tab.error}
        </div>
      ) : null}
    </div>
  );
}

function isChromeShortcut(event: React.KeyboardEvent): boolean {
  const key = event.key.toLowerCase();
  const mod = event.metaKey || event.ctrlKey;
  if (mod && ["l", "t", "w", "r", "n"].includes(key)) return true;
  if (mod && event.shiftKey && ["f", "a"].includes(key)) return true;
  if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    return true;
  }
  return false;
}
