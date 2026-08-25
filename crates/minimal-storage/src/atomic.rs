use std::ffi::OsStr;
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};

use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;
use tempfile::NamedTempFile;
use thiserror::Error;

use crate::records::{
    CURRENT_SCHEMA_VERSION, Favorites, LegacyBookmark, LegacySettings, SessionMetadata, SessionTab,
    StoredFavorites, StoredSession, StoredSettings,
};

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("invalid storage path: {0}")]
    InvalidPath(String),
    #[error("invalid storage record: {0}")]
    InvalidRecord(&'static str),
    #[error("storage I/O failed: {0}")]
    Io(#[from] io::Error),
    #[error("malformed JSON record: {0}")]
    Malformed(#[from] serde_json::Error),
    #[error("unsupported schema version {found}; current version is {current}")]
    UnknownVersion { found: u64, current: u32 },
}

#[derive(Clone, Debug)]
pub struct AtomicJsonStore {
    root: PathBuf,
}

impl AtomicJsonStore {
    /// Opens or creates a private storage root.
    ///
    /// # Errors
    ///
    /// Returns an error when the root is unsafe or cannot be created or secured.
    pub fn open(root: impl Into<PathBuf>) -> Result<Self, StorageError> {
        let root = root.into();
        if root.as_os_str().is_empty() {
            return Err(StorageError::InvalidPath("empty root".into()));
        }
        if let Ok(metadata) = fs::symlink_metadata(&root) {
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err(StorageError::InvalidPath(
                    "root must be a real directory".into(),
                ));
            }
        } else {
            fs::create_dir_all(&root)?;
        }
        set_dir_permissions(&root)?;
        Ok(Self { root })
    }

    /// Atomically replaces one JSON record with deterministic serialized bytes.
    ///
    /// # Errors
    ///
    /// Returns an error for an unsafe name, serialization failure, or I/O failure.
    pub fn write<T: Serialize>(&self, name: &str, value: &T) -> Result<(), StorageError> {
        self.write_inner(name, value, false)
    }

    /// Reads a record whose schema version is the current version.
    ///
    /// # Errors
    ///
    /// Returns an error for unsafe paths, I/O, malformed data, or a wrong version.
    pub fn read_current<T: DeserializeOwned>(&self, name: &str) -> Result<T, StorageError> {
        let bytes = fs::read(self.resolve(name)?)?;
        let value: Value = serde_json::from_slice(&bytes)?;
        ensure_version(&value, CURRENT_SCHEMA_VERSION)?;
        Ok(serde_json::from_value(value)?)
    }

    /// Reads current settings or upgrades the supported version-zero shape in memory.
    ///
    /// # Errors
    ///
    /// Returns an error for unsafe paths, I/O, malformed data, or an unknown version.
    pub fn read_settings(&self, name: &str) -> Result<StoredSettings, StorageError> {
        let bytes = fs::read(self.resolve(name)?)?;
        let value: Value = serde_json::from_slice(&bytes)?;
        match optional_record_version(&value)? {
            None => Ok(serde_json::from_value::<LegacySettings>(value)?.into()),
            Some(version) if version == u64::from(CURRENT_SCHEMA_VERSION) => {
                Ok(serde_json::from_value(value)?)
            }
            Some(found) => Err(StorageError::UnknownVersion {
                found,
                current: CURRENT_SCHEMA_VERSION,
            }),
        }
    }

    /// Reads current-version favorites.
    ///
    /// # Errors
    ///
    /// Returns an error for unsafe paths, I/O, malformed data, or a wrong version.
    pub fn read_favorites(&self, name: &str) -> Result<StoredFavorites, StorageError> {
        let bytes = fs::read(self.resolve(name)?)?;
        let value: Value = serde_json::from_slice(&bytes)?;
        match optional_record_version(&value)? {
            None => {
                let legacy: Vec<LegacyBookmark> = serde_json::from_value(value)?;
                Ok(StoredFavorites::current(Favorites {
                    items: legacy.into_iter().map(Into::into).collect(),
                }))
            }
            Some(version) if version == u64::from(CURRENT_SCHEMA_VERSION) => {
                Ok(serde_json::from_value(value)?)
            }
            Some(found) => Err(StorageError::UnknownVersion {
                found,
                current: CURRENT_SCHEMA_VERSION,
            }),
        }
    }

    /// Reads current-version optional session metadata.
    ///
    /// # Errors
    ///
    /// Returns an error for unsafe paths, I/O, malformed data, or a wrong version.
    pub fn read_session(&self, name: &str) -> Result<StoredSession, StorageError> {
        let bytes = fs::read(self.resolve(name)?)?;
        let value: Value = serde_json::from_slice(&bytes)?;
        match optional_record_version(&value)? {
            None => {
                let urls: Vec<String> = serde_json::from_value(value)?;
                let tabs = urls
                    .into_iter()
                    .enumerate()
                    .map(|(index, url)| SessionTab {
                        active: index == 0,
                        title: None,
                        url,
                    })
                    .collect();
                Ok(StoredSession::current(Some(SessionMetadata {
                    saved_at_unix_ms: 0,
                    tabs,
                })))
            }
            Some(version) if version == u64::from(CURRENT_SCHEMA_VERSION) => {
                Ok(serde_json::from_value(value)?)
            }
            Some(found) => Err(StorageError::UnknownVersion {
                found,
                current: CURRENT_SCHEMA_VERSION,
            }),
        }
    }

    fn write_inner<T: Serialize>(
        &self,
        name: &str,
        value: &T,
        fail_before_persist: bool,
    ) -> Result<(), StorageError> {
        let destination = self.resolve(name)?;
        reject_symlink(&destination)?;
        let mut bytes = serde_json::to_vec_pretty(value)?;
        bytes.push(b'\n');

        let mut temporary = NamedTempFile::new_in(&self.root)?;
        temporary.as_file_mut().write_all(&bytes)?;
        temporary.as_file_mut().sync_all()?;
        if fail_before_persist {
            return Err(StorageError::Io(io::Error::other(
                "injected failure before persist",
            )));
        }
        temporary
            .persist(&destination)
            .map_err(|error| StorageError::Io(error.error))?;
        set_file_permissions(&destination)?;
        sync_parent(&self.root)?;
        Ok(())
    }

    fn resolve(&self, name: &str) -> Result<PathBuf, StorageError> {
        let path = Path::new(name);
        let mut components = path.components();
        let Some(Component::Normal(component)) = components.next() else {
            return Err(StorageError::InvalidPath(name.into()));
        };
        if components.next().is_some() || component == OsStr::new(".") {
            return Err(StorageError::InvalidPath(name.into()));
        }
        Ok(self.root.join(component))
    }
}

fn record_version(value: &Value) -> Result<u64, StorageError> {
    optional_record_version(value)?.ok_or(StorageError::InvalidRecord(
        "record has no non-negative integer version",
    ))
}

fn optional_record_version(value: &Value) -> Result<Option<u64>, StorageError> {
    let Some(version) = value.as_object().and_then(|object| object.get("version")) else {
        return Ok(None);
    };
    version
        .as_u64()
        .map(Some)
        .ok_or(StorageError::InvalidRecord(
            "record version is not a non-negative integer",
        ))
}

fn ensure_version(value: &Value, current: u32) -> Result<(), StorageError> {
    let found = record_version(value)?;
    if found != u64::from(current) {
        return Err(StorageError::UnknownVersion { found, current });
    }
    Ok(())
}

fn reject_symlink(path: &Path) -> Result<(), StorageError> {
    if let Ok(metadata) = fs::symlink_metadata(path) {
        if metadata.file_type().is_symlink() {
            return Err(StorageError::InvalidPath(
                "destination must not be a symbolic link".into(),
            ));
        }
    }
    Ok(())
}

#[cfg(unix)]
fn set_dir_permissions(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
}

#[cfg(not(unix))]
fn set_dir_permissions(_path: &Path) -> io::Result<()> {
    Ok(())
}

#[cfg(unix)]
fn set_file_permissions(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
}

#[cfg(not(unix))]
fn set_file_permissions(_path: &Path) -> io::Result<()> {
    Ok(())
}

#[cfg(unix)]
fn sync_parent(path: &Path) -> io::Result<()> {
    File::open(path)?.sync_all()
}

#[cfg(not(unix))]
fn sync_parent(_path: &Path) -> io::Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::records::{FavoritesMode, Settings, StoredSettings, TabPosition};

    #[test]
    fn failed_atomic_write_preserves_previous_file() {
        let root = tempfile::tempdir().unwrap();
        let store = AtomicJsonStore::open(root.path()).unwrap();
        let old = StoredSettings::current(Settings {
            block_ads: true,
            favorites_mode: FavoritesMode::Always,
            restore_session: false,
            tab_position: TabPosition::Top,
        });
        let new = StoredSettings::current(Settings {
            block_ads: false,
            favorites_mode: FavoritesMode::Hover,
            restore_session: true,
            tab_position: TabPosition::Side,
        });
        store.write("settings.json", &old).unwrap();

        let result = store.write_inner("settings.json", &new, true);

        assert!(result.is_err());
        assert_eq!(store.read_settings("settings.json").unwrap(), old);
    }

    #[test]
    fn reads_legacy_and_current_settings() {
        let root = tempfile::tempdir().unwrap();
        let store = AtomicJsonStore::open(root.path()).unwrap();
        fs::write(
            root.path().join("legacy.json"),
            r#"{"tabPosition":"side","favoritesMode":"hover","restoreSession":true}"#,
        )
        .unwrap();
        let migrated = store.read_settings("legacy.json").unwrap();
        assert_eq!(migrated.version, CURRENT_SCHEMA_VERSION);
        assert!(migrated.settings.restore_session);
        assert_eq!(migrated.settings.tab_position, TabPosition::Side);

        store.write("current.json", &migrated).unwrap();
        assert_eq!(store.read_settings("current.json").unwrap(), migrated);
    }

    #[test]
    fn upgrades_legacy_favorites_and_session_shapes() {
        let root = tempfile::tempdir().unwrap();
        let store = AtomicJsonStore::open(root.path()).unwrap();
        fs::write(
            root.path().join("favorites.json"),
            r#"[{"id":"bookmark-1","url":"https://example.test","title":"Example","createdAt":42}]"#,
        )
        .unwrap();
        fs::write(
            root.path().join("session.json"),
            r#"["https://one.test","https://two.test"]"#,
        )
        .unwrap();

        let favorites = store.read_favorites("favorites.json").unwrap();
        assert_eq!(favorites.favorites.items[0].created_at_unix_ms, 42);
        let session = store.read_session("session.json").unwrap();
        let session = session.session.unwrap();
        assert_eq!(session.saved_at_unix_ms, 0);
        assert!(session.tabs[0].active);
        assert!(!session.tabs[1].active);
    }

    #[test]
    fn rejects_unknown_versions_and_fields() {
        let root = tempfile::tempdir().unwrap();
        let store = AtomicJsonStore::open(root.path()).unwrap();
        fs::write(root.path().join("future.json"), r#"{"version":99}"#).unwrap();
        assert!(matches!(
            store.read_settings("future.json"),
            Err(StorageError::UnknownVersion { found: 99, .. })
        ));

        fs::write(
            root.path().join("extra.json"),
            r#"{"version":1,"settings":{"block_ads":true,"favorites_mode":"always","restore_session":false,"tab_position":"top","otp_secret":"never"}}"#,
        )
        .unwrap();
        assert!(matches!(
            store.read_settings("extra.json"),
            Err(StorageError::Malformed(_))
        ));
    }

    #[test]
    fn serialization_is_deterministic_and_contains_no_secret_field() {
        let root = tempfile::tempdir().unwrap();
        let store = AtomicJsonStore::open(root.path()).unwrap();
        let record = StoredSettings::current(Settings {
            block_ads: true,
            favorites_mode: FavoritesMode::Never,
            restore_session: true,
            tab_position: TabPosition::Top,
        });
        store.write("one.json", &record).unwrap();
        store.write("two.json", &record).unwrap();
        let one = fs::read(root.path().join("one.json")).unwrap();
        let two = fs::read(root.path().join("two.json")).unwrap();
        assert_eq!(one, two);
        assert!(!String::from_utf8(one).unwrap().contains("secret"));
    }
}
