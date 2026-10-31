//! The optional planner HTTP contract. See docs/companion-api.md.
//! server/ implements these calls.

pub const DEFAULT_PLANNER_URL: &str = "https://unbored.kosarev.space";

use serde_json::{json, Value};

use crate::i18n::code;
use crate::savedvars::SessionProgress;
use crate::wow::CharacterFile;

pub fn validate_endpoint(url: &str) -> Result<(), String> {
    let url = url.trim();
    if url.is_empty() {
        return Ok(());
    }
    let lower = url.to_ascii_lowercase();
    if lower.starts_with("https://") {
        return Ok(());
    }
    if lower.starts_with("http://127.0.0.1") || lower.starts_with("http://localhost") {
        return Ok(());
    }
    Err(code("ERR_PLANNER_URL", &[]))
}

pub fn join_url(base: &str, path: &str) -> String {
    let base = base.trim().trim_end_matches('/');
    let path = path.trim_start_matches('/');
    format!("{base}/{path}")
}

pub fn progress_payload(file: &CharacterFile, progress: &SessionProgress) -> Value {
    let mut payload = json!({
        "account": file.account,
        "realm": file.realm,
        "character": file.character,
        "savedAt": progress.saved_at,
        "progress": {
            "v": 1,
            "kind": "progress",
            "mode": progress.mode,
            "budget": progress.budget,
            "source": progress.source,
            "currentId": progress.current_id,
            "done": stamps_json(&progress.done),
            "skipped": stamps_json(&progress.skipped),
            "remaining": progress.remaining,
        }
    });
    if let Some(stamp) = progress.generated_at {
        payload["progress"]["generatedAt"] = json!(stamp);
    }
    payload
}

fn stamps_json(stamps: &[crate::savedvars::Stamp]) -> Vec<Value> {
    stamps
        .iter()
        .map(|stamp| json!({ "id": stamp.id, "at": stamp.at }))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::savedvars::Stamp;
    use std::path::PathBuf;

    /// D151: the updater trusts the committed new public key, never a revert.
    #[test]
    fn embeds_the_new_updater_pubkey() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let embedded = conf["plugins"]["updater"]["pubkey"].as_str().unwrap();
        assert_eq!(embedded, include_str!("../updater-pubkey-v2.pub").trim());
    }

    #[test]
    fn https_only_except_localhost() {
        assert!(validate_endpoint("").is_ok());
        assert!(validate_endpoint("https://planner.example/unbored").is_ok());
        assert!(validate_endpoint("http://localhost:8787").is_ok());
        assert!(validate_endpoint("http://example.com").is_err());
    }

    #[test]
    fn progress_body_matches_the_contract() {
        let file = CharacterFile {
            account: "111111#1".into(),
            realm: "Area 52".into(),
            character: "Hero".into(),
            path: PathBuf::from("Unbored.lua"),
        };
        let progress = SessionProgress {
            mode: Some("custom".into()),
            budget: Some(60),
            source: Some("import".into()),
            saved_at: Some(10),
            current_id: Some("b".into()),
            done: vec![Stamp {
                id: "a".into(),
                at: Some(9),
            }],
            skipped: vec![],
            remaining: vec!["b".into()],
            generated_at: Some(1_790_000_000),
        };
        let body = progress_payload(&file, &progress);
        assert_eq!(body["account"], "111111#1");
        assert_eq!(body["progress"]["kind"], "progress");
        assert_eq!(body["progress"]["done"][0]["id"], "a");
        assert_eq!(body["progress"]["remaining"][0], "b");
        assert_eq!(body["progress"]["generatedAt"], 1_790_000_000);
        let older = progress_payload(
            &file,
            &SessionProgress {
                generated_at: None,
                ..progress
            },
        );
        assert!(older["progress"].get("generatedAt").is_none());
        assert_eq!(
            join_url("https://planner.example/unbored/", "/v1/plan"),
            "https://planner.example/unbored/v1/plan"
        );
    }
}
