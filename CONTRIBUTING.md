# Contributing to Minimal

Thanks for helping with a small, hackable Chromium browser.

Canonical public remote is GitHub: [PuvaanRaaj/mini-browser](https://github.com/PuvaanRaaj/mini-browser). Cursor users can also use Origin after it is synced from GitHub. Install the [Origin CLI](https://cursor.com/docs/origin/cli.md) (`origin`) for Origin clones and PRs.

## Setup (macOS)

You need Node 20+ and Xcode command line tools.

```bash
git clone https://github.com/PuvaanRaaj/mini-browser.git
cd mini-browser
npm install
npm run dev
```

```bash
npm test
npx tsc --noEmit
npm run dist:mac
```

`npm run dist:mac` writes `release/mac-arm64/Minimal.app` on Apple Silicon (or `release/mac/Minimal.app` on Intel). Open it with `npm run open:mac`. The first launch of an unsigned build may need System Settings → Privacy & Security.

## Layout

| Path | What it is |
| --- | --- |
| `src/main/` | Electron main process, menus, tab Chromium views |
| `src/preload/` | IPC bridge (`window.mini`) |
| `src/renderer/` | Window chrome (React) |
| `src/components/` | Compact chrome, start page, authenticator |
| `src/lib/totp.ts` | TOTP generation |
| `extension/` | Manifest V3 authenticator, loaded into the guest session |

Pages run in an **in-memory** Chromium partition. Authenticator secrets stay in Minimal's renderer storage and survive **Reset Session**.

## Pull requests

Public contributions go to GitHub. If Origin is mirroring GitHub, Origin PRs sync both ways.

```bash
git checkout -b your-change
git commit -am "Describe the change"
git push -u origin your-change
```

Then open a PR on [github.com/PuvaanRaaj/mini-browser](https://github.com/PuvaanRaaj/mini-browser), or `origin pr create --title "Describe the change"` against the Origin remote.

- Keep the chrome thin. New features should earn their pixels.
- Match the existing TypeScript / React style.
- Do not persist guest-session cookies by default.
- Do not send authenticator secrets off-device.
