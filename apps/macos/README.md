# Minimal for macOS

This is the native AppKit/WKWebView shell for Minimal Next. The new-tab chrome
is native and appears before a page webview is created. The first page
navigation creates a WKWebView using a nonpersistent WKWebsiteDataStore and no
native message handlers.

Development build (the shared Rust FFI library must be built first):

```bash
cargo build -p minimal-ffi
swift build --package-path apps/macos
```

The current environment can compile the Swift package with Command Line Tools.
Full Xcode is still required for `.app` packaging, UI tests, Developer ID
signing, and notarization.

The omnibox now resolves through the shared Rust core via the narrow FFI
boundary. The ABI exposes no page handles, page content, or secret storage.
