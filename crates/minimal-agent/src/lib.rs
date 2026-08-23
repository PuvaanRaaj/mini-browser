//! Default-deny contracts for Minimal's opt-in localhost automation mode.
//!
//! This crate intentionally provides no HTTP server, socket binding, page
//! scripting, or native engine integration. Shells authenticate transport
//! requests, obtain explicit capability approval from the user, execute typed
//! commands, and return the typed results defined here.

use std::collections::BTreeSet;
use std::fmt;

use minimal_core::BrowserState;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use zeroize::Zeroizing;

pub const API_VERSION: u16 = 1;
pub const DEFAULT_MAX_REQUEST_BYTES: usize = 256 * 1024;
pub const DEFAULT_MAX_RESPONSE_BYTES: usize = 256 * 1024;
pub const DEFAULT_MAX_SNAPSHOT_TEXT_CHARS: usize = 30_000;
pub const DEFAULT_MAX_INTERACTIVE_ELEMENTS: usize = 200;
pub const DEFAULT_MAX_SCREENSHOT_BASE64_BYTES: usize = 192 * 1024;

const MAX_ID_BYTES: usize = 128;
const MAX_NAVIGATION_INPUT_BYTES: usize = 8 * 1024;

/// A bearer token supplied by the loopback transport.
///
/// Its debug representation is always redacted and its allocation is zeroed
/// when dropped. Tokens are intentionally not serializable.
pub struct SecretToken(Zeroizing<Vec<u8>>);

impl SecretToken {
    /// Copies a non-empty token into zeroing storage.
    ///
    /// # Errors
    ///
    /// Returns [`ContractError::EmptyToken`] for an empty token.
    pub fn new(token: impl AsRef<[u8]>) -> Result<Self, ContractError> {
        let token = token.as_ref();
        if token.is_empty() {
            return Err(ContractError::EmptyToken);
        }
        Ok(Self(Zeroizing::new(token.to_vec())))
    }

    fn as_bytes(&self) -> &[u8] {
        self.0.as_slice()
    }
}

impl fmt::Debug for SecretToken {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("SecretToken([REDACTED])")
    }
}

/// Fixed-width verifier used for constant-time bearer comparisons.
///
/// Hashing both the configured and supplied values prevents a token-length
/// branch from deciding authentication before the constant-time comparison.
pub struct TokenVerifier([u8; 32]);

impl TokenVerifier {
    #[must_use]
    pub fn new(token: &SecretToken) -> Self {
        Self(Sha256::digest(token.as_bytes()).into())
    }

    #[must_use]
    pub fn verify(&self, supplied: &[u8]) -> bool {
        let supplied_digest: [u8; 32] = Sha256::digest(supplied).into();
        bool::from(self.0.ct_eq(&supplied_digest))
    }
}

impl fmt::Debug for TokenVerifier {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("TokenVerifier([REDACTED])")
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ContractLimits {
    pub max_request_bytes: usize,
    pub max_response_bytes: usize,
    pub max_snapshot_text_chars: usize,
    pub max_interactive_elements: usize,
    pub max_screenshot_base64_bytes: usize,
}

impl Default for ContractLimits {
    fn default() -> Self {
        Self {
            max_request_bytes: DEFAULT_MAX_REQUEST_BYTES,
            max_response_bytes: DEFAULT_MAX_RESPONSE_BYTES,
            max_snapshot_text_chars: DEFAULT_MAX_SNAPSHOT_TEXT_CHARS,
            max_interactive_elements: DEFAULT_MAX_INTERACTIVE_ELEMENTS,
            max_screenshot_base64_bytes: DEFAULT_MAX_SCREENSHOT_BASE64_BYTES,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RequestEnvelope {
    pub api_version: u16,
    pub request_id: String,
    pub grant_id: Option<String>,
    pub command: AgentCommand,
}

/// A request that passed bearer verification and strict JSON validation.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AuthenticatedRequest {
    envelope: RequestEnvelope,
}

impl AuthenticatedRequest {
    #[must_use]
    pub const fn envelope(&self) -> &RequestEnvelope {
        &self.envelope
    }

    /// Checks a user-approved grant and any tab revision carried by the command.
    ///
    /// # Errors
    ///
    /// Returns [`ContractError::ApprovalRequired`] unless a matching, current,
    /// user-approved grant permits the requested capability and tab. Returns a
    /// tab error if the caller acted on missing or stale state.
    pub fn authorize(
        &self,
        grant: Option<&CapabilityGrant>,
        current_tabs: &[TabRevision],
        now_unix_ms: u64,
    ) -> Result<(), ContractError> {
        let capability = self.envelope.command.required_capability();
        let grant_id = self.envelope.grant_id.as_deref();
        let Some(grant) = grant else {
            return Err(ContractError::ApprovalRequired(capability));
        };
        if grant_id != Some(grant.id())
            || !grant.user_approved
            || grant.is_expired(now_unix_ms)
            || !grant.capabilities.contains(&capability)
        {
            return Err(ContractError::ApprovalRequired(capability));
        }

        if let Some(tab) = self.envelope.command.tab() {
            if !grant.permits_tab(&tab.id) {
                return Err(ContractError::ApprovalRequired(capability));
            }
            let Some(current) = current_tabs.iter().find(|current| current.id == tab.id) else {
                return Err(ContractError::TabNotFound(tab.id.clone()));
            };
            if current.revision != tab.revision {
                return Err(ContractError::StaleTabRevision {
                    tab_id: tab.id.clone(),
                    expected: tab.revision,
                    actual: current.revision,
                });
            }
        }
        Ok(())
    }
}

/// Authenticates before parsing the request body, avoiding work on untrusted
/// JSON for unauthenticated callers.
///
/// # Errors
///
/// Returns a contract error for authentication, size, JSON, version, or field
/// validation failures.
pub fn authenticate_request(
    body: &[u8],
    supplied_bearer: &[u8],
    verifier: &TokenVerifier,
    limits: ContractLimits,
) -> Result<AuthenticatedRequest, ContractError> {
    if !verifier.verify(supplied_bearer) {
        return Err(ContractError::Unauthorized);
    }
    if body.len() > limits.max_request_bytes {
        return Err(ContractError::RequestTooLarge {
            actual: body.len(),
            limit: limits.max_request_bytes,
        });
    }
    let shape: Value = serde_json::from_slice(body).map_err(|_| ContractError::InvalidRequest)?;
    if !valid_request_shape(&shape) {
        return Err(ContractError::InvalidRequest);
    }
    let envelope: RequestEnvelope =
        serde_json::from_value(shape).map_err(|_| ContractError::InvalidRequest)?;
    envelope.validate()?;
    Ok(AuthenticatedRequest { envelope })
}

fn valid_request_shape(value: &Value) -> bool {
    let Some(root) = value.as_object() else {
        return false;
    };
    if !keys_allowed(root, &["apiVersion", "requestId", "grantId", "command"])
        || root.get("command").is_none()
    {
        return false;
    }
    let Some(command) = root.get("command").and_then(Value::as_object) else {
        return false;
    };
    let Some(kind) = command.get("type").and_then(Value::as_str) else {
        return false;
    };
    let keys = match kind {
        "health" | "browserState" | "resetSession" => &["type"][..],
        "pageSnapshot" | "screenshot" | "closeTab" | "switchTab" | "back" | "forward"
        | "reload" | "stop" => &["type", "tab"][..],
        "navigate" => &["type", "tab", "input"][..],
        "newTab" => &["type", "newTabId"][..],
        _ => return false,
    };
    if !keys_allowed(command, keys) {
        return false;
    }
    if keys.contains(&"tab") {
        let Some(tab) = command.get("tab").and_then(Value::as_object) else {
            return false;
        };
        if !keys_allowed(tab, &["id", "revision"]) {
            return false;
        }
    }
    true
}

fn keys_allowed(value: &serde_json::Map<String, Value>, allowed: &[&str]) -> bool {
    value.keys().all(|key| allowed.contains(&key.as_str()))
}

impl RequestEnvelope {
    fn validate(&self) -> Result<(), ContractError> {
        if self.api_version != API_VERSION {
            return Err(ContractError::UnsupportedVersion(self.api_version));
        }
        validate_id("requestId", &self.request_id)?;
        if let Some(grant_id) = &self.grant_id {
            validate_id("grantId", grant_id)?;
        }
        self.command.validate()
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum AgentCommand {
    Health,
    BrowserState,
    PageSnapshot { tab: TabHandle },
    Screenshot { tab: TabHandle },
    Navigate { tab: TabHandle, input: String },
    NewTab { new_tab_id: String },
    CloseTab { tab: TabHandle },
    SwitchTab { tab: TabHandle },
    Back { tab: TabHandle },
    Forward { tab: TabHandle },
    Reload { tab: TabHandle },
    Stop { tab: TabHandle },
    ResetSession,
}

impl AgentCommand {
    #[must_use]
    pub const fn required_capability(&self) -> Capability {
        match self {
            Self::Health => Capability::ReadHealth,
            Self::BrowserState => Capability::ReadBrowserState,
            Self::PageSnapshot { .. } => Capability::ReadPageSnapshot,
            Self::Screenshot { .. } => Capability::CaptureScreenshot,
            Self::Navigate { .. } => Capability::Navigate,
            Self::NewTab { .. }
            | Self::CloseTab { .. }
            | Self::SwitchTab { .. }
            | Self::Back { .. }
            | Self::Forward { .. }
            | Self::Reload { .. }
            | Self::Stop { .. } => Capability::ManageTabs,
            Self::ResetSession => Capability::ResetSession,
        }
    }

    #[must_use]
    pub const fn tab(&self) -> Option<&TabHandle> {
        match self {
            Self::PageSnapshot { tab }
            | Self::Screenshot { tab }
            | Self::Navigate { tab, .. }
            | Self::CloseTab { tab }
            | Self::SwitchTab { tab }
            | Self::Back { tab }
            | Self::Forward { tab }
            | Self::Reload { tab }
            | Self::Stop { tab } => Some(tab),
            Self::Health | Self::BrowserState | Self::NewTab { .. } | Self::ResetSession => None,
        }
    }

    fn validate(&self) -> Result<(), ContractError> {
        if let Some(tab) = self.tab() {
            validate_id("tab.id", &tab.id)?;
        }
        match self {
            Self::Navigate { input, .. } => {
                if input.is_empty() || input.len() > MAX_NAVIGATION_INPUT_BYTES {
                    return Err(ContractError::InvalidField("input"));
                }
            }
            Self::NewTab { new_tab_id } => validate_id("newTabId", new_tab_id)?,
            _ => {}
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TabHandle {
    pub id: String,
    pub revision: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TabRevision {
    pub id: String,
    pub revision: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Capability {
    ReadHealth,
    ReadBrowserState,
    ReadPageSnapshot,
    CaptureScreenshot,
    Navigate,
    ManageTabs,
    ResetSession,
}

/// A grant issued by the native shell after explicit user approval.
///
/// Grants are not deserializable, so request JSON cannot mint or alter one.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CapabilityGrant {
    id: String,
    capabilities: BTreeSet<Capability>,
    allowed_tabs: Option<BTreeSet<String>>,
    expires_at_unix_ms: u64,
    user_approved: bool,
}

impl CapabilityGrant {
    /// Constructs the shell-owned record of an explicit user approval.
    ///
    /// `allowed_tabs` set to `None` means the user approved all current and
    /// future tabs; `Some` limits the grant to the listed opaque tab IDs.
    ///
    /// # Errors
    ///
    /// Returns an invalid-field error for an invalid identifier or an empty
    /// capability set.
    pub fn user_approved(
        id: impl Into<String>,
        capabilities: impl IntoIterator<Item = Capability>,
        allowed_tabs: Option<impl IntoIterator<Item = String>>,
        expires_at_unix_ms: u64,
    ) -> Result<Self, ContractError> {
        let id = id.into();
        validate_id("grantId", &id)?;
        let capabilities: BTreeSet<_> = capabilities.into_iter().collect();
        if capabilities.is_empty() {
            return Err(ContractError::InvalidField("capabilities"));
        }
        let allowed_tabs = allowed_tabs
            .map(|tabs| tabs.into_iter().collect::<BTreeSet<_>>())
            .transpose_validate()?;
        Ok(Self {
            id,
            capabilities,
            allowed_tabs,
            expires_at_unix_ms,
            user_approved: true,
        })
    }

    #[must_use]
    pub fn id(&self) -> &str {
        &self.id
    }

    fn is_expired(&self, now_unix_ms: u64) -> bool {
        now_unix_ms >= self.expires_at_unix_ms
    }

    fn permits_tab(&self, tab_id: &str) -> bool {
        self.allowed_tabs
            .as_ref()
            .is_none_or(|tabs| tabs.contains(tab_id))
    }
}

trait ValidateTabSet {
    fn transpose_validate(self) -> Result<Option<BTreeSet<String>>, ContractError>;
}

impl ValidateTabSet for Option<BTreeSet<String>> {
    fn transpose_validate(self) -> Result<Option<BTreeSet<String>>, ContractError> {
        if let Some(tabs) = &self {
            for tab in tabs {
                validate_id("allowedTabs", tab)?;
            }
        }
        Ok(self)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResponseEnvelope {
    pub api_version: u16,
    pub request_id: String,
    pub result: AgentResult,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", content = "data", rename_all = "camelCase")]
pub enum AgentResult {
    Health(HealthResult),
    BrowserState(BrowserState),
    PageSnapshot(PageSnapshot),
    Screenshot(ScreenshotResult),
    Accepted(CommandAccepted),
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HealthResult {
    pub browser_version: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PageSnapshot {
    pub tab: TabHandle,
    pub url: String,
    pub title: String,
    pub visible_text: String,
    pub interactive_elements: Vec<InteractiveElement>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InteractiveElement {
    pub role: String,
    pub label: String,
    pub agent_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScreenshotResult {
    pub tab: TabHandle,
    pub png_base64: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CommandAccepted {
    pub browser_revision: u64,
}

/// Serializes a validated response and enforces the configured byte ceiling.
///
/// # Errors
///
/// Returns a contract error when semantic content or the serialized body is
/// larger than its configured bound.
pub fn encode_response(
    response: &ResponseEnvelope,
    limits: ContractLimits,
) -> Result<Vec<u8>, ContractError> {
    response.validate(limits)?;
    let encoded = serde_json::to_vec(response).map_err(|_| ContractError::InvalidResponse)?;
    if encoded.len() > limits.max_response_bytes {
        return Err(ContractError::ResponseTooLarge {
            actual: encoded.len(),
            limit: limits.max_response_bytes,
        });
    }
    Ok(encoded)
}

impl ResponseEnvelope {
    fn validate(&self, limits: ContractLimits) -> Result<(), ContractError> {
        if self.api_version != API_VERSION {
            return Err(ContractError::UnsupportedVersion(self.api_version));
        }
        validate_id("requestId", &self.request_id)?;
        match &self.result {
            AgentResult::PageSnapshot(snapshot) => {
                if snapshot.visible_text.chars().count() > limits.max_snapshot_text_chars
                    || snapshot.interactive_elements.len() > limits.max_interactive_elements
                {
                    return Err(ContractError::ResponseContentTooLarge);
                }
            }
            AgentResult::Screenshot(screenshot) => {
                if screenshot.png_base64.len() > limits.max_screenshot_base64_bytes {
                    return Err(ContractError::ResponseContentTooLarge);
                }
            }
            AgentResult::Health(_) | AgentResult::BrowserState(_) | AgentResult::Accepted(_) => {}
        }
        Ok(())
    }
}

fn validate_id(field: &'static str, id: &str) -> Result<(), ContractError> {
    if id.is_empty() || id.len() > MAX_ID_BYTES {
        Err(ContractError::InvalidField(field))
    } else {
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ContractError {
    EmptyToken,
    Unauthorized,
    RequestTooLarge {
        actual: usize,
        limit: usize,
    },
    ResponseTooLarge {
        actual: usize,
        limit: usize,
    },
    ResponseContentTooLarge,
    InvalidRequest,
    InvalidResponse,
    UnsupportedVersion(u16),
    InvalidField(&'static str),
    ApprovalRequired(Capability),
    TabNotFound(String),
    StaleTabRevision {
        tab_id: String,
        expected: u64,
        actual: u64,
    },
}

impl fmt::Display for ContractError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyToken => formatter.write_str("agent token must not be empty"),
            Self::Unauthorized => formatter.write_str("unauthorized"),
            Self::RequestTooLarge { .. } => formatter.write_str("request body is too large"),
            Self::ResponseTooLarge { .. } | Self::ResponseContentTooLarge => {
                formatter.write_str("response body is too large")
            }
            Self::InvalidRequest => formatter.write_str("request body is invalid"),
            Self::InvalidResponse => formatter.write_str("response body is invalid"),
            Self::UnsupportedVersion(_) => formatter.write_str("API version is unsupported"),
            Self::InvalidField(field) => write!(formatter, "{field} is invalid"),
            Self::ApprovalRequired(_) => formatter.write_str("explicit user approval is required"),
            Self::TabNotFound(_) => formatter.write_str("tab was not found"),
            Self::StaleTabRevision { .. } => formatter.write_str("tab revision is stale"),
        }
    }
}

impl std::error::Error for ContractError {}

#[cfg(test)]
mod tests {
    use super::*;

    const TOKEN: &[u8] = b"a-long-random-local-agent-token";

    fn verifier() -> TokenVerifier {
        TokenVerifier::new(&SecretToken::new(TOKEN).expect("valid token"))
    }

    fn navigate_body(grant_id: Option<&str>, revision: u64) -> Vec<u8> {
        let grant = grant_id.map_or_else(String::new, |id| format!(r#","grantId":"{id}""#));
        format!(
            r#"{{"apiVersion":1,"requestId":"request-1"{grant},"command":{{"type":"navigate","tab":{{"id":"tab-1","revision":{revision}}},"input":"example.com"}}}}"#
        )
        .into_bytes()
    }

    #[test]
    fn rejects_bad_authentication_before_parsing() {
        let error = authenticate_request(
            b"not-json",
            b"wrong-token",
            &verifier(),
            ContractLimits::default(),
        )
        .expect_err("bad bearer must fail");
        assert_eq!(error, ContractError::Unauthorized);
    }

    #[test]
    fn rejects_unknown_commands_and_fields() {
        let unknown_command = br#"{"apiVersion":1,"requestId":"r","command":{"type":"evaluate","expression":"alert(1)"}}"#;
        assert_eq!(
            authenticate_request(
                unknown_command,
                TOKEN,
                &verifier(),
                ContractLimits::default()
            )
            .expect_err("arbitrary evaluation must be rejected"),
            ContractError::InvalidRequest
        );

        let unknown_field = br#"{"apiVersion":1,"requestId":"r","command":{"type":"health","expression":"alert(1)"}}"#;
        assert_eq!(
            authenticate_request(unknown_field, TOKEN, &verifier(), ContractLimits::default())
                .expect_err("unknown fields must be rejected"),
            ContractError::InvalidRequest
        );
    }

    #[test]
    fn rejects_stale_tab_revision() {
        let request = authenticate_request(
            &navigate_body(Some("grant-1"), 4),
            TOKEN,
            &verifier(),
            ContractLimits::default(),
        )
        .expect("request authenticates");
        let grant = CapabilityGrant::user_approved(
            "grant-1",
            [Capability::Navigate],
            Some(["tab-1".to_owned()]),
            2_000,
        )
        .expect("valid grant");
        assert_eq!(
            request
                .authorize(
                    Some(&grant),
                    &[TabRevision {
                        id: "tab-1".to_owned(),
                        revision: 5,
                    }],
                    1_000,
                )
                .expect_err("stale request must fail"),
            ContractError::StaleTabRevision {
                tab_id: "tab-1".to_owned(),
                expected: 4,
                actual: 5,
            }
        );
    }

    #[test]
    fn actions_require_explicit_user_approval() {
        let request = authenticate_request(
            &navigate_body(None, 1),
            TOKEN,
            &verifier(),
            ContractLimits::default(),
        )
        .expect("request authenticates");
        assert_eq!(
            request
                .authorize(
                    None,
                    &[TabRevision {
                        id: "tab-1".to_owned(),
                        revision: 1,
                    }],
                    1_000,
                )
                .expect_err("missing approval must fail"),
            ContractError::ApprovalRequired(Capability::Navigate)
        );
    }

    #[test]
    fn request_and_response_size_limits_are_inclusive() {
        let body = navigate_body(None, 1);
        let exact_request = ContractLimits {
            max_request_bytes: body.len(),
            ..ContractLimits::default()
        };
        authenticate_request(&body, TOKEN, &verifier(), exact_request)
            .expect("exact request boundary is accepted");
        assert!(matches!(
            authenticate_request(
                &body,
                TOKEN,
                &verifier(),
                ContractLimits {
                    max_request_bytes: body.len() - 1,
                    ..ContractLimits::default()
                }
            ),
            Err(ContractError::RequestTooLarge { .. })
        ));

        let response = ResponseEnvelope {
            api_version: API_VERSION,
            request_id: "request-1".to_owned(),
            result: AgentResult::Health(HealthResult {
                browser_version: "0.1.0".to_owned(),
            }),
        };
        let encoded = encode_response(&response, ContractLimits::default()).expect("response");
        encode_response(
            &response,
            ContractLimits {
                max_response_bytes: encoded.len(),
                ..ContractLimits::default()
            },
        )
        .expect("exact response boundary is accepted");
        assert!(matches!(
            encode_response(
                &response,
                ContractLimits {
                    max_response_bytes: encoded.len() - 1,
                    ..ContractLimits::default()
                }
            ),
            Err(ContractError::ResponseTooLarge { .. })
        ));
    }

    #[test]
    fn token_debug_output_is_redacted() {
        let secret = SecretToken::new(TOKEN).expect("valid token");
        let verifier = TokenVerifier::new(&secret);
        assert_eq!(format!("{secret:?}"), "SecretToken([REDACTED])");
        assert_eq!(format!("{verifier:?}"), "TokenVerifier([REDACTED])");
        assert!(!format!("{secret:?}").contains("random-local-agent"));
    }
}
