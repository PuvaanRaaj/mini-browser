# Contributing to Mini

Thanks for helping with a small, hackable Chromium browser.

## Setup (macOS)

You need Node 20+ and Xcode command line tools.

```bash
git clone https://origin.cursor.com/puvaanraaj/tmp-fb57f3438b1f4856.git mini-browser
cd mini-browser
npm install
npm run dev
```

```bash
npm test
npx tsc --noEmit
npm run dist:mac
```

`npm run dist:mac` writes `release/mac/Mini.app`. The first launch of an unsigned build may need System Settings → Privacy & Security.

## Layout

| Path | What it is |
| --- | --- |
| `src/main/` | Electron main process, menus, tab Chromium views |
| `src/preload/` | IPC bridge (`window.mini`) |
| `src/renderer/` | Window chrome (React) |
| `src/components/` | Toolbar, tabs, start page, authenticator |
| `src/lib/totp.ts` | TOTP generation |
| `extension/` | Manifest V3 authenticator, loaded into the guest session |

Pages run in an **in-memory** Chromium partition. Authenticator secrets stay in Mini's renderer storage and survive **Reset Session**.

## Pull requests

- Keep the chrome thin. New features should earn their pixels.
- Match the existing TypeScript / React style.
- Do not persist guest-session cookies by default.
- Do not send authenticator secrets off-device.

Open a PR against `main` with a short description of the change and how you tried it (`npm run dev` is enough for UI work).
