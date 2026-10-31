//! Account key sent to the Server (D58, docs/adr/0044).
//!
//! The WoW account folder is `12345678#1`: the part before `#` is one
//! Battle.net account. This PC keeps a 32-byte salt next to its device
//! secret and sends only
//!
//! ```text
//! hex(SHA-256(salt_bytes || 0x00 || utf8(account_key)))
//! ```
//!
//! The salt never leaves the PC. Until the Server has renamed rows stored
//! under the old key, the upload also carries `accountLegacy` once.

use std::collections::BTreeSet;

use sha2::{Digest, Sha256};

use crate::i18n::code;

/// The part of a WTF account folder shared by every license (`12345678#1` → `12345678`).
pub fn account_key(folder: &str) -> String {
    folder
        .trim()
        .split('#')
        .next()
        .unwrap_or("")
        .trim()
        .to_string()
}

pub fn is_account_hash(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

/// Lowercase hex SHA-256 of `salt || 0x00 || account key`. `salt_hex` is 32 bytes, hex-encoded.
pub fn hash_account(salt_hex: &str, folder: &str) -> Result<String, String> {
    let salt = decode_salt(salt_hex)?;
    let key = account_key(folder);
    if key.is_empty() {
        return Err(code("ERR_NO_ACCOUNT_FOLDER", &[]));
    }
    let mut hasher = Sha256::new();
    hasher.update(salt);
    hasher.update([0u8]);
    hasher.update(key.as_bytes());
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

fn decode_salt(salt_hex: &str) -> Result<[u8; 32], String> {
    let bytes = salt_hex.trim().as_bytes();
    if bytes.len() != 64 || !bytes.iter().all(u8::is_ascii_hexdigit) {
        return Err(code("ERR_ACCOUNT_SALT", &[]));
    }
    let mut out = [0u8; 32];
    for (i, chunk) in bytes.chunks(2).enumerate() {
        let text = std::str::from_utf8(chunk).map_err(|_| code("ERR_ACCOUNT_SALT", &[]))?;
        out[i] = u8::from_str_radix(text, 16).map_err(|_| code("ERR_ACCOUNT_SALT", &[]))?;
    }
    Ok(out)
}

/// Which Account keys this PC has already asked the Server to rename.
#[derive(Debug, Clone)]
pub struct AccountSeal {
    salt: String,
    migrated: BTreeSet<String>,
}

impl AccountSeal {
    pub fn new(
        salt: impl Into<String>,
        migrated: impl IntoIterator<Item = impl AsRef<str>>,
    ) -> Self {
        Self {
            salt: salt.into(),
            migrated: migrated
                .into_iter()
                .map(|key| account_key(key.as_ref()))
                .filter(|key| !key.is_empty())
                .collect(),
        }
    }

    /// Hash for `account`, and the old key while this PC has not migrated it yet.
    pub fn publish(&self, folder: &str) -> Result<(String, Option<String>), String> {
        let hash = hash_account(&self.salt, folder)?;
        let key = account_key(folder);
        let legacy = if self.migrated.contains(&key) {
            None
        } else {
            Some(key)
        };
        Ok((hash, legacy))
    }

    pub fn note_migrated(&mut self, legacy: Option<&str>) {
        if let Some(key) = legacy.map(account_key).filter(|key| !key.is_empty()) {
            self.migrated.insert(key);
        }
    }

    pub fn migrated_accounts(&self) -> Vec<String> {
        self.migrated.iter().cloned().collect()
    }
}

pub fn attach_legacy(body: &mut serde_json::Value, legacy: Option<&str>) {
    if let (Some(map), Some(legacy)) = (body.as_object_mut(), legacy) {
        map.insert(
            "accountLegacy".into(),
            serde_json::Value::String(legacy.to_string()),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SALT: &str = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
    const HASH: &str = "7333440414623d4053ac778ca99e938ae2cf885cd54333c1c5f053e4a896c4ee";

    #[test]
    fn hash_is_salted_and_ignores_the_license_suffix() {
        assert_eq!(hash_account(SALT, "12345678#1").unwrap(), HASH);
        assert_eq!(hash_account(SALT, "12345678#2").unwrap(), HASH);
        assert_eq!(hash_account(SALT, " 12345678#1 ").unwrap(), HASH);
        assert_ne!(hash_account(SALT, "12345679").unwrap(), HASH);
        let other = "ff112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
        assert_ne!(hash_account(other, "12345678").unwrap(), HASH);
        assert!(is_account_hash(HASH));
        assert!(!is_account_hash("12345678"));
    }

    #[test]
    fn legacy_key_is_sent_once() {
        let mut seal = AccountSeal::new(SALT, Vec::<String>::new());
        let (hash, legacy) = seal.publish("12345678#1").unwrap();
        assert_eq!(hash, HASH);
        assert_eq!(legacy.as_deref(), Some("12345678"));
        seal.note_migrated(legacy.as_deref());
        let (_, again) = seal.publish("12345678#2").unwrap();
        assert_eq!(again, None);
        assert_eq!(seal.migrated_accounts(), vec!["12345678".to_string()]);
    }
}
