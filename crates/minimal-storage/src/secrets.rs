use std::fmt;

use thiserror::Error;
use zeroize::Zeroizing;

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct SecretKey(String);

impl SecretKey {
    /// Creates a bounded, non-control-character opaque key.
    ///
    /// # Errors
    ///
    /// Returns an error when the key is empty, too long, or contains control characters.
    pub fn new(value: impl Into<String>) -> Result<Self, SecretStoreError> {
        let value = value.into();
        if value.is_empty() || value.len() > 512 || value.chars().any(char::is_control) {
            return Err(SecretStoreError::new("invalid secret key"));
        }
        Ok(Self(value))
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

pub struct SecretBytes(Zeroizing<Vec<u8>>);

impl SecretBytes {
    #[must_use]
    pub fn new(value: Vec<u8>) -> Self {
        Self(Zeroizing::new(value))
    }

    #[must_use]
    pub fn expose(&self) -> &[u8] {
        self.0.as_slice()
    }
}

impl fmt::Debug for SecretBytes {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("SecretBytes")
            .field("value", &"[REDACTED]")
            .finish()
    }
}

#[derive(Debug, Error)]
#[error("secret store operation failed: {message}")]
pub struct SecretStoreError {
    message: String,
}

impl SecretStoreError {
    #[must_use]
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

pub trait SecretStore {
    /// Retrieves a secret, if present.
    ///
    /// # Errors
    ///
    /// Returns a platform-store error when retrieval fails.
    fn get(&self, key: &SecretKey) -> Result<Option<SecretBytes>, SecretStoreError>;
    /// Atomically creates or replaces a secret.
    ///
    /// # Errors
    ///
    /// Returns a platform-store error when persistence fails.
    fn put(&mut self, key: &SecretKey, value: SecretBytes) -> Result<(), SecretStoreError>;
    /// Deletes a secret if present.
    ///
    /// # Errors
    ///
    /// Returns a platform-store error when deletion fails.
    fn delete(&mut self, key: &SecretKey) -> Result<(), SecretStoreError>;
}
