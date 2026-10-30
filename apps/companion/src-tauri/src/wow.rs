//! Retail install and WTF account discovery. Paths only.

use std::fs;
use std::path::{Path, PathBuf};

use crate::savedvars::{session_from_saved_variables, SessionProgress};

#[derive(Debug, Clone, PartialEq)]
pub struct CharacterFile {
    pub account: String,
    pub realm: String,
    pub character: String,
    pub path: PathBuf,
}

pub fn find_retail_dirs(roots: &[PathBuf]) -> Vec<PathBuf> {
    let mut found = Vec::new();
    for root in roots {
        if let Some(retail) = retail_dir(root) {
            if !found.iter().any(|have: &PathBuf| have == &retail) {
                found.push(retail);
            }
        }
    }
    found
}

pub fn retail_dir(candidate: &Path) -> Option<PathBuf> {
    let candidate = normalize_existing(candidate)?;
    if is_retail(&candidate) {
        return Some(candidate);
    }
    let nested = candidate.join("_retail_");
    if is_retail(&nested) {
        return Some(nested);
    }
    None
}

fn normalize_existing(path: &Path) -> Option<PathBuf> {
    if path.exists() {
        Some(path.to_path_buf())
    } else {
        None
    }
}

fn is_retail(path: &Path) -> bool {
    path.is_dir() && path.join("Wow.exe").is_file()
}

pub fn common_roots() -> Vec<PathBuf> {
    let mut roots = vec![
        PathBuf::from(r"C:\Program Files (x86)\World of Warcraft"),
        PathBuf::from(r"C:\Program Files\World of Warcraft"),
    ];
    if let Some(program_files) = std::env::var_os("ProgramFiles") {
        roots.push(PathBuf::from(program_files).join("World of Warcraft"));
    }
    if let Some(program_files) = std::env::var_os("ProgramFiles(x86)") {
        roots.push(PathBuf::from(program_files).join("World of Warcraft"));
    }
    roots
}

#[cfg(windows)]
pub fn registry_roots() -> Vec<PathBuf> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    let keys = [
        (
            HKEY_LOCAL_MACHINE,
            r"SOFTWARE\WOW6432Node\Blizzard Entertainment\World of Warcraft",
        ),
        (
            HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Blizzard Entertainment\World of Warcraft",
        ),
        (
            HKEY_CURRENT_USER,
            r"SOFTWARE\Blizzard Entertainment\World of Warcraft",
        ),
    ];
    let mut roots = Vec::new();
    for (hive, subkey) in keys {
        let hk = RegKey::predef(hive);
        let Ok(key) = hk.open_subkey(subkey) else {
            continue;
        };
        if let Ok(install) = key.get_value::<String, _>("InstallPath") {
            roots.push(PathBuf::from(install));
        }
    }
    roots
}

#[cfg(not(windows))]
pub fn registry_roots() -> Vec<PathBuf> {
    Vec::new()
}

pub fn detect_installs() -> Vec<PathBuf> {
    let mut roots = registry_roots();
    roots.extend(common_roots());
    roots.extend(battle_net_install_roots());
    find_retail_dirs(&roots)
}

fn battle_net_install_roots() -> Vec<PathBuf> {
    crate::addon::battle_net_config_paths()
        .into_iter()
        .filter_map(|path| fs::read(path).ok())
        .flat_map(|bytes| crate::addon::wow_paths_in_blob(&bytes))
        .map(PathBuf::from)
        .collect()
}

pub fn list_accounts(retail: &Path) -> Vec<String> {
    let dir = retail.join("WTF").join("Account");
    let Ok(read) = fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut names = Vec::new();
    for entry in read.flatten() {
        if !entry.path().is_dir() {
            continue;
        }
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        if name.starts_with('.') || name.eq_ignore_ascii_case("SavedVariables") {
            continue;
        }
        names.push(name);
    }
    names.sort();
    names
}

pub fn character_saved_variables(retail: &Path, account: Option<&str>) -> Vec<CharacterFile> {
    let accounts = match account {
        Some(name) if !name.is_empty() => vec![name.to_string()],
        _ => list_accounts(retail),
    };
    let mut files = Vec::new();
    for account_name in accounts {
        let account_dir = retail.join("WTF").join("Account").join(&account_name);
        let Ok(realms) = fs::read_dir(&account_dir) else {
            continue;
        };
        for realm in realms.flatten() {
            if !realm.path().is_dir() {
                continue;
            }
            let realm_name = realm.file_name().to_string_lossy().to_string();
            if realm_name.eq_ignore_ascii_case("SavedVariables") || realm_name.starts_with('.') {
                continue;
            }
            let Ok(characters) = fs::read_dir(realm.path()) else {
                continue;
            };
            for character in characters.flatten() {
                if !character.path().is_dir() {
                    continue;
                }
                let character_name = character.file_name().to_string_lossy().to_string();
                let path = character.path().join("SavedVariables").join("Unbored.lua");
                if path.is_file() {
                    files.push(CharacterFile {
                        account: account_name.clone(),
                        realm: realm_name.clone(),
                        character: character_name,
                        path,
                    });
                }
            }
        }
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));
    files
}

/// The Account file (`WTF/Account/<account>/SavedVariables/Unbored.lua`).
pub fn account_saved_variables(retail: &Path, account: &str) -> Option<PathBuf> {
    let path = retail
        .join("WTF")
        .join("Account")
        .join(account)
        .join("SavedVariables")
        .join("Unbored.lua");
    path.is_file().then_some(path)
}

pub fn read_progress(file: &CharacterFile) -> Result<Option<SessionProgress>, String> {
    let text = fs::read_to_string(&file.path).map_err(|err| err.to_string())?;
    session_from_saved_variables(&text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn finds_retail_and_lists_accounts() {
        let root = std::env::temp_dir().join(format!("unbored-wow-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let install = root.join("World of Warcraft");
        let retail = install.join("_retail_");
        fs::create_dir_all(retail.join("WTF/Account/111111#1/Area 52/Hero/SavedVariables"))
            .unwrap();
        fs::write(retail.join("Wow.exe"), b"").unwrap();
        fs::write(
            retail.join("WTF/Account/111111#1/Area 52/Hero/SavedVariables/Unbored.lua"),
            "UnboredCharDB = { [\"session\"] = { [\"mode\"] = \"farm\", [\"tasks\"] = { { [\"id\"] = \"farm:eye\" } } } }\n",
        )
        .unwrap();
        fs::create_dir_all(retail.join("WTF/Account/222222#1/SavedVariables")).unwrap();

        let found = find_retail_dirs(&[install.clone(), retail.clone()]);
        assert_eq!(found.len(), 1);
        assert!(found[0].ends_with("_retail_"));
        assert_eq!(
            list_accounts(&found[0]),
            vec!["111111#1".to_string(), "222222#1".to_string()]
        );
        let files = character_saved_variables(&found[0], Some("111111#1"));
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].realm, "Area 52");
        assert_eq!(files[0].character, "Hero");
        let progress = read_progress(&files[0]).unwrap().unwrap();
        assert_eq!(progress.mode.as_deref(), Some("farm"));
        assert_eq!(progress.current_id.as_deref(), Some("farm:eye"));
        let _ = fs::remove_dir_all(&root);
    }
}
