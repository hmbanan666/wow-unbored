//! Tray window. Talks to WoW only through files.

use std::collections::{HashMap, HashSet};
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

use crate::account::{self, AccountSeal};
use crate::addon::{install_addon_zip, installed_version, select_addon_zip, should_update};
use crate::device::{self, registration_json, DeviceCredential};
use crate::endpoint::{join_url, progress_payload, validate_endpoint, DEFAULT_PLANNER_URL};
use crate::i18n::{self, tr, trf};
use crate::mood::{self, MoodInput, MASCOT_NAME};
use crate::plan::{
    clear_helper, decode_unb1, ensure_helper, install_advice, install_plan, install_plan_file,
    install_suggestions, pick_plan_file, plan_from_value, write_status, CompanionStatus, Plan,
    PlannerState, RequestState,
};
use crate::request::{self, request_status_path, PostedRequests, RequestUpload};
use crate::savedvars::{profile_from_saved_variables, request_from_saved_variables};
use crate::snapshot::{
    build_upload, character_identity, data_from_saved_variables, gzip, DataFile, SentSections,
    MAX_COMPRESSED_BYTES,
};
use crate::sync_state::{Current, Generation, SyncState};
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
    /// When the player used Forget my data. Cleared by Connect again.
    #[serde(default)]
    forgotten_at: Option<u64>,
    /// Account keys this PC has already asked the Server to rename (docs/adr/0044).
    #[serde(default)]
    migrated_accounts: Vec<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            wow_path: String::new(),
            account: String::new(),
            endpoint_url: String::new(),
            poll_minutes: 5,
            autostart_set: false,
            forgotten_at: None,
            migrated_accounts: Vec::new(),
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
    sent_sections: SentSections,
    posted_profiles: HashMap<String, u64>,
    notified: HashSet<String>,
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
            forgotten: self.settings.forgotten_at.is_some(),
            now: now_secs(),
            lang: i18n::current(),
        })
    }
}

struct AppState {
    inner: SyncState<Model>,
    /// Kept alive so the SavedVariables watch does not stop.
    watcher: Mutex<Option<RecommendedWatcher>>,
    device: Mutex<DeviceCredential>,
    /// Serialize explicit Device lifecycle/settings commands, never background sync.
    device_change: Mutex<()>,
    /// Preserve progress read/POST order without holding up Forget or the UI model.
    progress_scan: Mutex<()>,
    /// Set when the game saved, so the next check runs at once.
    wake: (Mutex<bool>, Condvar),
}

/// Settings, credentials and generation are captured atomically with local state.
struct SyncSession {
    settings: Settings,
    device: DeviceCredential,
    generation: Generation,
}

/// Caller holds the current generation through the file write.
fn write_heartbeat(
    app: &AppHandle,
    model: &Model,
    retail: &Path,
    online: bool,
) -> Result<(), String> {
    write_status(
        retail,
        &CompanionStatus {
            pairing: model.pairing.clone(),
            online,
            addon_version: installed_version(retail),
            companion_version: app.package_info().version.to_string(),
            seen_at: now_secs(),
        },
    )
    .map(|_| ())
    .map_err(game_files)
}

impl SyncSession {
    fn capture(state: &AppState) -> Result<Self, String> {
        let model = state.inner.lock().map_err(|err| err.to_string())?;
        let device = state.device.lock().map_err(|err| err.to_string())?;
        Ok(Self {
            settings: model.settings.clone(),
            device: device.clone(),
            generation: model.generation(),
        })
    }

    fn apply<R>(
        &self,
        app: &AppHandle,
        effect: impl FnOnce(&mut Current<Model>) -> R,
    ) -> Result<Option<R>, String> {
        app.state::<AppState>()
            .inner
            .apply(&self.generation, effect)
    }
}

/// A command error as the window shows it: always words, never a raw message (D215).
#[derive(Debug)]
struct Shown(String);

impl From<String> for Shown {
    fn from(text: String) -> Self {
        Shown(i18n::shown(&text))
    }
}

impl Serialize for Shown {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.0)
    }
}

fn offline(_: reqwest::Error) -> String {
    i18n::code("ERR_OFFLINE", &[])
}

fn game_files(_: crate::plan::PlanError) -> String {
    i18n::code("ERR_GAME_FILES", &[])
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

fn account_seal(device: &DeviceCredential, settings: &Settings) -> AccountSeal {
    AccountSeal::new(&device.account_salt, &settings.migrated_accounts)
}

fn remember_migrations(app: &AppHandle, model: &mut Model, seal: &AccountSeal) {
    let mut migrated = model.settings.migrated_accounts.clone();
    migrated.extend(seal.migrated_accounts());
    migrated.sort();
    migrated.dedup();
    if model.settings.migrated_accounts != migrated {
        model.settings.migrated_accounts = migrated;
        let _ = save_settings(app, &model.settings);
    }
}

fn post_progress(
    settings: &Settings,
    files: &[CharacterFile],
    posted: &mut HashMap<String, String>,
    bearer: &str,
    seal: &mut AccountSeal,
) -> Result<usize, String> {
    let url = effective_url(settings);
    validate_endpoint(&url)?;
    let client = http_client(Duration::from_secs(20))?;
    let mut sent = 0;
    for file in files {
        let Some(progress) = read_progress(file)? else {
            continue;
        };
        let (account, legacy) = seal.publish(&file.account)?;
        let mut named = file.clone();
        named.account = account;
        let mut body = progress_payload(&named, &progress);
        account::attach_legacy(&mut body, legacy.as_deref());
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
            .map_err(offline)?;
        if !response.status().is_success() {
            return Err(trf(
                "PLANNER_RETURNED_FOR",
                &[response.status().as_str(), &file.character],
            ));
        }
        posted.insert(key, fingerprint);
        seal.note_migrated(legacy.as_deref());
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

fn sync_progress(app: &AppHandle, session: &SyncSession) -> Result<usize, String> {
    let state = app.state::<AppState>();
    let _scan = state.progress_scan.lock().map_err(|err| err.to_string())?;
    let Some((approved, mut posted, mut seal)) = session.apply(app, |model| {
        (
            model.approved,
            model.posted.clone(),
            account_seal(&session.device, &model.settings),
        )
    })?
    else {
        return Ok(0);
    };
    let settings = &session.settings;
    let account = if settings.account.is_empty() {
        None
    } else {
        Some(settings.account.as_str())
    };
    let files = retail_path(settings)
        .map(|retail| character_saved_variables(&retail, account))
        .unwrap_or_default();
    let progress = scan_progress(settings);
    let result = if approved {
        post_progress(
            settings,
            &files,
            &mut posted,
            &session.device.secret,
            &mut seal,
        )
    } else {
        Ok(0)
    };
    session.apply(app, |model| {
        model.progress = progress;
        model.posted.extend(posted);
        remember_migrations(app, model, &seal);
    })?;
    result
}

fn scan_status(posting: bool, progress_len: usize, result: Result<usize, String>) -> String {
    match result {
        Err(err) => err,
        Ok(sent) if sent > 0 => trf("PROGRESS_SENT", &[&sent.to_string()]),
        Ok(_) if progress_len == 0 => tr("NOTHING_YET"),
        Ok(_) if posting => tr("PROGRESS_ON_PLANNER"),
        Ok(_) => tr("PROGRESS_READ"),
    }
}

fn write_plan(settings: &Settings, plan: &mut Plan) -> Result<String, String> {
    let Some(retail) = retail_path(settings) else {
        return Err(tr("PICK_RETAIL_FIRST"));
    };
    if plan.generated_at.is_none() {
        plan.generated_at = Some(now_secs());
    }
    let written = install_plan(&retail, plan).map_err(game_files)?;
    Ok(trf("WROTE_PLAN", &[&written.path.display().to_string()]))
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
    /// Bory's picture: idle, thinking, waiting or happy (D149).
    picture: String,
    headline: String,
    hint: String,
    steps: Vec<SetupStep>,
    /// en or ru, for `<html lang>`, and the window's words in it (docs/adr/0049).
    lang: String,
    text: serde_json::Map<String, serde_json::Value>,
    mascot: String,
    version: String,
    can_reconnect: bool,
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
            label: tr("STEP_WOW"),
            done: !model.needs_wow_path,
        },
        SetupStep {
            label: match &addon {
                Some(version) => trf("STEP_ADDON", &[version]),
                None => tr("STEP_ADDON_NONE"),
            },
            done: addon.is_some(),
        },
        SetupStep {
            label: match model.pairing.as_str() {
                "approved" => tr("STEP_APPROVED"),
                "revoked" => tr("STEP_REVOKED"),
                _ => tr("STEP_PAIRING"),
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
        status: i18n::shown(&model.status),
        autostart,
        needs_wow_path: model.needs_wow_path,
        addon_version: model.addon_version.clone(),
        pairing: model.pairing.clone(),
        planner_url: effective_url(&model.settings),
        phase: mood.phase.to_string(),
        picture: mood.picture.to_string(),
        headline: mood.headline,
        hint: mood.hint,
        steps: setup_steps(model),
        lang: i18n::current().code().to_string(),
        text: i18n::ui_text(i18n::current()),
        mascot: MASCOT_NAME.to_string(),
        version: app.package_info().version.to_string(),
        can_reconnect: model.settings.forgotten_at.is_some() && !model.approved,
    }
}

fn refresh_autostart(app: &AppHandle) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn get_state(app: AppHandle, state: State<AppState>) -> Result<UiState, Shown> {
    let model = state.inner.lock().map_err(|err| err.to_string())?;
    Ok(snapshot(&app, &model))
}

#[tauri::command]
fn detect_wow(app: AppHandle, state: State<AppState>) -> Result<UiState, Shown> {
    let found = detect_installs();
    let _change = state.device_change.lock().map_err(|err| err.to_string())?;
    let mut model = state.inner.lock().map_err(|err| err.to_string())?;
    model.invalidate();
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
fn set_wow_path(app: AppHandle, state: State<AppState>, path: String) -> Result<UiState, Shown> {
    let _change = state.device_change.lock().map_err(|err| err.to_string())?;
    let mut model = state.inner.lock().map_err(|err| err.to_string())?;
    model.invalidate();
    let chosen = path.trim();
    model.settings.wow_path = retail_dir(Path::new(chosen))
        .map(|dir| dir.display().to_string())
        .unwrap_or_default();
    let retail = PathBuf::from(&model.settings.wow_path);
    model.accounts = list_accounts(&retail);
    model.progress = scan_progress(&model.settings);
    model.needs_wow_path = model.settings.wow_path.is_empty();
    model.status = if !model.needs_wow_path {
        tr("FOUND_IT")
    } else if chosen.is_empty() {
        tr("PICK_FOLDER")
    } else {
        tr("NOT_WOW_FOLDER")
    };
    let path = model.settings.wow_path.clone();
    let _ = save_settings(&app, &model.settings);
    drop(model);
    arm_watch(&app, &path);
    let model = state.inner.lock().map_err(|err| err.to_string())?;
    Ok(snapshot(&app, &model))
}

#[tauri::command]
fn set_account(app: AppHandle, state: State<AppState>, account: String) -> Result<UiState, Shown> {
    let _change = state.device_change.lock().map_err(|err| err.to_string())?;
    let mut model = state.inner.lock().map_err(|err| err.to_string())?;
    model.invalidate();
    model.settings.account = account;
    model.progress = scan_progress(&model.settings);
    let _ = save_settings(&app, &model.settings);
    Ok(snapshot(&app, &model))
}

/// D61: the first-run line links to the README privacy section, in the
/// Companion's language. The URL is fixed here, never taken from the window.
#[tauri::command]
fn open_privacy() -> Result<(), Shown> {
    Ok(open_in_browser(i18n::privacy_url(i18n::current()))?)
}

#[cfg(windows)]
fn open_in_browser(url: &str) -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|_| trf("BROWSER_FAILED", &[url]))
}

#[cfg(not(windows))]
fn open_in_browser(url: &str) -> Result<(), String> {
    Err(trf("OPEN_IN_BROWSER", &[url]))
}

#[tauri::command]
fn set_endpoint(
    app: AppHandle,
    state: State<AppState>,
    url: String,
    poll_minutes: u32,
) -> Result<UiState, Shown> {
    let url = url.trim().to_string();
    validate_endpoint(&url)?;
    let _change = state.device_change.lock().map_err(|err| err.to_string())?;
    let mut model = state.inner.lock().map_err(|err| err.to_string())?;
    model.invalidate();
    model.settings.endpoint_url = url;
    model.settings.poll_minutes = poll_minutes.min(240);
    model.posted.clear();
    model.sent_sections.clear();
    model.posted_profiles.clear();
    model.notified.clear();
    model.status = tr("ENDPOINT_SAVED");
    let _ = save_settings(&app, &model.settings);
    Ok(snapshot(&app, &model))
}

#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool) -> Result<bool, Shown> {
    use tauri_plugin_autostart::ManagerExt;
    if enabled {
        app.autolaunch().enable().map_err(|err| err.to_string())?;
    } else {
        app.autolaunch().disable().map_err(|err| err.to_string())?;
    }
    Ok(refresh_autostart(&app))
}

#[tauri::command]
fn write_plan_text(app: AppHandle, state: State<AppState>, text: String) -> Result<UiState, Shown> {
    let mut plan = decode_unb1(&text).map_err(|_| i18n::code("ERR_PLAN_STRING", &[]))?;
    let mut model = state.inner.lock().map_err(|err| err.to_string())?;
    model.status = write_plan(&model.settings, &mut plan)?;
    let _ = save_settings(&app, &model.settings);
    Ok(snapshot(&app, &model))
}

#[tauri::command]
fn fetch_plan(app: AppHandle, state: State<AppState>) -> Result<UiState, Shown> {
    let session = SyncSession::capture(&state)?;
    let seal = session
        .apply(&app, |model| {
            model
                .approved
                .then(|| account_seal(&session.device, &model.settings))
        })?
        .flatten();
    if let Some(mut seal) = seal {
        let result = sync_plans(&app, &session, &mut seal);
        session
            .apply(&app, |model| {
                remember_migrations(&app, model, &seal);
                result.map(|message| model.status = message.unwrap_or_else(|| tr("NO_PLAN_YET")))
            })?
            .transpose()?;
    }
    let model = state.inner.lock().map_err(|err| err.to_string())?;
    Ok(snapshot(&app, &model))
}

/// Asks the planner to erase this PC's Accounts and revoke it (PRIVACY.md).
/// Ok(false) when the planner does not know this PC, so it holds nothing from it.
fn forget_on_planner(url: &str, secret: &str) -> Result<bool, String> {
    let client = http_client(Duration::from_secs(30))?;
    let response = client
        .post(join_url(url, "v1/devices/me/forget"))
        .bearer_auth(secret)
        .json(&serde_json::json!({ "confirm": true }))
        .send()
        .map_err(|_| tr("FORGET_OFFLINE"))?;
    match response.status().as_u16() {
        200..=299 => Ok(true),
        401 => Ok(false),
        code => Err(trf("FORGET_FAILED", &[&code.to_string()])),
    }
}

#[tauri::command]
fn forget_my_data(app: AppHandle, state: State<AppState>) -> Result<UiState, Shown> {
    let _change = state.device_change.lock().map_err(|err| err.to_string())?;
    let session = SyncSession::capture(&state)?;
    let url = effective_url(&session.settings);
    validate_endpoint(&url)?;
    let erased = forget_on_planner(&url, &session.device.secret)?;
    session
        .apply(&app, |model| -> Result<(), String> {
            model.invalidate();
            model.posted.clear();
            model.ready = None;
            model.request_pending = false;
            model.connected_at = None;
            model.pairing = "revoked".into();
            model.approved = false;
            model.error = false;
            model.settings.forgotten_at = Some(now_secs());
            // Revocation is local immediately, even if saving settings or erasing a
            // file fails. Attempt all cleanup; a later revoked sync retries disk I/O.
            let saved = save_settings(&app, &model.settings);
            model.sent_sections.clear();
            model.posted_profiles.clear();
            model.notified.clear();
            let cleared = retail_path(&session.settings)
                .map(|retail| {
                    clear_helper(&retail).map_err(game_files)?;
                    write_heartbeat(&app, model, &retail, true)
                })
                .transpose();
            saved?;
            cleared?;
            model.status = tr(if erased {
                "FORGET_DONE"
            } else {
                "FORGET_NOTHING"
            });
            Ok(())
        })?
        .transpose()?;
    let model = state.inner.lock().map_err(|err| err.to_string())?;
    Ok(snapshot(&app, &model))
}

/// A new device id and secret, like a fresh install, approved because this PC
/// still holds the secret it used for Forget my data (docs/adr/0045).
fn reconnect_on_planner(
    url: &str,
    old_secret: &str,
    device: &DeviceCredential,
) -> Result<String, String> {
    let client = http_client(Duration::from_secs(20))?;
    let response = client
        .post(join_url(url, "v1/devices/me/reconnect"))
        .bearer_auth(old_secret)
        .json(&registration_json(device, &machine_name()))
        .send()
        .map_err(|_| tr("RECONNECT_OFFLINE"))?;
    let status_code = response.status();
    let body: serde_json::Value = response.json().unwrap_or(serde_json::Value::Null);
    if !status_code.is_success() {
        let why = body
            .get("error")
            .and_then(|value| value.as_str())
            .map(str::to_string)
            .unwrap_or_else(|| tr("RECONNECT_FAILED"));
        return Err(why);
    }
    Ok(body
        .get("status")
        .and_then(|value| value.as_str())
        .unwrap_or("approved")
        .to_string())
}

#[tauri::command]
fn connect_again(app: AppHandle, state: State<AppState>) -> Result<UiState, Shown> {
    let _change = state.device_change.lock().map_err(|err| err.to_string())?;
    let (settings, old) = {
        let model = state.inner.lock().map_err(|err| err.to_string())?;
        let device = state.device.lock().map_err(|err| err.to_string())?;
        if model.settings.forgotten_at.is_none() {
            return Err(tr("RECONNECT_ONLY_AFTER").into());
        }
        (model.settings.clone(), device.clone())
    };
    let url = effective_url(&settings);
    validate_endpoint(&url)?;
    let fresh = old.rotate_keeping_salt()?;
    // TODO(audit): make reconnect recoverable when the response or local write
    // is lost; the Server consumes the old credential before this save.
    let status = reconnect_on_planner(&url, &old.secret, &fresh)?;
    let path = settings_path(&app)?.with_file_name("device.json");
    device::save(&path, &fresh)?;
    let mut model = state.inner.lock().map_err(|err| err.to_string())?;
    model.invalidate();
    *state.device.lock().map_err(|err| err.to_string())? = fresh;
    model.pairing = status.clone();
    model.approved = status == "approved";
    model.settings.forgotten_at = None;
    if model.approved {
        model.connected_at = Some(now_secs());
    }
    let _ = save_settings(&app, &model.settings);
    model.status = if model.approved {
        tr("RECONNECTED")
    } else {
        pairing_message(&status, model.needs_wow_path)
    };
    if model.approved {
        notify(&app, &tr("CONNECTED_TOAST"));
    }
    Ok(snapshot(&app, &model))
}

#[tauri::command]
fn rescan_progress(app: AppHandle, state: State<AppState>) -> Result<UiState, Shown> {
    let session = SyncSession::capture(&state)?;
    let result = sync_progress(&app, &session);
    session.apply(&app, |model| {
        model.status = scan_status(model.approved, model.progress.len(), result);
        let _ = app.emit("progress", &model.progress);
    })?;
    let model = state.inner.lock().map_err(|err| err.to_string())?;
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
    let Ok(session) = SyncSession::capture(&state) else {
        return;
    };
    let result = sync_progress(app, &session);
    let _ = session.apply(app, |model| {
        match result {
            Err(err) => model.status = err,
            Ok(sent) if sent > 0 => model.status = trf("PROGRESS_SENT", &[&sent.to_string()]),
            Ok(_) => {}
        }
        let _ = app.emit("progress", &model.progress);
    });
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
        .map_err(offline)?;
    if response.status().as_u16() == 404 {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(trf("PLANNER_RETURNED", &[response.status().as_str()]));
    }
    response
        .json()
        .map(Some)
        .map_err(|_| i18n::code("ERR_PLANNER_ANSWER", &[]))
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

/// Read pending Requests from disk; the library owns submission and selection.
fn post_requests(
    settings: &Settings,
    retail: &Path,
    secret: &str,
    seal: &mut AccountSeal,
) -> Result<PostedRequests, String> {
    let client = http_client(Duration::from_secs(20))?;
    let url = join_url(&effective_url(settings), "v1/requests");
    let requests: Vec<RequestUpload> = character_saved_variables(retail, None)
        .into_iter()
        .filter_map(|file| {
            let text = fs::read_to_string(&file.path).ok()?;
            let request = request_from_saved_variables(&text).ok()??;
            Some(RequestUpload {
                account: file.account,
                request,
            })
        })
        .collect();
    request::post_requests(&requests, seal, |body| {
        client
            .post(&url)
            .bearer_auth(secret)
            .json(body)
            .send()
            .map(|response| response.status().as_u16())
            .map_err(offline)
    })
}

/// Uploads the Sections that changed for every character and its Account,
/// gzip, on each SavedVariables write (docs/adr/0029). Characters whose addon
/// has no snapshot yet (0.6) are left to `post_profiles`.
fn post_snapshots(
    app: &AppHandle,
    session: &SyncSession,
    retail: &Path,
    seal: &mut AccountSeal,
) -> Result<(), String> {
    let settings = &session.settings;
    let secret = &session.device.secret;
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
        let Some(known) = session.apply(app, |model| model.sent_sections.clone())? else {
            return Ok(());
        };
        let (account, legacy) = seal.publish(&file.account)?;
        let Some((mut body, remember)) = build_upload(
            &account,
            &character,
            &realm,
            Some(&char_file),
            account_file.as_ref(),
            &known,
        ) else {
            continue;
        };
        account::attach_legacy(&mut body, legacy.as_deref());
        let bytes = gzip(body.to_string().as_bytes())?;
        if bytes.len() > MAX_COMPRESSED_BYTES {
            return Err(tr("GAME_DATA_TOO_BIG"));
        }
        let response = client
            .post(join_url(&url, "v1/snapshot"))
            .bearer_auth(secret)
            .header("Content-Type", "application/json")
            .header("Content-Encoding", "gzip")
            .body(bytes)
            .send()
            .map_err(offline)?;
        if response.status().as_u16() == 404 {
            // A Server older than 0.7: the profile upload still carries the basics.
            return Ok(());
        }
        if !response.status().is_success() {
            return Err(trf("PLANNER_RETURNED", &[response.status().as_str()]));
        }
        if session
            .apply(app, |model| model.sent_sections.extend(remember))?
            .is_none()
        {
            return Ok(());
        }
        seal.note_migrated(legacy.as_deref());
    }
    Ok(())
}

/// Uploads each character's profile once per save (docs/adr/0011). From 0.7
/// only for characters whose addon has no Game data snapshot yet.
fn post_profiles(
    app: &AppHandle,
    session: &SyncSession,
    retail: &Path,
    seal: &mut AccountSeal,
) -> Result<(), String> {
    let settings = &session.settings;
    let secret = &session.device.secret;
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
        let Some(known) = session.apply(app, |model| model.posted_profiles.get(&key).copied())?
        else {
            return Ok(());
        };
        if known == Some(stamp) {
            continue;
        }
        let (account, legacy) = seal.publish(&file.account)?;
        let mut body = serde_json::json!({
            "character": profile.character,
            "realm": profile.realm,
            "account": account,
            "savedAt": profile.saved_at,
            "profile": profile.profile,
        });
        account::attach_legacy(&mut body, legacy.as_deref());
        let response = client
            .post(join_url(&url, "v1/profile"))
            .bearer_auth(secret)
            .json(&body)
            .send()
            .map_err(offline)?;
        if !response.status().is_success() {
            return Err(trf("PLANNER_RETURNED", &[response.status().as_str()]));
        }
        if session
            .apply(app, |model| {
                model.posted_profiles.insert(key, stamp);
            })?
            .is_none()
        {
            return Ok(());
        }
        seal.note_migrated(legacy.as_deref());
    }
    Ok(())
}

/// Personal advice for this PC's characters, into Advice.lua (docs/adr/0019).
fn sync_advice(app: &AppHandle, session: &SyncSession, retail: &Path) -> Result<bool, String> {
    let client = http_client(Duration::from_secs(20))?;
    let url = join_url(&effective_url(&session.settings), "v1/advice");
    let Some(body) = get_json(&client, &url, &session.device.secret)? else {
        return Ok(false);
    };
    session
        .apply(app, |_| {
            install_advice(retail, &body["characters"], &body["holdings"]).map_err(game_files)
        })?
        .transpose()
        .map(|changed| changed.unwrap_or(false))
}

/// Bory's ideas for this PC's characters, into Suggestions.lua (D107).
fn sync_suggestions(app: &AppHandle, session: &SyncSession, retail: &Path) -> Result<bool, String> {
    let client = http_client(Duration::from_secs(20))?;
    let url = join_url(&effective_url(&session.settings), "v1/suggestions");
    let Some(body) = get_json(&client, &url, &session.device.secret)? else {
        return Ok(false);
    };
    session
        .apply(app, |_| {
            install_suggestions(retail, &body).map_err(game_files)
        })?
        .transpose()
        .map(|changed| changed.unwrap_or(false))
}

/// Sends in-game requests, then writes the one Plan.lua the game should see.
/// Returns a status line when the file changed.
fn sync_plans(
    app: &AppHandle,
    session: &SyncSession,
    seal: &mut AccountSeal,
) -> Result<Option<String>, String> {
    let settings = &session.settings;
    let secret = &session.device.secret;
    let Some(retail) = retail_path(settings) else {
        return Ok(Some(tr("APPROVED_CHOOSE_RETAIL")));
    };
    if session
        .apply(app, |_| ensure_helper(&retail).map_err(game_files))?
        .transpose()?
        .is_none()
    {
        return Ok(None);
    }
    let PostedRequests {
        rejection,
        waiting,
        deferred,
    } = post_requests(settings, &retail, secret, seal)?;
    for failure in deferred {
        // Only a transport category or HTTP code, never ids, bodies or raw errors.
        eprintln!("Earlier Request upload deferred ({failure:?}); retrying on the next sync.");
    }
    // Game data, a profile or advice that fails must not hold back plans and answers.
    let _ = post_snapshots(app, session, &retail, seal);
    let _ = post_profiles(app, session, &retail, seal);
    let _ = sync_suggestions(app, session, &retail);
    let _ = sync_advice(app, session, &retail);
    let rejected = rejection.is_some();
    let state = match rejection {
        Some(request) => PlannerState {
            request: Some(request),
            ..Default::default()
        },
        None => planner_state(settings, secret, waiting.as_deref())?,
    };
    let pending = state
        .request
        .as_ref()
        .is_some_and(|request| request.status == "pending");
    session
        .apply(app, |model| {
            model.request_pending = pending;
            let Some(file) = pick_plan_file(&state) else {
                return Ok(None);
            };
            let written = install_plan_file(&retail, &file).map_err(game_files)?;
            if let Some(id) = &file.ready_request {
                if model.notified.insert(id.clone()) && written.changed {
                    let kind = file.ready_kind.clone().unwrap_or_else(|| "plan".into());
                    let text = mood::ready_text(i18n::current(), &kind);
                    model.ready = Some((kind, now_secs()));
                    notify(app, &text);
                    return Ok(Some(text));
                }
            }
            if !written.changed {
                return Ok(None);
            }
            Ok(Some(match &state.request {
                Some(request) if file.ready_request.is_none() && request.status == "pending" => {
                    tr("REQUEST_SENT")
                }
                Some(request) if request.status == "failed" => tr(if rejected {
                    "PLANNER_REFUSED"
                } else {
                    "PLANNER_FAILED"
                }),
                _ => tr("NEW_PLAN"),
            }))
        })?
        .transpose()
        .map(Option::flatten)
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
        .map_err(offline)?;
    if !response.status().is_success() {
        return Err(trf("PLANNER_RETURNED", &[response.status().as_str()]));
    }
    let body: serde_json::Value = response
        .json()
        .map_err(|_| i18n::code("ERR_PLANNER_ANSWER", &[]))?;
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
        .map_err(offline)?;
    if !response.status().is_success() {
        return Err(trf("PLANNER_RETURNED", &[response.status().as_str()]));
    }
    let body: serde_json::Value = response
        .json()
        .map_err(|_| i18n::code("ERR_PLANNER_ANSWER", &[]))?;
    Ok(body
        .get("status")
        .and_then(|value| value.as_str())
        .unwrap_or("pending")
        .to_string())
}

fn pairing_message(status: &str, needs_path: bool) -> String {
    let base = match status {
        "approved" => tr("PAIRING_APPROVED"),
        "revoked" => tr("PAIRING_REVOKED"),
        _ => tr("PAIRING_WAITING"),
    };
    if needs_path {
        trf("PAIRING_CHOOSE_RETAIL", &[&base])
    } else {
        base
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
        .map_err(offline)?;
    if !response.status().is_success() {
        return Err(trf("GITHUB_RETURNED", &[response.status().as_str()]));
    }
    let body = response.text().map_err(|err| err.to_string())?;
    let Some(release) = select_addon_zip(&body)? else {
        return Ok(tr("NO_ADDON_RELEASE"));
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
        return Ok(trf("ADDON_INSTALLED", &[&release.version]));
    }
    let toc_existed = toc.is_file();
    set_busy(
        app,
        Some(&tr(if toc_existed {
            "BUSY_UPDATING_ADDON"
        } else {
            "BUSY_INSTALLING_ADDON"
        })),
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
            notify(app, &tr("ADDON_UPDATED_TOAST"));
        } else {
            notify(app, &tr("ADDON_NEW_TOAST"));
        }
    }
    Ok(trf("INSTALLED_ADDON", &[&release.version]))
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
    session: &SyncSession,
    addon_checked: &mut Option<std::time::Instant>,
) -> Result<(), String> {
    let settings = &session.settings;
    let retail = retail_path(settings);
    follow_lang(app, settings);
    // The helper and the addon come from disk and GitHub, so they are set up
    // even while the planner is down or this PC is not approved yet.
    if let Some(retail) = &retail {
        let _ = session.apply(app, |_| ensure_helper(retail));
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
                    session.apply(app, |model| {
                        model.status = trf("ADDON_CHECK", &[&i18n::shown(&err)])
                    })?;
                }
            }
        }
    }
    let result = sync_planner(app, session);
    if let Some(retail) = &retail {
        session.apply(app, |model| {
            let _ = write_heartbeat(app, model, retail, result.is_ok());
        })?;
    }
    let _ = app.emit("progress", serde_json::json!({}));
    result
}

fn sync_planner(app: &AppHandle, session: &SyncSession) -> Result<(), String> {
    let settings = &session.settings;
    let device = &session.device;
    let url = effective_url(settings);
    let secret = &device.secret;
    let status = match device_status(&url, secret) {
        Ok(status) => status,
        Err(err) if err.contains("401") => register_device(&url, device)?,
        Err(err) => return Err(err),
    };
    let needs_path = settings.wow_path.trim().is_empty();
    if session
        .apply(app, |model| {
            let changed = model.pairing != status;
            let just_approved = changed && status == "approved" && model.pairing == "pending";
            model.pairing = status.clone();
            model.approved = status == "approved";
            model.needs_wow_path = needs_path;
            if just_approved {
                model.connected_at = Some(now_secs());
                notify(app, &tr("CONNECTED_TOAST"));
            }
            if model.approved && model.settings.forgotten_at.take().is_some() {
                let _ = save_settings(app, &model.settings);
            }
            if status == "revoked" && model.settings.forgotten_at.is_some() {
                // Retry a failed local erase/save. Old generations cannot write back.
                if let Some(retail) = retail_path(settings) {
                    clear_helper(&retail).map_err(game_files)?;
                }
                save_settings(app, &model.settings)?;
            }
            if changed || status != "approved" {
                model.status = pairing_message(&status, needs_path);
            }
            Ok::<_, String>(())
        })?
        .transpose()?
        .is_none()
    {
        return Ok(());
    }
    if status == "approved" && !needs_path {
        let _ = sync_progress(app, session);
        let Some(mut seal) = session.apply(app, |model| account_seal(device, &model.settings))?
        else {
            return Ok(());
        };
        let result = sync_plans(app, session, &mut seal);
        session
            .apply(app, |model| {
                remember_migrations(app, model, &seal);
                result.map(|message| {
                    if let Some(message) = message {
                        model.status = message;
                    }
                })
            })?
            .transpose()?;
    }
    Ok(())
}

fn sync_loop(app: AppHandle) {
    let mut addon_checked = None;
    loop {
        match SyncSession::capture(&app.state::<AppState>()) {
            Ok(session) => {
                let result = sync_once(&app, &session, &mut addon_checked);
                let _ = session.apply(&app, |model| {
                    model.error = result.is_err();
                    if let Err(err) = result {
                        model.status = err;
                    }
                });
                refresh_view(&app);
            }
            Err(err) => publish_status(&app, &err),
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
    set_busy(app, Some(&tr("BUSY_SELF_UPDATE")));
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

/// The game's language, else the Windows one, else English (docs/adr/0049).
fn detect_lang(settings: &Settings) -> i18n::Lang {
    let addon = retail_path(settings).and_then(|retail| i18n::addon_lang(&retail));
    i18n::pick(addon.as_deref(), sys_locale::get_locale().as_deref())
}

fn tray_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let open = MenuItem::with_id(app, "open", tr("TRAY_OPEN"), true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", tr("TRAY_QUIT"), true, None::<&str>)?;
    Menu::with_items(app, &[&open, &quit])
}

/// A new language from the game: the tray menu follows, the window on its next paint.
fn follow_lang(app: &AppHandle, settings: &Settings) {
    if !i18n::set(detect_lang(settings)) {
        return;
    }
    if let (Some(tray), Ok(menu)) = (app.tray_by_id("unbored"), tray_menu(app)) {
        let _ = tray.set_menu(Some(menu));
    }
    refresh_view(app);
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
            let settings_for_lang = settings.clone();
            let needs_wow_path = settings.wow_path.trim().is_empty();
            let device = device::load_or_create(
                &settings_path(app.handle())?.with_file_name("device.json"),
            )?;
            app.manage(AppState {
                inner: SyncState::new(Model {
                    settings,
                    status: String::new(),
                    installs,
                    accounts,
                    progress,
                    posted: HashMap::new(),
                    sent_sections: SentSections::new(),
                    posted_profiles: HashMap::new(),
                    notified: HashSet::new(),
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
                device_change: Mutex::new(()),
                progress_scan: Mutex::new(()),
                wake: (Mutex::new(false), Condvar::new()),
            });
            arm_watch(app.handle(), &wow_path);
            let handle = app.handle().clone();
            std::thread::Builder::new()
                .name("unbored-sync".into())
                .spawn(move || sync_loop(handle))
                .map_err(|err| err.to_string())?;

            i18n::set(detect_lang(&settings_for_lang));
            let menu = tray_menu(app.handle())?;
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
            rescan_progress,
            open_privacy,
            forget_my_data,
            connect_again
        ])
        .run(tauri::generate_context!())
        .expect("Unbored Companion failed to start");
}
