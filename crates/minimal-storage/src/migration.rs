use std::fmt;

use crate::{SecretBytes, SecretKey, SecretStore, SecretStoreError};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MigrationRejection {
    pub source_index: usize,
    pub reason: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MigrationPreview<T> {
    pub accepted: Vec<T>,
    pub rejected: Vec<MigrationRejection>,
    pub warnings: Vec<String>,
}

impl<T> MigrationPreview<T> {
    #[must_use]
    pub fn is_lossless(&self) -> bool {
        self.rejected.is_empty()
    }
}

#[derive(Debug)]
pub struct PendingSecret {
    pub key: SecretKey,
    pub value: SecretBytes,
}

#[derive(Debug)]
pub struct MigrationTransaction<T> {
    pub public_value: T,
    pub secrets: Vec<PendingSecret>,
}

#[derive(Debug)]
pub struct MigrationCommitError<E> {
    pub cause: MigrationFailure<E>,
    pub rollback_failures: Vec<SecretStoreError>,
}

#[derive(Debug)]
pub enum MigrationFailure<E> {
    Secret(SecretStoreError),
    Public(E),
}

impl<E: fmt::Display> fmt::Display for MigrationCommitError<E> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.cause {
            MigrationFailure::Secret(error) => {
                write!(formatter, "migration secret commit failed: {error}")
            }
            MigrationFailure::Public(error) => {
                write!(formatter, "migration public commit failed: {error}")
            }
        }?;
        if !self.rollback_failures.is_empty() {
            write!(
                formatter,
                "; {} rollback operation(s) also failed",
                self.rollback_failures.len()
            )?;
        }
        Ok(())
    }
}

impl<T> MigrationTransaction<T> {
    /// Commits secrets and then public metadata, restoring prior secrets on failure.
    ///
    /// # Errors
    ///
    /// Returns the original failure plus every rollback failure so no loss is silent.
    pub fn commit<S, E, F>(
        self,
        secret_store: &mut S,
        commit_public: F,
    ) -> Result<T, MigrationCommitError<E>>
    where
        S: SecretStore,
        F: FnOnce(&T) -> Result<(), E>,
    {
        let mut prior = Vec::with_capacity(self.secrets.len());
        for pending in self.secrets {
            let previous = match secret_store.get(&pending.key) {
                Ok(previous) => previous,
                Err(error) => {
                    let rollback_failures = rollback(secret_store, prior);
                    return Err(MigrationCommitError {
                        cause: MigrationFailure::Secret(error),
                        rollback_failures,
                    });
                }
            };
            prior.push((pending.key.clone(), previous));
            if let Err(error) = secret_store.put(&pending.key, pending.value) {
                let rollback_failures = rollback(secret_store, prior);
                return Err(MigrationCommitError {
                    cause: MigrationFailure::Secret(error),
                    rollback_failures,
                });
            }
        }

        if let Err(error) = commit_public(&self.public_value) {
            let rollback_failures = rollback(secret_store, prior);
            return Err(MigrationCommitError {
                cause: MigrationFailure::Public(error),
                rollback_failures,
            });
        }
        Ok(self.public_value)
    }
}

fn rollback<S: SecretStore>(
    store: &mut S,
    prior: Vec<(SecretKey, Option<SecretBytes>)>,
) -> Vec<SecretStoreError> {
    let mut failures = Vec::new();
    for (key, previous) in prior.into_iter().rev() {
        let result = match previous {
            Some(value) => store.put(&key, value),
            None => store.delete(&key),
        };
        if let Err(error) = result {
            failures.push(error);
        }
    }
    failures
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;

    #[derive(Default)]
    struct MemorySecrets(HashMap<String, Vec<u8>>);

    impl SecretStore for MemorySecrets {
        fn get(&self, key: &SecretKey) -> Result<Option<SecretBytes>, SecretStoreError> {
            Ok(self.0.get(key.as_str()).cloned().map(SecretBytes::new))
        }

        fn put(&mut self, key: &SecretKey, value: SecretBytes) -> Result<(), SecretStoreError> {
            self.0.insert(key.as_str().into(), value.expose().to_vec());
            Ok(())
        }

        fn delete(&mut self, key: &SecretKey) -> Result<(), SecretStoreError> {
            self.0.remove(key.as_str());
            Ok(())
        }
    }

    #[test]
    fn failed_public_commit_rolls_secrets_back() {
        let key = SecretKey::new("auth/item-1").unwrap();
        let mut store = MemorySecrets::default();
        store.0.insert(key.as_str().into(), b"old".to_vec());
        let transaction = MigrationTransaction {
            public_value: "metadata",
            secrets: vec![PendingSecret {
                key: key.clone(),
                value: SecretBytes::new(b"new".to_vec()),
            }],
        };

        let result = transaction.commit(&mut store, |_| Err("disk full"));

        assert!(result.is_err());
        assert_eq!(store.0.get(key.as_str()).unwrap(), b"old");
    }

    #[test]
    fn secret_payload_debug_is_redacted() {
        let rendered = format!("{:?}", SecretBytes::new(b"super-secret-seed".to_vec()));
        assert!(!rendered.contains("super-secret-seed"));
        assert!(rendered.contains("REDACTED"));
    }
}
