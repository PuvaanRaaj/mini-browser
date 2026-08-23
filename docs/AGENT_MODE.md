# Agent mode

Minimal can expose an opt-in, loopback-only control API for local browser agents. It is disabled by default.

## Start it

Development:

```bash
MINIMAL_AGENT=1 MINIMAL_AGENT_TOKEN="replace-with-a-long-random-token" npm run dev
```

Packaged app: launch it with `--agent` or `--agent-port=0`. A random token and the selected port are written to:

```text
~/Library/Application Support/Minimal/agent.json
```

The file is created with owner-only permissions. Prefer setting `MINIMAL_AGENT_TOKEN` explicitly for a long-running agent. The server binds to `127.0.0.1`; it is never exposed on the LAN.

## API

All requests need `Authorization: Bearer <token>`:

```bash
TOKEN=...
BASE=http://127.0.0.1:32123
curl -H "Authorization: Bearer $TOKEN" "$BASE/v1/state"
curl -H "Authorization: Bearer $TOKEN" "$BASE/v1/page"
curl -H "Authorization: Bearer $TOKEN" "$BASE/v1/screenshot" -o page.png
curl -X POST "$BASE/v1/command" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"type":"navigate","url":"https://example.com"}'
```

The page snapshot returns the URL, title, bounded visible text, and a bounded list of interactive elements. `/v1/evaluate` is available only in explicit agent mode and executes JavaScript in the selected page; treat the token like a local remote-control password.

## Safety rules

- Keep agent mode off for normal browsing.
- Never put the token in a URL, shell history, repository, or prompt shared with an untrusted process.
- Do not return authenticator secrets through the agent API. The snapshot intentionally excludes password input values.
- Keep navigation and evaluation actions visible to the user until an approval policy exists.

## Next improvements

1. Add stable `data-agent` labels and accessibility-tree snapshots so agents do not depend on pixel coordinates.
2. Add typed actions (`click`, `fill`, `select`, `submit`) with origin and frame checks instead of requiring arbitrary JavaScript.
3. Add per-action approvals for downloads, password fields, authenticator use, and external navigation.
4. Add request limits, an audit log, and a short-lived token rotation command.
5. Add Playwright/CDP compatibility after the typed API is stable.
