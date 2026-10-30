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
}

impl DeviceCredential {
    pub fn generate() -> Result<Self, String> {
        Ok(Self {
            device_id: random_token(16)?,
            secret: random_token(32)?,
        })
    }

    pub fn secret_hash(&self) -> String {
        secret_hash(&self.secret)
    }
}

pub fn secret_hash(secret: &str) -> String {
    let digest = Sha256::digest(secret.as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn load_or_create(path: &Path) -> Result<DeviceCredential, String> {
    if let Some(existing) = read_file(path) {
        remember_windows(&existing);
        return Ok(existing);
    }
    if let Some(existing) = recall_windows() {
        write_file(path, &existing)?;
        return Ok(existing);
    }
    let created = DeviceCredential::generate()?;
    write_file(path, &created)?;
    remember_windows(&created);
    Ok(created)
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
        assert!(!fs::read_to_string(&path)
            .unwrap()
            .contains(&first.secret_hash()));
        let _ = fs::remove_dir_all(&dir);
    }
}
