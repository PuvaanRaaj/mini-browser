import assert from "node:assert/strict";

import { runGoogleOAuth } from "./oauth";

async function main(): Promise<void> {
  let authorizationUrl: URL | null = null;
  let tokenBody: URLSearchParams | null = null;

  const result = await runGoogleOAuth(
  {
    clientId: "desktop-client.apps.googleusercontent.com",
    scopes: ["openid", "email", "email"],
    timeoutMs: 5_000,
  },
  {
    now: () => 1_000_000,
    openExternal: async (value) => {
      authorizationUrl = new URL(value);
      const redirect = authorizationUrl.searchParams.get("redirect_uri");
      const state = authorizationUrl.searchParams.get("state");
      assert.ok(redirect);
      assert.ok(state);

      const invalid = await fetch(`${redirect}?code=attacker&state=wrong`);
      assert.equal(invalid.status, 400);
      const accepted = await fetch(`${redirect}?code=one-time-code&state=${encodeURIComponent(state)}`);
      assert.equal(accepted.status, 200);
    },
    fetch: async (_input, init) => {
      tokenBody = new URLSearchParams(String(init?.body));
      return new Response(
        JSON.stringify({
          access_token: "access-token",
          refresh_token: "refresh-token",
          id_token: "id-token",
          token_type: "Bearer",
          scope: "openid email",
          expires_in: 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  },
  );

  const openedUrl = authorizationUrl as unknown as URL;
  const exchangedBody = tokenBody as unknown as URLSearchParams;
  assert.ok(openedUrl);
  assert.equal(openedUrl.hostname, "accounts.google.com");
  assert.equal(openedUrl.searchParams.get("response_type"), "code");
  assert.equal(openedUrl.searchParams.get("code_challenge_method"), "S256");
  assert.equal(openedUrl.searchParams.get("scope"), "openid email");
  assert.ok(openedUrl.searchParams.get("code_challenge"));
  assert.ok(exchangedBody);
  assert.equal(exchangedBody.get("code"), "one-time-code");
  assert.equal(exchangedBody.get("grant_type"), "authorization_code");
  assert.ok(exchangedBody.get("code_verifier"));
  assert.equal(result.accessToken, "access-token");
  assert.equal(result.refreshToken, "refresh-token");
  assert.equal(result.expiresAt, 4_600_000);

  await assert.rejects(
    () => runGoogleOAuth({ clientId: "" }, { openExternal: async () => undefined }),
    /not configured/,
  );

  console.log("oauth tests passed");
}

void main();
