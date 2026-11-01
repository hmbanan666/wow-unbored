//! Local Companion preferences and lifecycle markers. Callers serialize writes.

use std::fs;
use std::io::Write;
use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Settings {
    pub wow_path: String,
    pub account: String,
    pub endpoint_url: String,
    pub poll_minutes: u32,
    /// Launch at login is enabled once; subsequent player choices stand.
    #[serde(default)]
    pub autostart_set: bool,
    /// Set by Forget my data, cleared by Connect again.
    #[serde(default)]
    pub forgotten_at: Option<u64>,
    /// Account keys already renamed on the Server (ADR 0044).
    #[serde(default)]
    pub migrated_accounts: Vec<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            wow_path: String::new(),
            account: String::new(),
            endpoint_url: String::new(),
            poll_minutes: 5,
            autostart_set: false,
            forgotten_at: None,
            migrated_accounts: Vec::new(),
        }
    }
}

impl Settings {
    pub(crate) fn load(path: &Path) -> Self {
        // TODO(audit): agree on recovery/reporting for unreadable or malformed
        // settings instead of silently treating them as a fresh install.
        fs::read(path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    pub(crate) fn save(&self, path: &Path) -> Result<(), String> {
        let text = serde_json::to_string_pretty(self).map_err(|err| err.to_string())?;
        // Keep the working file intact until the complete replacement is ready.
        // A leftover staging file is never loaded and the next save replaces it.
        let mut name = path.as_os_str().to_os_string();
        name.push(".tmp");
        let staging = std::path::PathBuf::from(name);
        let write = || -> std::io::Result<()> {
            let mut file = fs::File::create(&staging)?;
            file.write_all(text.as_bytes())?;
            file.sync_all()?;
            drop(file); // Close before rename, including on Windows.
            fs::rename(&staging, path)
        };
        write().map_err(|err| err.to_string())
    }

    /// Explicit preference changes become active only after persistence succeeds.
    /// Forget has already happened remotely and must use save without rollback.
    pub(crate) fn update(
        &mut self,
        path: &Path,
        edit: impl FnOnce(&mut Self),
    ) -> Result<(), String> {
        let mut next = self.clone();
        edit(&mut next);
        next.save(path)?;
        *self = next;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    struct Directory(PathBuf);

    impl Directory {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir()
                .join(format!("unbored-settings-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }

        fn settings(&self) -> PathBuf {
            self.0.join("settings.json")
        }
    }

    impl Drop for Directory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn existing() -> Settings {
        Settings {
            wow_path: "old/_retail_".into(),
            account: "old-account".into(),
            endpoint_url: "https://old.example".into(),
            poll_minutes: 5,
            autostart_set: true,
            forgotten_at: Some(123),
            migrated_accounts: vec!["already-renamed".into()],
        }
    }

    #[test]
    fn failed_preference_changes_keep_memory_and_disk_then_can_retry() {
        let dir = Directory::new("preferences");
        let path = dir.settings();
        let staging = dir.0.join("settings.json.tmp");
        let mut settings = existing();
        settings.save(&path).unwrap();
        for preference in ["detect", "path", "account", "endpoint"] {
            let edit = |next: &mut Settings| match preference {
                "detect" => next.wow_path = "detected/_retail_".into(),
                "path" => next.wow_path = "chosen/_retail_".into(),
                "account" => next.account = "new-account".into(),
                "endpoint" => {
                    next.endpoint_url = "https://new.example".into();
                    next.poll_minutes = 30;
                }
                _ => unreachable!(),
            };
            let before = settings.clone();
            let bytes = fs::read(&path).unwrap();
            fs::create_dir(&staging).unwrap();
            assert!(settings.update(&path, edit).is_err(), "{preference}");
            assert_eq!(settings, before, "{preference}");
            assert_eq!(fs::read(&path).unwrap(), bytes, "{preference}");
            fs::remove_dir(&staging).unwrap();
            settings.update(&path, edit).unwrap();
            assert_ne!(settings, before);
            assert_eq!(Settings::load(&path), settings);
            assert_eq!(settings.forgotten_at, Some(123));
            assert_eq!(settings.migrated_accounts, vec!["already-renamed"]);
        }
    }

    #[test]
    fn a_failed_rename_does_not_commit_preferences_or_remove_the_destination() {
        let dir = Directory::new("rename");
        let path = dir.settings();
        fs::create_dir(&path).unwrap();
        fs::write(path.join("keep"), "existing entry").unwrap();
        let mut settings = existing();
        let before = settings.clone();
        assert!(settings
            .update(&path, |next| next.account = "new".into())
            .is_err());
        assert_eq!(settings, before);
        assert_eq!(
            fs::read_to_string(path.join("keep")).unwrap(),
            "existing entry"
        );
        fs::remove_dir_all(&path).unwrap();
        settings
            .update(&path, |next| next.account = "new".into())
            .unwrap();
        assert_eq!(Settings::load(&path), settings);
    }

    #[test]
    fn interrupted_staging_is_never_loaded_and_the_next_save_replaces_it() {
        let dir = Directory::new("interrupted");
        let path = dir.settings();
        let staging = dir.0.join("settings.json.tmp");
        let mut settings = existing();
        settings.save(&path).unwrap();
        fs::write(&staging, b"{\"wowPath\":").unwrap();
        assert_eq!(Settings::load(&path), settings);
        settings
            .update(&path, |next| next.account = "next".into())
            .unwrap();
        assert_eq!(Settings::load(&path), settings);
        assert!(!staging.exists());
        assert!(settings.autostart_set);
        assert_eq!(settings.forgotten_at, Some(123));
    }

    #[test]
    fn legacy_settings_keep_their_defaults_and_can_be_replaced() {
        let dir = Directory::new("legacy");
        let path = dir.settings();
        fs::write(
            &path,
            r#"{"wowPath":"old","account":"","endpointUrl":"","pollMinutes":5}"#,
        )
        .unwrap();
        let mut settings = Settings::load(&path);
        assert!(!settings.autostart_set);
        assert_eq!(settings.forgotten_at, None);
        assert!(settings.migrated_accounts.is_empty());
        settings
            .update(&path, |next| next.wow_path = "new".into())
            .unwrap();
        assert_eq!(Settings::load(&path), settings);
    }
}
