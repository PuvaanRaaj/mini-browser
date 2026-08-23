# Mini

A personal Chromium browser for the moments your everyday browser is too much: screen shares, streams, and throwaway tests. Inspired by Guillermo Rauch's Mini (built with [fx](https://fx.sh)) and Orion's focus mode.

Mini keeps the chrome thin, the session empty, and — the one extra we actually needed — a TOTP authenticator beside the page.

## Why this exists

A full browser is a pile of cookies, extensions, and logged-in tabs. Mini is the opposite:

- **Fresh Chromium** every time, isolated from your daily profile
- **Focus mode** hides tabs and the toolbar so you can share just the page
- **Built-in 2FA** so you can still sign in without opening your main browser or a separate authenticator app
- **Hackable** TypeScript throughout, plus a real Chrome extension in `extension/`

## Run it

You need Node 20+ and Chrome or Chromium on the PATH.

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43217](http://127.0.0.1:43217). Mini starts a throwaway Chromium profile in the background and streams it into the window.

```bash
npm test
npm run build
npm start
```

If Playwright cannot find system Chrome, install a bundled browser:

```bash
npx playwright install chromium
```

## Keyboard

| Shortcut | Action |
| --- | --- |
| `Ctrl/⌘ L` | Focus the address bar |
| `Ctrl/⌘ T` | New tab |
| `Ctrl/⌘ W` | Close tab |
| `Ctrl/⌘ R` | Reload |
| `Ctrl/⌘ Shift+F` | Focus mode |
| `Ctrl/⌘ Shift+A` | Authenticator |
| `Alt ← / →` | Back / forward |

Search queries go to DuckDuckGo. Anything that looks like a host is opened with `https://`.

## Authenticator

The side panel (`Ctrl/⌘ Shift+A`) is the daily driver: paste an `otpauth://` URI or a base32 secret, click a code to copy it, watch the 30s countdown.

Secrets are stored in this browser's `localStorage`. They never enter the ephemeral Chromium profile unless you paste a code into a page.

The same authenticator also ships as a Manifest V3 extension:

1. Chrome → `chrome://extensions`
2. Enable Developer mode
3. Load unpacked → select the `extension/` folder

Mini tries to load that extension into its own Chromium session on launch. The panel still works if Chrome refuses extensions in headless mode.

## Reset

**Reset session** throws away cookies, storage, and tabs and boots a new profile. Authenticator accounts are untouched.

## Stack

Next.js, Playwright/Chromium, Tailwind, shadcn/ui, [`otpauth`](https://github.com/hectorm/otpauth).
