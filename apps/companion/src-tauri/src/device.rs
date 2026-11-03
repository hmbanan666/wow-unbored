//! Device id and secret for pairing. The secret stays on this machine.
//! Windows also copies it into Credential Manager when that store is available.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCredential {
    pub device_id: String,
    pub secret: String,
    /// 32 random bytes, hex. Salts the Account key (docs/adr/0044). Stays on this PC.
    #[serde(default)]
    pub account_salt: String,
}

impl DeviceCredential {
    pub fn generate() -> Result<Self, String> {
        Ok(Self {
            device_id: random_token(16)?,
            secret: random_token(32)?,
            account_salt: random_token(32)?,
        })
    }

    /// A new id and secret, the same way a fresh install does, keeping the Account salt.
    pub fn rotate_keeping_salt(&self) -> Result<Self, String> {
        let mut next = Self::generate()?;
        next.account_salt = self.account_salt.clone();
        Ok(next)
    }

    pub fn secret_hash(&self) -> String {
        secret_hash(&self.secret)
    }
}

pub fn secret_hash(secret: &str) -> String {
    let digest = Sha256::digest(secret.as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn save(path: &Path, device: &DeviceCredential) -> Result<(), String> {
    write_file(path, device)?;
    remember_windows(device);
    Ok(())
}

fn pending_path(path: &Path) -> PathBuf {
    path.with_file_name("device.pending.json")
}

/// Persist the replacement before sending anything; retries reuse the same credential.
pub fn prepare_reconnect(path: &Path, old: &DeviceCredential) -> Result<DeviceCredential, String> {
    if let Some(pending) = load_pending(path)? {
        return Ok(pending);
    }
    let pending = old.rotate_keeping_salt()?;
    write_file_with_permissions(&pending_path(path), &pending, path)?;
    Ok(pending)
}

fn load_pending(path: &Path) -> Result<Option<DeviceCredential>, String> {
    let text = match fs::read_to_string(pending_path(path)) {
        Ok(text) => text,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(err.to_string()),
    };
    serde_json::from_str(&text)
        .map(Some)
        .map_err(|err| err.to_string())
}

/// Keep pending until the complete replacement is safely stored as the active Device.
pub fn adopt_pending(path: &Path, pending: &DeviceCredential) -> Result<(), String> {
    save(path, pending)?;
    discard_pending(path)
}

/// Forget cancels any interrupted Connect again as well.
pub fn discard_pending(path: &Path) -> Result<(), String> {
    match fs::remove_file(pending_path(path)) {
        Ok(()) => sync_directory(path),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

pub struct RecoveredDevice {
    pub device: DeviceCredential,
    pub status: String,
}

/// Startup recovery. Transport failures keep both files intact for the next attempt.
/// The callbacks return HTTP status and pairing status, without exposing credentials in errors.
pub fn recover_reconnect(
    path: &Path,
    old: &DeviceCredential,
    probe: impl FnOnce(&str) -> Result<(u16, String), String>,
    reconnect: impl FnOnce(&str, &DeviceCredential) -> Result<(u16, String), String>,
) -> Result<Option<RecoveredDevice>, String> {
    let Some(pending) = load_pending(path)? else {
        return Ok(None);
    };
    let (code, status) = probe(&pending.secret)?;
    if code == 200 && status != "revoked" {
        adopt_pending(path, &pending)?;
        return Ok(Some(RecoveredDevice {
            device: pending,
            status,
        }));
    }
    if code != 401 && code != 403 && !(code == 200 && status == "revoked") {
        return Err(crate::i18n::code("RECONNECT_FAILED", &[]));
    }
    let (code, status) = reconnect(&old.secret, &pending)?;
    if code == 201 {
        adopt_pending(path, &pending)?;
        return Ok(Some(RecoveredDevice {
            device: pending,
            status,
        }));
    }
    if code == 403 {
        // Both sides have been revoked. Start normal pairing with a fresh Device.
        let device = old.rotate_keeping_salt()?;
        adopt_pending(path, &device)?;
        return Ok(Some(RecoveredDevice {
            device,
            status: "pending".into(),
        }));
    }
    Err(crate::i18n::code("RECONNECT_FAILED", &[]))
}

pub fn load_or_create(path: &Path) -> Result<DeviceCredential, String> {
    if let Some(mut existing) = read_file(path) {
        if ensure_salt(&mut existing)? {
            write_file(path, &existing)?;
        }
        remember_windows(&existing);
        return Ok(existing);
    }
    if let Some(mut existing) = recall_windows() {
        if ensure_salt(&mut existing)? {
            remember_windows(&existing);
        }
        write_file(path, &existing)?;
        return Ok(existing);
    }
    let created = DeviceCredential::generate()?;
    write_file(path, &created)?;
    remember_windows(&created);
    Ok(created)
}

fn ensure_salt(device: &mut DeviceCredential) -> Result<bool, String> {
    if salt_ok(&device.account_salt) {
        return Ok(false);
    }
    device.account_salt = random_token(32)?;
    Ok(true)
}

fn salt_ok(salt: &str) -> bool {
    salt.len() == 64 && salt.bytes().all(|byte| byte.is_ascii_hexdigit())
}

/// Body of `POST /v1/devices/register` and of Connect again. The secret stays local.
pub fn registration_json(device: &DeviceCredential, name: &str) -> serde_json::Value {
    serde_json::json!({
        "deviceId": device.device_id,
        "name": name,
        "secretHash": device.secret_hash(),
    })
}

fn read_file(path: &Path) -> Option<DeviceCredential> {
    let text = fs::read_to_string(path).ok()?;
    let parsed: DeviceCredential = serde_json::from_str(&text).ok()?;
    if parsed.device_id.len() < 8 || parsed.secret.len() < 16 {
        return None;
    }
    Some(parsed)
}

fn write_file(path: &Path, device: &DeviceCredential) -> Result<(), String> {
    write_file_with_permissions(path, device, path)
}

fn write_file_with_permissions(
    path: &Path,
    device: &DeviceCredential,
    permissions_from: &Path,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let text = serde_json::to_string_pretty(device).map_err(|err| err.to_string())?;
    let staging = path.with_extension(format!("{}.tmp", random_token(8)?));
    let write = || -> std::io::Result<()> {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&staging)?;
        if let Ok(metadata) = fs::metadata(permissions_from) {
            file.set_permissions(metadata.permissions())?;
        }
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
        drop(file); // Windows requires the handle closed before replacement.
        fs::rename(&staging, path)
    };
    let result = write().map_err(|err| err.to_string());
    if result.is_err() {
        let _ = fs::remove_file(&staging);
    }
    result?;
    sync_directory(path)
}

fn sync_directory(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    if let Some(parent) = path.parent() {
        fs::File::open(parent)
            .and_then(|dir| dir.sync_all())
            .map_err(|err| err.to_string())?;
    }
    let _ = path;
    Ok(())
}

fn random_token(bytes: usize) -> Result<String, String> {
    let mut buf = vec![0u8; bytes];
    getrandom::fill(&mut buf).map_err(|err| err.to_string())?;
    Ok(buf.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn remember_windows(device: &DeviceCredential) {
    #[cfg(windows)]
    {
        if let Ok(entry) = keyring::Entry::new("Unbored Companion", "device") {
            if let Ok(text) = serde_json::to_string(device) {
                let _ = entry.set_password(&text);
            }
        }
    }
    let _ = device;
}

fn recall_windows() -> Option<DeviceCredential> {
    #[cfg(windows)]
    {
        let entry = keyring::Entry::new("Unbored Companion", "device").ok()?;
        let text = entry.get_password().ok()?;
        let parsed: DeviceCredential = serde_json::from_str(&text).ok()?;
        (parsed.device_id.len() >= 8 && parsed.secret.len() >= 16).then_some(parsed)
    }
    #[cfg(not(windows))]
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_roundtrip_keeps_the_same_device() {
        let dir = std::env::temp_dir().join(format!("unbored-device-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("device.json");
        let first = load_or_create(&path).unwrap();
        let second = load_or_create(&path).unwrap();
        assert_eq!(first, second);
        assert_eq!(first.secret_hash().len(), 64);
        assert_eq!(first.account_salt.len(), 64);
        assert!(!fs::read_to_string(&path)
            .unwrap()
            .contains(&first.secret_hash()));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_file_without_a_salt_gains_one_and_keeps_the_device() {
        let dir = std::env::temp_dir().join(format!("unbored-device-salt-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("device.json");
        fs::write(
            &path,
            r#"{"deviceId":"abcdef1234567890","secret":"0123456789abcdef"}"#,
        )
        .unwrap();
        let loaded = load_or_create(&path).unwrap();
        assert_eq!(loaded.device_id, "abcdef1234567890");
        assert_eq!(loaded.account_salt.len(), 64);
        let again = load_or_create(&path).unwrap();
        assert_eq!(again.account_salt, loaded.account_salt);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn pending_survives_a_crash_before_the_call_and_recovers_on_start() {
        let dir = std::env::temp_dir().join(format!("unbored-pending-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let path = dir.join("device.json");
        let old = load_or_create(&path).unwrap();
        let pending = prepare_reconnect(&path, &old).unwrap();
        assert_eq!(load_or_create(&path).unwrap(), old);
        assert_eq!(prepare_reconnect(&path, &old).unwrap(), pending);
        let recovered = recover_reconnect(
            &path,
            &old,
            |secret| {
                assert_eq!(secret, pending.secret);
                Ok((401, String::new()))
            },
            |secret, next| {
                assert_eq!(secret, old.secret);
                assert_eq!(next, &pending);
                Ok((201, "approved".into()))
            },
        )
        .unwrap()
        .unwrap();
        assert_eq!(recovered.device, pending);
        assert_eq!(recovered.status, "approved");
        assert_eq!(load_or_create(&path).unwrap(), pending);
        assert!(!pending_path(&path).exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn recovery_adopts_after_lost_reply_or_after_saving_before_the_first_poll() {
        for saved in [false, true] {
            let dir =
                std::env::temp_dir().join(format!("unbored-adopt-{saved}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            let path = dir.join("device.json");
            let old = load_or_create(&path).unwrap();
            let pending = prepare_reconnect(&path, &old).unwrap();
            if saved {
                save(&path, &pending).unwrap();
            }
            let active = load_or_create(&path).unwrap();
            let recovered = recover_reconnect(
                &path,
                &active,
                |secret| {
                    assert_eq!(secret, pending.secret);
                    Ok((200, "approved".into()))
                },
                |_, _| panic!("an authenticated replacement must not reconnect"),
            )
            .unwrap()
            .unwrap();
            assert_eq!(recovered.device, pending);
            assert_eq!(load_or_create(&path).unwrap(), pending);
            assert!(!pending_path(&path).exists());
            assert!(recover_reconnect(
                &path,
                &pending,
                |_| panic!("no pending"),
                |_, _| panic!("no pending")
            )
            .unwrap()
            .is_none());
            let _ = fs::remove_dir_all(dir);
        }
    }

    #[test]
    fn recovery_keeps_both_credentials_on_network_or_server_failure() {
        let dir = std::env::temp_dir().join(format!("unbored-retry-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let path = dir.join("device.json");
        let old = load_or_create(&path).unwrap();
        let pending = prepare_reconnect(&path, &old).unwrap();
        for code in [0, 401, 500] {
            assert!(recover_reconnect(
                &path,
                &old,
                |_| if code == 0 {
                    Err("offline".into())
                } else {
                    Ok((code, String::new()))
                },
                |_, _| Err("lost reply".into()),
            )
            .is_err());
            assert_eq!(load_or_create(&path).unwrap(), old);
            assert_eq!(load_pending(&path).unwrap(), Some(pending.clone()));
        }
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn revoked_recovery_returns_to_normal_pairing_without_reusing_either_secret() {
        for code in [200, 401, 403] {
            let dir =
                std::env::temp_dir().join(format!("unbored-revoked-{code}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            let path = dir.join("device.json");
            let old = load_or_create(&path).unwrap();
            let pending = prepare_reconnect(&path, &old).unwrap();
            let recovered = recover_reconnect(
                &path,
                &old,
                |_| Ok((code, "revoked".into())),
                |secret, next| {
                    assert_eq!(secret, old.secret);
                    assert_eq!(next, &pending);
                    Ok((403, String::new()))
                },
            )
            .unwrap()
            .unwrap();
            assert_eq!(recovered.status, "pending");
            assert_ne!(recovered.device.secret, old.secret);
            assert_ne!(recovered.device.secret, pending.secret);
            assert_eq!(recovered.device.account_salt, old.account_salt);
            assert!(!pending_path(&path).exists());
            assert_eq!(load_or_create(&path).unwrap(), recovered.device);
            let _ = fs::remove_dir_all(dir);
        }
    }

    #[test]
    fn failed_pending_write_leaves_active_device_and_failed_adoption_keeps_pending() {
        let dir = std::env::temp_dir().join(format!("unbored-write-failed-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let path = dir.join("device.json");
        let old = load_or_create(&path).unwrap();
        fs::create_dir(pending_path(&path)).unwrap();
        assert!(prepare_reconnect(&path, &old).is_err());
        assert_eq!(load_or_create(&path).unwrap(), old);
        fs::remove_dir(pending_path(&path)).unwrap();
        let pending = prepare_reconnect(&path, &old).unwrap();
        fs::remove_file(&path).unwrap();
        fs::create_dir(&path).unwrap();
        assert!(recover_reconnect(
            &path,
            &old,
            |_| Ok((200, "approved".into())),
            |_, _| panic!("no reconnect")
        )
        .is_err());
        assert_eq!(load_pending(&path).unwrap(), Some(pending.clone()));
        fs::remove_dir(&path).unwrap();
        save(&path, &old).unwrap();
        assert_eq!(
            recover_reconnect(
                &path,
                &old,
                |_| Ok((200, "approved".into())),
                |_, _| panic!("no reconnect")
            )
            .unwrap()
            .unwrap()
            .device,
            pending
        );
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn restart_after_adoption_before_poll_keeps_the_new_device() {
        let dir = std::env::temp_dir().join(format!("unbored-before-poll-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let path = dir.join("device.json");
        let old = load_or_create(&path).unwrap();
        let pending = prepare_reconnect(&path, &old).unwrap();
        adopt_pending(&path, &pending).unwrap();
        let restarted = load_or_create(&path).unwrap();
        assert_eq!(restarted, pending);
        assert!(recover_reconnect(
            &path,
            &restarted,
            |_| panic!("normal polling confirms"),
            |_, _| panic!("no reconnect")
        )
        .unwrap()
        .is_none());
        // Forget also cancels a pending attempt without changing the active credential.
        prepare_reconnect(&path, &restarted).unwrap();
        discard_pending(&path).unwrap();
        discard_pending(&path).unwrap();
        assert!(!pending_path(&path).exists());
        assert_eq!(load_or_create(&path).unwrap(), restarted);
        let _ = fs::remove_dir_all(dir);
    }

    #[cfg(unix)]
    #[test]
    fn pending_and_atomic_replacement_keep_device_file_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("unbored-permissions-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let path = dir.join("device.json");
        let old = load_or_create(&path).unwrap();
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).unwrap();
        let pending = prepare_reconnect(&path, &old).unwrap();
        assert_eq!(
            fs::metadata(pending_path(&path))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o640
        );
        adopt_pending(&path, &pending).unwrap();
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o640
        );
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn connect_again_is_a_new_device_with_the_same_salt() {
        let old = DeviceCredential::generate().unwrap();
        let next = old.rotate_keeping_salt().unwrap();
        assert_ne!(next.device_id, old.device_id);
        assert_ne!(next.secret, old.secret);
        assert_eq!(next.account_salt, old.account_salt);
        let body = registration_json(&next, "PC");
        assert_eq!(body["secretHash"].as_str().unwrap().len(), 64);
        assert!(body.get("secret").is_none());
        let text = body.to_string();
        assert!(!text.contains(&next.secret));
    }
}
