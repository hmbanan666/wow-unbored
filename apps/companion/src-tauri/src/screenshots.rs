//! Only files first seen during an uninterrupted sharing interval are eligible.
//! No directory is read while sharing is off; restarts and consent changes start at now.
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Default)]
pub struct ScreenshotWatch {
    generation: String,
    started: u64,
    seen: HashMap<PathBuf, (u64, u64)>,
}
impl ScreenshotWatch {
    pub fn reset(&mut self) {
        *self = Self::default();
    }
    /// First poll only establishes the baseline. A file must be stable across two polls.
    pub fn scan(&mut self, directory: &Path, generation: &str, now: u64) -> Vec<(PathBuf, u64)> {
        if generation.is_empty() {
            self.reset();
            return vec![];
        }
        if self.generation != generation {
            self.reset();
            self.generation = generation.into();
            self.started = now;
            return vec![];
        }
        let Ok(entries) = std::fs::read_dir(directory) else {
            return vec![];
        };
        let mut ready = vec![];
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            let extension = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if !name.starts_with("WoWScrnShot_")
                || !matches!(extension.as_str(), "jpg" | "jpeg" | "png")
            {
                continue;
            }
            let Ok(metadata) = std::fs::symlink_metadata(&path) else {
                continue;
            };
            if !metadata.is_file() || metadata.len() > 12 * 1024 * 1024 || metadata.len() == 0 {
                continue;
            }
            let Some(at) = metadata
                .modified()
                .ok()
                .and_then(|v| v.duration_since(UNIX_EPOCH).ok())
                .map(|v| v.as_secs())
            else {
                continue;
            };
            if at <= self.started || at > now || now.saturating_sub(at) > 300 {
                continue;
            }
            let stamp = (at, metadata.len());
            if self.seen.get(&path) == Some(&(u64::MAX, 0)) {
                continue;
            }
            if self.seen.get(&path) == Some(&stamp) {
                ready.push((path, at));
            } else {
                self.seen.insert(path, stamp);
            }
        }
        ready.truncate(2);
        ready
    }
    pub fn sent(&mut self, path: &Path) {
        // A zero-length sentinel prevents re-sending without retaining image bytes.
        self.seen.insert(path.into(), (u64::MAX, 0));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_stable_new_files_upload_once_and_a_new_interval_drops_them() {
        let dir = std::env::temp_dir().join(format!(
            "unbored-new-screenshot-test-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let image = dir.join("WoWScrnShot_new.jpg");
        std::fs::write(&image, b"new game image").unwrap();
        let file = std::fs::File::options().write(true).open(&image).unwrap();
        file.set_times(
            std::fs::FileTimes::new()
                .set_modified(UNIX_EPOCH + std::time::Duration::from_secs(101)),
        )
        .unwrap();
        let mut watch = ScreenshotWatch::default();
        assert!(watch.scan(&dir, "on", 100).is_empty());
        assert!(watch.scan(&dir, "on", 102).is_empty());
        assert_eq!(watch.scan(&dir, "on", 103), vec![(image.clone(), 101)]);
        watch.sent(&image);
        assert!(watch.scan(&dir, "on", 104).is_empty());
        assert!(watch.scan(&dir, "on", 105).is_empty());
        assert!(watch.scan(&dir, "new-consent", 106).is_empty());
        assert!(watch.scan(&dir, "new-consent", 107).is_empty());
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn consent_changes_restart_the_window_and_old_files_never_upload() {
        let dir =
            std::env::temp_dir().join(format!("unbored-screenshot-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let now = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let old = dir.join("WoWScrnShot_old.jpg");
        std::fs::write(&old, b"old").unwrap();
        let mut watch = ScreenshotWatch::default();
        assert!(watch.scan(&dir, "on", now).is_empty());
        assert!(watch.scan(&dir, "on", now + 1).is_empty());
        assert!(watch.scan(&dir, "", now + 2).is_empty());
        assert!(watch.scan(&dir, "again", now + 3).is_empty());
        assert!(watch.scan(&dir, "again", now + 4).is_empty());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
