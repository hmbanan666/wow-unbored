//! The Game data snapshot (docs/adr/0028, 0029): reads the Sections the addon
//! keeps in `UnboredCharDB.data` and `UnboredDB.data`, hashes each one, and
//! builds the `POST /v1/snapshot` body with only the Sections that changed.
//! Packed id sets pass through as they are; the unpacker here is for tests
//! and the Companion's own checks. Pure logic, so it is tested without a GUI.

use std::collections::{BTreeMap, HashMap};
use std::io::Write;

use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

use crate::savedvars::{parse_saved_variables, table_get, LuaValue};

pub const SCHEMA: u64 = 2;
pub const PACKED_TAG: &str = "ids1";
pub const PACKED_VALUES_TAG: &str = "idv1";

#[derive(Debug, Clone, PartialEq)]
pub struct Section {
    pub v: u64,
    pub at: Option<u64>,
    pub src: Option<String>,
    pub body: Value,
}

/// One SavedVariables file's `data` table.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct DataFile {
    pub saved_at: Option<u64>,
    pub sections: BTreeMap<String, Section>,
    pub dropped: Option<Value>,
}

/// `global` is `UnboredCharDB` for a Character file, `UnboredDB` for the Account file.
pub fn data_from_saved_variables(text: &str, global: &str) -> Result<Option<DataFile>, String> {
    let values = parse_saved_variables(text)?;
    Ok(values.get(global).and_then(data_from_table))
}

pub fn data_from_table(db: &LuaValue) -> Option<DataFile> {
    let data = table_get(db, "data")?;
    if table_get(data, "schema").and_then(LuaValue::as_u64) != Some(SCHEMA) {
        return None;
    }
    let mut out = DataFile {
        saved_at: table_get(data, "savedAt").and_then(LuaValue::as_u64),
        ..Default::default()
    };
    if let Some(LuaValue::Table(entries)) = table_get(data, "sections") {
        for (key, value) in entries {
            let crate::savedvars::TableKey::Name(name) = key else {
                continue;
            };
            let body = table_get(value, "body").map(LuaValue::to_json);
            let Some(body) = body.filter(Value::is_object) else {
                continue;
            };
            out.sections.insert(
                name.clone(),
                Section {
                    v: table_get(value, "v")
                        .and_then(LuaValue::as_u64)
                        .unwrap_or(1),
                    at: table_get(value, "at").and_then(LuaValue::as_u64),
                    src: table_get(value, "src")
                        .and_then(LuaValue::as_str)
                        .map(str::to_string),
                    body,
                },
            );
        }
    }
    out.dropped = table_get(data, "dropped")
        .map(LuaValue::to_json)
        .filter(|value| value.as_object().is_some_and(|map| !map.is_empty()));
    Some(out)
}

/// JSON with object keys sorted and no whitespace (docs/contract/README.md).
/// Written by hand: serde_json keeps insertion order when another crate in
/// the build turns on `preserve_order`.
pub fn canonical_json(value: &Value) -> String {
    let mut out = String::new();
    write_canonical(value, &mut out);
    out
}

fn write_canonical(value: &Value, out: &mut String) {
    match value {
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            out.push('{');
            for (i, key) in keys.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&Value::String((*key).clone()).to_string());
                out.push(':');
                write_canonical(&map[*key], out);
            }
            out.push('}');
        }
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_canonical(item, out);
            }
            out.push(']');
        }
        other => out.push_str(&other.to_string()),
    }
}

pub fn section_hash(body: &Value) -> String {
    let digest = Sha256::digest(canonical_json(body).as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// Every row of a packed set: the id and, for `idv1`, its values.
pub fn unpack_rows(packed: &Value) -> Vec<(u64, Vec<u64>)> {
    let Some(items) = packed.as_array() else {
        return Vec::new();
    };
    let tag = items.first().and_then(Value::as_str);
    if tag != Some(PACKED_TAG) && tag != Some(PACKED_VALUES_TAG) {
        return Vec::new();
    }
    let mut out = Vec::new();
    let mut previous = 0u64;
    for chunk in items.iter().skip(1).filter_map(Value::as_str) {
        for word in chunk.split(',').filter(|word| !word.is_empty()) {
            let mut parts = word.split(':');
            let Some(gap) = parts.next().and_then(|g| u64::from_str_radix(g, 36).ok()) else {
                continue;
            };
            previous += gap;
            let values = parts
                .filter_map(|part| u64::from_str_radix(part, 36).ok())
                .collect();
            out.push((previous, values));
        }
    }
    out
}

pub fn unpack_ids(packed: &Value) -> Vec<u64> {
    unpack_rows(packed).into_iter().map(|(id, _)| id).collect()
}

/// Who a Section belongs to, for the Companion's own "already sent" memory.
pub fn owner_key(scope: &str, account: &str, realm: &str, character: &str) -> String {
    if scope == "account" {
        format!("account:{account}")
    } else {
        format!("char:{account}:{realm}-{character}")
    }
}

/// The upload body with every Section whose hash is not in `sent`, and the
/// `(key, hash)` pairs to remember once the Server accepted it. None when
/// nothing changed.
pub fn build_upload(
    account: &str,
    character: &str,
    realm: &str,
    char_file: Option<&DataFile>,
    account_file: Option<&DataFile>,
    sent: &HashMap<String, String>,
) -> Option<(Value, Vec<(String, String)>)> {
    let mut sections = Map::new();
    let mut remember = Vec::new();
    let mut dropped = Map::new();
    for (scope, file) in [("char", char_file), ("account", account_file)] {
        let Some(file) = file else {
            continue;
        };
        let owner = owner_key(scope, account, realm, character);
        for (name, section) in &file.sections {
            if scope == "account" && sections.contains_key(name) {
                continue;
            }
            let hash = section_hash(&section.body);
            let key = format!("{owner}|{name}");
            if sent.get(&key) == Some(&hash) {
                continue;
            }
            let mut entry = Map::new();
            entry.insert("scope".into(), Value::from(scope));
            entry.insert("v".into(), Value::from(section.v));
            if let Some(at) = section.at {
                entry.insert("at".into(), Value::from(at));
            }
            if let Some(src) = &section.src {
                entry.insert("src".into(), Value::from(src.as_str()));
            }
            entry.insert("hash".into(), Value::from(hash.as_str()));
            entry.insert("body".into(), section.body.clone());
            sections.insert(name.clone(), Value::Object(entry));
            remember.push((key, hash));
        }
        if let Some(value) = &file.dropped {
            dropped.insert(scope.into(), value.clone());
        }
    }
    if sections.is_empty() {
        return None;
    }
    let saved_at = char_file
        .and_then(|file| file.saved_at)
        .or_else(|| account_file.and_then(|file| file.saved_at));
    let mut body = Map::new();
    body.insert("schema".into(), Value::from(SCHEMA));
    body.insert("account".into(), Value::from(account));
    body.insert("character".into(), Value::from(character));
    body.insert("realm".into(), Value::from(realm));
    body.insert(
        "savedAt".into(),
        saved_at.map(Value::from).unwrap_or(Value::Null),
    );
    body.insert("sections".into(), Value::Object(sections));
    if !dropped.is_empty() {
        body.insert("dropped".into(), Value::Object(dropped));
    }
    Some((Value::Object(body), remember))
}

/// The character's own name and realm from its `char` Section, else the
/// WTF folder names.
pub fn character_identity(
    char_file: Option<&DataFile>,
    folder_realm: &str,
    folder_character: &str,
) -> (String, String) {
    let body = char_file
        .and_then(|file| file.sections.get("char"))
        .map(|section| &section.body);
    let field = |name: &str| {
        body.and_then(|body| body.get(name))
            .and_then(Value::as_str)
            .filter(|text| !text.is_empty())
            .map(str::to_string)
    };
    (
        field("name").unwrap_or_else(|| folder_character.to_string()),
        field("realm").unwrap_or_else(|| folder_realm.to_string()),
    )
}

pub fn gzip(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    encoder.write_all(bytes).map_err(|err| err.to_string())?;
    encoder.finish().map_err(|err| err.to_string())
}

/// The Server's limit for one upload (docs/adr/0029).
pub const MAX_COMPRESSED_BYTES: usize = 4 * 1024 * 1024;

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    const SNAPSHOT_LUA: &str = include_str!("../../../../packages/contracts/fixtures/snapshot.lua");
    const SNAPSHOT_JSON: &str =
        include_str!("../../../../packages/contracts/fixtures/snapshot.json");
    const SNAPSHOT_SCHEMA: &str =
        include_str!("../../../../packages/contracts/schema/snapshot.schema.json");
    const PACKED: &str = include_str!("../../../../packages/contracts/fixtures/packed-ids.json");

    fn fixture_files() -> (DataFile, DataFile) {
        let char_file = data_from_saved_variables(SNAPSHOT_LUA, "UnboredCharDB")
            .unwrap()
            .expect("character data");
        let account_file = data_from_saved_variables(SNAPSHOT_LUA, "UnboredDB")
            .unwrap()
            .expect("account data");
        (char_file, account_file)
    }

    #[test]
    fn unpacks_the_shared_packed_id_fixture() {
        let doc: Value = serde_json::from_str(PACKED).unwrap();
        for case in doc["cases"].as_array().unwrap() {
            let ids: Vec<u64> = case["ids"]
                .as_array()
                .unwrap()
                .iter()
                .map(|v| v.as_u64().unwrap())
                .collect();
            assert_eq!(unpack_ids(&case["packed"]), ids, "{}", case["name"]);
        }
        for case in doc["valueCases"].as_array().unwrap() {
            let rows = unpack_rows(&case["packed"]);
            let ids: Vec<u64> = rows.iter().map(|(id, _)| *id).collect();
            let values: Vec<Vec<u64>> = rows.into_iter().map(|(_, values)| values).collect();
            assert_eq!(serde_json::json!(ids), case["ids"], "{}", case["name"]);
            assert_eq!(
                serde_json::json!(values),
                case["values"],
                "{}",
                case["name"]
            );
        }
    }

    #[test]
    fn builds_the_upload_in_the_shared_fixture() {
        let (char_file, account_file) = fixture_files();
        let (name, realm) = character_identity(Some(&char_file), "folder", "folder");
        assert_eq!((name.as_str(), realm.as_str()), ("Mira", "Silvermoon"));
        let (body, remember) = build_upload(
            "111111#1",
            &name,
            &realm,
            Some(&char_file),
            Some(&account_file),
            &HashMap::new(),
        )
        .expect("an upload");
        let expected: Value = serde_json::from_str(SNAPSHOT_JSON).unwrap();
        assert_eq!(body, expected);
        assert_eq!(
            remember.len(),
            expected["sections"].as_object().unwrap().len()
        );
        let schema: Value = serde_json::from_str(SNAPSHOT_SCHEMA).unwrap();
        let validator = jsonschema::validator_for(&schema).unwrap();
        assert!(validator.is_valid(&body), "the upload matches the schema");
        let quests = &body["sections"]["questsDone"]["body"];
        assert_eq!(
            unpack_ids(&quests["ids"]).len() as u64,
            quests["count"].as_u64().unwrap()
        );
    }

    #[test]
    fn uploads_only_changed_sections() {
        let (mut char_file, account_file) = fixture_files();
        let (_, remember) = build_upload(
            "a",
            "Mira",
            "Silvermoon",
            Some(&char_file),
            Some(&account_file),
            &HashMap::new(),
        )
        .unwrap();
        let sent: HashMap<String, String> = remember.into_iter().collect();
        assert!(build_upload(
            "a",
            "Mira",
            "Silvermoon",
            Some(&char_file),
            Some(&account_file),
            &sent
        )
        .is_none());
        char_file.sections.get_mut("char").unwrap().body["money"] = Value::from(1);
        let (body, remember) = build_upload(
            "a",
            "Mira",
            "Silvermoon",
            Some(&char_file),
            Some(&account_file),
            &sent,
        )
        .unwrap();
        let names: Vec<&String> = body["sections"].as_object().unwrap().keys().collect();
        assert_eq!(names, vec!["char"]);
        assert_eq!(remember.len(), 1);
    }

    #[test]
    fn hash_ignores_key_order() {
        let a: Value = serde_json::from_str(r#"{"b":1,"a":{"y":[1,2],"x":"é"}}"#).unwrap();
        let b: Value = serde_json::from_str(r#"{"a":{"x":"é","y":[1,2]},"b":1}"#).unwrap();
        assert_eq!(section_hash(&a), section_hash(&b));
        assert_eq!(canonical_json(&a), r#"{"a":{"x":"é","y":[1,2]},"b":1}"#);
    }

    #[test]
    fn gzip_round_trips() {
        let text = SNAPSHOT_JSON.as_bytes();
        let packed = gzip(text).unwrap();
        assert!(packed.len() < text.len());
        let mut out = Vec::new();
        flate2::read::GzDecoder::new(packed.as_slice())
            .read_to_end(&mut out)
            .unwrap();
        assert_eq!(out, text);
    }

    #[test]
    fn a_06_file_has_no_snapshot() {
        let text = "UnboredCharDB = {\n[\"profile\"] = {\n[\"character\"] = \"Hero\",\n},\n}\n";
        assert!(data_from_saved_variables(text, "UnboredCharDB")
            .unwrap()
            .is_none());
    }
}
