//! Tray window. Talks to WoW only through files.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::sync::{Condvar, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};

use serde::{Deserialize, Serialize};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::addon::{install_addon_zip, installed_version, select_addon_zip, should_update};
use crate::device::{self, DeviceCredential};
use crate::endpoint::{join_url, progress_payload, validate_endpoint, DEFAULT_PLANNER_URL};
use crate::mood::{self, MoodInput, MASCOT_NAME};
use crate::plan::{
    decode_unb1, ensure_helper, install_advice, install_plan, install_plan_file, pick_plan_file,
    plan_from_value, render_request_lua, write_status, CompanionStatus, Plan, PlanFile,
    PlannerState, RequestState,
};
use crate::request::{reason, request_body, request_status_path, waited_request};
use crate::savedvars::{profile_from_saved_variables, request_from_saved_variables};
use crate::snapshot::{
    build_upload, character_identity, data_from_saved_variables, gzip, DataFile,
    MAX_COMPRESSED_BYTES,
};
use crate::wow::{
    account_saved_variables, character_saved_variables, detect_installs, list_accounts,
    read_progress, retail_dir, CharacterFile,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    wow_path: String,
    account: String,
    endpoint_url: String,
    poll_minutes: u32,
    /// Launch at login is turned on once, on the first run; after that the
    /// player's choice in the window stands.
    #[serde(default)]
    autostart_set: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            wow_path: String::new(),
            account: String::new(),
            endpoint_url: String::new(),
            poll_minutes: 5,
            autostart_set: false,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressView {
    account: String,
    realm: String,
    character: String,
    mode: String,
    source: String,
    current_id: String,
    done: usize,
    skipped: usize,
    remaining: Vec<String>,
}

struct Model {
    settings: Settings,
    status: String,
    installs: Vec<String>,
    accounts: Vec<String>,
    progress: Vec<ProgressView>,
    /// Last progress body posted for each SavedVariables path.
    posted: HashMap<String, String>,
    approved: bool,
    needs_wow_path: bool,
    addon_version: String,
    pairing: String,
    busy: Option<String>,
    error: bool,
    ready: Option<(String, u64)>,
    request_pending: bool,
    connected_at: Option<u64>,
    addon_updated_at: Option<u64>,
    machine: String,
}

impl Model {
    fn mood(&self) -> mood::Mood {
        mood::current(&MoodInput {
            busy: self.busy.clone(),
            pairing: self.pairing.clone(),
            needs_wow_path: self.needs_wow_path,
            error: self.error,
            ready: self.ready.clone(),
            request_pending: self.request_pending,
            connected_at: self.connected_at,
            addon_updated_at: self.addon_updated_at,
            machine: self.machine.clone(),
            now: now_secs(),
        })
    }
}

struct AppState {
    inner: Mutex<Model>,
    /// Kept alive so the SavedVariables watch does not stop.
    watcher: Mutex<Option<RecommendedWatcher>>,
    device: Mutex<DeviceCredential>,
    /// Set when the game saved, so the next check runs at once.
    wake: (Mutex<bool>, Condvar),
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|err| err.to_string())?;
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    Ok(dir.join("settings.json"))
}

fn load_settings(app: &AppHandle) -> Settings {
    let Ok(path) = settings_path(app) else {
        return Settings::default();
    };
    let Ok(text) = fs::read_to_string(path) else {
        return Settings::default();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

fn save_settings(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = settings_path(app)?;
    let text = serde_json::to_string_pretty(settings).map_err(|err| err.to_string())?;
    fs::write(path, text).map_err(|err| err.to_string())
}

fn retail_path(settings: &Settings) -> Option<PathBuf> {
    if settings.wow_path.is_empty() {
        None
    } else {
        Some(PathBuf::from(&settings.wow_path))
    }
}

fn scan_progress(settings: &Settings) -> Vec<ProgressView> {
    let Some(retail) = retail_path(settings) else {
        return Vec::new();
    };
    let account = if settings.account.is_empty() {
        None
    } else {
        Some(settings.account.as_str())
    };
    let mut views = Vec::new();
    for file in character_saved_variables(&retail, account) {
        if let Ok(Some(progress)) = read_progress(&file) {
            views.push(ProgressView {
                account: file.account,
                realm: file.realm,
                character: file.character,
                mode: progress.mode.unwrap_or_default(),
                source: progress.source.unwrap_or_default(),
                current_id: progress.current_id.unwrap_or_default(),
                done: progress.done.len(),
                skipped: progress.skipped.len(),
                remaining: progress.remaining,
            });
        }
    }
    views
}

fn effective_url(settings: &Settings) -> String {
    let trimmed = settings.endpoint_url.trim();
    if trimmed.is_empty() {
        DEFAULT_PLANNER_URL.to_string()
    } else {
        trimmed.to_string()
    }
}

fn post_progress(
    settings: &Settings,
    files: &[CharacterFile],
    posted: &mut HashMap<String, String>,
    bearer: &str,
) -> Result<usize, String> {
    let url = effective_url(settings);
    validate_endpoint(&url)?;
    let client = http_client(Duration::from_secs(20))?;
    let mut sent = 0;
    for file in files {
        let Some(progress) = read_progress(file)? else {
            continue;
        };
        let body = progress_payload(file, &progress);
        let key = file.path.display().to_string();
        let fingerprint = serde_json::to_string(&body).unwrap_or_default();
        if posted.get(&key).is_some_and(|have| have == &fingerprint) {
            continue;
        }
        let response = client
            .post(join_url(&url, "v1/progress"))
            .bearer_auth(bearer)
            .json(&body)
            .send()
            .map_err(|err| err.to_string())?;
        if !response.status().is_success() {
            return Err(format!(
                "Planner returned {} for {}.",
                response.status(),
                file.character
            ));
        }
        posted.insert(key, fingerprint);
        sent += 1;
    }
    Ok(sent)
}

fn http_client(timeout: Duration) -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(timeout)
        .user_agent("unbored-companion")
        .build()
        .map_err(|err| err.to_string())
}

fn run_scan(model: &mut Model, bearer: Option<&str>) -> Result<usize, String> {
    let settings = model.settings.clone();
    let account = if settings.account.is_empty() {
        None
    } else {
        Some(settings.account.as_str())
    };
    let files = retail_path(&settings)
        .map(|retail| character_saved_variables(&retail, account))
        .unwrap_or_default();
    model.progress = scan_progress(&settings);
    if let Some(bearer) = bearer {
        post_progress(&settings, &files, &mut model.posted, bearer)
    } else {
        Ok(0)
    }
}

fn scan_status(posting: bool, progress_len: usize, result: Result<usize, String>) -> String {
    match result {
        Err(err) => err,
        Ok(sent) if sent > 0 => format!("Progress sent for {sent} character file(s)."),
        Ok(_) if progress_len == 0 => {
            "Nothing from the game yet. Log in once and pick a plan with Wisp.".into()
        }
        Ok(_) if posting => "Progress is already on the planner.".into(),
        Ok(_) => "Progress read from SavedVariables.".into(),
    }
}

fn write_plan(settings: &Settings, plan: &mut Plan) -> Result<String, String> {
    let Some(retail) = retail_path(settings) else {
        return Err("Pick the Retail folder first.".into());
    };
    if plan.generated_at.is_none() {
        plan.generated_at = Some(now_secs());
    }
    let written = install_plan(&retail, plan).map_err(|err| err.0)?;
    Ok(format!(
        "Wrote {}. Wisp picks it up next time you log in, or click Refresh in Wisp's bubble.",
        written.path.display()
    ))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UiState {
    settings: Settings,
    installs: Vec<String>,
    accounts: Vec<String>,
    progress: Vec<ProgressView>,
    status: String,
    autostart: bool,
    needs_wow_path: bool,
    addon_version: String,
    pairing: String,
    planner_url: String,
    phase: String,
    headline: String,
    hint: String,
    steps: Vec<SetupStep>,
    mascot: String,
    version: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SetupStep {
    label: String,
    done: bool,
}

/// The three things a first run needs, in order, so the window can show
/// what is done and what it is waiting for.
fn setup_steps(model: &Model) -> Vec<SetupStep> {
    let addon = retail_path(&model.settings).and_then(|retail| installed_version(&retail));
    vec![
        SetupStep {
            label: "World of Warcraft found".into(),
            done: !model.needs_wow_path,
        },
        SetupStep {
            label: match &addon {
                Some(version) => format!("Wisp is in the game (addon {version})"),
                None => "Putting Wisp into the game".into(),
            },
            done: addon.is_some(),
        },
        SetupStep {
            label: match model.pairing.as_str() {
                "approved" => "This PC is approved".into(),
                "revoked" => "This PC was disconnected".into(),
                _ => "Waiting for a one-time OK for this PC".into(),
            },
            done: model.approved,
        },
    ]
}

fn snapshot(app: &AppHandle, model: &Model) -> UiState {
    let autostart = refresh_autostart(app);
    let mood = model.mood();
    UiState {
        settings: model.settings.clone(),
        installs: model.installs.clone(),
        accounts: model.accounts.clone(),
        progress: model.progress.clone(),
        status: model.status.clone(),
        autostart,
        needs_wow_path: model.needs_wow_path,
        addon_version: model.addon_version.clone(),
        pairing: model.pairing.clone(),
        planner_url: effective_url(&model.settings),
        phase: mood.phase.to_string(),
        headline: mood.headline,
        hint: mood.hint,
        steps: setup_steps(model),
        mascot: MASCOT_NAME.to_string(),
        version: app.package_info().version.to_string(),
    }
}

fn refresh_autostart(app: &AppHandle) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn get_state(app: AppHandle, state: State<AppState>) -> Result<UiState, String> {
    let model = state.inner.lock().map_err(|err| err.to_string())?;
    Ok(snapshot(&app, &model))
}

#[tauri::command]
fn detect_wow(app: AppHandle, state: State<AppState>) -> Result<UiState, String> {
    let found = detect_installs();
    let mut model = state.inner.lock().map_err(|err| err.to_string())?;
    model.installs = found.iter().map(|p| p.display().to_string()).collect();
    if model.settings.wow_path.is_empty() {
        if let Some(first) = model.installs.first() {
            model.settings.wow_path = first.clone();
        }
    }
    let retail = PathBuf::from(&model.settings.wow_path);
    model.accounts = list_accounts(&retail);
    model.progress = scan_progress(&model.settings);
    model.needs_wow_path = model.settings.wow_path.trim().is_empty();
    if model.installs.is_empty() {
        model.needs_wow_path = true;
    }
    let path = model.settings.wow_path.clone();
    let _ = save_settings(&app, &model.settings);
    drop(model);
    arm_watch(&app, &path);
    let model = state.inner.lock().map_err(|err| err.to_string())?;
    Ok(snapshot(&app, &model))
}

#[tauri::command]
fn set_wow_path(app: AppHandle, state: State<AppState>, path: String) -> Result<UiState, String> {
    let mut model = state.inner.lock().map_err(|err| err.to_string())?;
    let chosen = path.trim();
    model.settings.wow_path = retail_dir(Path::new(chosen))
        .map(|dir| dir.display().to_string())
        .unwrap_or_default();
    let retail = PathBuf::from(&model.settings.wow_path);
    model.accounts = list_accounts(&retail);
    model.progress = scan_progress(&model.settings);
    model.needs_wow_path = model.settings.wow_path.is_empty();
    model.status = if !model.needs_wow_path {
        "Found it. Setting up the addon...".into()
    } else if chosen.is_empty() {
        "Pick your World of Warcraft folder.".into()
    } else {
        "I can't find World of Warcraft in that folder. Pick the one that has Wow.exe in it.".into()
    };
    let path = model.settings.wow_path.clone();
    let _ = save_settings(&app, &model.settings);
    drop(model);
    arm_watch(&app, &path);
    let model = state.inner.lock().map_err(|err| err.to_string())?;
    Ok(snapshot(&app, &model))
}

#[tauri::command]
fn set_account(app: AppHandle, state: State<AppState>, account: String) -> Result<UiState, String> {
    let mut model = state.inner.lock().map_err(|err| err.to_string())?;
    model.settings.account = account;
    model.progress = scan_progress(&model.settings);
    let _ = save_settings(&app, &model.settings);
    Ok(snapshot(&app, &model))
}

#[tauri::command]
fn set_endpoint(
    app: AppHandle,
    state: State<AppState>,
    url: String,
    poll_minutes: u32,
) -> Result<UiState, String> {
    let url = url.trim().to_string();
    validate_endpoint(&url)?;
    let mut model = state.inner.lock().map_err(|err| err.to_string())?;
    model.settings.endpoint_url = url;
    model.settings.poll_minutes = poll_minutes.min(240);
    model.posted.clear();
    model.status = "Planner address saved.".into();
    let _ = save_settings(&app, &model.settings);
    Ok(snapshot(&app, &model))
}

#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    if enabled {
        app.autolaunch().enable().map_err(|err| err.to_string())?;
    } else {
        app.autolaunch().disable().map_err(|err| err.to_string())?;
    }
    Ok(refresh_autostart(&app))
}

#[tauri::command]
fn write_plan_text(
    app: AppHandle,
    state: State<AppState>,
    text: String,
) -> Result<UiState, String> {
    let mut plan = decode_unb1(&text).map_err(|err| err.0)?;
    let mut model = state.inner.lock().map_err(|err| err.to_string())?;
    model.status = write_plan(&model.settings, &mut plan)?;
    let _ = save_settings(&app, &model.settings);
    Ok(snapshot(&app, &model))
}

#[tauri::command]
fn fetch_plan(app: AppHandle, state: State<AppState>) -> Result<UiState, String> {
    let (settings, secret, approved) = {
        let model = state.inner.lock().map_err(|err| err.to_string())?;
        let device = state.device.lock().map_err(|err| err.to_string())?;
        (
            model.settings.clone(),
            device.secret.clone(),
            model.approved,
        )
    };
    if !approved {
        let model = state.inner.lock().map_err(|err| err.to_string())?;
        return Ok(snapshot(&app, &model));
    }
    let mut notified = std::collections::HashSet::new();
    let message = sync_plans(&app, &settings, &secret, &mut notified)?;
    let mut model = state.inner.lock().map_err(|err| err.to_string())?;
    model.status = message.unwrap_or_else(|| "No plan on the planner yet.".into());
    Ok(snapshot(&app, &model))
}

#[tauri::command]
fn rescan_progress(app: AppHandle, state: State<AppState>) -> Result<UiState, String> {
    let mut model = state.inner.lock().map_err(|err| err.to_string())?;
    let bearer = if model.approved {
        state.device.lock().ok().map(|device| device.secret.clone())
    } else {
        None
    };
    let posting = bearer.is_some();
    let result = run_scan(&mut model, bearer.as_deref());
    model.status = scan_status(posting, model.progress.len(), result);
    let _ = app.emit("progress", &model.progress);
    Ok(snapshot(&app, &model))
}

fn watch_root(retail: &Path) -> Option<PathBuf> {
    let account = retail.join("WTF").join("Account");
    if account.is_dir() {
        return Some(account);
    }
    let wtf = retail.join("WTF");
    if wtf.is_dir() {
        return Some(wtf);
    }
    None
}

fn touches_saved_variables(event: &Result<Event, notify::Error>) -> bool {
    let Ok(event) = event else {
        return false;
    };
    event.paths.iter().any(|path| {
        path.file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.eq_ignore_ascii_case("Unbored.lua"))
    })
}

fn note_saved_variables(app: &AppHandle) {
    let state = app.state::<AppState>();
    let Ok(mut model) = state.inner.lock() else {
        return;
    };
    let bearer = if model.approved {
        state.device.lock().ok().map(|device| device.secret.clone())
    } else {
        None
    };
    let result = run_scan(&mut model, bearer.as_deref());
    match &result {
        Err(err) => model.status = err.clone(),
        Ok(sent) if *sent > 0 => {
            model.status = format!("Progress sent for {sent} character file(s).");
        }
        Ok(_) => {}
    }
    let progress = model.progress.clone();
    drop(model);
    let _ = app.emit("progress", &progress);
    wake_sync(app);
}

/// The game just saved (a Preset, Send, or Load): check now, not in 30 s.
fn wake_sync(app: &AppHandle) {
    let state = app.state::<AppState>();
    let (lock, signal) = &state.wake;
    if let Ok(mut woken) = lock.lock() {
        *woken = true;
        signal.notify_one();
    };
}

fn wait_for_wake(app: &AppHandle, timeout: Duration) {
    let state = app.state::<AppState>();
    let (lock, signal) = &state.wake;
    let Ok(guard) = lock.lock() else {
        std::thread::sleep(timeout);
        return;
    };
    if let Ok((mut woken, _)) = signal.wait_timeout_while(guard, timeout, |woken| !*woken) {
        *woken = false;
    };
}

fn watch_loop(app: AppHandle, rx: Receiver<Result<Event, notify::Error>>) {
    while let Ok(first) = rx.recv() {
        let mut hit = touches_saved_variables(&first);
        loop {
            match rx.recv_timeout(Duration::from_millis(400)) {
                Ok(event) => hit = hit || touches_saved_variables(&event),
                Err(RecvTimeoutError::Timeout) => break,
                Err(RecvTimeoutError::Disconnected) => {
                    if hit {
                        note_saved_variables(&app);
                    }
                    return;
                }
            }
        }
        if hit {
            note_saved_variables(&app);
        }
    }
}

fn spawn_watch(app: AppHandle, retail: PathBuf) -> Option<RecommendedWatcher> {
    let root = watch_root(&retail)?;
    let (tx, rx) = std::sync::mpsc::channel();
    let mut watcher = notify::recommended_watcher(move |event| {
        let _ = tx.send(event);
    })
    .ok()?;
    watcher.watch(&root, RecursiveMode::Recursive).ok()?;
    std::thread::Builder::new()
        .name("unbored-sv-watch".into())
        .spawn(move || watch_loop(app, rx))
        .ok()?;
    Some(watcher)
}

fn arm_watch(app: &AppHandle, wow_path: &str) {
    let next = if wow_path.is_empty() {
        None
    } else {
        spawn_watch(app.clone(), PathBuf::from(wow_path))
    };
    let state = app.state::<AppState>();
    if let Ok(mut slot) = state.watcher.lock() {
        *slot = next;
    };
}

fn machine_name() -> String {
    let name = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "companion".into());
    let trimmed = name.trim();
    if trimmed.is_empty() {
        "companion".into()
    } else {
        trimmed.chars().take(80).collect()
    }
}

fn decode_plan_field(value: &serde_json::Value) -> Result<Option<Plan>, String> {
    match value {
        serde_json::Value::String(text) => decode_unb1(text).map(Some).map_err(|err| err.0),
        other if other.is_object() => plan_from_value(other.clone())
            .map(Some)
            .map_err(|err| err.0),
        _ => Ok(None),
    }
}

fn get_json(
    client: &reqwest::blocking::Client,
    url: &str,
    secret: &str,
) -> Result<Option<serde_json::Value>, String> {
    let response = client
        .get(url)
        .bearer_auth(secret)
        .send()
        .map_err(|err| err.to_string())?;
    if response.status().as_u16() == 404 {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(format!("Planner returned {}.", response.status()));
    }
    response.json().map(Some).map_err(|err| err.to_string())
}

fn planner_state(
    settings: &Settings,
    secret: &str,
    waiting: Option<&str>,
) -> Result<PlannerState, String> {
    let url = effective_url(settings);
    validate_endpoint(&url)?;
    let client = http_client(Duration::from_secs(20))?;
    let mut state = PlannerState::default();
    if let Some(body) = get_json(&client, &join_url(&url, "v1/plan"), secret)? {
        if let Some(plan) = decode_plan_field(&body["plan"])? {
            let id = body.get("id").and_then(|value| value.as_u64()).unwrap_or(0);
            state.latest_plan = Some((id, plan));
            state.latest_plan_at = body.get("createdAt").and_then(|value| value.as_u64());
        }
    }
    if let Some(body) = get_json(
        &client,
        &join_url(&url, &request_status_path(waiting)),
        secret,
    )? {
        if let Some(id) = body.get("id").and_then(|value| value.as_str()) {
            state.request = Some(RequestState {
                id: id.to_string(),
                status: body
                    .get("status")
                    .and_then(|value| value.as_str())
                    .unwrap_or("pending")
                    .to_string(),
                reason: body
                    .get("reason")
                    .and_then(|value| value.as_str())
                    .map(str::to_string),
                reason_code: body
                    .get("reasonCode")
                    .and_then(|value| value.as_str())
                    .map(str::to_string),
                plan_id: body.get("planId").and_then(|value| value.as_u64()),
                plan: decode_plan_field(body.get("plan").unwrap_or(&serde_json::Value::Null))?,
                kind: body
                    .get("type")
                    .and_then(|value| value.as_str())
                    .unwrap_or("plan")
                    .to_string(),
                answer: body
                    .get("answer")
                    .filter(|value| value.is_object())
                    .cloned(),
                updated_at: body.get("updatedAt").and_then(|value| value.as_u64()),
                eta: body.get("eta").and_then(|value| value.as_u64()),
            });
        }
    }
    Ok(state)
}

/// Sends every character's pending Request. Returns the ones the planner
/// refused outright (a 4xx other than 401), so the game can be told, and the
/// Server's reason for the Companion's own status line. Also returns the id
/// of the Request the game waits for.
fn post_requests(settings: &Settings, retail: &Path, secret: &str) -> Result<Posted, String> {
    let client = http_client(Duration::from_secs(20))?;
    let url = effective_url(settings);
    let mut rejected = Vec::new();
    let mut saved = Vec::new();
    for file in character_saved_variables(retail, None) {
        let Ok(text) = fs::read_to_string(&file.path) else {
            continue;
        };
        let Ok(Some(request)) = request_from_saved_variables(&text) else {
            continue;
        };
        saved.push(request.clone());
        let response = client
            .post(join_url(&url, "v1/requests"))
            .bearer_auth(secret)
            .json(&request_body(&request, Some(&file.account)))
            .send()
            .map_err(|err| err.to_string())?;
        let code = response.status();
        if code.is_client_error() && code.as_u16() != 401 {
            let why = response
                .json::<serde_json::Value>()
                .ok()
                .and_then(|body| {
                    body.get("error")
                        .and_then(|value| value.as_str())
                        .map(str::to_string)
                })
                .unwrap_or_else(|| code.to_string());
            rejected.push((
                RequestState {
                    id: request.id.clone(),
                    kind: request.kind.clone(),
                    status: "failed".into(),
                    reason_code: Some(reason::REJECTED.into()),
                    ..Default::default()
                },
                why,
            ));
            continue;
        }
        if !code.is_success() {
            return Err(format!("Planner returned {code}."));
        }
    }
    Ok(Posted {
        waiting: waited_request(&saved).map(str::to_string),
        rejected,
    })
}

struct Posted {
    rejected: Vec<(RequestState, String)>,
    waiting: Option<String>,
}

/// Uploads the Sections that changed for every character and its Account,
/// gzip, on each SavedVariables write (docs/adr/0029). Characters whose addon
/// has no snapshot yet (0.6) are left to `post_profiles`.
fn post_snapshots(settings: &Settings, retail: &Path, secret: &str) -> Result<(), String> {
    static SENT: std::sync::OnceLock<Mutex<HashMap<String, String>>> = std::sync::OnceLock::new();
    let sent = SENT.get_or_init(|| Mutex::new(HashMap::new()));
    let client = http_client(Duration::from_secs(30))?;
    let url = effective_url(settings);
    let mut accounts: HashMap<String, Option<DataFile>> = HashMap::new();
    for file in character_saved_variables(retail, None) {
        let Ok(text) = fs::read_to_string(&file.path) else {
            continue;
        };
        let Ok(Some(char_file)) = data_from_saved_variables(&text, "UnboredCharDB") else {
            continue;
        };
        let account_file = accounts
            .entry(file.account.clone())
            .or_insert_with(|| {
                account_saved_variables(retail, &file.account)
                    .and_then(|path| fs::read_to_string(path).ok())
                    .and_then(|text| data_from_saved_variables(&text, "UnboredDB").ok().flatten())
            })
            .clone();
        let (character, realm) = character_identity(Some(&char_file), &file.realm, &file.character);
        let known = sent.lock().map_err(|err| err.to_string())?.clone();
        let Some((body, remember)) = build_upload(
            &file.account,
            &character,
            &realm,
            Some(&char_file),
            account_file.as_ref(),
            &known,
        ) else {
            continue;
        };
        let bytes = gzip(body.to_string().as_bytes())?;
        if bytes.len() > MAX_COMPRESSED_BYTES {
            return Err("The game data is too big to send.".into());
        }
        let response = client
            .post(join_url(&url, "v1/snapshot"))
            .bearer_auth(secret)
            .header("Content-Type", "application/json")
            .header("Content-Encoding", "gzip")
            .body(bytes)
            .send()
            .map_err(|err| err.to_string())?;
        if response.status().as_u16() == 404 {
            // A Server older than 0.7: the profile upload still carries the basics.
            return Ok(());
        }
        if !response.status().is_success() {
            return Err(format!(
                "Planner returned {} for the game data.",
                response.status()
            ));
        }
        sent.lock().map_err(|err| err.to_string())?.extend(remember);
    }
    Ok(())
}

/// Uploads each character's profile once per save (docs/adr/0011). From 0.7
/// only for characters whose addon has no Game data snapshot yet.
fn post_profiles(settings: &Settings, retail: &Path, secret: &str) -> Result<(), String> {
    static POSTED: std::sync::OnceLock<Mutex<HashMap<String, u64>>> = std::sync::OnceLock::new();
    let posted = POSTED.get_or_init(|| Mutex::new(HashMap::new()));
    let client = http_client(Duration::from_secs(20))?;
    let url = effective_url(settings);
    for file in character_saved_variables(retail, None) {
        let Ok(text) = fs::read_to_string(&file.path) else {
            continue;
        };
        if matches!(
            data_from_saved_variables(&text, "UnboredCharDB"),
            Ok(Some(_))
        ) {
            continue;
        }
        let Ok(Some(profile)) = profile_from_saved_variables(&text) else {
            continue;
        };
        let key = format!("{}-{}", profile.realm, profile.character);
        let stamp = profile.saved_at.unwrap_or(0);
        if posted.lock().map_err(|err| err.to_string())?.get(&key) == Some(&stamp) {
            continue;
        }
        let response = client
            .post(join_url(&url, "v1/profile"))
            .bearer_auth(secret)
            .json(&serde_json::json!({
                "character": profile.character,
                "realm": profile.realm,
                "account": file.account,
                "savedAt": profile.saved_at,
                "profile": profile.profile,
            }))
            .send()
            .map_err(|err| err.to_string())?;
        if !response.status().is_success() {
            return Err(format!(
                "Planner returned {} for the profile.",
                response.status()
            ));
        }
        posted
            .lock()
            .map_err(|err| err.to_string())?
            .insert(key, stamp);
    }
    Ok(())
}

/// Personal advice for this PC's characters, into Advice.lua (docs/adr/0019).
fn sync_advice(settings: &Settings, retail: &Path, secret: &str) -> Result<bool, String> {
    let client = http_client(Duration::from_secs(20))?;
    let url = join_url(&effective_url(settings), "v1/advice");
    let Some(body) = get_json(&client, &url, secret)? else {
        return Ok(false);
    };
    install_advice(retail, &body["characters"]).map_err(|err| err.0)
}

/// Sends in-game requests, then writes the one Plan.lua the game should see.
/// Returns a status line when the file changed.
fn sync_plans(
    app: &AppHandle,
    settings: &Settings,
    secret: &str,
    notified: &mut std::collections::HashSet<String>,
) -> Result<Option<String>, String> {
    let Some(retail) = retail_path(settings) else {
        return Ok(Some("Approved. Choose the Retail folder.".into()));
    };
    ensure_helper(&retail).map_err(|err| err.0)?;
    let Posted { rejected, waiting } = post_requests(settings, &retail, secret)?;
    // Game data, a profile or advice that fails must not hold back plans and answers.
    let _ = post_snapshots(settings, &retail, secret);
    let _ = post_profiles(settings, &retail, secret);
    let _ = sync_advice(settings, &retail, secret);
    if let Some((request, why)) = rejected.first() {
        // Only the Reason code goes to the game; Wisp says its own line.
        let file = PlanFile {
            body: render_request_lua(request, "failed", None),
            ready_request: None,
            ready_kind: None,
        };
        let written = install_plan_file(&retail, &file).map_err(|err| err.0)?;
        return Ok(written
            .changed
            .then(|| format!("The planner refused a request: {why}")));
    }
    let state = planner_state(settings, secret, waiting.as_deref())?;
    let pending = state
        .request
        .as_ref()
        .is_some_and(|request| request.status == "pending");
    if let Ok(mut model) = app.state::<AppState>().inner.lock() {
        model.request_pending = pending;
    }
    let Some(file) = pick_plan_file(&state) else {
        return Ok(None);
    };
    let written = install_plan_file(&retail, &file).map_err(|err| err.0)?;
    if let Some(id) = &file.ready_request {
        if notified.insert(id.clone()) && written.changed {
            let kind = file.ready_kind.clone().unwrap_or_else(|| "plan".into());
            let text = mood::ready_text(&kind);
            if let Ok(mut model) = app.state::<AppState>().inner.lock() {
                model.ready = Some((kind, now_secs()));
            }
            notify(app, text);
            return Ok(Some(text.into()));
        }
    }
    if !written.changed {
        return Ok(None);
    }
    Ok(Some(match &state.request {
        Some(request) if file.ready_request.is_none() && request.status == "pending" => {
            "Request sent. The planner is working on it.".into()
        }
        Some(request) if request.status == "failed" => {
            "The planner could not answer that one.".into()
        }
        _ => "New plan ready. Wisp picks it up next time you log in.".into(),
    }))
}

fn register_device(url: &str, device: &DeviceCredential) -> Result<String, String> {
    let client = http_client(Duration::from_secs(20))?;
    let response = client
        .post(join_url(url, "v1/devices/register"))
        .json(&serde_json::json!({
            "deviceId": device.device_id,
            "name": machine_name(),
            "secretHash": device.secret_hash(),
        }))
        .send()
        .map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Planner returned {}.", response.status()));
    }
    let body: serde_json::Value = response.json().map_err(|err| err.to_string())?;
    Ok(body
        .get("status")
        .and_then(|value| value.as_str())
        .unwrap_or("pending")
        .to_string())
}

fn device_status(url: &str, secret: &str) -> Result<String, String> {
    let client = http_client(Duration::from_secs(20))?;
    let response = client
        .get(join_url(url, "v1/devices/me"))
        .bearer_auth(secret)
        .send()
        .map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Planner returned {}.", response.status()));
    }
    let body: serde_json::Value = response.json().map_err(|err| err.to_string())?;
    Ok(body
        .get("status")
        .and_then(|value| value.as_str())
        .unwrap_or("pending")
        .to_string())
}

fn pairing_message(status: &str, needs_path: bool) -> String {
    let base = match status {
        "approved" => "Approved.",
        "revoked" => "This device was revoked.",
        _ => "Waiting for approval",
    };
    if needs_path {
        format!("{base} Choose the Retail folder.")
    } else {
        base.to_string()
    }
}

fn publish_status(app: &AppHandle, status: &str) {
    let state = app.state::<AppState>();
    let Ok(mut model) = state.inner.lock() else {
        return;
    };
    if model.status == status {
        return;
    }
    model.status = status.to_string();
    drop(model);
    refresh_view(app);
}

/// Pushes the current mood to the window and the tray tooltip.
fn refresh_view(app: &AppHandle) {
    let headline = app
        .state::<AppState>()
        .inner
        .lock()
        .map(|model| model.mood().headline)
        .unwrap_or_default();
    let _ = app.emit("progress", serde_json::json!({}));
    if let Some(tray) = app.tray_by_id("unbored") {
        let _ = tray.set_tooltip(Some(format!("{MASCOT_NAME}: {headline}")));
    }
}

fn set_busy(app: &AppHandle, busy: Option<&str>) {
    if let Ok(mut model) = app.state::<AppState>().inner.lock() {
        model.busy = busy.map(str::to_string);
    }
    refresh_view(app);
}

fn ensure_addon(app: &AppHandle, retail: &Path, version_file: &Path) -> Result<String, String> {
    let client = http_client(Duration::from_secs(30))?;
    let response = client
        .get("https://api.github.com/repos/hmbanan666/wow-unbored/releases?per_page=20")
        .header("Accept", "application/vnd.github+json")
        .send()
        .map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!("GitHub returned {}.", response.status()));
    }
    let body = response.text().map_err(|err| err.to_string())?;
    let Some(release) = select_addon_zip(&body)? else {
        return Ok("No addon release found.".into());
    };
    let installed = installed_version(retail).or_else(|| {
        fs::read_to_string(version_file)
            .ok()
            .map(|text| text.trim().to_string())
    });
    let toc = retail
        .join("Interface")
        .join("AddOns")
        .join("Unbored")
        .join("Unbored.toc");
    if toc.is_file() && !should_update(installed.as_deref(), &release.version) {
        if let Ok(mut model) = app.state::<AppState>().inner.lock() {
            model.addon_version = release.version.clone();
        }
        return Ok(format!("Addon {} is installed.", release.version));
    }
    let toc_existed = toc.is_file();
    set_busy(
        app,
        Some(if toc_existed {
            "Updating Wisp in the game..."
        } else {
            "Putting Wisp into the game..."
        }),
    );
    let installed = client
        .get(&release.url)
        .send()
        .and_then(|response| response.bytes())
        .map_err(|err| err.to_string())
        .and_then(|bytes| install_addon_zip(&bytes, retail));
    set_busy(app, None);
    installed?;
    if let Some(parent) = version_file.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(version_file, &release.version).map_err(|err| err.to_string())?;
    if let Ok(mut model) = app.state::<AppState>().inner.lock() {
        model.addon_version = release.version.clone();
    }
    if wow_running() {
        if toc_existed {
            if let Ok(mut model) = app.state::<AppState>().inner.lock() {
                model.addon_updated_at = Some(now_secs());
            }
            notify(
                app,
                "I updated Wisp. Click Load in Wisp's bubble once to finish.",
            );
        } else {
            notify(
                app,
                "Wisp is in the game now. Restart World of Warcraft once to meet her.",
            );
        }
    }
    Ok(format!("Installed addon {}.", release.version))
}

fn notify(app: &AppHandle, body: &str) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app
        .notification()
        .builder()
        .title(MASCOT_NAME)
        .body(body)
        .show();
}

#[cfg(windows)]
fn wow_running() -> bool {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    std::process::Command::new("tasklist")
        .args(["/FI", "IMAGENAME eq Wow.exe", "/NH", "/FO", "CSV"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|out| {
            String::from_utf8_lossy(&out.stdout)
                .to_ascii_lowercase()
                .contains("wow.exe")
        })
        .unwrap_or(false)
}

#[cfg(not(windows))]
fn wow_running() -> bool {
    false
}

fn sync_once(
    app: &AppHandle,
    addon_checked: &mut Option<std::time::Instant>,
    notified: &mut std::collections::HashSet<String>,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let settings = state
        .inner
        .lock()
        .map_err(|err| err.to_string())?
        .settings
        .clone();
    let device = state.device.lock().map_err(|err| err.to_string())?.clone();
    let retail = retail_path(&settings);
    // The helper and the addon come from disk and GitHub, so they are set up
    // even while the planner is down or this PC is not approved yet.
    if let Some(retail) = &retail {
        let _ = ensure_helper(retail);
        let due = addon_checked
            .map(|at| at.elapsed() >= Duration::from_secs(30 * 60))
            .unwrap_or(true);
        if due {
            let version_file = app
                .path()
                .app_config_dir()
                .map_err(|err| err.to_string())?
                .join("addon-version.txt");
            let now = std::time::Instant::now();
            match ensure_addon(app, retail, &version_file) {
                Ok(_) => *addon_checked = Some(now),
                Err(err) => {
                    // Try again in about 5 minutes; GitHub limits unauthenticated calls.
                    *addon_checked =
                        Some(now.checked_sub(Duration::from_secs(25 * 60)).unwrap_or(now));
                    publish_status(app, &format!("Addon check: {err}"));
                }
            }
        }
    }
    let result = sync_planner(app, &settings, &device, notified);
    if let Some(retail) = &retail {
        let model = state.inner.lock().map_err(|err| err.to_string())?;
        let status = CompanionStatus {
            pairing: model.pairing.clone(),
            online: result.is_ok(),
            addon_version: installed_version(retail),
            companion_version: app.package_info().version.to_string(),
            seen_at: now_secs(),
        };
        drop(model);
        let _ = write_status(retail, &status);
    }
    let _ = app.emit("progress", serde_json::json!({}));
    result
}

fn sync_planner(
    app: &AppHandle,
    settings: &Settings,
    device: &DeviceCredential,
    notified: &mut std::collections::HashSet<String>,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let url = effective_url(settings);
    let secret = device.secret.clone();
    let status = match device_status(&url, &secret) {
        Ok(status) => status,
        Err(err) if err.contains("401") => register_device(&url, device)?,
        Err(err) => return Err(err),
    };
    let needs_path = settings.wow_path.trim().is_empty();
    let (pairing_changed, just_approved) = {
        let mut model = state.inner.lock().map_err(|err| err.to_string())?;
        let changed = model.pairing != status;
        let just_approved = changed && status == "approved" && model.pairing == "pending";
        model.pairing = status.clone();
        model.approved = status == "approved";
        model.needs_wow_path = needs_path;
        if just_approved {
            model.connected_at = Some(now_secs());
        }
        (changed, just_approved)
    };
    if just_approved {
        notify(
            app,
            "You're connected! Start World of Warcraft and click Wisp to pick a plan.",
        );
    }
    if pairing_changed || status != "approved" {
        publish_status(app, &pairing_message(&status, needs_path));
    }
    if status == "approved" && !needs_path {
        let mut model = state.inner.lock().map_err(|err| err.to_string())?;
        let _ = run_scan(&mut model, Some(&secret));
        drop(model);
        if let Some(message) = sync_plans(app, settings, &secret, notified)? {
            publish_status(app, &message);
        }
    }
    Ok(())
}

fn sync_loop(app: AppHandle) {
    let mut addon_checked = None;
    let mut notified = std::collections::HashSet::new();
    loop {
        let result = sync_once(&app, &mut addon_checked, &mut notified);
        if let Ok(mut model) = app.state::<AppState>().inner.lock() {
            model.error = result.is_err();
        }
        match result {
            Err(err) => publish_status(&app, &err),
            Ok(()) => refresh_view(&app),
        }
        wait_for_wake(&app, Duration::from_secs(30));
    }
}

const UPDATE_EVERY: Duration = Duration::from_secs(4 * 60 * 60);

fn update_marker(app: &AppHandle) -> Option<PathBuf> {
    settings_path(app)
        .ok()
        .map(|path| path.with_file_name("updating"))
}

/// Checks GitHub for a signed build at start and every few hours. The
/// installer runs quietly and the app comes back in the tray.
fn spawn_updater(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(20)).await;
        loop {
            if let Err(err) = update_once(&app).await {
                eprintln!("update check: {err}");
            }
            tokio::time::sleep(UPDATE_EVERY).await;
        }
    });
}

async fn update_once(app: &AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|err| err.to_string())?;
    let Some(update) = updater.check().await.map_err(|err| err.to_string())? else {
        return Ok(());
    };
    set_busy(app, Some("Updating myself..."));
    let bytes = update.download(|_, _| {}, || {}).await.map_err(|err| {
        set_busy(app, None);
        err.to_string()
    })?;
    if let Some(marker) = update_marker(app) {
        let _ = fs::write(marker, &update.version);
    }
    update.install(bytes).map_err(|err| err.to_string())?;
    app.restart();
}

fn enable_autostart_once(app: &AppHandle, settings: &mut Settings) {
    if settings.autostart_set {
        return;
    }
    use tauri_plugin_autostart::ManagerExt;
    if app.autolaunch().enable().is_ok() {
        settings.autostart_set = true;
        let _ = save_settings(app, settings);
    }
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let settings = load_settings(app.handle());
            let installs = detect_installs()
                .into_iter()
                .map(|path| path.display().to_string())
                .collect::<Vec<_>>();
            let mut settings = settings;
            enable_autostart_once(app.handle(), &mut settings);
            if settings.wow_path.is_empty() {
                if let Some(first) = installs.first() {
                    settings.wow_path = first.clone();
                }
            }
            let accounts = list_accounts(&PathBuf::from(&settings.wow_path));
            let progress = scan_progress(&settings);
            let wow_path = settings.wow_path.clone();
            let needs_wow_path = settings.wow_path.trim().is_empty();
            let device = device::load_or_create(
                &settings_path(app.handle())?.with_file_name("device.json"),
            )?;
            app.manage(AppState {
                inner: Mutex::new(Model {
                    settings,
                    status: String::new(),
                    installs,
                    accounts,
                    progress,
                    posted: HashMap::new(),
                    approved: false,
                    needs_wow_path,
                    addon_version: String::new(),
                    pairing: String::new(),
                    busy: None,
                    error: false,
                    ready: None,
                    request_pending: false,
                    connected_at: None,
                    addon_updated_at: None,
                    machine: machine_name(),
                }),
                watcher: Mutex::new(None),
                device: Mutex::new(device),
                wake: (Mutex::new(false), Condvar::new()),
            });
            arm_watch(app.handle(), &wow_path);
            let handle = app.handle().clone();
            std::thread::Builder::new()
                .name("unbored-sync".into())
                .spawn(move || sync_loop(handle))
                .map_err(|err| err.to_string())?;

            let open = MenuItem::with_id(app, "open", "Open", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))?;
            TrayIconBuilder::with_id("unbored")
                .icon(icon)
                .menu(&menu)
                .tooltip(MASCOT_NAME)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            let after_update = update_marker(app.handle())
                .map(|marker| fs::remove_file(marker).is_ok())
                .unwrap_or(false);
            let hidden = after_update || std::env::args().any(|arg| arg == "--hidden");
            if !hidden || needs_wow_path {
                show_main(app.handle());
            }
            spawn_updater(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_state,
            detect_wow,
            set_wow_path,
            set_account,
            set_endpoint,
            set_autostart,
            write_plan_text,
            fetch_plan,
            rescan_progress
        ])
        .run(tauri::generate_context!())
        .expect("Unbored Companion failed to start");
}
