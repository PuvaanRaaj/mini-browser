use std::sync::OnceLock;

use percent_encoding::{AsciiSet, CONTROLS, utf8_percent_encode};
use regex::Regex;
use url::Url;

const URI_COMPONENT: &AsciiSet = &CONTROLS
    .add(b' ')
    .add(b'"')
    .add(b'#')
    .add(b'$')
    .add(b'%')
    .add(b'&')
    .add(b'+')
    .add(b',')
    .add(b'/')
    .add(b':')
    .add(b';')
    .add(b'<')
    .add(b'=')
    .add(b'>')
    .add(b'?')
    .add(b'@')
    .add(b'[')
    .add(b'\\')
    .add(b']')
    .add(b'^')
    .add(b'`')
    .add(b'{')
    .add(b'|')
    .add(b'}');

fn domain_like() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(
            r"(?i)^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+([/:?#].*)?$",
        )
        .expect("the domain-like pattern is valid")
    })
}

fn local_host() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"(?i)^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?([/?#].*)?$")
            .expect("the local-host pattern is valid")
    })
}

/// Resolves omnibox text using the legacy Minimal navigation contract.
#[must_use]
pub fn resolve_navigation(input: &str) -> String {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let lower = trimmed.to_ascii_lowercase();
    if ["http:", "https:", "file:", "about:"]
        .iter()
        .any(|scheme| lower.starts_with(scheme))
    {
        return trimmed.to_owned();
    }
    if trimmed.starts_with("//") {
        return format!("https:{trimmed}");
    }
    if local_host().is_match(trimmed) {
        return format!("http://{trimmed}");
    }
    if domain_like().is_match(trimmed) && !trimmed.chars().any(char::is_whitespace) {
        return format!("https://{trimmed}");
    }

    let query = utf8_percent_encode(trimmed, URI_COMPONENT);
    format!("https://duckduckgo.com/?q={query}")
}

/// Formats a URL for the omnibox, including restoring `DuckDuckGo` query text.
#[must_use]
pub fn display_url(value: &str) -> String {
    if value.is_empty() || value == "about:blank" {
        return String::new();
    }

    let Ok(parsed) = Url::parse(value) else {
        return value.to_owned();
    };
    if parsed.host_str() == Some("duckduckgo.com")
        && let Some((_, query)) = parsed.query_pairs().find(|(key, _)| key == "q")
    {
        return query.into_owned();
    }

    value.strip_prefix("https://").unwrap_or(value).to_owned()
}

/// Returns the legacy remote favicon endpoint for a valid URL with a host.
#[must_use]
pub fn favicon_for(value: &str) -> Option<String> {
    let parsed = Url::parse(value).ok()?;
    let hostname = parsed.host_str()?;
    if hostname.is_empty() {
        return None;
    }
    let domain = utf8_percent_encode(hostname, URI_COMPONENT);
    Some(format!(
        "https://www.google.com/s2/favicons?sz=32&domain={domain}"
    ))
}

/// Extracts a display hostname and removes one leading `www.` label.
#[must_use]
pub fn hostname_of(value: &str) -> String {
    let hostname = Url::parse(value)
        .ok()
        .and_then(|url| url.host_str().map(ToOwned::to_owned))
        .unwrap_or_default();
    hostname
        .strip_prefix("www.")
        .unwrap_or(&hostname)
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_the_existing_omnibox_cases() {
        assert_eq!(
            resolve_navigation("https://example.com/path"),
            "https://example.com/path"
        );
        assert_eq!(
            resolve_navigation("http://localhost:4321"),
            "http://localhost:4321"
        );
        assert_eq!(
            resolve_navigation("127.0.0.1:3000/test"),
            "http://127.0.0.1:3000/test"
        );
        assert_eq!(resolve_navigation("//example.com"), "https://example.com");
        assert_eq!(
            resolve_navigation("example.com/docs"),
            "https://example.com/docs"
        );
        assert_eq!(
            resolve_navigation("electron browser"),
            "https://duckduckgo.com/?q=electron%20browser"
        );
        assert_eq!(resolve_navigation("   "), "");
    }

    #[test]
    fn search_encoding_matches_encode_uri_component() {
        assert_eq!(
            resolve_navigation("rust & swift/ffi!~*'()"),
            "https://duckduckgo.com/?q=rust%20%26%20swift%2Fffi!~*'()"
        );
        assert_eq!(
            resolve_navigation("café"),
            "https://duckduckgo.com/?q=caf%C3%A9"
        );
    }

    #[test]
    fn formats_urls_like_the_existing_shell() {
        assert_eq!(display_url(""), "");
        assert_eq!(display_url("about:blank"), "");
        assert_eq!(
            display_url("https://duckduckgo.com/?q=electron%20browser"),
            "electron browser"
        );
        assert_eq!(
            display_url("https://www.example.com/path"),
            "www.example.com/path"
        );
        assert_eq!(display_url("not a URL"), "not a URL");
    }

    #[test]
    fn derives_favicons_and_hostnames() {
        assert_eq!(
            favicon_for("https://example.com/path").as_deref(),
            Some("https://www.google.com/s2/favicons?sz=32&domain=example.com")
        );
        assert_eq!(favicon_for("not a URL"), None);
        assert_eq!(hostname_of("https://www.example.com/path"), "example.com");
        assert_eq!(hostname_of("not a URL"), "");
    }
}
