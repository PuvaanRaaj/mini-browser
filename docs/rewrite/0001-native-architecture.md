# ADR 0001: native shells with a shared Rust core

- Status: accepted
- Date: 2026-08-23
- Baseline: `b04b346f04f14a28e4d8ef1e82a1af830dfd319e`

## Decision

Minimal Next uses a pure Rust domain core with two thin native shells:

- Swift and AppKit with WKWebView on macOS.
- Rust using the `windows` crate and Win32 with WebView2 on Windows.

Browser chrome is native. Remote pages render only inside platform page
webviews and receive no host objects, native message bridge, filesystem access,
secret access, or privileged initialization script.

The current Electron application remains the releasable fallback until the
replacement passes the parity, security, migration, performance, packaging,
and clean-machine gates in the rewrite goal.

## Why

The product goal prioritizes startup latency, resident memory, idle energy, and
installer size. Electron ships a complete Chromium runtime and renders the
initial shell in a JavaScript application. Using system engines removes that
packaged runtime. Native chrome can become usable before WKWebView or WebView2
is initialized.

Microsoft's WebView2 performance guidance explicitly recommends lightweight
XAML or Win32 instead of WebView2 for initial UI and recommends sharing one
CoreWebView2Environment across tabbed controls. Apple exposes a nonpersistent
WKWebsiteDataStore and compiled WKContentRuleList support.

## Boundaries

The Rust core owns:

- tab and command state transitions;
- URL and search resolution;
- settings, bookmarks, session metadata, and versioned migrations;
- OTP models and Firefox Authenticator backup parsing;
- content-rule normalization and fallback matching;
- typed agent contracts and benchmark schemas.

The native shells may call only the audited `minimal-ffi` C ABI for pure core
helpers. It currently exports UTF-8 omnibox resolution and buffer release; it
does not expose page content, browser handles, or secrets.

Platform shells own:

- window, control, accessibility, menu, and keyboard behavior;
- webview creation, isolation, navigation, permissions, and downloads;
- nonpersistent browsing-data lifecycle;
- Keychain or Credential Manager operations;
- content-blocker installation;
- updater, signing, packaging, and platform telemetry adapters.

The website is a separate static application and never ships in the desktop
runtime.

## Alternatives rejected

### Keep Electron

This retains the easiest compatibility path, but cannot meet the final goal of
removing Electron, React, and the Node runtime or achieve the intended package
and shell-overhead reduction. It remains the rollback implementation only.

### Tauri or WRY shell UI

This would reduce package size and share more UI code, but the initial chrome
would still wait for a webview. Browser-grade session, permission, download,
and blocking behavior is platform-specific anyway. It is not the selected
final architecture for a startup-first browser.

### CEF, QtWebEngine, or a Chromium fork

These preserve one rendering engine but reintroduce a bundled Chromium runtime
and its security-update burden. They do not advance the primary goal.

## Consequences

- AppKit and Win32 chrome must stay behaviorally aligned through shared
  fixtures and accessibility tests.
- Page-engine results will track Safari on macOS and Edge on Windows. Minimal
  may claim measured shell, memory, energy, package, or blocker-assisted wins,
  not a universally faster JavaScript engine.
- Firefox Authenticator migration must be implemented once in Rust and exposed
  through secure native UI on both platforms.
- Full Xcode is required for final app packaging, signing, notarization, and UI
  automation. The current machine has Swift and Command Line Tools only, so
  Swift package compilation can proceed but production `.app` validation is an
  external gate until Xcode is installed.

## Revisit condition

Revisit only if a native engine adapter cannot satisfy a documented security,
accessibility, lifecycle, or performance gate. Any replacement decision needs
same-machine measurements and a threat-model comparison.
