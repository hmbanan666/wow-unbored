//! Request submission and the status the game waits for (docs/adr/0013).
//! The HTTP adapter lives in the GUI; selection and retries are testable here.

use serde_json::{Map, Value};

use crate::account::{self, AccountSeal};
use crate::i18n::trf;
use crate::plan::RequestState;
use crate::savedvars::SavedRequest;

/// A pending Request and the Account folder that owns its SavedVariables.
pub struct RequestUpload {
    pub account: String,
    pub request: SavedRequest,
}

/// The one Request whose status may be written into the helper addon.
#[derive(Debug)]
pub struct PostedRequests {
    pub waiting: Option<String>,
    pub rejection: Option<RequestState>,
}

/// Submit the saved Requests through the provided HTTP adapter. Accepted
/// uploads acknowledge Account migration; failed attempts never do.
pub fn post_requests(
    requests: &[RequestUpload],
    seal: &mut AccountSeal,
    mut send: impl FnMut(&Value) -> Result<u16, String>,
) -> Result<PostedRequests, String> {
    let waiting = waited_request(requests.iter().map(|upload| &upload.request)).map(str::to_string);
    let mut rejection = None;
    for upload in requests {
        let request = &upload.request;
        let (account, legacy) = seal.publish(&upload.account)?;
        let mut body = request_body(request, Some(&account));
        account::attach_legacy(&mut body, legacy.as_deref());
        let status = send(&body)?;
        if (400..500).contains(&status) && !matches!(status, 401 | 408 | 429) {
            if Some(request.id.as_str()) == waiting.as_deref() {
                rejection = Some(RequestState {
                    id: request.id.clone(),
                    kind: request.kind.clone(),
                    status: "failed".into(),
                    reason_code: Some(reason::REJECTED.into()),
                    ..Default::default()
                });
            }
        } else if (200..300).contains(&status) {
            seal.note_migrated(legacy.as_deref());
        } else {
            return Err(trf("PLANNER_RETURNED", &[&status.to_string()]));
        }
    }
    Ok(PostedRequests { waiting, rejection })
}

/// Why a Request did not get an Answer. Bory has one friendly line per code.
pub mod reason {
    pub const NOT_APPROVED: &str = "not_approved";
    pub const SERVER_UNREACHABLE: &str = "server_unreachable";
    pub const REJECTED: &str = "rejected";
    pub const TIMEOUT: &str = "timeout";
    pub const PLANNER_FAILED: &str = "planner_failed";
}

fn put(out: &mut Map<String, Value>, key: &str, value: Option<Value>) {
    if let Some(value) = value {
        if !value.is_null() {
            out.insert(key.to_string(), value);
        }
    }
}

fn text(value: &Option<String>) -> Option<Value> {
    value
        .as_ref()
        .filter(|text| !text.is_empty())
        .map(|text| Value::String(text.clone()))
}

/// Mode goes only with plan Requests, and budget only when the player typed
/// minutes for one (docs/adr/0037).
pub fn request_body(request: &SavedRequest, account: Option<&str>) -> Value {
    let mut out = Map::new();
    out.insert("id".into(), Value::String(request.id.clone()));
    put(&mut out, "createdAt", request.created_at.map(Value::from));
    out.insert("character".into(), Value::String(request.character.clone()));
    out.insert("realm".into(), Value::String(request.realm.clone()));
    out.insert("type".into(), Value::String(request.kind.clone()));
    if request.kind == "plan" {
        put(&mut out, "mode", text(&request.mode));
        put(&mut out, "budget", request.budget.map(Value::from));
    }
    put(&mut out, "wish", text(&request.wish));
    put(&mut out, "question", text(&request.question));
    put(&mut out, "topic", text(&request.topic));
    put(&mut out, "lang", text(&request.lang));
    put(
        &mut out,
        "account",
        account
            .filter(|name| !name.is_empty())
            .map(|name| Value::String(name.into())),
    );
    put(&mut out, "item", request.item.clone());
    put(&mut out, "context", request.context.clone());
    put(&mut out, "suggestionId", text(&request.suggestion_id));
    put(&mut out, "suggestion", request.suggestion.clone());
    Value::Object(out)
}

/// The Request the game waits for: the newest one saved in any character's
/// SavedVariables (docs/decisions-v0.7.md, D82).
pub fn waited_request<'a>(requests: impl IntoIterator<Item = &'a SavedRequest>) -> Option<&'a str> {
    requests
        .into_iter()
        .max_by(|a, b| {
            a.created_at
                .unwrap_or(0)
                .cmp(&b.created_at.unwrap_or(0))
                .then_with(|| a.id.cmp(&b.id))
        })
        .map(|request| request.id.as_str())
}

/// Where the Companion reads the Request's status. With a waited id it asks
/// for exactly that one, so a status change on an older Request (failed,
/// timed out) can never replace the answer the game is waiting for.
pub fn request_status_path(waiting: Option<&str>) -> String {
    match waiting {
        Some(id) => {
            let mut path = String::from("v1/requests/");
            for byte in id.bytes() {
                if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
                    path.push(byte as char);
                } else {
                    path.push_str(&format!("%{byte:02X}"));
                }
            }
            path
        }
        None => "v1/requests/latest".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::savedvars::request_from_saved_variables;

    const CONTRACT: &str = include_str!("../../../../packages/contracts/fixtures/requests.json");
    const REQUEST_SCHEMA: &str =
        include_str!("../../../../packages/contracts/schema/request.schema.json");
    const PLAN_SCHEMA: &str =
        include_str!("../../../../packages/contracts/schema/plan.schema.json");
    const PROFILE_SCHEMA: &str =
        include_str!("../../../../packages/contracts/schema/profile.schema.json");
    const PLAN_FIXTURE: &str = include_str!("../../../../packages/contracts/fixtures/plan.json");
    const PROFILE_FIXTURE: &str =
        include_str!("../../../../packages/contracts/fixtures/profile.json");

    fn saved(name: &str) -> &'static str {
        match name {
            "plan.lua" => include_str!("../../../../packages/contracts/fixtures/plan.lua"),
            "custom.lua" => include_str!("../../../../packages/contracts/fixtures/custom.lua"),
            "item.lua" => include_str!("../../../../packages/contracts/fixtures/item.lua"),
            "question.lua" => include_str!("../../../../packages/contracts/fixtures/question.lua"),
            "suggestion.lua" => {
                include_str!("../../../../packages/contracts/fixtures/suggestion.lua")
            }
            other => panic!("unknown fixture {other}"),
        }
    }

    fn assert_schema(schema_text: &str, instance_text: &str, label: &str) {
        let schema: Value = serde_json::from_str(schema_text).unwrap();
        let instance: Value = serde_json::from_str(instance_text).unwrap();
        let validator = jsonschema::validator_for(&schema)
            .unwrap_or_else(|err| panic!("{label} schema: {err}"));
        if let Err(err) = validator.validate(&instance) {
            panic!("{label} does not match its JSON schema: {err}");
        }
    }

    #[test]
    fn saved_requests_post_the_contract_bodies() {
        let doc: Value = serde_json::from_str(CONTRACT).unwrap();
        for case in doc["cases"].as_array().unwrap() {
            let file = case["savedVariables"].as_str().unwrap();
            let request = request_from_saved_variables(saved(file)).unwrap().unwrap();
            let body = request_body(&request, case["account"].as_str());
            assert_eq!(body, case["body"], "contract case {}", case["name"]);
        }
    }

    #[test]
    fn fixtures_match_the_json_schema() {
        let doc: Value = serde_json::from_str(CONTRACT).unwrap();
        let schema: Value = serde_json::from_str(REQUEST_SCHEMA).unwrap();
        let validator = jsonschema::validator_for(&schema).expect("request schema");
        for case in doc["cases"].as_array().unwrap() {
            let body = &case["body"];
            if let Err(err) = validator.validate(body) {
                panic!(
                    "contract case {} does not match the JSON schema: {err}",
                    case["name"]
                );
            }
        }
        assert_schema(PLAN_SCHEMA, PLAN_FIXTURE, "plan");
        assert_schema(PROFILE_SCHEMA, PROFILE_FIXTURE, "player profile");
    }

    #[test]
    fn the_newest_saved_request_is_the_one_read_by_id() {
        let base = request_from_saved_variables(saved("plan.lua"))
            .unwrap()
            .unwrap();
        let at = |id: &str, created_at: u64| SavedRequest {
            id: id.into(),
            created_at: Some(created_at),
            ..base.clone()
        };
        let requests = vec![at("req-new", 2000), at("req-old", 1000)];
        let waiting = waited_request(&requests);
        assert_eq!(waiting, Some("req-new"));
        assert_eq!(request_status_path(waiting), "v1/requests/req-new");
        assert_eq!(request_status_path(Some("a b/c")), "v1/requests/a%20b%2Fc");
        assert_eq!(waited_request(&[]), None);
        assert_eq!(request_status_path(None), "v1/requests/latest");
    }

    #[test]
    fn an_old_characters_rejection_cannot_replace_the_waited_request() {
        for reverse in [false, true] {
            let mut uploads = uploads();
            if reverse {
                uploads.reverse();
            }
            let mut seal = seal();
            let mut sent = Vec::new();
            let posted = post_requests(&uploads, &mut seal, |body| {
                let id = body["id"].as_str().unwrap().to_string();
                sent.push(id.clone());
                Ok(if id == "req-old" { 400 } else { 201 })
            })
            .unwrap();
            assert_eq!(sent.len(), 2);
            assert_eq!(posted.waiting.as_deref(), Some("req-new"));
            assert!(
                posted.rejection.is_none(),
                "only the waited Request may supply a failure"
            );
        }
    }

    #[test]
    fn the_waited_rejection_names_the_correct_request_and_reason() {
        let posted = post_requests(&uploads(), &mut seal(), |_| Ok(400)).unwrap();
        let rejection = posted.rejection.unwrap();
        assert_eq!(rejection.id, "req-new");
        assert_eq!(rejection.reason_code.as_deref(), Some(reason::REJECTED));
        let file = crate::plan::pick_plan_file(&crate::plan::PlannerState {
            request: Some(rejection),
            ..Default::default()
        })
        .unwrap();
        assert!(file.ready_request.is_none());
        assert!(file.body.contains("req-new") && !file.body.contains("req-old"));
        assert!(crate::savedvars::parse_saved_variables(&file.body).is_ok());
    }

    #[test]
    fn temporary_http_failures_are_retried_without_acknowledging_migration() {
        for status in [401, 408, 429, 500, 503] {
            let mut seal = seal();
            let uploads = uploads();
            let attempted = &uploads[1..];
            let result = post_requests(attempted, &mut seal, |_| Ok(status));
            assert!(
                result.is_err(),
                "HTTP {status} must not become a permanent rejection"
            );
            let error = result.unwrap_err();
            assert_eq!(crate::i18n::shown(&error), error);
            assert!(seal.migrated_accounts().is_empty());
            let retried = post_requests(attempted, &mut seal, |body| {
                assert_eq!(body["accountLegacy"], "111111");
                Ok(200)
            })
            .unwrap();
            assert!(retried.rejection.is_none());
            assert_eq!(seal.migrated_accounts(), vec!["111111"]);
        }
    }

    fn seal() -> AccountSeal {
        AccountSeal::new("01".repeat(32), Vec::<String>::new())
    }

    fn uploads() -> Vec<RequestUpload> {
        let base = request_from_saved_variables(saved("plan.lua"))
            .unwrap()
            .unwrap();
        [("req-old", 1000), ("req-new", 2000)]
            .into_iter()
            .map(|(id, at)| RequestUpload {
                account: "111111#1".into(),
                request: SavedRequest {
                    id: id.into(),
                    created_at: Some(at),
                    ..base.clone()
                },
            })
            .collect()
    }

    #[test]
    fn item_and_question_bodies_carry_no_mode_or_budget() {
        let doc: Value = serde_json::from_str(CONTRACT).unwrap();
        for case in doc["cases"].as_array().unwrap() {
            let body = &case["body"];
            if body["type"] != "plan" {
                assert!(body.get("mode").is_none() && body.get("budget").is_none());
            }
        }
    }
}
