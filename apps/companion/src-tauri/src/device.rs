//! Device id and secret for pairing. The secret stays on this machine.
//! Windows also copies it into Credential Manager when that store is available.

use std::fs;
use std::path::Path;

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
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let text = serde_json::to_string_pretty(device).map_err(|err| err.to_string())?;
    fs::write(path, text).map_err(|err| err.to_string())
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
