# Minimal for macOS

This is the native AppKit/WKWebView shell for Minimal Next. The new-tab chrome
is native and appears before a page webview is created. The first page
navigation creates a WKWebView using a nonpersistent WKWebsiteDataStore and no
native message handlers.

Development build:

```bash
swift build --package-path apps/macos
```

The current environment can compile the Swift package with Command Line Tools.
Full Xcode is still required for `.app` packaging, UI tests, Developer ID
signing, and notarization.

The temporary Swift URL resolver will be replaced by the shared Rust core once
the FFI boundary is established. It exists only to make the native one-tab
vertical slice executable during Phase 1.
