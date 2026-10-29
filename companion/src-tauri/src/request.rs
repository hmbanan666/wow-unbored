//! The JSON body the Companion posts for a Request saved in SavedVariables
//! (docs/adr/0013). Pure logic, so it is tested without a GUI.

use serde_json::{Map, Value};

use crate::savedvars::SavedRequest;

/// Why a Request did not get an Answer. Wisp has one friendly line per code.
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
    value.as_ref().filter(|text| !text.is_empty()).map(|text| Value::String(text.clone()))
}

/// Mode and budget go only with plan Requests.
pub fn request_body(request: &SavedRequest, account: Option<&str>) -> Value {
    let mut out = Map::new();
    out.insert("id".into(), Value::String(request.id.clone()));
    put(&mut out, "createdAt", request.created_at.map(Value::from));
    out.insert("character".into(), Value::String(request.character.clone()));
    out.insert("realm".into(), Value::String(request.realm.clone()));
    out.insert("type".into(), Value::String(request.kind.clone()));
    if request.kind == "plan" {
        put(&mut out, "mode", text(&request.mode));
        out.insert("budget".into(), Value::from(request.budget.unwrap_or(60)));
    }
    put(&mut out, "wish", text(&request.wish));
    put(&mut out, "question", text(&request.question));
    put(&mut out, "topic", text(&request.topic));
    put(&mut out, "lang", text(&request.lang));
    put(&mut out, "account", account.filter(|name| !name.is_empty()).map(|name| Value::String(name.into())));
    put(&mut out, "item", request.item.clone());
    put(&mut out, "context", request.context.clone());
    Value::Object(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::savedvars::request_from_saved_variables;

    const CONTRACT: &str = include_str!("../../../docs/contract/requests.json");

    fn saved(name: &str) -> &'static str {
        match name {
            "plan.lua" => include_str!("../../../docs/contract/plan.lua"),
            "item.lua" => include_str!("../../../docs/contract/item.lua"),
            "question.lua" => include_str!("../../../docs/contract/question.lua"),
            other => panic!("unknown fixture {other}"),
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
