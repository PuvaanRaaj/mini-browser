import { getMiniBrowser } from "@/lib/get-browser";
import type { BrowserCommand } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const browser = getMiniBrowser();
  try {
    await browser.ensureStarted();
  } catch {
    // State already includes the error.
  }
  return Response.json(browser.getState());
}

export async function POST(request: Request) {
  const command = (await request.json()) as BrowserCommand;
  const browser = getMiniBrowser();
  try {
    const result = await browser.handle(command);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        state: browser.getState(),
        error: error instanceof Error ? error.message : "Command failed.",
      },
      { status: 500 },
    );
  }
}
