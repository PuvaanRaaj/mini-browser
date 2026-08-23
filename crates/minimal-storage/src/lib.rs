#![doc = include_str!("../README.md")]

mod atomic;
mod migration;
mod records;
mod secrets;

pub use atomic::{AtomicJsonStore, StorageError};
pub use migration::{
    MigrationCommitError, MigrationFailure, MigrationPreview, MigrationRejection,
    MigrationTransaction, PendingSecret,
};
pub use records::{
    Bookmark, CURRENT_SCHEMA_VERSION, Favorites, FavoritesMode, SessionMetadata, SessionTab,
    Settings, StoredFavorites, StoredSession, StoredSettings, TabPosition,
};
pub use secrets::{SecretBytes, SecretKey, SecretStore, SecretStoreError};
