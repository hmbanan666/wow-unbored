//! Pick the latest Unbored addon zip and unpack it into Interface/AddOns.
//! Companion releases are ignored. The zip is the BigWigs packager asset.

use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::{Component, Path, PathBuf};

use serde_json::Value;
use zip::ZipArchive;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AddonRelease {
    pub tag: String,
    pub version: String,
    pub name: String,
    pub url: String,
}

pub fn select_addon_zip(body: &str) -> Result<Option<AddonRelease>, String> {
    let parsed: Value = serde_json::from_str(body).map_err(|err| err.to_string())?;
    let Some(releases) = parsed.as_array() else {
        return Err("GitHub releases were not a list.".into());
    };
    let mut best: Option<AddonRelease> = None;
    for release in releases {
        let Some(tag) = release.get("tag_name").and_then(|value| value.as_str()) else {
            continue;
        };
        if !is_addon_tag(tag) {
            continue;
        }
        let Some(assets) = release.get("assets").and_then(|value| value.as_array()) else {
            continue;
        };
        for asset in assets {
            let name = asset.get("name").and_then(|value| value.as_str()).unwrap_or("");
            let url = asset
                .get("browser_download_url")
                .and_then(|value| value.as_str())
                .unwrap_or("");
            if !is_addon_zip(name) || url.is_empty() {
                continue;
            }
            let version = tag.trim_start_matches('v').to_string();
            let candidate = AddonRelease {
                tag: tag.to_string(),
                version,
                name: name.to_string(),
                url: url.to_string(),
            };
            let replace = best
                .as_ref()
                .map(|have| version_cmp(&candidate.version, &have.version) == std::cmp::Ordering::Greater)
                .unwrap_or(true);
            if replace {
                best = Some(candidate);
            }
        }
    }
    Ok(best)
}

pub fn is_addon_tag(tag: &str) -> bool {
    let rest = tag.strip_prefix('v').unwrap_or("");
    !rest.is_empty() && rest.chars().next().is_some_and(|c| c.is_ascii_digit()) && !tag.starts_with("companion-")
}

fn is_addon_zip(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.starts_with("unbored-") && lower.ends_with(".zip") && !lower.contains("companion")
}

pub fn version_cmp(left: &str, right: &str) -> std::cmp::Ordering {
    let left = left.trim_start_matches('v');
    let right = right.trim_start_matches('v');
    let left_parts = left.split('.');
    let right_parts = right.split('.');
    for (a, b) in left_parts.zip(right_parts) {
        let order = match (a.parse::<u64>(), b.parse::<u64>()) {
            (Ok(a), Ok(b)) => a.cmp(&b),
            _ => a.cmp(b),
        };
        if order != std::cmp::Ordering::Equal {
            return order;
        }
    }
    left.split('.').count().cmp(&right.split('.').count())
}

pub fn should_update(installed: Option<&str>, remote: &str) -> bool {
    match installed {
        None => true,
        Some(installed) => version_cmp(remote, installed) == std::cmp::Ordering::Greater,
    }
}

pub fn install_addon_zip(bytes: &[u8], retail: &Path) -> Result<(), String> {
    if bytes.len() > 20 * 1024 * 1024 {
        return Err("The addon zip is larger than 20 MB.".into());
    }
    let mut archive = ZipArchive::new(Cursor::new(bytes)).map_err(|err| err.to_string())?;
    let mut names = Vec::new();
    for index in 0..archive.len() {
        let file = archive.by_index(index).map_err(|err| err.to_string())?;
        names.push(file.name().replace('\\', "/"));
    }
    let toc = names
        .iter()
        .find(|name| name.as_str() == "Unbored.toc" || name.ends_with("/Unbored.toc"))
        .cloned()
        .ok_or_else(|| "The release zip has no Unbored.toc.".to_string())?;
    let prefix = match toc.rfind('/') {
        Some(index) => toc[..=index].to_string(),
        None => String::new(),
    };
    let addons = retail.join("Interface").join("AddOns");
    let addon_dir = addons.join("Unbored");
    let staging = addons.join("Unbored.new");
    let previous = addons.join("Unbored.old");
    if staging.exists() {
        fs::remove_dir_all(&staging).map_err(|err| err.to_string())?;
    }
    fs::create_dir_all(&staging).map_err(|err| err.to_string())?;
    let unpacked = unpack(&mut archive, &prefix, &staging);
    if let Err(err) = unpacked {
        let _ = fs::remove_dir_all(&staging);
        return Err(err);
    }
    // Two renames keep a whole addon on disk at every moment: the game never
    // sees a half-written folder, and a failed swap puts the old one back.
    if previous.exists() {
        fs::remove_dir_all(&previous).map_err(|err| err.to_string())?;
    }
    if addon_dir.exists() {
        fs::rename(&addon_dir, &previous).map_err(|err| err.to_string())?;
    }
    if let Err(err) = fs::rename(&staging, &addon_dir) {
        if previous.exists() {
            let _ = fs::rename(&previous, &addon_dir);
        }
        let _ = fs::remove_dir_all(&staging);
        return Err(err.to_string());
    }
    let _ = fs::remove_dir_all(&previous);
    Ok(())
}

fn unpack(archive: &mut ZipArchive<Cursor<&[u8]>>, prefix: &str, dir: &Path) -> Result<(), String> {
    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(|err| err.to_string())?;
        let name = file.name().replace('\\', "/");
        if !prefix.is_empty() && !name.starts_with(prefix) {
            continue;
        }
        if name.ends_with('/') {
            continue;
        }
        let relative = name.trim_start_matches(prefix);
        let dest = safe_join(dir, relative).ok_or_else(|| format!("Unsafe path in the zip: {name}"))?;
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }
        let mut out = fs::File::create(&dest).map_err(|err| err.to_string())?;
        let mut buf = Vec::new();
        file.read_to_end(&mut buf).map_err(|err| err.to_string())?;
        out.write_all(&buf).map_err(|err| err.to_string())?;
    }
    if !dir.join("Unbored.toc").is_file() {
        return Err("The release zip has no Unbored.toc at the addon root.".into());
    }
    Ok(())
}

/// `## Version:` from the installed Unbored.toc, so a manual install counts.
pub fn installed_version(retail: &Path) -> Option<String> {
    let toc = retail.join("Interface").join("AddOns").join("Unbored").join("Unbored.toc");
    let text = fs::read_to_string(toc).ok()?;
    text.lines().find_map(|line| {
        let rest = line.trim().strip_prefix("##")?.trim();
        let value = rest.strip_prefix("Version:")?.trim().trim_start_matches('v');
        if value.is_empty() || value.starts_with('@') {
            None
        } else {
            Some(value.to_string())
        }
    })
}

fn safe_join(root: &Path, relative: &str) -> Option<PathBuf> {
    let mut out = root.to_path_buf();
    if relative.is_empty() {
        return None;
    }
    for part in Path::new(relative).components() {
        match part {
            Component::Normal(piece) => out.push(piece),
            Component::CurDir => {}
            _ => return None,
        }
    }
    Some(out)
}

/// Paths mentioned in a Battle.net config or product.db blob.
pub fn wow_paths_in_blob(bytes: &[u8]) -> Vec<String> {
    let mut found = Vec::new();
    push_unique(&mut found, ascii_paths(bytes));
    push_unique(&mut found, utf16_paths(bytes));
    found
}

fn push_unique(into: &mut Vec<String>, more: Vec<String>) {
    for path in more {
        if !into.iter().any(|have| have.eq_ignore_ascii_case(&path)) {
            into.push(path);
        }
    }
}

fn ascii_paths(bytes: &[u8]) -> Vec<String> {
    let needle = b"World of Warcraft";
    let mut found = Vec::new();
    let mut index = 0;
    while index + needle.len() <= bytes.len() {
        if &bytes[index..index + needle.len()] == needle {
            let start = path_start(bytes, index, 1);
            let end = path_end(bytes, index + needle.len(), 1);
            if let Ok(text) = std::str::from_utf8(&bytes[start..end]) {
                if let Some(path) = clean_path(text) {
                    found.push(path);
                }
            }
            index += needle.len();
        } else {
            index += 1;
        }
    }
    found
}

fn utf16_paths(bytes: &[u8]) -> Vec<String> {
    let needle: Vec<u8> = "World of Warcraft"
        .encode_utf16()
        .flat_map(|unit| unit.to_le_bytes())
        .collect();
    let mut found = Vec::new();
    let mut index = 0;
    while index + needle.len() <= bytes.len() {
        if &bytes[index..index + needle.len()] == needle.as_slice() {
            let start = path_start(bytes, index, 2);
            let end = path_end(bytes, index + needle.len(), 2);
            let wide = &bytes[start..end];
            if wide.len() % 2 == 0 {
                let units: Vec<u16> = wide
                    .chunks_exact(2)
                    .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
                    .collect();
                if let Some(text) = String::from_utf16(&units).ok() {
                    if let Some(path) = clean_path(&text) {
                        found.push(path);
                    }
                }
            }
            index += needle.len();
        } else {
            index += 1;
        }
    }
    found
}

fn path_start(bytes: &[u8], at: usize, width: usize) -> usize {
    let mut cursor = at;
    while cursor >= width {
        if !path_byte(bytes[cursor - width]) {
            break;
        }
        cursor -= width;
    }
    cursor
}

fn path_end(bytes: &[u8], at: usize, width: usize) -> usize {
    let mut cursor = at;
    while cursor + width <= bytes.len() && path_byte(bytes[cursor]) {
        cursor += width;
    }
    cursor
}

fn path_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric()
        || matches!(byte, b'\\' | b'/' | b':' | b' ' | b'(' | b')' | b'.' | b'_' | b'-')
}

fn clean_path(text: &str) -> Option<String> {
    let text = text.trim().trim_matches(|c| c == '"' || c == '\'');
    if !text.contains("World of Warcraft") {
        return None;
    }
    Some(text.trim_end_matches(['\\', '/']).to_string())
}

pub fn battle_net_config_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(program_data) = std::env::var_os("ProgramData") {
        let root = PathBuf::from(program_data).join("Battle.net");
        paths.push(root.join("Agent").join("product.db"));
        paths.push(root.join("Battle.net.config"));
    }
    if let Some(appdata) = std::env::var_os("APPDATA") {
        paths.push(PathBuf::from(appdata).join("Battle.net").join("Battle.net.config"));
    }
    paths
}

#[cfg(test)]
mod tests {
    use super::*;
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    #[test]
    fn picks_the_newest_addon_zip_and_skips_companion_tags() {
        let body = r#"[
          {"tag_name":"companion-v0.9.0","assets":[{"name":"Unbored Companion_0.9.0_x64-setup.exe","browser_download_url":"https://example/setup.exe"}]},
          {"tag_name":"v0.1.0","assets":[{"name":"Unbored-v0.1.0.zip","browser_download_url":"https://example/old.zip"}]},
          {"tag_name":"v0.1.1","assets":[{"name":"Unbored-v0.1.1.zip","browser_download_url":"https://example/new.zip"}]}
        ]"#;
        let picked = select_addon_zip(body).unwrap().unwrap();
        assert_eq!(picked.version, "0.1.1");
        assert_eq!(picked.url, "https://example/new.zip");
        assert!(!should_update(Some("0.1.1"), "0.1.0"));
        assert!(should_update(Some("0.1.0"), "0.1.1"));
        assert!(should_update(None, "0.1.0"));
    }

    #[test]
    fn extracts_the_addon_folder_next_to_other_addons() {
        let mut cursor = Cursor::new(Vec::new());
        {
            let mut writer = ZipWriter::new(&mut cursor);
            writer
                .start_file("Unbored/Unbored.toc", SimpleFileOptions::default())
                .unwrap();
            writer.write_all(b"## Interface: 120105\n## Version: v0.3.0\n").unwrap();
            writer
                .start_file("Unbored/Core/Namespace.lua", SimpleFileOptions::default())
                .unwrap();
            writer.write_all(b"local _, ns = ...\n").unwrap();
            writer.finish().unwrap();
        }
        let root = std::env::temp_dir().join(format!("unbored-zip-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let retail = root.join("_retail_");
        fs::create_dir_all(&retail).unwrap();
        let stale = retail.join("Interface/AddOns/Unbored/Old.lua");
        fs::create_dir_all(stale.parent().unwrap()).unwrap();
        fs::write(&stale, "old").unwrap();
        install_addon_zip(cursor.get_ref(), &retail).unwrap();
        let toc = fs::read_to_string(retail.join("Interface/AddOns/Unbored/Unbored.toc")).unwrap();
        assert!(toc.contains("120105"));
        assert_eq!(installed_version(&retail).as_deref(), Some("0.3.0"));
        assert!(retail
            .join("Interface/AddOns/Unbored/Core/Namespace.lua")
            .is_file());
        assert!(!stale.exists());
        assert!(!retail.join("Interface/AddOns/Unbored.new").exists());
        assert!(!retail.join("Interface/AddOns/Unbored.old").exists());
        assert!(install_addon_zip(b"not a zip", &retail).is_err());
        assert!(retail.join("Interface/AddOns/Unbored/Unbored.toc").is_file());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn reads_wow_paths_from_battle_net_text_and_utf16() {
        let text = b"Games\0C:\\Games\\World of Warcraft";
        let paths = wow_paths_in_blob(text);
        assert_eq!(paths, vec!["C:\\Games\\World of Warcraft".to_string()]);

        let wide: Vec<u8> = "D:\\WoW\\World of Warcraft\\_retail_"
            .encode_utf16()
            .flat_map(|unit| unit.to_le_bytes())
            .collect();
        let wide_paths = wow_paths_in_blob(&wide);
        assert_eq!(
            wide_paths,
            vec!["D:\\WoW\\World of Warcraft\\_retail_".to_string()]
        );
    }
}
