use serde::{Deserialize, Serialize};

use crate::{hostname_of, resolve_navigation};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
// These fields intentionally preserve the existing cross-shell wire contract.
#[allow(clippy::struct_excessive_bools)]
pub struct TabInfo {
    pub id: String,
    pub url: String,
    pub title: String,
    pub loading: bool,
    pub can_go_back: bool,
    pub can_go_forward: bool,
    pub is_start_page: bool,
    pub error: Option<String>,
}

impl TabInfo {
    #[must_use]
    pub fn start(id: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            url: String::new(),
            title: "New tab".to_owned(),
            loading: false,
            can_go_back: false,
            can_go_forward: false,
            is_start_page: true,
            error: None,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BrowserStatus {
    #[default]
    Ready,
    Error,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserState {
    pub tabs: Vec<TabInfo>,
    pub active_tab_id: Option<String>,
    pub session_id: String,
    pub status: BrowserStatus,
    pub error: Option<String>,
    pub extension_loaded: bool,
    pub adblock_enabled: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum BrowserCommand {
    Navigate {
        input: String,
        tab_id: Option<String>,
    },
    Back,
    Forward,
    Reload,
    Stop,
    NewTab {
        tab_id: String,
    },
    CloseTab {
        tab_id: String,
        replacement_id: String,
    },
    SwitchTab {
        tab_id: String,
    },
    ResetSession {
        session_id: String,
        tab_id: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum BrowserEffect {
    Navigate { tab_id: String, url: String },
    GoBack { tab_id: String },
    GoForward { tab_id: String },
    Reload { tab_id: String },
    Stop { tab_id: String },
    ActivateTab { tab_id: String },
    ClosePage { tab_id: String },
    ResetSession { old_session_id: String },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ModelError {
    DuplicateTabId(String),
    DuplicateSessionId,
}

/// The deterministic browser state owned by both native shells.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BrowserModel {
    state: BrowserState,
}

impl BrowserModel {
    #[must_use]
    pub fn new(session_id: impl Into<String>, tab_id: impl Into<String>) -> Self {
        let tab = TabInfo::start(tab_id);
        let active_tab_id = Some(tab.id.clone());
        Self {
            state: BrowserState {
                tabs: vec![tab],
                active_tab_id,
                session_id: session_id.into(),
                status: BrowserStatus::Ready,
                error: None,
                extension_loaded: false,
                adblock_enabled: false,
            },
        }
    }

    #[must_use]
    pub const fn state(&self) -> &BrowserState {
        &self.state
    }

    pub fn set_capabilities(&mut self, extension_loaded: bool, adblock_enabled: bool) {
        self.state.extension_loaded = extension_loaded;
        self.state.adblock_enabled = adblock_enabled;
    }

    /// Applies one native-shell command and returns platform work to perform.
    ///
    /// # Errors
    ///
    /// Returns [`ModelError`] when a caller supplies an identifier that would
    /// violate the uniqueness invariants of the model.
    pub fn apply(&mut self, command: BrowserCommand) -> Result<Vec<BrowserEffect>, ModelError> {
        match command {
            BrowserCommand::Navigate { input, tab_id } => Ok(self.navigate(&input, tab_id)),
            BrowserCommand::Back => {
                Ok(self.active_effect(|tab_id| BrowserEffect::GoBack { tab_id }))
            }
            BrowserCommand::Forward => {
                Ok(self.active_effect(|tab_id| BrowserEffect::GoForward { tab_id }))
            }
            BrowserCommand::Reload => {
                Ok(self.active_effect(|tab_id| BrowserEffect::Reload { tab_id }))
            }
            BrowserCommand::Stop => Ok(self.active_effect(|tab_id| BrowserEffect::Stop { tab_id })),
            BrowserCommand::NewTab { tab_id } => self.new_tab(tab_id),
            BrowserCommand::CloseTab {
                tab_id,
                replacement_id,
            } => self.close_tab(&tab_id, replacement_id),
            BrowserCommand::SwitchTab { tab_id } => Ok(self.switch_tab(&tab_id)),
            BrowserCommand::ResetSession { session_id, tab_id } => {
                self.reset_session(session_id, tab_id)
            }
        }
    }

    pub fn page_title_updated(&mut self, tab_id: &str, title: &str) {
        if let Some(tab) = self.tab_mut(tab_id)
            && !title.is_empty()
        {
            title.clone_into(&mut tab.title);
        }
    }

    pub fn page_started_loading(&mut self, tab_id: &str) {
        if let Some(tab) = self.tab_mut(tab_id) {
            tab.loading = true;
        }
    }

    pub fn page_stopped_loading(
        &mut self,
        tab_id: &str,
        url: &str,
        title: &str,
        can_go_back: bool,
        can_go_forward: bool,
    ) {
        if let Some(tab) = self.tab_mut(tab_id) {
            tab.loading = false;
            url.clone_into(&mut tab.url);
            if !title.is_empty() {
                title.clone_into(&mut tab.title);
            }
            tab.can_go_back = can_go_back;
            tab.can_go_forward = can_go_forward;
        }
    }

    pub fn page_navigated(&mut self, tab_id: &str, url: &str) {
        if let Some(tab) = self.tab_mut(tab_id) {
            url.clone_into(&mut tab.url);
            tab.is_start_page = false;
        }
    }

    pub fn page_failed(&mut self, tab_id: &str, message: impl Into<String>) {
        if let Some(tab) = self.tab_mut(tab_id) {
            tab.error = Some(message.into());
            tab.loading = false;
        }
    }

    fn navigate(&mut self, input: &str, tab_id: Option<String>) -> Vec<BrowserEffect> {
        let url = resolve_navigation(input);
        if url.is_empty() {
            return Vec::new();
        }

        let id = tab_id
            .or_else(|| self.state.active_tab_id.clone())
            .unwrap_or_default();
        let Some(tab) = self.tab_mut(&id) else {
            return Vec::new();
        };
        tab.url.clone_from(&url);
        tab.title = match hostname_of(&url) {
            hostname if hostname.is_empty() => "Loading".to_owned(),
            hostname => hostname,
        };
        tab.loading = true;
        tab.is_start_page = false;
        tab.error = None;
        self.state.active_tab_id = Some(id.clone());
        vec![BrowserEffect::Navigate { tab_id: id, url }]
    }

    fn new_tab(&mut self, tab_id: String) -> Result<Vec<BrowserEffect>, ModelError> {
        if self.has_tab(&tab_id) {
            return Err(ModelError::DuplicateTabId(tab_id));
        }
        self.state.tabs.push(TabInfo::start(tab_id.clone()));
        self.state.active_tab_id = Some(tab_id.clone());
        Ok(vec![BrowserEffect::ActivateTab { tab_id }])
    }

    fn close_tab(
        &mut self,
        tab_id: &str,
        replacement_id: String,
    ) -> Result<Vec<BrowserEffect>, ModelError> {
        let Some(index) = self.state.tabs.iter().position(|tab| tab.id == tab_id) else {
            return Ok(Vec::new());
        };
        if self.state.tabs.len() == 1 && replacement_id == tab_id {
            return Err(ModelError::DuplicateTabId(replacement_id));
        }
        let was_active = self.state.active_tab_id.as_deref() == Some(tab_id);
        self.state.tabs.remove(index);
        let mut effects = vec![BrowserEffect::ClosePage {
            tab_id: tab_id.to_owned(),
        }];

        if self.state.tabs.is_empty() {
            self.state.tabs.push(TabInfo::start(replacement_id.clone()));
            self.state.active_tab_id = Some(replacement_id.clone());
            effects.push(BrowserEffect::ActivateTab {
                tab_id: replacement_id,
            });
        } else if was_active {
            let next_id = self
                .state
                .tabs
                .last()
                .expect("tabs is not empty")
                .id
                .clone();
            self.state.active_tab_id = Some(next_id.clone());
            effects.push(BrowserEffect::ActivateTab { tab_id: next_id });
        }
        Ok(effects)
    }

    fn switch_tab(&mut self, tab_id: &str) -> Vec<BrowserEffect> {
        if !self.has_tab(tab_id) {
            return Vec::new();
        }
        self.state.active_tab_id = Some(tab_id.to_owned());
        vec![BrowserEffect::ActivateTab {
            tab_id: tab_id.to_owned(),
        }]
    }

    fn reset_session(
        &mut self,
        session_id: String,
        tab_id: String,
    ) -> Result<Vec<BrowserEffect>, ModelError> {
        if session_id == self.state.session_id {
            return Err(ModelError::DuplicateSessionId);
        }
        let old_session_id = std::mem::replace(&mut self.state.session_id, session_id);
        self.state.tabs = vec![TabInfo::start(tab_id.clone())];
        self.state.active_tab_id = Some(tab_id.clone());
        self.state.status = BrowserStatus::Ready;
        self.state.error = None;
        self.state.extension_loaded = false;
        self.state.adblock_enabled = false;
        Ok(vec![
            BrowserEffect::ResetSession { old_session_id },
            BrowserEffect::ActivateTab { tab_id },
        ])
    }

    fn active_effect(&self, create: fn(String) -> BrowserEffect) -> Vec<BrowserEffect> {
        self.state
            .active_tab_id
            .clone()
            .map(create)
            .into_iter()
            .collect()
    }

    fn has_tab(&self, tab_id: &str) -> bool {
        self.state.tabs.iter().any(|tab| tab.id == tab_id)
    }

    fn tab_mut(&mut self, tab_id: &str) -> Option<&mut TabInfo> {
        self.state.tabs.iter_mut().find(|tab| tab.id == tab_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starts_with_one_fresh_active_tab() {
        let model = BrowserModel::new("session-1", "tab-1");
        assert_eq!(model.state().tabs, vec![TabInfo::start("tab-1")]);
        assert_eq!(model.state().active_tab_id.as_deref(), Some("tab-1"));
        assert_eq!(model.state().status, BrowserStatus::Ready);
    }

    #[test]
    fn navigation_updates_state_before_emitting_platform_work() {
        let mut model = BrowserModel::new("session-1", "tab-1");
        let effects = model
            .apply(BrowserCommand::Navigate {
                input: " example.com/docs ".to_owned(),
                tab_id: None,
            })
            .unwrap();

        assert_eq!(
            effects,
            vec![BrowserEffect::Navigate {
                tab_id: "tab-1".to_owned(),
                url: "https://example.com/docs".to_owned(),
            }]
        );
        let tab = &model.state().tabs[0];
        assert_eq!(tab.url, "https://example.com/docs");
        assert_eq!(tab.title, "example.com");
        assert!(tab.loading);
        assert!(!tab.is_start_page);
        assert_eq!(tab.error, None);
    }

    #[test]
    fn empty_navigation_and_unknown_tabs_are_ignored() {
        let mut model = BrowserModel::new("session-1", "tab-1");
        assert!(
            model
                .apply(BrowserCommand::Navigate {
                    input: "  ".to_owned(),
                    tab_id: None,
                })
                .unwrap()
                .is_empty()
        );
        assert!(
            model
                .apply(BrowserCommand::Navigate {
                    input: "example.com".to_owned(),
                    tab_id: Some("missing".to_owned()),
                })
                .unwrap()
                .is_empty()
        );
        assert_eq!(model.state().tabs, vec![TabInfo::start("tab-1")]);
    }

    #[test]
    fn close_selects_last_tab_and_never_leaves_an_empty_window() {
        let mut model = BrowserModel::new("session-1", "tab-1");
        model
            .apply(BrowserCommand::NewTab {
                tab_id: "tab-2".to_owned(),
            })
            .unwrap();
        model
            .apply(BrowserCommand::NewTab {
                tab_id: "tab-3".to_owned(),
            })
            .unwrap();

        model
            .apply(BrowserCommand::CloseTab {
                tab_id: "tab-3".to_owned(),
                replacement_id: "unused".to_owned(),
            })
            .unwrap();
        assert_eq!(model.state().active_tab_id.as_deref(), Some("tab-2"));

        model
            .apply(BrowserCommand::CloseTab {
                tab_id: "tab-2".to_owned(),
                replacement_id: "unused".to_owned(),
            })
            .unwrap();
        model
            .apply(BrowserCommand::CloseTab {
                tab_id: "tab-1".to_owned(),
                replacement_id: "tab-4".to_owned(),
            })
            .unwrap();
        assert_eq!(model.state().tabs, vec![TabInfo::start("tab-4")]);
        assert_eq!(model.state().active_tab_id.as_deref(), Some("tab-4"));
    }

    #[test]
    fn rejected_replacement_id_does_not_mutate_the_last_tab() {
        let mut model = BrowserModel::new("session-1", "tab-1");
        let error = model
            .apply(BrowserCommand::CloseTab {
                tab_id: "tab-1".to_owned(),
                replacement_id: "tab-1".to_owned(),
            })
            .unwrap_err();

        assert_eq!(error, ModelError::DuplicateTabId("tab-1".to_owned()));
        assert_eq!(model.state().tabs, vec![TabInfo::start("tab-1")]);
        assert_eq!(model.state().active_tab_id.as_deref(), Some("tab-1"));
    }

    #[test]
    fn engine_events_are_scoped_to_the_matching_tab() {
        let mut model = BrowserModel::new("session-1", "tab-1");
        model.page_navigated("tab-1", "https://example.com");
        model.page_started_loading("tab-1");
        model.page_title_updated("tab-1", "Example");
        model.page_stopped_loading("tab-1", "https://example.com/next", "Next", true, false);
        model.page_failed("missing", "must not leak to the active tab");

        let tab = &model.state().tabs[0];
        assert_eq!(tab.url, "https://example.com/next");
        assert_eq!(tab.title, "Next");
        assert!(!tab.loading);
        assert!(tab.can_go_back);
        assert!(!tab.can_go_forward);
        assert!(!tab.is_start_page);
        assert_eq!(tab.error, None);
    }

    #[test]
    fn reset_replaces_session_tabs_and_capabilities() {
        let mut model = BrowserModel::new("session-1", "tab-1");
        model.set_capabilities(true, true);
        let effects = model
            .apply(BrowserCommand::ResetSession {
                session_id: "session-2".to_owned(),
                tab_id: "tab-2".to_owned(),
            })
            .unwrap();

        assert_eq!(model.state().session_id, "session-2");
        assert_eq!(model.state().tabs, vec![TabInfo::start("tab-2")]);
        assert!(!model.state().extension_loaded);
        assert!(!model.state().adblock_enabled);
        assert_eq!(
            effects[0],
            BrowserEffect::ResetSession {
                old_session_id: "session-1".to_owned()
            }
        );
    }
}
