//! Host-only request blocker with label-boundary suffix matching.
//!
//! Unicode host names are deliberately rejected. Callers must pass the ASCII
//! serialization produced by the page engine; `xn--` punycode labels are
//! accepted and matched as ordinary ASCII labels. This keeps normalization
//! identical across `WebKit` and `WebView2` and avoids a second, potentially
//! divergent IDNA implementation in the blocker.

use std::collections::{BTreeSet, HashSet};
use std::fmt;
use std::net::IpAddr;

use serde::{Deserialize, Serialize};

pub const CACHE_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Debug, Default)]
pub struct Blocker {
    hosts: HashSet<String>,
}

impl Blocker {
    /// Compiles normalized hosts, rejecting the first malformed rule.
    ///
    /// # Errors
    ///
    /// Returns [`InvalidHost`] when a rule is not a valid host-only ASCII name.
    pub fn compile(hosts: impl IntoIterator<Item = String>) -> Result<Self, InvalidHost> {
        let mut normalized = HashSet::new();
        for host in hosts {
            normalized.insert(normalize_host(&host)?);
        }
        Ok(Self { hosts: normalized })
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.hosts.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.hosts.is_empty()
    }

    /// Returns true for an exact rule or a subdomain of a rule.
    ///
    /// Each lookup probes only label-aligned suffixes in a `HashSet`. It never
    /// scans every rule and never performs substring matching.
    #[must_use]
    pub fn is_blocked(&self, hostname: &str) -> bool {
        let Ok(host) = normalize_host(hostname) else {
            return false;
        };

        if self.hosts.contains(host.as_str()) {
            return true;
        }

        host.match_indices('.')
            .any(|(dot, _)| self.hosts.contains(&host[dot + 1..]))
    }

    fn sorted_hosts(&self) -> Vec<String> {
        let mut hosts: Vec<_> = self.hosts.iter().cloned().collect();
        hosts.sort_unstable();
        hosts
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InvalidHost {
    value: String,
    reason: &'static str,
}

impl InvalidHost {
    #[must_use]
    pub fn value(&self) -> &str {
        &self.value
    }

    #[must_use]
    pub const fn reason(&self) -> &'static str {
        self.reason
    }
}

impl fmt::Display for InvalidHost {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "invalid host {:?}: {}", self.value, self.reason)
    }
}

impl std::error::Error for InvalidHost {}

fn invalid(value: &str, reason: &'static str) -> InvalidHost {
    InvalidHost {
        value: value.to_owned(),
        reason,
    }
}

/// Normalizes a page-engine hostname or host-only rule.
///
/// # Errors
///
/// Returns [`InvalidHost`] for empty, non-ASCII, IP-address, oversized, or
/// syntactically invalid DNS names.
pub fn normalize_host(value: &str) -> Result<String, InvalidHost> {
    let trimmed = value.trim().trim_end_matches('.');
    if trimmed.is_empty() {
        return Err(invalid(value, "empty host"));
    }
    if !trimmed.is_ascii() {
        return Err(invalid(
            value,
            "Unicode must be serialized as ASCII punycode",
        ));
    }
    if trimmed.len() > 253 {
        return Err(invalid(value, "host exceeds 253 bytes"));
    }
    if trimmed.parse::<IpAddr>().is_ok() {
        return Err(invalid(value, "IP address rules are not supported"));
    }

    for label in trimmed.split('.') {
        if label.is_empty() {
            return Err(invalid(value, "empty label"));
        }
        if label.len() > 63 {
            return Err(invalid(value, "label exceeds 63 bytes"));
        }
        if label.starts_with('-') || label.ends_with('-') {
            return Err(invalid(value, "label begins or ends with a hyphen"));
        }
        if !label
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        {
            return Err(invalid(value, "host contains a non-DNS character"));
        }
    }

    Ok(trimmed.to_ascii_lowercase())
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RejectedRule {
    pub line: usize,
    pub value: String,
    pub reason: &'static str,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct ImportReport {
    pub hosts: Vec<String>,
    pub rejected: Vec<RejectedRule>,
    pub ignored_lines: usize,
}

/// Imports raw hosts, hosts-file mappings, and `EasyList` `||host^` rules.
#[must_use]
pub fn import_legacy_text(text: &str) -> ImportReport {
    let mut hosts = BTreeSet::new();
    let mut rejected = Vec::new();
    let mut ignored_lines = 0;

    for (index, raw) in text.lines().enumerate() {
        let line_number = index + 1;
        let line = raw.split('#').next().unwrap_or_default().trim();
        if line.is_empty() || line.starts_with('!') || line.starts_with('[') {
            ignored_lines += 1;
            continue;
        }

        let candidate = if let Some(rule) = line.strip_prefix("||") {
            let Some((host, _)) = rule.split_once('^') else {
                rejected.push(RejectedRule {
                    line: line_number,
                    value: line.to_owned(),
                    reason: "EasyList host rule is missing ^",
                });
                continue;
            };
            host
        } else {
            let fields: Vec<_> = line.split_ascii_whitespace().collect();
            match fields.as_slice() {
                [host] => *host,
                [address, host, ..] if address.parse::<IpAddr>().is_ok() => *host,
                _ => {
                    // Other EasyList syntax is intentionally outside this
                    // host-only engine, so it is ignored rather than guessed.
                    ignored_lines += 1;
                    continue;
                }
            }
        };

        match normalize_host(candidate) {
            Ok(host) if host != "localhost" => {
                hosts.insert(host);
            }
            Ok(_) => {
                ignored_lines += 1;
            }
            Err(error) => rejected.push(RejectedRule {
                line: line_number,
                value: candidate.to_owned(),
                reason: error.reason(),
            }),
        }
    }

    ImportReport {
        hosts: hosts.into_iter().collect(),
        rejected,
        ignored_lines,
    }
}

#[derive(Debug)]
pub enum JsonImportError {
    Json(serde_json::Error),
    UnsupportedShape,
}

impl fmt::Display for JsonImportError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Json(error) => write!(formatter, "invalid JSON: {error}"),
            Self::UnsupportedShape => formatter.write_str(
                "expected an array or an object containing hosts, rules, or blockedHosts",
            ),
        }
    }
}

impl std::error::Error for JsonImportError {}

impl From<serde_json::Error> for JsonImportError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

/// Imports the old string-array cache and common object-wrapped variants.
///
/// # Errors
///
/// Returns [`JsonImportError`] for malformed JSON or an unsupported root shape.
pub fn import_legacy_json(json: &str) -> Result<ImportReport, JsonImportError> {
    let value: serde_json::Value = serde_json::from_str(json)?;
    let values = match &value {
        serde_json::Value::Array(values) => values,
        serde_json::Value::Object(object) => ["hosts", "rules", "blockedHosts"]
            .iter()
            .find_map(|key| object.get(*key).and_then(serde_json::Value::as_array))
            .ok_or(JsonImportError::UnsupportedShape)?,
        _ => return Err(JsonImportError::UnsupportedShape),
    };

    let mut report = ImportReport::default();
    let mut hosts = BTreeSet::new();
    for (index, value) in values.iter().enumerate() {
        let Some(candidate) = value.as_str() else {
            report.rejected.push(RejectedRule {
                line: index + 1,
                value: value.to_string(),
                reason: "JSON rule is not a string",
            });
            continue;
        };
        match normalize_host(candidate) {
            Ok(host) => {
                hosts.insert(host);
            }
            Err(error) => report.rejected.push(RejectedRule {
                line: index + 1,
                value: candidate.to_owned(),
                reason: error.reason(),
            }),
        }
    }
    report.hosts = hosts.into_iter().collect();
    Ok(report)
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SourceFreshness {
    pub source_id: String,
    pub source_updated_unix_seconds: Option<u64>,
    pub fetched_at_unix_seconds: u64,
    pub expires_at_unix_seconds: Option<u64>,
    pub entity_tag: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct CompiledCache {
    pub schema_version: u32,
    pub source: SourceFreshness,
    pub rule_count: usize,
    pub hosts: Vec<String>,
}

#[derive(Debug)]
pub enum CacheError {
    Json(serde_json::Error),
    UnsupportedSchema(u32),
    RuleCount,
    InvalidHost(InvalidHost),
}

impl fmt::Display for CacheError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Json(error) => write!(formatter, "invalid cache JSON: {error}"),
            Self::UnsupportedSchema(version) => write!(formatter, "unsupported schema {version}"),
            Self::RuleCount => formatter.write_str("cache rule_count does not match unique hosts"),
            Self::InvalidHost(error) => error.fmt(formatter),
        }
    }
}

impl std::error::Error for CacheError {}

impl From<serde_json::Error> for CacheError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

impl From<InvalidHost> for CacheError {
    fn from(error: InvalidHost) -> Self {
        Self::InvalidHost(error)
    }
}

impl CompiledCache {
    #[must_use]
    pub fn new(blocker: &Blocker, source: SourceFreshness) -> Self {
        let hosts = blocker.sorted_hosts();
        Self {
            schema_version: CACHE_SCHEMA_VERSION,
            source,
            rule_count: hosts.len(),
            hosts,
        }
    }

    /// Stable because the struct field order is fixed and hosts are sorted.
    ///
    /// # Errors
    ///
    /// Returns the serializer error if JSON encoding fails.
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }

    /// Loads and validates a compiled cache before constructing its matcher.
    ///
    /// # Errors
    ///
    /// Returns [`CacheError`] for malformed JSON, unsupported schemas,
    /// non-canonical rules, invalid hosts, or a mismatched rule count.
    pub fn from_json(json: &str) -> Result<(Self, Blocker), CacheError> {
        let cache: Self = serde_json::from_str(json)?;
        if cache.schema_version != CACHE_SCHEMA_VERSION {
            return Err(CacheError::UnsupportedSchema(cache.schema_version));
        }
        let blocker = Blocker::compile(cache.hosts.clone())?;
        if blocker.len() != cache.rule_count || cache.hosts.len() != cache.rule_count {
            return Err(CacheError::RuleCount);
        }
        if blocker.sorted_hosts() != cache.hosts {
            return Err(CacheError::RuleCount);
        }
        Ok((cache, blocker))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn blocker() -> Blocker {
        Blocker::compile(vec![
            "doubleclick.net".to_owned(),
            "xn--bcher-kva.example".to_owned(),
        ])
        .expect("fixture is valid")
    }

    #[test]
    fn matches_exact_hosts_and_label_aligned_subdomains() {
        let blocker = blocker();
        assert!(blocker.is_blocked("doubleclick.net"));
        assert!(blocker.is_blocked("ADS.FOO.doubleclick.net."));
        assert!(!blocker.is_blocked("notdoubleclick.net"));
        assert!(!blocker.is_blocked("doubleclick.net.evil.test"));
    }

    #[test]
    fn rejects_unicode_and_accepts_ascii_punycode() {
        assert!(normalize_host("bücher.example").is_err());
        assert!(blocker().is_blocked("shop.xn--bcher-kva.example"));
    }

    #[test]
    fn rejects_malformed_host_rules() {
        for value in ["", ".example.com", "example..com", "-bad.test", "bad/path"] {
            assert!(normalize_host(value).is_err(), "{value} must be rejected");
        }
    }

    #[test]
    fn imports_legacy_text_without_substring_rules() {
        let report = import_legacy_text(
            "! comment\n||Ads.Example.com^\n0.0.0.0 tracker.test\nraw.test\n127.0.0.1 localhost\n||bad/path^\n",
        );
        assert_eq!(
            report.hosts,
            ["ads.example.com", "raw.test", "tracker.test"]
        );
        assert_eq!(report.rejected.len(), 1);
        assert_eq!(report.ignored_lines, 2);
    }

    #[test]
    fn imports_old_json_array_and_deduplicates() {
        let report = import_legacy_json(r#"["EXAMPLE.com", "example.com", 7]"#)
            .expect("legacy cache parses");
        assert_eq!(report.hosts, ["example.com"]);
        assert_eq!(report.rejected.len(), 1);
    }

    #[test]
    fn cache_json_is_deterministic_and_round_trips() {
        let source = SourceFreshness {
            source_id: "fixture-v1".to_owned(),
            source_updated_unix_seconds: Some(100),
            fetched_at_unix_seconds: 200,
            expires_at_unix_seconds: Some(300),
            entity_tag: Some("fixture-etag".to_owned()),
        };
        let cache = CompiledCache::new(&blocker(), source);
        let first = cache.to_json().expect("serializes");
        let second = cache.to_json().expect("serializes identically");
        assert_eq!(first, second);
        let (decoded, decoded_blocker) = CompiledCache::from_json(&first).expect("round trips");
        assert_eq!(decoded, cache);
        assert!(decoded_blocker.is_blocked("pixel.doubleclick.net"));
    }

    #[test]
    fn cache_rejects_unsorted_or_mismatched_rules() {
        let malformed = r#"{"schema_version":1,"source":{"source_id":"x","source_updated_unix_seconds":null,"fetched_at_unix_seconds":1,"expires_at_unix_seconds":null,"entity_tag":null},"rule_count":2,"hosts":["z.test","a.test"]}"#;
        assert!(matches!(
            CompiledCache::from_json(malformed),
            Err(CacheError::RuleCount)
        ));
    }
}
