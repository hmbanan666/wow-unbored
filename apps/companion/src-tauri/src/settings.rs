//! Local Companion preferences and lifecycle markers. Callers serialize writes.

use std::fs;
use std::io::{self, Write};
use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::i18n::{self, Lang};

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
    /// Never replace the only copy after recovery failed. Not persisted or sent to the UI.
    #[serde(skip)]
    preserve_original: bool,
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
            preserve_original: false,
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum SettingsRecovery {
    Saved(String),
    BackupFailed,
}

impl SettingsRecovery {
    pub(crate) fn message(&self, lang: Lang) -> String {
        match self {
            Self::Saved(name) => i18n::trf_in(lang, "SETTINGS_RECOVERED", &[name]),
            Self::BackupFailed => i18n::tr_in(lang, "ERR_SETTINGS_RECOVERY"),
        }
    }
}

fn backup_settings(
    path: &Path,
    stamp: Duration,
    rename: impl Fn(&Path, &Path) -> io::Result<()>,
) -> io::Result<String> {
    // Unix seconds and nanoseconds are UTC, with no Windows-invalid colons.
    let base = format!(
        "settings.json.bad-{}.{:09}",
        stamp.as_secs(),
        stamp.subsec_nanos()
    );
    let mut collision = 0u64;
    loop {
        let name = if collision == 0 {
            base.clone()
        } else {
            format!("{base}-{collision}")
        };
        let backup = path.with_file_name(&name);
        // Reserve the name exclusively. Rename/copy can only replace our own placeholder.
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&backup)
        {
            Ok(file) => drop(file), // Close before rename on Windows.
            Err(err) if err.kind() == io::ErrorKind::AlreadyExists => {
                collision += 1;
                continue;
            }
            Err(err) => return Err(err),
        }
        let result = rename(path, &backup).or_else(|_| fs::copy(path, &backup).map(|_| ()));
        if let Err(err) = result {
            let _ = fs::remove_file(&backup);
            return Err(err);
        }
        return Ok(name);
    }
}

impl Settings {
    pub(crate) fn load(path: &Path) -> (Self, Option<SettingsRecovery>) {
        match fs::read(path) {
            Ok(bytes) => {
                if let Ok(settings) = serde_json::from_slice(&bytes) {
                    return (settings, None);
                }
            }
            Err(err) if err.kind() == io::ErrorKind::NotFound => return (Self::default(), None),
            Err(_) => {}
        }
        // Neither parser errors nor file contents belong in logs or UI state.
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default();
        match backup_settings(path, stamp, |from, to| fs::rename(from, to)) {
            Ok(name) => (Self::default(), Some(SettingsRecovery::Saved(name))),
            Err(_) => (
                Self {
                    preserve_original: true,
                    ..Self::default()
                },
                Some(SettingsRecovery::BackupFailed),
            ),
        }
    }

    pub(crate) fn save(&self, path: &Path) -> Result<(), String> {
        if self.preserve_original {
            return Err(i18n::code("ERR_SETTINGS_RECOVERY", &[]));
        }
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
            preserve_original: false,
        }
    }

    #[test]
    fn corrupt_json_is_preserved_before_defaults_are_used() {
        let dir = Directory::new("corrupt");
        let path = dir.settings();
        let broken = b"{\"wowPath\":";
        fs::write(&path, broken).unwrap();
        let (settings, notice) = Settings::load(&path);
        assert_eq!(settings, Settings::default());
        let backups: Vec<_> = fs::read_dir(&dir.0)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .filter(|path| {
                path.file_name()
                    .unwrap()
                    .to_string_lossy()
                    .starts_with("settings.json.bad-")
            })
            .collect();
        assert_eq!(backups.len(), 1, "broken settings must be preserved");
        assert_eq!(fs::read(&backups[0]).unwrap(), broken);
        let name = backups[0].file_name().unwrap().to_string_lossy();
        assert_eq!(notice, Some(SettingsRecovery::Saved(name.to_string())));
        for lang in [Lang::En, Lang::Ru] {
            assert!(notice
                .as_ref()
                .unwrap()
                .message(lang)
                .contains(name.as_ref()));
        }
        assert!(!path.exists());
        settings.save(&path).unwrap();
        assert!(Settings::load(&path).1.is_none());
        fs::write(&path, b"another broken file").unwrap();
        let (_, next_notice) = Settings::load(&path);
        let Some(SettingsRecovery::Saved(next_name)) = next_notice else {
            panic!("a new occurrence needs a new notice")
        };
        assert_ne!(next_name, name);
        assert_eq!(fs::read(&backups[0]).unwrap(), broken);
        assert_eq!(
            fs::read(dir.0.join(next_name)).unwrap(),
            b"another broken file"
        );
    }

    #[test]
    fn missing_settings_are_silent_and_do_not_create_a_backup() {
        let dir = Directory::new("missing");
        assert_eq!(Settings::load(&dir.settings()), (Settings::default(), None));
        assert_eq!(fs::read_dir(&dir.0).unwrap().count(), 0);
    }

    #[test]
    fn backup_names_use_utc_time_and_never_replace_an_existing_backup() {
        let dir = Directory::new("backup-names");
        let path = dir.settings();
        let stamp = Duration::new(1_793_664_000, 123_456_789);
        let first = "settings.json.bad-1793664000.123456789";
        fs::write(dir.0.join(first), b"previous backup").unwrap();
        fs::write(&path, b"new broken settings").unwrap();
        let name = backup_settings(&path, stamp, |from, to| fs::rename(from, to)).unwrap();
        assert_eq!(name, format!("{first}-1"));
        assert_eq!(fs::read(dir.0.join(first)).unwrap(), b"previous backup");
        assert_eq!(fs::read(dir.0.join(name)).unwrap(), b"new broken settings");
    }

    #[test]
    fn failed_rename_copies_the_original_without_replacing_an_earlier_backup() {
        let dir = Directory::new("copy");
        let path = dir.settings();
        fs::write(&path, b"broken settings").unwrap();
        let stamp = Duration::from_secs(1_793_664_000);
        for expected in [
            "settings.json.bad-1793664000.000000000",
            "settings.json.bad-1793664000.000000000-1",
        ] {
            let name = backup_settings(&path, stamp, |_, _| {
                Err(io::ErrorKind::PermissionDenied.into())
            })
            .unwrap();
            assert_eq!(name, expected);
            assert_eq!(fs::read(dir.0.join(name)).unwrap(), b"broken settings");
            assert_eq!(fs::read(&path).unwrap(), b"broken settings");
        }
    }

    #[cfg(unix)]
    #[test]
    fn unreadable_settings_are_renamed_and_reported() {
        use std::os::unix::fs::PermissionsExt;
        let dir = Directory::new("unreadable");
        let path = dir.settings();
        existing().save(&path).unwrap();
        let bytes = fs::read(&path).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o000)).unwrap();
        assert_eq!(
            fs::read(&path).unwrap_err().kind(),
            io::ErrorKind::PermissionDenied
        );
        let (settings, notice) = Settings::load(&path);
        assert_eq!(settings, Settings::default());
        let Some(SettingsRecovery::Saved(name)) = notice else {
            panic!("missing recovery notice")
        };
        let backup = dir.0.join(name);
        fs::set_permissions(&backup, fs::Permissions::from_mode(0o600)).unwrap();
        assert_eq!(fs::read(backup).unwrap(), bytes);
        assert!(!path.exists());
    }

    #[cfg(unix)]
    #[test]
    fn failed_backup_reports_failure_and_protects_the_original_from_later_saves() {
        use std::os::unix::fs::PermissionsExt;
        let dir = Directory::new("backup-failed");
        let path = dir.settings();
        fs::write(&path, b"broken settings").unwrap();
        fs::set_permissions(&dir.0, fs::Permissions::from_mode(0o500)).unwrap();
        let (settings, notice) = Settings::load(&path);
        fs::set_permissions(&dir.0, fs::Permissions::from_mode(0o700)).unwrap();
        assert_eq!(notice, Some(SettingsRecovery::BackupFailed));
        assert_eq!(settings.wow_path, "");
        assert!(settings.save(&path).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"broken settings");
        assert_eq!(fs::read_dir(&dir.0).unwrap().count(), 1);
        for lang in [Lang::En, Lang::Ru] {
            assert_eq!(
                notice.as_ref().unwrap().message(lang),
                i18n::tr_in(lang, "ERR_SETTINGS_RECOVERY")
            );
        }
    }

    #[test]
    fn failed_copy_removes_the_placeholder_and_keeps_the_original() {
        let dir = Directory::new("copy-failed");
        let path = dir.settings();
        fs::create_dir(&path).unwrap();
        fs::write(path.join("keep"), b"original").unwrap();
        let (_, notice) = Settings::load(&path);
        assert_eq!(notice, Some(SettingsRecovery::BackupFailed));
        assert_eq!(fs::read(path.join("keep")).unwrap(), b"original");
        assert_eq!(fs::read_dir(&dir.0).unwrap().count(), 1);
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
            assert_eq!(Settings::load(&path).0, settings);
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
        assert_eq!(Settings::load(&path).0, settings);
    }

    #[test]
    fn interrupted_staging_is_never_loaded_and_the_next_save_replaces_it() {
        let dir = Directory::new("interrupted");
        let path = dir.settings();
        let staging = dir.0.join("settings.json.tmp");
        let mut settings = existing();
        settings.save(&path).unwrap();
        fs::write(&staging, b"{\"wowPath\":").unwrap();
        assert_eq!(Settings::load(&path).0, settings);
        settings
            .update(&path, |next| next.account = "next".into())
            .unwrap();
        assert_eq!(Settings::load(&path).0, settings);
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
        let mut settings = Settings::load(&path).0;
        assert!(!settings.autostart_set);
        assert_eq!(settings.forgotten_at, None);
        assert!(settings.migrated_accounts.is_empty());
        settings
            .update(&path, |next| next.wow_path = "new".into())
            .unwrap();
        assert_eq!(Settings::load(&path).0, settings);
    }
}
