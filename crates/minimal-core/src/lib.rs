//! Platform-independent contracts and state transitions for Minimal.
//!
//! This crate intentionally contains no `AppKit`, `Win32`, `WKWebView`, or `WebView2`
//! code. Native shells apply [`BrowserEffect`] values and feed engine events
//! back into [`BrowserModel`].

mod navigation;
mod state;

pub use navigation::{display_url, favicon_for, hostname_of, resolve_navigation};
pub use state::{
    BrowserCommand, BrowserEffect, BrowserModel, BrowserState, BrowserStatus, ModelError, TabInfo,
};
