import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";

const CALLBACK_HOST = "127.0.0.1";
const CALLBACK_PATH = "/oauth/callback";
const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const DEFAULT_SCOPES = ["openid", "email", "profile"];

export type OAuthTokenSet = {
  accessToken: string;
  refreshToken: string | null;
  idToken: string | null;
  tokenType: string;
  scope: string;
  expiresAt: number | null;
};

export type GoogleOAuthOptions = {
  clientId: string;
  scopes?: string[];
  timeoutMs?: number;
};

export type GoogleOAuthDependencies = {
  openExternal: (url: string) => Promise<unknown>;
  fetch?: typeof fetch;
  now?: () => number;
};

export async function runGoogleOAuth(
  options: GoogleOAuthOptions,
  dependencies: GoogleOAuthDependencies,
): Promise<OAuthTokenSet> {
  const clientId = options.clientId.trim();
  if (!clientId || /\s/.test(clientId)) throw new Error("Google OAuth client ID is not configured.");

  const scopes = normalizeScopes(options.scopes ?? DEFAULT_SCOPES);
  const timeoutMs = options.timeoutMs ?? 120_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 10 * 60_000) {
    throw new Error("OAuth timeout must be between 1 second and 10 minutes.");
  }

  const verifier = randomBytes(64).toString("base64url");
  const challenge = createHash("sha256").update(verifier, "ascii").digest("base64url");
  const state = randomBytes(32).toString("base64url");
  const callback = await listenForCallback(state, timeoutMs);

  const authorizationUrl = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  authorizationUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callback.redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    access_type: "offline",
    include_granted_scopes: "true",
  }).toString();

  try {
    await dependencies.openExternal(authorizationUrl.toString());
    const code = await callback.code;
    return await exchangeCode(
      dependencies.fetch ?? fetch,
      dependencies.now ?? Date.now,
      clientId,
      callback.redirectUri,
      code,
      verifier,
    );
  } finally {
    await closeServer(callback.server);
  }
}

function normalizeScopes(values: string[]): string[] {
  const scopes = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (scopes.length === 0 || scopes.some((scope) => /\s/.test(scope))) {
    throw new Error("OAuth scopes must be non-empty, space-free values.");
  }
  return scopes;
}

async function listenForCallback(
  expectedState: string,
  timeoutMs: number,
): Promise<{ server: Server; redirectUri: string; code: Promise<string> }> {
  let resolveCode!: (code: string) => void;
  let rejectCode!: (error: Error) => void;
  const code = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  let settled = false;

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${CALLBACK_HOST}`);
    if (request.method !== "GET" || url.pathname !== CALLBACK_PATH) {
      response.writeHead(404, { "Cache-Control": "no-store" }).end("Not found");
      return;
    }

    const state = url.searchParams.get("state") ?? "";
    if (!constantTimeEqual(state, expectedState)) {
      response.writeHead(400, { "Cache-Control": "no-store" }).end("Invalid OAuth state");
      return;
    }

    const error = url.searchParams.get("error");
    const authorizationCode = url.searchParams.get("code");
    if (error || !authorizationCode) {
      response.writeHead(400, { "Cache-Control": "no-store" }).end("Google sign-in was cancelled");
      if (!settled) {
        settled = true;
        rejectCode(new Error(error ? `Google sign-in failed: ${error}` : "Google returned no code."));
      }
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    });
    response.end("<!doctype html><title>Minimal</title><p>Sign-in complete. You can close this window.</p>");
    if (!settled) {
      settled = true;
      resolveCode(authorizationCode);
    }
  });

  server.on("error", (error) => {
    if (!settled) {
      settled = true;
      rejectCode(error);
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, CALLBACK_HOST, () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("Could not bind the OAuth callback server.");
  }

  const timer = setTimeout(() => {
    if (!settled) {
      settled = true;
      rejectCode(new Error("Google sign-in timed out."));
    }
  }, timeoutMs);
  timer.unref();
  void code.finally(() => clearTimeout(timer)).catch(() => undefined);

  return {
    server,
    redirectUri: `http://${CALLBACK_HOST}:${address.port}${CALLBACK_PATH}`,
    code,
  };
}

async function exchangeCode(
  request: typeof fetch,
  now: () => number,
  clientId: string,
  redirectUri: string,
  code: string,
  verifier: string,
): Promise<OAuthTokenSet> {
  const response = await request(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
    }),
  });
  if (!response.ok) throw new Error(`Google token exchange failed (${response.status}).`);

  const value: unknown = await response.json();
  if (!value || typeof value !== "object") throw new Error("Google returned an invalid token response.");
  const record = value as Record<string, unknown>;
  if (typeof record.access_token !== "string" || typeof record.token_type !== "string") {
    throw new Error("Google returned an incomplete token response.");
  }
  const expiresIn = typeof record.expires_in === "number" && record.expires_in > 0
    ? record.expires_in
    : null;

  return {
    accessToken: record.access_token,
    refreshToken: typeof record.refresh_token === "string" ? record.refresh_token : null,
    idToken: typeof record.id_token === "string" ? record.id_token : null,
    tokenType: record.token_type,
    scope: typeof record.scope === "string" ? record.scope : "",
    expiresAt: expiresIn === null ? null : now() + expiresIn * 1_000,
  };
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
