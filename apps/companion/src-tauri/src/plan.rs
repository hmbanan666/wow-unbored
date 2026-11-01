//! UNB1 strings and the Lua file the helper addon loads.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use base64::engine::general_purpose::{STANDARD, URL_SAFE};
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const HELPER_TOC: &str = "\
## Interface: 120105, 120100
## Title: Unbored Plan
## Notes: Plans, answers and item tips from Unbored Companion. Bory reads them when you log in or press Refresh.
## Author: Unbored contributors
## Version: 0.10.0
## LoadOnDemand: 0

Plan.lua
Advice.lua
Suggestions.lua
";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub v: u32,
    pub kind: String,
    #[serde(default = "default_mode")]
    pub mode: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub budget: Option<u32>,
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
    /// The card fields (ADR 0038); all optional, a 0.7 plan has none.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub goal: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rewards: Option<Vec<String>>,
    /// Reward contents (ADR 0055): a container reward token to what it may hold.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contains: Option<Value>,
    pub tasks: Vec<Task>,
    /// Npc names and places for `{npc:ID}` tokens (packages/contracts/markup.md).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entities: Option<Value>,
}

fn default_mode() -> String {
    "custom".to_string()
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub why: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rewards: Option<Vec<String>>,
    /// `{ text, check = { kind, id, atLeast } }`, checked live by the addon.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub condition: Option<Value>,
    /// Step group (ADR 0056): consecutive steps done in any order.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
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
        return Err(PlanError("The string should start with UNB1:.".into()));
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
        return Err(PlanError(format!("Unsupported plan version {}.", plan.v)));
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
    if plan
        .budget
        .is_some_and(|minutes| !(5..=240).contains(&minutes))
    {
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
                return Err(PlanError(format!(
                    "Task {n} has more than {MAX_WAYPOINTS} waypoints."
                )));
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
const ETA_MIN: u64 = 60;
const ETA_MAX: u64 = 900;

pub fn render_request_lua(request: &RequestState, status: &str, plan: Option<&Plan>) -> String {
    let mut extras = vec![("requestType", Value::String(request.kind.clone()))];
    if let Some(code) = request
        .reason_code
        .as_ref()
        .filter(|_| status == "failed" && plan.is_some())
    {
        extras.push(("requestReasonCode", Value::String(code.clone())));
    }
    if let Some(answer) = request.answer.as_ref().filter(|_| status == "fulfilled") {
        extras.push(("answer", answer.clone()));
    }
    if let Some(eta) = request.eta.filter(|_| status == "pending") {
        extras.push(("eta", Value::from(eta.clamp(ETA_MIN, ETA_MAX))));
    }
    if let Some(plan) = plan {
        let mut copy = plan.clone();
        copy.request_id = Some(request.id.clone());
        copy.request_status = Some(status.to_string());
        copy.request_reason = request.reason.clone();
        render_plan_body(&copy, &extras)
    } else {
        let mut out = String::from(
            "-- Written by Unbored Companion. Read by Unbored_Plan at login or Refresh.\n",
        );
        out.push_str("UnboredExternalPlan = {\n");
        push_pair(&mut out, 1, "requestId", &Value::String(request.id.clone()));
        push_pair(
            &mut out,
            1,
            "requestStatus",
            &Value::String(status.to_string()),
        );
        if let Some(reason) = &request.reason {
            push_pair(&mut out, 1, "requestReason", &Value::String(reason.clone()));
        }
        if let Some(code) = request.reason_code.as_ref().filter(|_| status == "failed") {
            push_pair(
                &mut out,
                1,
                "requestReasonCode",
                &Value::String(code.clone()),
            );
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
/// that survives a play session and is read at the next login or Refresh.
pub fn install_plan(retail: &Path, plan: &Plan) -> Result<Written, PlanError> {
    write_plan_lua(retail, &render_plan_lua(plan))
}

#[derive(Debug, Clone, PartialEq)]
pub struct Written {
    pub path: PathBuf,
    pub changed: bool,
}

const EMPTY_PLAN_LUA: &str = "-- Written by Unbored Companion. No plan yet.\n";
const EMPTY_ADVICE_LUA: &str = "-- Written by Unbored Companion. No Personal advice yet.\n";
const EMPTY_SUGGESTIONS_LUA: &str = "-- Written by Unbored Companion. No ideas yet.\n";

/// D107: Suggestions.lua has its own small share of the D76 budget.
pub const SUGGESTIONS_MAX_BYTES: usize = 20 * 1024;
pub const SUGGESTIONS_MAX_LITERALS: usize = 2_000;
const MAX_SUGGESTIONS: usize = 10;
const SUGGESTION_TEXT: [(&str, usize); 6] = [
    ("id", 120),
    ("kind", 20),
    ("title", 40),
    ("titleToken", 60),
    ("goal", 140),
    ("why", 100),
];

/// Per character; the game holds all of it in memory.
pub const MAX_ADVICE_ITEMS: usize = 500;
const ADVICE_FIELDS: [(&str, usize); 4] =
    [("action", 20), ("line", 120), ("lineRu", 240), ("to", 80)];

/// Alts from the Account digest (D76), per character.
pub const MAX_DIGEST_ALTS: usize = 50;
const MAX_ALT_PROFESSIONS: usize = 6;

/// D76, D143: everything the Companion writes into Unbored_Plan stays within this.
pub const HELPER_MAX_BYTES: usize = 260 * 1024;
pub const HELPER_MAX_LITERALS: usize = 20_000;

/// The Account holdings index (docs/adr/0048): at most this many items and places.
pub const MAX_HOLDINGS_ITEMS: usize = 3000;
const MAX_HOLDINGS_PLACES: usize = 50;
const MAX_HOLDINGS_VALUE: usize = 200;

/// Advice.lua from GET /v1/advice: UnboredAdvice.characters["Realm-Name"].items[itemID]
/// (docs/adr/0019), .alts, the Account digest (D76), and .holdings (docs/adr/0048).
/// Only known fields are kept; the addon checks them again.
pub fn render_advice_lua(characters: &Value, holdings: &Value) -> String {
    render_advice_capped(
        characters,
        holdings,
        MAX_ADVICE_ITEMS,
        MAX_DIGEST_ALTS,
        MAX_HOLDINGS_ITEMS,
    )
}

/// One holdings value: `place:count` pairs, the place a 1-based index or `w`.
fn holdings_value(text: &str, places: usize) -> bool {
    !text.is_empty()
        && text.len() <= MAX_HOLDINGS_VALUE
        && text.split(',').all(|pair| {
            let Some((place, count)) = pair.split_once(':') else {
                return false;
            };
            let place_ok = place == "w"
                || place
                    .parse::<usize>()
                    .is_ok_and(|index| index >= 1 && index <= places);
            place_ok && count.parse::<u64>().is_ok_and(|count| count > 0)
        })
}

fn push_holdings(out: &mut String, holdings: &Value, max_items: usize) {
    let places: Vec<&str> = holdings["places"]
        .as_array()
        .map(|list| list.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    let places: Vec<&str> = places.into_iter().take(MAX_HOLDINGS_PLACES).collect();
    let Some(items) = holdings["items"].as_object() else {
        return;
    };
    if places.is_empty() || items.is_empty() || max_items == 0 {
        return;
    }
    out.push_str("  [\"holdings\"] = {\n    [\"places\"] = {");
    for place in &places {
        out.push_str(" \"");
        push_lua_string_body(out, &place.chars().take(80).collect::<String>());
        out.push_str("\",");
    }
    let mut rows: Vec<(u64, &str)> = items
        .iter()
        .filter_map(|(id, value)| {
            let id = id.parse::<u64>().ok().filter(|id| *id > 0)?;
            let text = value
                .as_str()
                .filter(|text| holdings_value(text, places.len()))?;
            Some((id, text))
        })
        .collect();
    // Items in the most places are kept when the budget cuts (D143).
    rows.sort_by_key(|(id, text)| (std::cmp::Reverse(text.matches(',').count()), *id));
    rows.truncate(max_items);
    rows.sort_by_key(|(id, _)| *id);
    out.push_str(" },\n    [\"items\"] = {\n");
    for (id, text) in rows {
        out.push_str(&format!("      [{id}] = \"{text}\",\n"));
    }
    out.push_str("    },\n  },\n");
}

fn render_advice_capped(
    characters: &Value,
    holdings: &Value,
    max_items: usize,
    max_alts: usize,
    max_holdings: usize,
) -> String {
    let mut out = String::from(
        "-- Written by Unbored Companion. Personal advice, read at login or Refresh.\n",
    );
    out.push_str("UnboredAdvice = {\n  [\"v\"] = 1,\n  [\"characters\"] = {\n");
    let mut rows: Vec<&Value> = characters
        .as_array()
        .map(|list| list.iter().collect())
        .unwrap_or_default();
    rows.sort_by_key(|row| {
        (
            row["realm"].as_str().unwrap_or("").to_string(),
            row["character"].as_str().unwrap_or("").to_string(),
        )
    });
    for row in rows {
        let (Some(character), Some(realm)) = (row["character"].as_str(), row["realm"].as_str())
        else {
            continue;
        };
        out.push_str("    [\"");
        push_lua_string_body(&mut out, &format!("{realm}-{character}"));
        out.push_str("\"] = {\n");
        if let Some(at) = row["updatedAt"].as_u64() {
            out.push_str(&format!("      [\"updatedAt\"] = {at},\n"));
        }
        out.push_str("      [\"items\"] = {\n");
        let items = row["items"]
            .as_array()
            .map(|list| list.as_slice())
            .unwrap_or_default();
        for item in items.iter().take(max_items) {
            let Some(id) = item["itemID"].as_u64().filter(|id| *id > 0) else {
                continue;
            };
            if item["line"]
                .as_str()
                .is_none_or(|line| line.trim().is_empty())
            {
                continue;
            }
            out.push_str(&format!("        [{id}] = {{"));
            for (field, limit) in ADVICE_FIELDS {
                if let Some(text) = item[field].as_str() {
                    push_lua_field(&mut out, field, text, limit);
                }
            }
            out.push_str(" },\n");
        }
        out.push_str("      },\n");
        push_alts(&mut out, &row["alts"], max_alts);
        out.push_str("    },\n");
    }
    out.push_str("  },\n");
    push_holdings(&mut out, holdings, max_holdings);
    out.push_str("}\n");
    out
}

fn push_lua_field(out: &mut String, field: &str, text: &str, limit: usize) {
    let text: String = text.chars().take(limit).collect();
    out.push_str(&format!(" [\"{field}\"] = \""));
    push_lua_string_body(out, &text);
    out.push_str("\",");
}

fn push_alts(out: &mut String, alts: &Value, max_alts: usize) {
    let alts = alts
        .as_array()
        .map(|list| list.as_slice())
        .unwrap_or_default();
    if alts.is_empty() || max_alts == 0 {
        return;
    }
    out.push_str("      [\"alts\"] = {\n");
    for alt in alts.iter().take(max_alts) {
        let (Some(name), Some(realm)) = (alt["name"].as_str(), alt["realm"].as_str()) else {
            continue;
        };
        out.push_str("        {");
        push_lua_field(out, "name", name, 60);
        push_lua_field(out, "realm", realm, 60);
        if let Some(faction) = alt["faction"].as_str() {
            push_lua_field(out, "faction", faction, 20);
        }
        if let Some(at) = alt["seenAt"].as_u64() {
            out.push_str(&format!(" [\"seenAt\"] = {at},"));
        }
        out.push_str(" [\"professions\"] = {");
        let professions = alt["professions"]
            .as_array()
            .map(|list| list.as_slice())
            .unwrap_or_default();
        for profession in professions.iter().take(MAX_ALT_PROFESSIONS) {
            let Some(line) = profession["skillLine"].as_u64() else {
                continue;
            };
            out.push_str(&format!(" {{ [\"skillLine\"] = {line},"));
            if let Some(name) = profession["name"].as_str() {
                push_lua_field(out, "name", name, 60);
            }
            if let Some(skill) = profession["skill"].as_u64() {
                out.push_str(&format!(" [\"skill\"] = {skill},"));
            }
            out.push_str(" },");
        }
        out.push_str(" }, },\n");
    }
    out.push_str("      },\n");
}

/// Constants in a file we wrote: string and number literals. The game's Lua
/// loader has a per-chunk constant limit, which is what D76 guards.
pub fn count_lua_literals(text: &str) -> usize {
    let bytes = text.as_bytes();
    let mut count = 0;
    let mut i = 0;
    let mut prev_word = false;
    while i < bytes.len() {
        let b = bytes[i];
        if b == b'-' && bytes.get(i + 1) == Some(&b'-') {
            while i < bytes.len() && bytes[i] != b'\n' {
                i += 1;
            }
            prev_word = false;
            continue;
        }
        if b == b'"' {
            count += 1;
            i += 1;
            while i < bytes.len() && bytes[i] != b'"' {
                if bytes[i] == b'\\' {
                    i += 1;
                }
                i += 1;
            }
            i += 1;
            prev_word = false;
            continue;
        }
        if b.is_ascii_digit() && !prev_word {
            count += 1;
            while i < bytes.len() && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'.') {
                i += 1;
            }
            continue;
        }
        prev_word = b.is_ascii_alphanumeric() || b == b'_';
        i += 1;
    }
    count
}

/// Advice.lua within what Plan.lua leaves of the D76 budget: fewer holdings
/// items first (the Server already put the ones in most places first), then
/// fewer items per character, then fewer Alts.
pub fn render_advice_within(
    characters: &Value,
    holdings: &Value,
    used_bytes: usize,
    used_literals: usize,
) -> String {
    let bytes = HELPER_MAX_BYTES.saturating_sub(used_bytes);
    let literals = HELPER_MAX_LITERALS.saturating_sub(used_literals);
    let fits = |text: &String| text.len() <= bytes && count_lua_literals(text) < literals;
    let mut held = MAX_HOLDINGS_ITEMS;
    loop {
        let text = render_advice_capped(
            characters,
            holdings,
            MAX_ADVICE_ITEMS,
            MAX_DIGEST_ALTS,
            held,
        );
        if fits(&text) {
            return text;
        }
        if held == 0 {
            break;
        }
        held = held.saturating_sub(250);
    }
    let mut items = MAX_ADVICE_ITEMS;
    loop {
        let text = render_advice_capped(characters, holdings, items, MAX_DIGEST_ALTS, 0);
        if fits(&text) || items == 0 {
            if fits(&text) {
                return text;
            }
            break;
        }
        items = items.saturating_sub(50);
    }
    let mut alts = MAX_DIGEST_ALTS;
    while alts > 0 {
        alts /= 2;
        let text = render_advice_capped(characters, holdings, 0, alts, 0);
        if fits(&text) {
            return text;
        }
    }
    EMPTY_ADVICE_LUA.to_string()
}

fn clip(text: &str, max_bytes: usize) -> String {
    let mut end = text.len().min(max_bytes);
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    text[..end].to_string()
}

/// Only the fields the addon reads (D106), each within its limit.
fn clean_suggestion(item: &Value) -> Option<Value> {
    let mut out = serde_json::Map::new();
    for (field, limit) in SUGGESTION_TEXT {
        if let Some(text) = item[field].as_str().filter(|text| !text.trim().is_empty()) {
            out.insert(field.into(), Value::String(clip(text, limit)));
        }
    }
    if !(out.contains_key("id") && out.contains_key("title") && out.contains_key("goal")) {
        return None;
    }
    let rewards: Vec<Value> = item["rewards"]
        .as_array()
        .map(|list| list.as_slice())
        .unwrap_or_default()
        .iter()
        .filter_map(|token| token.as_str())
        .take(3)
        .map(|token| Value::String(clip(token, 120)))
        .collect();
    out.insert("rewards".into(), Value::Array(rewards));
    for field in ["mapID", "expiresAt"] {
        if let Some(number) = item[field].as_u64() {
            out.insert(field.into(), Value::from(number));
        }
    }
    let reason = &item["reason"];
    if let Some(kind) = reason["kind"].as_str() {
        let mut why = serde_json::Map::new();
        why.insert("kind".into(), Value::String(clip(kind, 20)));
        for field in ["at", "count", "mapID"] {
            if let Some(number) = reason[field].as_u64() {
                why.insert(field.into(), Value::from(number));
            }
        }
        if let Some(name) = reason["name"]
            .as_str()
            .filter(|name| !name.trim().is_empty())
        {
            why.insert("name".into(), Value::String(clip(name, 60)));
        }
        out.insert("reason".into(), Value::Object(why));
    }
    let chain = &item["chain"];
    if let Some(line) = chain["questLineID"].as_u64().filter(|id| *id > 0) {
        let mut info = serde_json::Map::new();
        info.insert("questLineID".into(), Value::from(line));
        for field in ["nextQuestID", "done", "total"] {
            if let Some(number) = chain[field].as_u64() {
                info.insert(field.into(), Value::from(number));
            }
        }
        out.insert("chain".into(), Value::Object(info));
    }
    let request = &item["request"];
    if let Some(wish) = request["wish"].as_str() {
        let mut ask = serde_json::Map::new();
        ask.insert("topic".into(), Value::String("suggestion".into()));
        ask.insert("suggestionId".into(), out["id"].clone());
        ask.insert("wish".into(), Value::String(clip(wish, 300)));
        out.insert("request".into(), Value::Object(ask));
    }
    Some(Value::Object(out))
}

fn render_suggestions_capped(body: &Value, per_character: usize) -> String {
    let mut out =
        String::from("-- Written by Unbored Companion. Bory's ideas, read at login or Refresh.\n");
    out.push_str("UnboredSuggestions = {\n");
    push_pair(&mut out, 1, "v", &Value::from(1));
    push_pair(
        &mut out,
        1,
        "computedAt",
        &Value::from(body["computedAt"].as_u64().unwrap_or(0)),
    );
    let mut characters = serde_json::Map::new();
    if let Some(map) = body["characters"].as_object() {
        for (key, list) in map {
            let items: Vec<Value> = list
                .as_array()
                .map(|list| list.as_slice())
                .unwrap_or_default()
                .iter()
                .filter_map(clean_suggestion)
                .take(per_character)
                .collect();
            if !items.is_empty() {
                characters.insert(clip(key, 120), Value::Array(items));
            }
        }
    }
    push_pair(&mut out, 1, "characters", &Value::Object(characters));
    out.push_str("}\n");
    out
}

/// Suggestions.lua from GET /v1/suggestions (D107), fewer per character until it fits.
pub fn render_suggestions_lua(body: &Value) -> String {
    let fits = |text: &String| {
        text.len() <= SUGGESTIONS_MAX_BYTES && count_lua_literals(text) <= SUGGESTIONS_MAX_LITERALS
    };
    for per_character in (1..=MAX_SUGGESTIONS).rev() {
        let text = render_suggestions_capped(body, per_character);
        if fits(&text) {
            return text;
        }
    }
    EMPTY_SUGGESTIONS_LUA.to_string()
}

/// Writes Suggestions.lua only when it changed. Returns true when it did.
pub fn install_suggestions(retail: &Path, body: &Value) -> Result<bool, PlanError> {
    let files = HelperFiles::open(retail)?;
    files.write("Suggestions.lua", &render_suggestions_lua(body))
}

/// Writes Advice.lua only when it changed. Returns true when it did.
pub fn install_advice(
    retail: &Path,
    characters: &Value,
    holdings: &Value,
) -> Result<bool, PlanError> {
    let files = HelperFiles::open(retail)?;
    let mut used = files.read_text("Plan.lua")?;
    used.push_str(&files.read_text("Suggestions.lua")?);
    let body = render_advice_within(characters, holdings, used.len(), count_lua_literals(&used));
    files.write("Advice.lua", &body)
}

/// Everything after this line in Plan.lua is the Companion's own status. The
/// plan part and the status part are written separately, so one never
/// overwrites the other.
const STATUS_MARK: &str = "-- Companion status, rewritten on every check.\n";

/// What the addon is told about the Companion, so Bory can say why a
/// Request is not back yet (docs/companion-api.md).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct CompanionStatus {
    /// pending, approved, or revoked; empty before the planner answered once.
    pub pairing: String,
    /// False when the last check could not reach the planner.
    pub online: bool,
    /// The addon version on disk, from Unbored.toc.
    pub addon_version: Option<String>,
    pub companion_version: String,
    /// Unix time, rounded down to SEEN_STEP, so the file changes rarely.
    pub seen_at: u64,
}

pub const SEEN_STEP: u64 = 300;

pub fn render_status_lua(status: &CompanionStatus) -> String {
    let mut out = String::from(STATUS_MARK);
    out.push_str("UnboredCompanionStatus = {\n");
    push_pair(&mut out, 1, "v", &Value::from(1));
    if !status.pairing.is_empty() {
        push_pair(
            &mut out,
            1,
            "pairing",
            &Value::String(status.pairing.clone()),
        );
    }
    push_pair(&mut out, 1, "online", &Value::Bool(status.online));
    if let Some(version) = &status.addon_version {
        push_pair(&mut out, 1, "addonVersion", &Value::String(version.clone()));
    }
    push_pair(
        &mut out,
        1,
        "companionVersion",
        &Value::String(status.companion_version.clone()),
    );
    push_pair(
        &mut out,
        1,
        "seenAt",
        &Value::from(status.seen_at - status.seen_at % SEEN_STEP),
    );
    out.push_str("}\n");
    out
}

fn split_status(text: &str) -> (&str, &str) {
    match text.find(STATUS_MARK) {
        Some(at) => (&text[..at], &text[at..]),
        None => (text, ""),
    }
}

/// Rewrites only the status part of Plan.lua. Returns true when it changed.
pub fn write_status(retail: &Path, status: &CompanionStatus) -> Result<bool, PlanError> {
    let files = HelperFiles::open(retail)?;
    let current = files.read_text("Plan.lua")?;
    let (plan, old) = split_status(&current);
    let fresh = render_status_lua(status);
    if old == fresh {
        return Ok(false);
    }
    let plan = if plan.trim().is_empty() {
        EMPTY_PLAN_LUA
    } else {
        plan
    };
    files.write("Plan.lua", &format!("{plan}{fresh}"))
}

fn helper_dir(retail: &Path) -> PathBuf {
    retail.join("Interface").join("AddOns").join("Unbored_Plan")
}

/// All helper writers in this process share one read/modify/replace lock.
/// No network or application-state lock is acquired while it is held.
struct HelperFiles {
    dir: PathBuf,
    _write_guard: MutexGuard<'static, ()>,
}

impl HelperFiles {
    fn open(retail: &Path) -> Result<Self, PlanError> {
        static WRITES: Mutex<()> = Mutex::new(());
        let guard = WRITES
            .lock()
            .map_err(|_| PlanError("Helper write interrupted.".into()))?;
        let dir = helper_dir(retail);
        fs::create_dir_all(&dir)
            .map_err(|err| PlanError(format!("Could not create the helper addon: {err}")))?;
        let files = Self {
            dir,
            _write_guard: guard,
        };
        files.write("Unbored_Plan.toc", HELPER_TOC)?;
        Ok(files)
    }

    fn read(&self, name: &str) -> Result<Option<Vec<u8>>, PlanError> {
        match fs::read(self.dir.join(name)) {
            Ok(bytes) => Ok(Some(bytes)),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(err) => Err(PlanError(format!("Could not read {name}: {err}"))),
        }
    }

    fn read_text(&self, name: &str) -> Result<String, PlanError> {
        String::from_utf8(self.read(name)?.unwrap_or_default())
            .map_err(|err| PlanError(format!("Could not read {name}: {err}")))
    }

    fn write(&self, name: &str, body: &str) -> Result<bool, PlanError> {
        if self.read(name)?.as_deref() == Some(body.as_bytes()) {
            return Ok(false);
        }
        self.replace(name, body)?;
        Ok(true)
    }

    fn replace(&self, name: &str, body: &str) -> Result<(), PlanError> {
        let tmp = self.dir.join(format!("{name}.tmp"));
        fs::write(&tmp, body).map_err(|err| PlanError(format!("Could not write {name}: {err}")))?;
        fs::rename(&tmp, self.dir.join(name))
            .map_err(|err| PlanError(format!("Could not replace {name}: {err}")))
    }

    fn ensure(&self) -> Result<(), PlanError> {
        for (name, body) in [
            ("Plan.lua", EMPTY_PLAN_LUA),
            ("Advice.lua", EMPTY_ADVICE_LUA),
            ("Suggestions.lua", EMPTY_SUGGESTIONS_LUA),
        ] {
            if self.read(name)?.is_none() {
                self.replace(name, body)?;
            }
        }
        Ok(())
    }
}

/// The game addon treats a loaded Unbored_Plan as "a companion is here", so
/// the helper exists from the first sync, even before any plan arrives.
pub fn ensure_helper(retail: &Path) -> Result<(), PlanError> {
    HelperFiles::open(retail)?.ensure()
}

/// Forget my data: empties the plan, advice and ideas the planner sent. The
/// status part of Plan.lua stays, so Bory still knows the Companion is here.
pub fn clear_helper(retail: &Path) -> Result<(), PlanError> {
    let files = HelperFiles::open(retail)?;
    // Erasure must work even if the old file cannot be decoded. Preserve the
    // status when readable, but never require personal data to be readable.
    let current = files.read_text("Plan.lua").unwrap_or_default();
    let (_, status) = split_status(&current);
    files.replace("Plan.lua", &format!("{EMPTY_PLAN_LUA}{status}"))?;
    for (name, empty) in [
        ("Advice.lua", EMPTY_ADVICE_LUA),
        ("Suggestions.lua", EMPTY_SUGGESTIONS_LUA),
    ] {
        files.replace(name, empty)?;
    }
    Ok(())
}

/// Leaves the file alone when the plan part is unchanged, so a running game is
/// not handed the same plan again and no second toast goes out.
fn write_plan_lua(retail: &Path, body: &str) -> Result<Written, PlanError> {
    let files = HelperFiles::open(retail)?;
    let lua_path = files.dir.join("Plan.lua");
    let current = files.read_text("Plan.lua")?;
    let (plan, status) = split_status(&current);
    if plan == body {
        return Ok(Written {
            path: lua_path,
            changed: false,
        });
    }
    files.write("Plan.lua", &format!("{body}{status}"))?;
    Ok(Written {
        path: lua_path,
        changed: true,
    })
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
    /// A Reason code (docs/adr/0013); Bory turns it into its own line.
    pub reason_code: Option<String>,
    pub plan_id: Option<u64>,
    pub plan: Option<Plan>,
    pub answer: Option<Value>,
    pub updated_at: Option<u64>,
    /// Seconds a plan usually takes (Server p50), for Bory's Refresh offer (D68).
    pub eta: Option<u64>,
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
        let answered =
            request.status == "fulfilled" && (request.plan.is_some() || request.answer.is_some());
        let newer_direct = match (&state.latest_plan, request.plan_id) {
            (Some((id, _)), Some(request_plan)) => *id > request_plan,
            (Some(_), None) => match (state.latest_plan_at, request.updated_at) {
                (Some(plan_at), Some(answered_at)) => plan_at > answered_at,
                _ => false,
            },
            _ => false,
        };
        if !answered || !newer_direct {
            let plan = if answered {
                request.plan.as_ref()
            } else {
                None
            };
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
        "-- Written by Unbored Companion. Read by Unbored_Plan at login or Refresh.\n",
    );
    out.push_str("-- Do not edit this by hand; the app replaces the file.\n");
    out.push_str("UnboredExternalPlan = {\n");
    push_pair(&mut out, 1, "v", &Value::from(plan.v));
    push_pair(&mut out, 1, "kind", &Value::String(plan.kind.clone()));
    push_pair(&mut out, 1, "mode", &Value::String(plan.mode.clone()));
    if let Some(minutes) = plan.budget {
        push_pair(&mut out, 1, "budget", &Value::from(minutes));
    }
    if let Some(at) = plan.generated_at {
        push_pair(&mut out, 1, "generatedAt", &Value::from(at));
    }
    if let Some(note) = &plan.note {
        push_pair(&mut out, 1, "note", &Value::String(note.clone()));
    }
    for (key, text) in [
        ("title", &plan.title),
        ("goal", &plan.goal),
        ("details", &plan.details),
    ] {
        if let Some(text) = text {
            push_pair(&mut out, 1, key, &Value::String(text.clone()));
        }
    }
    if let Some(rewards) = &plan.rewards {
        push_pair(&mut out, 1, "rewards", &Value::from(rewards.clone()));
    }
    if let Some(contains) = plan.contains.as_ref().filter(|value| value.is_object()) {
        push_pair(&mut out, 1, "contains", contains);
    }
    if let Some(request_id) = &plan.request_id {
        push_pair(&mut out, 1, "requestId", &Value::String(request_id.clone()));
    }
    if let Some(request_status) = &plan.request_status {
        push_pair(
            &mut out,
            1,
            "requestStatus",
            &Value::String(request_status.clone()),
        );
    }
    if let Some(request_reason) = &plan.request_reason {
        push_pair(
            &mut out,
            1,
            "requestReason",
            &Value::String(request_reason.clone()),
        );
    }
    for (key, value) in extras {
        push_pair(&mut out, 1, key, value);
    }
    if let Some(entities) = plan.entities.as_ref().filter(|value| value.is_object()) {
        push_pair(&mut out, 1, "entities", entities);
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
        if let Some(why) = &task.why {
            push_pair(&mut out, 3, "why", &Value::String(why.clone()));
        }
        if let Some(rewards) = &task.rewards {
            push_pair(&mut out, 3, "rewards", &Value::from(rewards.clone()));
        }
        if let Some(group) = &task.group {
            push_pair(&mut out, 3, "group", &Value::String(group.clone()));
        }
        if let Some(condition) = task.condition.as_ref().filter(|value| value.is_object()) {
            push_pair(&mut out, 3, "condition", condition);
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
    fn a_plan_without_a_budget_keeps_none() {
        let plan = plan_from_value(serde_json::json!({
            "v": 1,
            "kind": "plan",
            "tasks": [{ "id": "a", "title": "A", "estMinutes": 5 }]
        }))
        .unwrap();
        assert_eq!(plan.budget, None);
        assert!(!render_plan_lua(&plan).contains("budget"));
        let typed = plan_from_value(serde_json::json!({
            "v": 1, "kind": "plan", "budget": 45,
            "tasks": [{ "id": "a", "title": "A" }]
        }))
        .unwrap();
        assert!(render_plan_lua(&typed).contains("[\"budget\"] = 45"));
        let bad = plan_from_value(serde_json::json!({
            "v": 1, "kind": "plan", "budget": 300,
            "tasks": [{ "id": "a", "title": "A" }]
        }));
        assert!(bad.is_err());
    }

    #[test]
    fn writes_a_helper_addon_the_parser_can_read_back() {
        let mut plan = decode_unb1(SAMPLE).unwrap();
        plan.generated_at = Some(1_761_720_000);
        plan.tasks[1].title = "Ashes \"of\" Al'ar\nline".into();
        let root = std::env::temp_dir().join(format!("unbored-plan-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let retail = root.join("_retail_");
        fs::create_dir_all(&retail).unwrap();
        let path = install_plan(&retail, &plan).unwrap().path;
        assert!(path.ends_with("Plan.lua"));
        let toc = fs::read_to_string(retail.join("Interface/AddOns/Unbored_Plan/Unbored_Plan.toc"))
            .unwrap();
        assert!(toc.contains("120105, 120100"));
        let text = fs::read_to_string(&path).unwrap();
        let values = parse_saved_variables(&text).unwrap();
        let external = values.get("UnboredExternalPlan").unwrap();
        let tasks = crate::savedvars::table_get(external, "tasks").unwrap();
        let second = crate::savedvars::array_items(tasks)[1];
        assert_eq!(
            crate::savedvars::table_get(second, "title").and_then(|v| v.as_str()),
            Some("Ashes \"of\" Al'ar\nline")
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn keeps_link_tokens_and_npc_entities_from_the_markup_fixture() {
        const MARKUP: &str = include_str!("../../../../packages/contracts/fixtures/markup.json");
        let doc: Value = serde_json::from_str(MARKUP).unwrap();
        let plan = plan_from_value(doc["plan"].clone()).unwrap();
        let text = render_plan_lua(&plan);
        let values = parse_saved_variables(&text).unwrap();
        let external = values.get("UnboredExternalPlan").unwrap();
        let tasks = crate::savedvars::table_get(external, "tasks").unwrap();
        let first = crate::savedvars::array_items(tasks)[0];
        assert_eq!(
            crate::savedvars::table_get(first, "title").and_then(|v| v.as_str()),
            Some("Talk to {npc:12345}")
        );
        let npc = crate::savedvars::table_get(external, "entities")
            .and_then(|v| crate::savedvars::table_get(v, "npc"))
            .and_then(|v| crate::savedvars::table_get(v, "12345"))
            .unwrap();
        assert_eq!(
            crate::savedvars::table_get(npc, "name").and_then(|v| v.as_str()),
            Some("Fixer Kev")
        );
    }

    #[test]
    fn writes_personal_advice_the_parser_can_read_back() {
        let root = std::env::temp_dir().join(format!("unbored-advice-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let retail = root.join("_retail_");
        ensure_helper(&retail).unwrap();
        let dir = retail.join("Interface/AddOns/Unbored_Plan");
        assert!(fs::read_to_string(dir.join("Unbored_Plan.toc"))
            .unwrap()
            .contains("Advice.lua"));
        assert!(dir.join("Advice.lua").is_file());
        let advice = serde_json::json!([{
            "character": "Hero",
            "realm": "Area 52",
            "updatedAt": 1_761_720_000u64,
            "items": [
                { "itemID": 2447, "action": "send", "line": "Send to \"Mira\" (Alchemy): mail", "lineRu": "Отправь Мире", "to": "Mira", "extra": "x" },
                { "itemID": 0, "action": "keep", "line": "bad id" },
                { "itemID": 5, "action": "keep", "line": "  " }
            ]
        }]);
        assert!(install_advice(&retail, &advice, &Value::Null).unwrap());
        assert!(!install_advice(&retail, &advice, &Value::Null).unwrap());
        let text = fs::read_to_string(dir.join("Advice.lua")).unwrap();
        assert!(!text.contains("extra") && !text.contains("bad id"));
        let values = parse_saved_variables(&text).unwrap();
        let chars = crate::savedvars::table_get(values.get("UnboredAdvice").unwrap(), "characters")
            .unwrap();
        let mine = crate::savedvars::table_get(chars, "Area 52-Hero").unwrap();
        let items = crate::savedvars::table_get(mine, "items").unwrap();
        let entry = crate::savedvars::array_items(items);
        assert_eq!(entry.len(), 1);
        assert_eq!(
            crate::savedvars::table_get(entry[0], "line").and_then(|v| v.as_str()),
            Some("Send to \"Mira\" (Alchemy): mail")
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn writes_the_account_digest_of_alts() {
        let advice = serde_json::json!([{
            "character": "Hero",
            "realm": "Area 52",
            "items": [],
            "alts": [{
                "name": "Mira", "realm": "Area 52", "faction": "Horde", "seenAt": 5u64,
                "professions": [{ "skillLine": 171, "name": "Alchemy", "skill": 75 }, { "name": "no id" }]
            }, { "realm": "no name" }]
        }]);
        let text = render_advice_lua(&advice, &Value::Null);
        let values = parse_saved_variables(&text).unwrap();
        let chars = crate::savedvars::table_get(values.get("UnboredAdvice").unwrap(), "characters")
            .unwrap();
        let mine = crate::savedvars::table_get(chars, "Area 52-Hero").unwrap();
        let alts =
            crate::savedvars::array_items(crate::savedvars::table_get(mine, "alts").unwrap());
        assert_eq!(alts.len(), 1);
        assert_eq!(
            crate::savedvars::table_get(alts[0], "faction").and_then(|v| v.as_str()),
            Some("Horde")
        );
        let professions = crate::savedvars::array_items(
            crate::savedvars::table_get(alts[0], "professions").unwrap(),
        );
        assert_eq!(professions.len(), 1);
        assert!(!text.contains("no id") && !text.contains("no name"));
    }

    #[test]
    fn keeps_advice_and_the_plan_within_the_helper_budget() {
        let items: Vec<Value> = (1..=500u64)
            .map(|id| {
                serde_json::json!({
                    "itemID": id, "action": "send",
                    "line": "x".repeat(120), "lineRu": "я".repeat(120), "to": "Mira"
                })
            })
            .collect();
        let characters: Vec<Value> = (0..12)
            .map(|n| serde_json::json!({ "character": format!("Hero{n}"), "realm": "Area 52", "items": items }))
            .collect();
        let advice = Value::Array(characters);
        let full = render_advice_lua(&advice, &Value::Null);
        assert!(full.len() > HELPER_MAX_BYTES);
        let plan_bytes = 40 * 1024;
        let plan_literals = 2_000;
        let text = render_advice_within(&advice, &Value::Null, plan_bytes, plan_literals);
        assert!(text.len() + plan_bytes <= HELPER_MAX_BYTES);
        assert!(count_lua_literals(&text) + plan_literals < HELPER_MAX_LITERALS);
        assert!(text.contains("[\"Area 52-Hero11\"]"));
        assert!(parse_saved_variables(&text).is_ok());
    }

    #[test]
    fn writes_the_holdings_index() {
        let advice = serde_json::json!([{ "character": "Hero", "realm": "Area 52", "items": [] }]);
        let holdings = serde_json::json!({
            "places": ["Grubbyman-Area 52", "Hero-Area 52", "warband"],
            "items": { "2447": "1:40,w:200", "12": "9:1", "13": "1:x", "0": "1:1", "14": "2:3" }
        });
        let text = render_advice_lua(&advice, &holdings);
        let values = parse_saved_variables(&text).unwrap();
        let held =
            crate::savedvars::table_get(values.get("UnboredAdvice").unwrap(), "holdings").unwrap();
        let places =
            crate::savedvars::array_items(crate::savedvars::table_get(held, "places").unwrap());
        assert_eq!(places.len(), 3);
        assert_eq!(places[2].as_str(), Some("warband"));
        assert!(text.contains("[2447] = \"1:40,w:200\""));
        assert!(text.contains("[14] = \"2:3\""));
        assert!(!text.contains("[12]") && !text.contains("[13]") && !text.contains("[0]"));
        assert!(!render_advice_lua(&advice, &Value::Null).contains("holdings"));
    }

    #[test]
    fn keeps_advice_with_holdings_within_the_helper_budget() {
        let advice = serde_json::json!([{ "character": "Hero", "realm": "Area 52", "items": [] }]);
        let mut items = serde_json::Map::new();
        for id in 1..=3000u64 {
            let value = if id % 2 == 0 { "1:40,2:3,w:200" } else { "1:1" };
            items.insert(id.to_string(), Value::String(value.into()));
        }
        let holdings = serde_json::json!({ "places": ["A-R", "B-R", "warband"], "items": items });
        let full = render_advice_lua(&advice, &holdings);
        assert!(
            full.len() > 60 * 1024,
            "the full index is big: {}",
            full.len()
        );
        let used = HELPER_MAX_BYTES - 40 * 1024;
        let text = render_advice_within(&advice, &holdings, used, 2_000);
        assert!(text.len() + used <= HELPER_MAX_BYTES);
        assert!(count_lua_literals(&text) + 2_000 < HELPER_MAX_LITERALS);
        assert!(
            text.contains("[2] = \"1:40,2:3,w:200\""),
            "items in most places stay"
        );
        assert!(
            !text.contains("[2999] = \"1:1\""),
            "items in one place go first"
        );
        assert!(parse_saved_variables(&text).is_ok());
    }

    #[test]
    fn counts_string_and_number_literals() {
        assert_eq!(
            count_lua_literals("-- 12 \"x\"\nT = { [\"a\"] = 12, b2 = \"q\\\"z\" }\n"),
            3
        );
    }

    #[test]
    fn writes_the_ideas_the_addon_reads_within_budget() {
        const IDEAS: &str =
            include_str!("../../../../packages/contracts/fixtures/suggestions.json");
        const IDEAS_LUA: &str =
            include_str!("../../../../packages/contracts/fixtures/suggestions.lua");
        let body: Value = serde_json::from_str(IDEAS).unwrap();
        let lua = render_suggestions_lua(&body);
        if std::env::var_os("UNBORED_WRITE_FIXTURES").is_some() {
            fs::write(
                concat!(
                    env!("CARGO_MANIFEST_DIR"),
                    "/../../../packages/contracts/fixtures/suggestions.lua"
                ),
                &lua,
            )
            .unwrap();
            return;
        }
        assert_eq!(
            lua, IDEAS_LUA,
            "suggestions.lua is what the Companion writes"
        );
        let values = parse_saved_variables(&lua).unwrap();
        let get = crate::savedvars::table_get;
        let chars = get(values.get("UnboredSuggestions").unwrap(), "characters").unwrap();
        let list = crate::savedvars::array_items(get(chars, "Silvermoon-Mira").unwrap());
        assert_eq!(list.len(), 6);
        assert_eq!(get(list[0], "kind").and_then(|v| v.as_str()), Some("event"));
        let chain = list
            .iter()
            .find(|item| get(item, "kind").and_then(|v| v.as_str()) == Some("chain"))
            .expect("the chain idea is written");
        assert_eq!(
            get(get(chain, "chain").unwrap(), "questLineID").and_then(|v| v.as_u64()),
            Some(5678)
        );

        let many: serde_json::Map<String, Value> = (0..200)
            .map(|n| {
                (
                    format!("Realm-Char{n}"),
                    body["characters"]["Silvermoon-Mira"].clone(),
                )
            })
            .collect();
        let big = serde_json::json!({ "v": 1, "computedAt": 1, "characters": many });
        let text = render_suggestions_lua(&big);
        assert!(text.len() <= SUGGESTIONS_MAX_BYTES);
        assert!(count_lua_literals(&text) <= SUGGESTIONS_MAX_LITERALS);
        assert!(parse_saved_variables(&text).is_ok());
    }

    #[test]
    fn an_unchanged_ideas_file_is_not_rewritten() {
        let root = std::env::temp_dir().join(format!("unbored-ideas-test-{}", std::process::id()));
        let retail = root.join("_retail_");
        ensure_helper(&retail).unwrap();
        let dir = retail.join("Interface").join("AddOns").join("Unbored_Plan");
        assert!(fs::read_to_string(dir.join("Unbored_Plan.toc"))
            .unwrap()
            .contains("Suggestions.lua"));
        assert!(dir.join("Suggestions.lua").is_file());
        let body: Value = serde_json::from_str(include_str!(
            "../../../../packages/contracts/fixtures/suggestions.json"
        ))
        .unwrap();
        assert!(install_suggestions(&retail, &body).unwrap());
        assert!(!install_suggestions(&retail, &body).unwrap());
        let empty = serde_json::json!({ "v": 1, "computedAt": 0, "characters": {} });
        assert!(install_suggestions(&retail, &empty).unwrap());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn writes_the_card_fields_the_addon_reads() {
        const CARD: &str = include_str!("../../../../packages/contracts/fixtures/plan-card.json");
        const CARD_LUA: &str =
            include_str!("../../../../packages/contracts/fixtures/plan-card.lua");
        let plan = plan_from_value(serde_json::from_str(CARD).unwrap()).unwrap();
        let lua = render_plan_lua(&plan);
        if std::env::var_os("UNBORED_WRITE_FIXTURES").is_some() {
            fs::write(
                concat!(
                    env!("CARGO_MANIFEST_DIR"),
                    "/../../../packages/contracts/fixtures/plan-card.lua"
                ),
                &lua,
            )
            .unwrap();
            return;
        }
        assert_eq!(lua, CARD_LUA, "plan-card.lua is what the Companion writes");
        let values = parse_saved_variables(&lua).unwrap();
        let root = values.get("UnboredExternalPlan").unwrap();
        let get = crate::savedvars::table_get;
        assert_eq!(
            get(root, "title").and_then(|v| v.as_str()),
            Some("Ashes in one evening")
        );
        assert_eq!(
            crate::savedvars::array_items(get(root, "rewards").unwrap()).len(),
            2
        );
        let tasks = crate::savedvars::array_items(get(root, "tasks").unwrap());
        assert!(get(tasks[0], "why").is_some() && get(tasks[0], "rewards").is_some());
        let check = get(get(tasks[1], "condition").unwrap(), "check").unwrap();
        assert_eq!(get(check, "kind").and_then(|v| v.as_str()), Some("level"));

        const OLD: &str = include_str!("../../../../packages/contracts/fixtures/plan.json");
        let old = render_plan_lua(&plan_from_value(serde_json::from_str(OLD).unwrap()).unwrap());
        assert!(!old.contains("\n  [\"title\"]") && !old.contains("[\"rewards\"]"));
    }

    #[test]
    fn writes_reward_contents_and_step_groups() {
        const GROUP: &str = include_str!("../../../../packages/contracts/fixtures/plan-group.json");
        const GROUP_LUA: &str =
            include_str!("../../../../packages/contracts/fixtures/plan-group.lua");
        let plan = plan_from_value(serde_json::from_str(GROUP).unwrap()).unwrap();
        let lua = render_plan_lua(&plan);
        if std::env::var_os("UNBORED_WRITE_FIXTURES").is_some() {
            fs::write(
                concat!(
                    env!("CARGO_MANIFEST_DIR"),
                    "/../../../packages/contracts/fixtures/plan-group.lua"
                ),
                &lua,
            )
            .unwrap();
            return;
        }
        assert_eq!(
            lua, GROUP_LUA,
            "plan-group.lua is what the Companion writes"
        );
        let values = parse_saved_variables(&lua).unwrap();
        let root = values.get("UnboredExternalPlan").unwrap();
        let get = crate::savedvars::table_get;
        let contains = get(root, "contains").unwrap();
        let cage = get(contains, "{item:128025|Rattling Iron Cage}").unwrap();
        assert_eq!(crate::savedvars::array_items(cage).len(), 3);
        let tasks = crate::savedvars::array_items(get(root, "tasks").unwrap());
        assert!(get(tasks[0], "group").is_none());
        assert_eq!(
            get(tasks[1], "group").and_then(|v| v.as_str()),
            Some("rares")
        );
        assert_eq!(
            get(tasks[3], "group").and_then(|v| v.as_str()),
            Some("rares")
        );
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
            crate::savedvars::table_get(values.get("UnboredExternalPlan").unwrap(), "tasks")
                .unwrap(),
        )[0];
        let points =
            crate::savedvars::array_items(crate::savedvars::table_get(task, "waypoints").unwrap());
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
        let many: Vec<_> = (0..11)
            .map(|_| serde_json::json!({ "mapID": 1, "x": 0.1, "y": 0.1 }))
            .collect();
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
        assert_eq!(
            table_get(external, "requestType").and_then(|v| v.as_str()),
            Some("question")
        );
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
    fn a_pending_request_carries_the_eta_clamped() {
        let mut pending = request("pending", None, None);
        pending.eta = Some(5000);
        let file = render_request_lua(&pending, "pending", None);
        let values = parse_saved_variables(&file).unwrap();
        let external = values.get("UnboredExternalPlan").unwrap();
        use crate::savedvars::table_get;
        assert_eq!(
            table_get(external, "eta").and_then(|v| v.as_u64()),
            Some(900)
        );
        assert_eq!(
            table_get(external, "requestId").and_then(|v| v.as_str()),
            Some("req-1")
        );
        let failed = render_request_lua(&pending, "failed", None);
        assert!(!failed.contains("eta"));
    }

    #[test]
    fn picks_between_the_request_and_a_direct_plan() {
        assert!(pick_plan_file(&PlannerState::default()).is_none());
        let direct = PlannerState {
            latest_plan: Some((3, small_plan("direct"))),
            ..Default::default()
        };
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
    fn unreadable_plan_is_not_replaced_by_a_status_or_plan_update() {
        let root = std::env::temp_dir().join(format!("unbored-unreadable-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        ensure_helper(&root).unwrap();
        let path = helper_dir(&root).join("Plan.lua");
        let bytes = b"UnboredExternalPlan = {}\n\xff";
        fs::write(&path, bytes).unwrap();
        assert!(write_status(&root, &CompanionStatus::default()).is_err());
        assert_eq!(fs::read(&path).unwrap(), bytes);
        assert!(install_plan(&root, &small_plan("new")).is_err());
        assert_eq!(fs::read(&path).unwrap(), bytes);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn advice_keeps_its_old_file_when_the_budget_inputs_cannot_be_read() {
        let root = std::env::temp_dir().join(format!("unbored-budget-read-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        ensure_helper(&root).unwrap();
        let dir = helper_dir(&root);
        let advice = b"-- existing advice\nUnboredAdvice = { v = 1 }\n";
        fs::write(dir.join("Advice.lua"), advice).unwrap();
        for name in ["Plan.lua", "Suggestions.lua"] {
            let path = dir.join(name);
            let previous = fs::read(&path).unwrap();
            fs::write(&path, [0xff]).unwrap();
            assert!(install_advice(&root, &Value::Null, &Value::Null).is_err());
            assert_eq!(fs::read(dir.join("Advice.lua")).unwrap(), advice);
            fs::write(path, previous).unwrap();
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn erasure_does_not_require_decodable_personal_data() {
        let root =
            std::env::temp_dir().join(format!("unbored-clear-corrupt-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        ensure_helper(&root).unwrap();
        for name in ["Plan.lua", "Advice.lua", "Suggestions.lua"] {
            fs::write(helper_dir(&root).join(name), b"private data\xff").unwrap();
        }
        clear_helper(&root).unwrap();
        for name in ["Plan.lua", "Advice.lua", "Suggestions.lua"] {
            let text = fs::read_to_string(helper_dir(&root).join(name)).unwrap();
            assert!(!text.contains("private data"));
            assert!(parse_saved_variables(&text).unwrap().is_empty());
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn failed_replacement_keeps_the_previous_plan_and_status() {
        let root =
            std::env::temp_dir().join(format!("unbored-write-failure-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        install_plan(&root, &small_plan("old")).unwrap();
        write_status(&root, &CompanionStatus::default()).unwrap();
        let dir = helper_dir(&root);
        let old = fs::read(dir.join("Plan.lua")).unwrap();
        // Simulate a filesystem that refuses the staging write, without
        // platform-specific permissions or running the test as another user.
        fs::create_dir(dir.join("Plan.lua.tmp")).unwrap();
        assert!(install_plan(&root, &small_plan("new")).is_err());
        assert_eq!(fs::read(dir.join("Plan.lua")).unwrap(), old);
        fs::remove_dir(dir.join("Plan.lua.tmp")).unwrap();
        install_plan(&root, &small_plan("new")).unwrap();
        let text = fs::read_to_string(dir.join("Plan.lua")).unwrap();
        assert!(text.contains("\"new\"") && text.contains(STATUS_MARK));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn simultaneous_plan_and_status_updates_preserve_both_parts() {
        let root = std::env::temp_dir().join(format!("unbored-concurrent-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        ensure_helper(&root).unwrap();
        for n in 1..=50 {
            let barrier = std::sync::Barrier::new(2);
            std::thread::scope(|scope| {
                let plans = scope.spawn(|| {
                    barrier.wait();
                    install_plan(&root, &small_plan(&format!("plan-{n}")))
                });
                let statuses = scope.spawn(|| {
                    barrier.wait();
                    write_status(
                        &root,
                        &CompanionStatus {
                            seen_at: n * SEEN_STEP,
                            ..Default::default()
                        },
                    )
                });
                plans.join().unwrap().unwrap();
                statuses.join().unwrap().unwrap();
            });
            let text = fs::read_to_string(helper_dir(&root).join("Plan.lua")).unwrap();
            let values = parse_saved_variables(&text).unwrap();
            assert!(text.contains(&format!("\"plan-{n}\"")), "new Plan was lost");
            assert_eq!(
                crate::savedvars::table_get(
                    values
                        .get("UnboredCompanionStatus")
                        .expect("status was lost"),
                    "seenAt"
                )
                .and_then(|v| v.as_u64()),
                Some(n * SEEN_STEP)
            );
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn keeps_the_status_and_the_plan_apart() {
        let root = std::env::temp_dir().join(format!("unbored-plan-status-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let retail = root.join("_retail_");
        fs::create_dir_all(&retail).unwrap();
        let lua = retail.join("Interface/AddOns/Unbored_Plan/Plan.lua");
        let mut status = CompanionStatus {
            pairing: "pending".into(),
            online: true,
            addon_version: Some("0.5.0".into()),
            companion_version: "0.5.0".into(),
            seen_at: 1_000_123,
        };
        assert!(write_status(&retail, &status).unwrap());
        assert!(
            !write_status(&retail, &status).unwrap(),
            "the same status is not written again"
        );
        status.seen_at += 10;
        assert!(
            !write_status(&retail, &status).unwrap(),
            "seenAt is rounded, so it rarely changes"
        );
        let values = parse_saved_variables(&fs::read_to_string(&lua).unwrap()).unwrap();
        let shown = values.get("UnboredCompanionStatus").unwrap();
        use crate::savedvars::table_get;
        assert_eq!(
            table_get(shown, "pairing").and_then(|v| v.as_str()),
            Some("pending")
        );
        assert_eq!(
            table_get(shown, "addonVersion").and_then(|v| v.as_str()),
            Some("0.5.0")
        );
        assert_eq!(
            table_get(shown, "seenAt").and_then(|v| v.as_u64()),
            Some(1_000_123 - 1_000_123 % 300)
        );
        assert!(!values.contains_key("UnboredExternalPlan"));

        let plan = small_plan("with-status");
        assert!(install_plan(&retail, &plan).unwrap().changed);
        assert!(
            !install_plan(&retail, &plan).unwrap().changed,
            "the status does not count as a plan change"
        );
        let text = fs::read_to_string(&lua).unwrap();
        let values = parse_saved_variables(&text).unwrap();
        assert!(
            values.contains_key("UnboredExternalPlan")
                && values.contains_key("UnboredCompanionStatus")
        );

        status.pairing = "approved".into();
        status.online = false;
        assert!(write_status(&retail, &status).unwrap());
        let text = fs::read_to_string(&lua).unwrap();
        assert!(
            text.contains("with-status")
                && text.contains("\"approved\"")
                && !text.contains("\"pending\"")
        );
        assert_eq!(text.matches("UnboredCompanionStatus").count(), 1);
        let _ = fs::remove_dir_all(&root);
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
        assert!(parse_saved_variables(&fs::read_to_string(&lua).unwrap())
            .unwrap()
            .is_empty());
        let plan = small_plan("a");
        assert!(install_plan(&retail, &plan).unwrap().changed);
        assert!(!install_plan(&retail, &plan).unwrap().changed);
        ensure_helper(&retail).unwrap();
        assert!(fs::read_to_string(&lua).unwrap().contains("\"a\""));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn clearing_the_helper_keeps_only_the_status() {
        let root = std::env::temp_dir().join(format!("unbored-plan-clear-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let retail = root.join("_retail_");
        fs::create_dir_all(&retail).unwrap();
        let dir = retail.join("Interface/AddOns/Unbored_Plan");
        install_plan(&retail, &small_plan("gone")).unwrap();
        let status = CompanionStatus {
            pairing: "revoked".into(),
            companion_version: "0.9.0".into(),
            seen_at: 1_000,
            ..Default::default()
        };
        write_status(&retail, &status).unwrap();
        fs::write(dir.join("Advice.lua"), "UnboredAdvice = { v = 1 }\n").unwrap();
        fs::write(
            dir.join("Suggestions.lua"),
            "UnboredSuggestions = { v = 1 }\n",
        )
        .unwrap();

        clear_helper(&retail).unwrap();
        let plan = fs::read_to_string(dir.join("Plan.lua")).unwrap();
        let values = parse_saved_variables(&plan).unwrap();
        assert!(!values.contains_key("UnboredExternalPlan"));
        assert!(values.contains_key("UnboredCompanionStatus"));
        assert_eq!(
            fs::read_to_string(dir.join("Advice.lua")).unwrap(),
            EMPTY_ADVICE_LUA
        );
        assert_eq!(
            fs::read_to_string(dir.join("Suggestions.lua")).unwrap(),
            EMPTY_SUGGESTIONS_LUA
        );
        let _ = fs::remove_dir_all(&root);
    }
}
