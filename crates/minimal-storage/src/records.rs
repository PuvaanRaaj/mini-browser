use serde::{Deserialize, Serialize};

pub const CURRENT_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TabPosition {
    Top,
    Side,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FavoritesMode {
    Always,
    Hover,
    Never,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Settings {
    pub block_ads: bool,
    pub favorites_mode: FavoritesMode,
    pub restore_session: bool,
    pub tab_position: TabPosition,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct StoredSettings {
    pub version: u32,
    pub settings: Settings,
}

impl StoredSettings {
    #[must_use]
    pub fn current(settings: Settings) -> Self {
        Self {
            version: CURRENT_SCHEMA_VERSION,
            settings,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Bookmark {
    pub created_at_unix_ms: u64,
    pub id: String,
    pub title: String,
    pub url: String,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Favorites {
    pub items: Vec<Bookmark>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct StoredFavorites {
    pub version: u32,
    pub favorites: Favorites,
}

impl StoredFavorites {
    #[must_use]
    pub fn current(favorites: Favorites) -> Self {
        Self {
            version: CURRENT_SCHEMA_VERSION,
            favorites,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SessionTab {
    pub active: bool,
    pub title: Option<String>,
    pub url: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SessionMetadata {
    pub saved_at_unix_ms: u64,
    pub tabs: Vec<SessionTab>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct StoredSession {
    pub version: u32,
    pub session: Option<SessionMetadata>,
}

impl StoredSession {
    #[must_use]
    pub fn current(session: Option<SessionMetadata>) -> Self {
        Self {
            version: CURRENT_SCHEMA_VERSION,
            session,
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct LegacySettings {
    pub tab_position: TabPosition,
    pub favorites_mode: FavoritesMode,
    pub restore_session: bool,
}

impl From<LegacySettings> for StoredSettings {
    fn from(value: LegacySettings) -> Self {
        Self::current(Settings {
            block_ads: true,
            favorites_mode: value.favorites_mode,
            restore_session: value.restore_session,
            tab_position: value.tab_position,
        })
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct LegacyBookmark {
    pub created_at: u64,
    pub id: String,
    pub title: String,
    pub url: String,
}

impl From<LegacyBookmark> for Bookmark {
    fn from(value: LegacyBookmark) -> Self {
        Self {
            created_at_unix_ms: value.created_at,
            id: value.id,
            title: value.title,
            url: value.url,
        }
    }
}
