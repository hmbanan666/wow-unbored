//! UNB1 strings and the Lua file the helper addon loads.

use std::fs;
use std::path::{Path, PathBuf};

use base64::engine::general_purpose::{STANDARD, URL_SAFE};
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const HELPER_TOC: &str = "\
## Interface: 120105, 120100
## Title: Unbored Plan
## Notes: Plan file owned by Unbored Companion. The game reads it on /reload.
## Author: Unbored contributors
## Version: 0.1.0
## LoadOnDemand: 0

Plan.lua
";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub v: u32,
    pub kind: String,
    #[serde(default = "default_mode")]
    pub mode: String,
    #[serde(default = "default_budget")]
    pub budget: u32,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub generated_at: Option<u64>,
    #[serde(default)]
    pub request_id: Option<String>,
    #[serde(default)]
    pub request_status: Option<String>,
    #[serde(default)]
    pub request_reason: Option<String>,
    pub tasks: Vec<Task>,
}

fn default_mode() -> String {
    "custom".to_string()
}

fn default_budget() -> u32 {
    60
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    #[serde(default = "default_est", rename = "estMinutes")]
    pub est_minutes: u32,
    #[serde(default, rename = "mapID")]
    pub map_id: Option<u32>,
    #[serde(default)]
    pub x: Option<f64>,
    #[serde(default)]
    pub y: Option<f64>,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub complete: Option<Value>,
}

fn default_est() -> u32 {
    15
}

#[derive(Debug)]
pub struct PlanError(pub String);

impl std::fmt::Display for PlanError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

pub fn decode_unb1(text: &str) -> Result<Plan, PlanError> {
    let compact: String = text.chars().filter(|c| !c.is_whitespace()).collect();
    if compact.is_empty() {
        return Err(PlanError("Paste a plan string first.".into()));
    }
    let payload = if let Some(rest) = compact.strip_prefix("UNB1:") {
        rest
    } else if compact.starts_with("UNB1P:") {
        return Err(PlanError(
            "That is a progress export (UNB1P), not a plan.".into(),
        ));
    } else {
        return Err(PlanError(
            "The string should start with UNB1:.".into(),
        ));
    };
    let raw = decode_b64(payload)?;
    let value: Value = serde_json::from_slice(&raw)
        .map_err(|_| PlanError("Could not read the plan JSON.".into()))?;
    plan_from_value(value)
}

pub fn plan_from_value(value: Value) -> Result<Plan, PlanError> {
    let plan: Plan = serde_json::from_value(value)
        .map_err(|err| PlanError(format!("Plan JSON is missing a field: {err}")))?;
    if plan.v != 1 {
        return Err(PlanError(format!(
            "Unsupported plan version {}.",
            plan.v
        )));
    }
    if plan.kind != "plan" {
        return Err(PlanError("The JSON kind must be \"plan\".".into()));
    }
    if plan.tasks.is_empty() {
        return Err(PlanError("The plan has no tasks.".into()));
    }
    if plan.tasks.len() > 40 {
        return Err(PlanError("Too many tasks (max 40).".into()));
    }
    if !(5..=240).contains(&plan.budget) {
        return Err(PlanError(
            "Budget must be a whole number of minutes from 5 to 240.".into(),
        ));
    }
    for (index, task) in plan.tasks.iter().enumerate() {
        let n = index + 1;
        if task.id.is_empty()
            || task.id.len() > 80
            || !task
                .id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, ':' | '.' | '_' | '-'))
        {
            return Err(PlanError(format!("Task {n} has a bad id.")));
        }
        if task.title.trim().is_empty() || task.title.len() > 240 {
            return Err(PlanError(format!("Task {n} needs a title.")));
        }
        if !(1..=240).contains(&task.est_minutes) {
            return Err(PlanError(format!("Task {n} has a bad time estimate.")));
        }
        if let (Some(x), Some(y)) = (task.x, task.y) {
            if !(0.0..=1.0).contains(&x) || !(0.0..=1.0).contains(&y) {
                return Err(PlanError(format!(
                    "Task {n} coordinates must be fractions from 0 to 1, not 0 to 100."
                )));
            }
        } else if task.x.is_some() || task.y.is_some() {
            return Err(PlanError(format!("Task {n} needs both x and y.")));
        }
    }
    Ok(plan)
}

fn decode_b64(payload: &str) -> Result<Vec<u8>, PlanError> {
    let mut text = payload.replace('-', "+").replace('_', "/");
    let pad = text.len() % 4;
    if pad > 0 {
        text.push_str(&"=".repeat(4 - pad));
    }
    STANDARD
        .decode(text.as_bytes())
        .or_else(|_| URL_SAFE.decode(payload.as_bytes()))
        .map_err(|_| PlanError("Could not decode this string. It is not valid base64.".into()))
}

/// Write `Interface/AddOns/Unbored_Plan`, which this app owns.
/// WoW rewrites SavedVariables on logout, so a helper addon is the file
/// that survives a play session and is read on the next /reload.
pub fn install_request_file(
    retail: &Path,
    request_id: &str,
    status: &str,
    reason: Option<&str>,
    plan: Option<&Plan>,
) -> Result<PathBuf, PlanError> {
    let body = if let Some(plan) = plan {
        let mut copy = plan.clone();
        copy.request_id = Some(request_id.to_string());
        copy.request_status = Some(status.to_string());
        copy.request_reason = reason.map(str::to_string);
        render_plan_lua(&copy)
    } else {
        let mut out = String::from(
            "-- Written by Unbored Companion. Loaded by Unbored_Plan on /reload.\n",
        );
        out.push_str("UnboredExternalPlan = {\n");
        push_pair(&mut out, 1, "requestId", &Value::String(request_id.to_string()));
        push_pair(&mut out, 1, "requestStatus", &Value::String(status.to_string()));
        if let Some(reason) = reason {
            push_pair(&mut out, 1, "requestReason", &Value::String(reason.to_string()));
        }
        out.push_str("}\n");
        out
    };
    write_plan_lua(retail, &body)
}

pub fn install_plan(retail: &Path, plan: &Plan) -> Result<PathBuf, PlanError> {
    write_plan_lua(retail, &render_plan_lua(plan))
}

fn write_plan_lua(retail: &Path, body: &str) -> Result<PathBuf, PlanError> {
    let dir = retail.join("Interface").join("AddOns").join("Unbored_Plan");
    fs::create_dir_all(&dir).map_err(|err| PlanError(format!("Could not create the helper addon: {err}")))?;
    let toc = dir.join("Unbored_Plan.toc");
    fs::write(&toc, HELPER_TOC).map_err(|err| PlanError(format!("Could not write the helper TOC: {err}")))?;
    let lua_path = dir.join("Plan.lua");
    let tmp = dir.join("Plan.lua.tmp");
    fs::write(&tmp, body).map_err(|err| PlanError(format!("Could not write the plan: {err}")))?;
    fs::rename(&tmp, &lua_path).map_err(|err| PlanError(format!("Could not replace the plan: {err}")))?;
    Ok(lua_path)
}

pub fn render_plan_lua(plan: &Plan) -> String {
    let mut out = String::from(
        "-- Written by Unbored Companion. Loaded by Unbored_Plan on /reload.\n",
    );
    out.push_str("-- Do not edit this by hand; the app replaces the file.\n");
    out.push_str("UnboredExternalPlan = {\n");
    push_pair(&mut out, 1, "v", &Value::from(plan.v));
    push_pair(&mut out, 1, "kind", &Value::String(plan.kind.clone()));
    push_pair(&mut out, 1, "mode", &Value::String(plan.mode.clone()));
    push_pair(&mut out, 1, "budget", &Value::from(plan.budget));
    if let Some(at) = plan.generated_at {
        push_pair(&mut out, 1, "generatedAt", &Value::from(at));
    }
    if let Some(note) = &plan.note {
        push_pair(&mut out, 1, "note", &Value::String(note.clone()));
    }
    if let Some(request_id) = &plan.request_id {
        push_pair(&mut out, 1, "requestId", &Value::String(request_id.clone()));
    }
    if let Some(request_status) = &plan.request_status {
        push_pair(&mut out, 1, "requestStatus", &Value::String(request_status.clone()));
    }
    if let Some(request_reason) = &plan.request_reason {
        push_pair(&mut out, 1, "requestReason", &Value::String(request_reason.clone()));
    }
    out.push_str("  [\"tasks\"] = {\n");
    for task in &plan.tasks {
        out.push_str("    {\n");
        push_pair(&mut out, 3, "id", &Value::String(task.id.clone()));
        push_pair(&mut out, 3, "title", &Value::String(task.title.clone()));
        push_pair(&mut out, 3, "estMinutes", &Value::from(task.est_minutes));
        if let Some(map_id) = task.map_id {
            push_pair(&mut out, 3, "mapID", &Value::from(map_id));
        }
        if let Some(x) = task.x {
            push_pair(&mut out, 3, "x", &Value::from(x));
        }
        if let Some(y) = task.y {
            push_pair(&mut out, 3, "y", &Value::from(y));
        }
        if let Some(note) = &task.note {
            push_pair(&mut out, 3, "note", &Value::String(note.clone()));
        }
        if let Some(complete) = &task.complete {
            out.push_str("      [\"complete\"] = ");
            write_value(&mut out, complete, 3);
            out.push_str(",\n");
        }
        out.push_str("    },\n");
    }
    out.push_str("  },\n}\n");
    out
}

fn push_pair(out: &mut String, depth: usize, key: &str, value: &Value) {
    for _ in 0..depth {
        out.push_str("  ");
    }
    out.push_str("[\"");
    push_lua_string_body(out, key);
    out.push_str("\"] = ");
    write_value(out, value, depth);
    out.push_str(",\n");
}

fn write_value(out: &mut String, value: &Value, depth: usize) {
    match value {
        Value::Null => out.push_str("nil"),
        Value::Bool(true) => out.push_str("true"),
        Value::Bool(false) => out.push_str("false"),
        Value::Number(number) => out.push_str(&number.to_string()),
        Value::String(text) => {
            out.push('"');
            push_lua_string_body(out, text);
            out.push('"');
        }
        Value::Array(items) => {
            out.push_str("{\n");
            for item in items {
                for _ in 0..(depth + 1) {
                    out.push_str("  ");
                }
                write_value(out, item, depth + 1);
                out.push_str(",\n");
            }
            for _ in 0..depth {
                out.push_str("  ");
            }
            out.push('}');
        }
        Value::Object(map) => {
            out.push_str("{\n");
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            for key in keys {
                for _ in 0..(depth + 1) {
                    out.push_str("  ");
                }
                out.push_str("[\"");
                push_lua_string_body(out, key);
                out.push_str("\"] = ");
                write_value(out, &map[key], depth + 1);
                out.push_str(",\n");
            }
            for _ in 0..depth {
                out.push_str("  ");
            }
            out.push('}');
        }
    }
}

fn push_lua_string_body(out: &mut String, text: &str) {
    for ch in text.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 32 => {
                out.push_str(&format!("\\{:03}", c as u32));
            }
            c => out.push(c),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::savedvars::parse_saved_variables;

    const SAMPLE: &str = "UNB1:eyJ2IjoxLCJraW5kIjoicGxhbiIsIm1vZGUiOiJjdXN0b20iLCJidWRnZXQiOjYwLCJub3RlIjoiZXZlbmluZyBzZXNzaW9uIiwidGFza3MiOlt7ImlkIjoibWVudG9yOmZhbGwiLCJ0aXRsZSI6IkdvaW5nIERvd24/IiwiZXN0TWludXRlcyI6NSwibm90ZSI6ItC/0YDQvtGB0YLQviDRg9C/0LDQtNC4IiwiY29tcGxldGUiOnsia2luZCI6ImFjaGlldmVtZW50IiwiYWNoaWV2ZW1lbnRJRCI6OTY0fX0seyJpZCI6Im1lbnRvcjphc2hlcyIsInRpdGxlIjoiQXNoZXMgb2YgQWwnYXIiLCJtYXBJRCI6MTA5LCJ4IjowLjczOSwieSI6MC42MzcsImVzdE1pbnV0ZXMiOjIwLCJub3RlIjoiVGVtcGVzdCBLZWVwLCBLYWVsJ3RoYXMuIiwiY29tcGxldGUiOnsia2luZCI6Im1vdW50IiwibW91bnRJRCI6MTgzfX1dfQ==";

    #[test]
    fn decodes_the_documented_example() {
        let plan = decode_unb1(&format!("\n{SAMPLE}\n")).unwrap();
        assert_eq!(plan.tasks.len(), 2);
        assert_eq!(plan.tasks[0].id, "mentor:fall");
        assert_eq!(plan.tasks[0].note.as_deref(), Some("просто упади"));
        assert_eq!(plan.tasks[1].map_id, Some(109));
        assert!((plan.tasks[1].x.unwrap() - 0.739).abs() < 1e-6);
    }

    #[test]
    fn rejects_progress_and_bad_coords() {
        assert!(decode_unb1("UNB1P:aaaa").is_err());
        let err = decode_unb1("hello").unwrap_err().0;
        assert!(err.contains("UNB1"));
        let bad = plan_from_value(serde_json::json!({
            "v": 1,
            "kind": "plan",
            "budget": 30,
            "tasks": [{ "id": "a", "title": "A", "estMinutes": 5, "x": 50, "y": 10 }]
        }));
        assert!(bad.unwrap_err().0.contains("0 to 1"));
    }

    #[test]
    fn writes_a_helper_addon_the_parser_can_read_back() {
        let mut plan = decode_unb1(SAMPLE).unwrap();
        plan.generated_at = Some(1_761_720_000);
        plan.tasks[1].title = "Ashes \"of\" Al'ar\nline".into();
        let root = std::env::temp_dir().join(format!(
            "unbored-plan-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let retail = root.join("_retail_");
        fs::create_dir_all(&retail).unwrap();
        let path = install_plan(&retail, &plan).unwrap();
        assert!(path.ends_with("Plan.lua"));
        let toc = fs::read_to_string(
            retail.join("Interface/AddOns/Unbored_Plan/Unbored_Plan.toc"),
        )
        .unwrap();
        assert!(toc.contains("120105, 120100"));
        let text = fs::read_to_string(&path).unwrap();
        let values = parse_saved_variables(&text).unwrap();
        let external = values.get("UnboredExternalPlan").unwrap();
        let tasks = crate::savedvars::table_get(external, "tasks").unwrap();
        let second = crate::savedvars::array_items(tasks)[1];
        assert_eq!(
            crate::savedvars::table_get(second, "title")
                .and_then(|v| v.as_str()),
            Some("Ashes \"of\" Al'ar\nline")
        );
        let _ = fs::remove_dir_all(&root);
    }
}
