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
## Version: 0.3.0
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub waypoints: Option<Vec<Waypoint>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Waypoint {
    #[serde(rename = "mapID")]
    pub map_id: u32,
    pub x: f64,
    pub y: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

pub const MAX_WAYPOINTS: usize = 10;

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
        if let Some(points) = &task.waypoints {
            if points.len() > MAX_WAYPOINTS {
                return Err(PlanError(format!("Task {n} has more than {MAX_WAYPOINTS} waypoints.")));
            }
            for point in points {
                if point.map_id == 0
                    || !(0.0..=1.0).contains(&point.x)
                    || !(0.0..=1.0).contains(&point.y)
                {
                    return Err(PlanError(format!(
                        "Task {n} waypoints need a mapID and x/y fractions from 0 to 1."
                    )));
                }
            }
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

/// Plan.lua for an in-game request: its status, and when it is answered,
/// the reply text, the follow-up plan, or both.
pub fn render_request_lua(request: &RequestState, status: &str, plan: Option<&Plan>) -> String {
    let mut extras = vec![("requestType", Value::String(request.kind.clone()))];
    if let Some(answer) = request.answer.as_ref().filter(|_| status == "fulfilled") {
        extras.push(("answer", answer.clone()));
    }
    if let Some(plan) = plan {
        let mut copy = plan.clone();
        copy.request_id = Some(request.id.clone());
        copy.request_status = Some(status.to_string());
        copy.request_reason = request.reason.clone();
        render_plan_body(&copy, &extras)
    } else {
        let mut out = String::from(
            "-- Written by Unbored Companion. Loaded by Unbored_Plan on /reload.\n",
        );
        out.push_str("UnboredExternalPlan = {\n");
        push_pair(&mut out, 1, "requestId", &Value::String(request.id.clone()));
        push_pair(&mut out, 1, "requestStatus", &Value::String(status.to_string()));
        if let Some(reason) = &request.reason {
            push_pair(&mut out, 1, "requestReason", &Value::String(reason.clone()));
        }
        for (key, value) in &extras {
            push_pair(&mut out, 1, key, value);
        }
        out.push_str("}\n");
        out
    }
}

/// Write `Interface/AddOns/Unbored_Plan`, which this app owns.
/// WoW rewrites SavedVariables on logout, so a helper addon is the file
/// that survives a play session and is read on the next /reload.
pub fn install_plan(retail: &Path, plan: &Plan) -> Result<Written, PlanError> {
    write_plan_lua(retail, &render_plan_lua(plan))
}

#[derive(Debug, Clone, PartialEq)]
pub struct Written {
    pub path: PathBuf,
    pub changed: bool,
}

const EMPTY_PLAN_LUA: &str = "-- Written by Unbored Companion. No plan yet.\n";

fn helper_dir(retail: &Path) -> PathBuf {
    retail.join("Interface").join("AddOns").join("Unbored_Plan")
}

fn write_helper_toc(dir: &Path) -> Result<(), PlanError> {
    let toc = dir.join("Unbored_Plan.toc");
    if fs::read_to_string(&toc).ok().as_deref() == Some(HELPER_TOC) {
        return Ok(());
    }
    fs::write(&toc, HELPER_TOC).map_err(|err| PlanError(format!("Could not write the helper TOC: {err}")))
}

/// The game addon treats a loaded Unbored_Plan as "a companion is here", so
/// the helper exists from the first sync, even before any plan arrives.
pub fn ensure_helper(retail: &Path) -> Result<(), PlanError> {
    let dir = helper_dir(retail);
    fs::create_dir_all(&dir).map_err(|err| PlanError(format!("Could not create the helper addon: {err}")))?;
    write_helper_toc(&dir)?;
    let lua_path = dir.join("Plan.lua");
    if !lua_path.is_file() {
        fs::write(&lua_path, EMPTY_PLAN_LUA)
            .map_err(|err| PlanError(format!("Could not write the plan: {err}")))?;
    }
    Ok(())
}

/// Leaves the file alone when the body is unchanged, so a running game is
/// not handed the same plan again and no second toast goes out.
fn write_plan_lua(retail: &Path, body: &str) -> Result<Written, PlanError> {
    let dir = helper_dir(retail);
    fs::create_dir_all(&dir).map_err(|err| PlanError(format!("Could not create the helper addon: {err}")))?;
    write_helper_toc(&dir)?;
    let lua_path = dir.join("Plan.lua");
    if fs::read_to_string(&lua_path).ok().as_deref() == Some(body) {
        return Ok(Written { path: lua_path, changed: false });
    }
    let tmp = dir.join("Plan.lua.tmp");
    fs::write(&tmp, body).map_err(|err| PlanError(format!("Could not write the plan: {err}")))?;
    fs::rename(&tmp, &lua_path).map_err(|err| PlanError(format!("Could not replace the plan: {err}")))?;
    Ok(Written { path: lua_path, changed: true })
}

/// What the planner holds for this device: the newest plan and the newest
/// in-game request from it.
#[derive(Debug, Clone, Default)]
pub struct PlannerState {
    pub latest_plan: Option<(u64, Plan)>,
    pub latest_plan_at: Option<u64>,
    pub request: Option<RequestState>,
}

#[derive(Debug, Clone, Default)]
pub struct RequestState {
    pub id: String,
    /// plan, item, or question.
    pub kind: String,
    pub status: String,
    pub reason: Option<String>,
    pub plan_id: Option<u64>,
    pub plan: Option<Plan>,
    pub answer: Option<Value>,
    pub updated_at: Option<u64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PlanFile {
    pub body: String,
    /// Set when the file carries a finished plan or answer for this request.
    pub ready_request: Option<String>,
    /// The kind of that ready request: plan, item, or question.
    pub ready_kind: Option<String>,
}

/// One Plan.lua serves both flows. A pending or failed request wins, since
/// the game ignores other plans while it waits. An answered request wins
/// unless the planner put a newer plan after it.
pub fn pick_plan_file(state: &PlannerState) -> Option<PlanFile> {
    if let Some(request) = &state.request {
        let answered = request.status == "fulfilled" && (request.plan.is_some() || request.answer.is_some());
        let newer_direct = match (&state.latest_plan, request.plan_id) {
            (Some((id, _)), Some(request_plan)) => *id > request_plan,
            (Some(_), None) => match (state.latest_plan_at, request.updated_at) {
                (Some(plan_at), Some(answered_at)) => plan_at > answered_at,
                _ => false,
            },
            _ => false,
        };
        if !answered || !newer_direct {
            let plan = if answered { request.plan.as_ref() } else { None };
            let status = if request.status == "fulfilled" && !answered {
                "pending"
            } else {
                request.status.as_str()
            };
            return Some(PlanFile {
                body: render_request_lua(request, status, plan),
                ready_request: answered.then(|| request.id.clone()),
                ready_kind: answered.then(|| request.kind.clone()),
            });
        }
    }
    state.latest_plan.as_ref().map(|(_, plan)| PlanFile {
        body: render_plan_lua(plan),
        ready_request: None,
        ready_kind: None,
    })
}

pub fn install_plan_file(retail: &Path, file: &PlanFile) -> Result<Written, PlanError> {
    write_plan_lua(retail, &file.body)
}

pub fn render_plan_lua(plan: &Plan) -> String {
    render_plan_body(plan, &[])
}

fn render_plan_body(plan: &Plan, extras: &[(&str, Value)]) -> String {
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
    for (key, value) in extras {
        push_pair(&mut out, 1, key, value);
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
        if let Some(points) = &task.waypoints {
            let value = serde_json::to_value(points).unwrap_or(Value::Null);
            out.push_str("      [\"waypoints\"] = ");
            write_value(&mut out, &value, 3);
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
        let path = install_plan(&retail, &plan).unwrap().path;
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

    fn small_plan(id: &str) -> Plan {
        plan_from_value(serde_json::json!({
            "v": 1,
            "kind": "plan",
            "budget": 30,
            "generatedAt": 5,
            "tasks": [{ "id": id, "title": "T", "estMinutes": 5 }]
        }))
        .unwrap()
    }

    #[test]
    fn keeps_waypoints_and_rejects_bad_routes() {
        let plan = plan_from_value(serde_json::json!({
            "v": 1,
            "kind": "plan",
            "budget": 30,
            "tasks": [{
                "id": "a",
                "title": "A",
                "waypoints": [
                    { "mapID": 2248, "x": 0.1, "y": 0.2, "label": "Gate" },
                    { "mapID": 2248, "x": 0.5, "y": 0.6 }
                ]
            }]
        }))
        .unwrap();
        let lua = render_plan_lua(&plan);
        let values = parse_saved_variables(&lua).unwrap();
        let task = crate::savedvars::array_items(
            crate::savedvars::table_get(values.get("UnboredExternalPlan").unwrap(), "tasks").unwrap(),
        )[0];
        let points = crate::savedvars::array_items(crate::savedvars::table_get(task, "waypoints").unwrap());
        assert_eq!(points.len(), 2);
        assert_eq!(
            crate::savedvars::table_get(points[0], "label").and_then(|v| v.as_str()),
            Some("Gate")
        );
        assert!(crate::savedvars::table_get(points[1], "label").is_none());
        let percent = plan_from_value(serde_json::json!({
            "v": 1, "kind": "plan", "budget": 30,
            "tasks": [{ "id": "a", "title": "A", "waypoints": [{ "mapID": 1, "x": 40, "y": 2 }] }]
        }));
        assert!(percent.is_err());
        let many: Vec<_> = (0..11).map(|_| serde_json::json!({ "mapID": 1, "x": 0.1, "y": 0.1 })).collect();
        let too_many = plan_from_value(serde_json::json!({
            "v": 1, "kind": "plan", "budget": 30,
            "tasks": [{ "id": "a", "title": "A", "waypoints": many }]
        }));
        assert!(too_many.is_err());
    }

    fn request(status: &str, plan_id: Option<u64>, plan: Option<Plan>) -> RequestState {
        RequestState {
            id: "req-1".into(),
            kind: "plan".into(),
            status: status.into(),
            plan_id,
            plan,
            ..Default::default()
        }
    }

    #[test]
    fn writes_an_answer_the_parser_can_read_back() {
        let answer = serde_json::json!({
            "message": "A rare is east of you.\nI pinned it.",
            "waypoints": [{ "mapID": 2248, "x": 0.6, "y": 0.4, "label": "Rare" }],
            "answeredAt": 20
        });
        let state = PlannerState {
            latest_plan: Some((3, small_plan("older"))),
            latest_plan_at: Some(10),
            request: Some(RequestState {
                id: "ask-1".into(),
                kind: "question".into(),
                status: "fulfilled".into(),
                answer: Some(answer),
                updated_at: Some(20),
                ..Default::default()
            }),
        };
        let file = pick_plan_file(&state).unwrap();
        assert_eq!(file.ready_request.as_deref(), Some("ask-1"));
        assert_eq!(file.ready_kind.as_deref(), Some("question"));
        let values = parse_saved_variables(&file.body).unwrap();
        let external = values.get("UnboredExternalPlan").unwrap();
        use crate::savedvars::table_get;
        assert_eq!(table_get(external, "requestType").and_then(|v| v.as_str()), Some("question"));
        let reply = table_get(external, "answer").unwrap();
        assert_eq!(
            table_get(reply, "message").and_then(|v| v.as_str()),
            Some("A rare is east of you.\nI pinned it.")
        );
        assert!(table_get(external, "tasks").is_none());

        let pending = PlannerState {
            request: Some(RequestState {
                id: "ask-2".into(),
                kind: "item".into(),
                status: "pending".into(),
                answer: Some(serde_json::json!({ "message": "stale" })),
                ..Default::default()
            }),
            ..Default::default()
        };
        let file = pick_plan_file(&pending).unwrap();
        assert!(file.ready_request.is_none() && !file.body.contains("stale"));
        assert!(file.body.contains("\"item\""));

        let mut newer = state.clone();
        newer.latest_plan_at = Some(30);
        let file = pick_plan_file(&newer).unwrap();
        assert!(file.body.contains("older") && file.ready_request.is_none());
    }

    #[test]
    fn picks_between_the_request_and_a_direct_plan() {
        assert!(pick_plan_file(&PlannerState::default()).is_none());
        let direct = PlannerState { latest_plan: Some((3, small_plan("direct"))), ..Default::default() };
        let file = pick_plan_file(&direct).unwrap();
        assert!(file.body.contains("direct") && file.ready_request.is_none());

        let pending = PlannerState {
            latest_plan_at: None,
            latest_plan: Some((3, small_plan("direct"))),
            request: Some(request("pending", None, None)),
        };
        let file = pick_plan_file(&pending).unwrap();
        assert!(file.body.contains("\"pending\"") && !file.body.contains("direct"));
        assert!(file.ready_request.is_none());

        let fulfilled = PlannerState {
            latest_plan_at: None,
            latest_plan: Some((4, small_plan("asked"))),
            request: Some(request("fulfilled", Some(4), Some(small_plan("asked")))),
        };
        let file = pick_plan_file(&fulfilled).unwrap();
        assert!(file.body.contains("req-1") && file.body.contains("asked"));
        assert_eq!(file.ready_request.as_deref(), Some("req-1"));

        let newer = PlannerState {
            latest_plan_at: None,
            latest_plan: Some((9, small_plan("later"))),
            request: Some(request("fulfilled", Some(4), Some(small_plan("asked")))),
        };
        let file = pick_plan_file(&newer).unwrap();
        assert!(file.body.contains("later") && !file.body.contains("req-1"));
    }

    #[test]
    fn writes_only_when_the_plan_changes() {
        let root = std::env::temp_dir().join(format!("unbored-plan-change-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let retail = root.join("_retail_");
        fs::create_dir_all(&retail).unwrap();
        ensure_helper(&retail).unwrap();
        let lua = retail.join("Interface/AddOns/Unbored_Plan/Plan.lua");
        assert!(lua.is_file());
        assert!(parse_saved_variables(&fs::read_to_string(&lua).unwrap()).unwrap().is_empty());
        let plan = small_plan("a");
        assert!(install_plan(&retail, &plan).unwrap().changed);
        assert!(!install_plan(&retail, &plan).unwrap().changed);
        ensure_helper(&retail).unwrap();
        assert!(fs::read_to_string(&lua).unwrap().contains("\"a\""));
        let _ = fs::remove_dir_all(&root);
    }
}
