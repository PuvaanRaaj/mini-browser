import { getMiniBrowser } from "@/lib/get-browser";
import type { BrowserState, FramePayload } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const browser = getMiniBrowser();
  try {
    await browser.ensureStarted();
  } catch {
    // Stream still reports status=error.
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      const onState = (state: BrowserState) => send("state", state);
      const onFrame = (frame: FramePayload) => send("frame", frame);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        browser.off("state", onState);
        browser.off("frame", onFrame);
        request.signal.removeEventListener("abort", close);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      browser.on("state", onState);
      browser.on("frame", onFrame);
      send("state", browser.getState());

      const heartbeat = setInterval(() => send("ping", Date.now()), 15_000);
      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
