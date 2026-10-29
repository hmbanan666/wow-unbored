//! Tray window. Talks to WoW only through files.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};

use serde::{Deserialize, Serialize};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::endpoint::{join_url, progress_payload, validate_endpoint};
use crate::plan::{decode_unb1, install_plan, plan_from_value, Plan};
use crate::wow::{character_saved_variables, detect_installs, list_accounts, read_progress, CharacterFile};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    wow_path: String,
    account: String,
    endpoint_url: String,
    endpoint_token: String,
    poll_minutes: u32,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            wow_path: String::new(),
            account: String::new(),
            endpoint_url: String::new(),
            endpoint_token: String::new(),
            poll_minutes: 5,
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
    budget: u64,
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
}

struct AppState {
    inner: Mutex<Model>,
    /// Kept alive so the SavedVariables watch does not stop.
    watcher: Mutex<Option<RecommendedWatcher>>,
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
                budget: progress.budget.unwrap_or(0),
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

fn post_progress(
    settings: &Settings,
    files: &[CharacterFile],
    posted: &mut HashMap<String, String>,
) -> Result<usize, String> {
    let url = settings.endpoint_url.trim();
    if url.is_empty() {
        return Ok(0);
    }
    validate_endpoint(url)?;
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|err| err.to_string())?;
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
        let mut request = client.post(join_url(url, "v1/progress")).json(&body);
        if !settings.endpoint_token.is_empty() {
            request = request.bearer_auth(&settings.endpoint_token);
        }
        let response = request.send().map_err(|err| err.to_string())?;
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

fn run_scan(model: &mut Model) -> Result<usize, String> {
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
    post_progress(&settings, &files, &mut model.posted)
}

fn scan_status(settings: &Settings, progress_len: usize, result: Result<usize, String>) -> String {
    match result {
        Err(err) => err,
        Ok(sent) if sent > 0 => format!("Progress sent for {sent} character file(s)."),
        Ok(_) if progress_len == 0 => "No Unbored.lua yet. /reload once in game.".into(),
        Ok(_) if !settings.endpoint_url.trim().is_empty() => {
            "Progress is already on the planner.".into()
        }
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
    let path = install_plan(&retail, plan).map_err(|err| err.0)?;
    Ok(format!(
        "Wrote {}. /reload in game, then choose Use it.",
        path.display()
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
}

fn snapshot(app: &AppHandle, model: &Model) -> UiState {
    let autostart = refresh_autostart(app);
    UiState {
        settings: model.settings.clone(),
        installs: model.installs.clone(),
        accounts: model.accounts.clone(),
        progress: model.progress.clone(),
        status: model.status.clone(),
        autostart,
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
    if model.installs.is_empty() {
        model.status = "No Retail install found. Paste the _retail_ folder.".into();
    } else {
        model.status = format!("Found {} Retail folder(s).", model.installs.len());
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
    model.settings.wow_path = path.trim().to_string();
    let retail = PathBuf::from(&model.settings.wow_path);
    model.accounts = list_accounts(&retail);
    model.progress = scan_progress(&model.settings);
    model.status = "Retail folder saved.".into();
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
    token: String,
    poll_minutes: u32,
) -> Result<UiState, String> {
    validate_endpoint(&url)?;
    let mut model = state.inner.lock().map_err(|err| err.to_string())?;
    model.settings.endpoint_url = url.trim().to_string();
    model.settings.endpoint_token = token;
    model.settings.poll_minutes = poll_minutes.min(240);
    model.posted.clear();
    model.status = "Planner endpoint saved.".into();
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
fn write_plan_text(app: AppHandle, state: State<AppState>, text: String) -> Result<UiState, String> {
    let mut plan = decode_unb1(&text).map_err(|err| err.0)?;
    let mut model = state.inner.lock().map_err(|err| err.to_string())?;
    model.status = write_plan(&model.settings, &mut plan)?;
    let _ = save_settings(&app, &model.settings);
    Ok(snapshot(&app, &model))
}

#[tauri::command]
fn fetch_plan(app: AppHandle, state: State<AppState>) -> Result<UiState, String> {
    let (url, token, settings) = {
        let model = state.inner.lock().map_err(|err| err.to_string())?;
        (
            model.settings.endpoint_url.clone(),
            model.settings.endpoint_token.clone(),
            model.settings.clone(),
        )
    };
    if url.trim().is_empty() {
        return Err("Set a planner URL first.".into());
    }
    validate_endpoint(&url)?;
    let client = reqwest::blocking::Client::new();
    let mut request = client.get(join_url(&url, "v1/plan"));
    if !token.is_empty() {
        request = request.bearer_auth(&token);
    }
    let response = request.send().map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Planner returned {}.", response.status()));
    }
    let body: serde_json::Value = response.json().map_err(|err| err.to_string())?;
    let mut plan = match &body["plan"] {
        serde_json::Value::String(text) => decode_unb1(text).map_err(|err| err.0)?,
        other if other.is_object() => plan_from_value(other.clone()).map_err(|err| err.0)?,
        _ => return Err("Response needs a plan string or plan object.".into()),
    };
    let mut model = state.inner.lock().map_err(|err| err.to_string())?;
    model.settings = settings;
    model.status = write_plan(&model.settings, &mut plan)?;
    Ok(snapshot(&app, &model))
}

#[tauri::command]
fn rescan_progress(app: AppHandle, state: State<AppState>) -> Result<UiState, String> {
    let mut model = state.inner.lock().map_err(|err| err.to_string())?;
    let result = run_scan(&mut model);
    model.status = scan_status(&model.settings, model.progress.len(), result);
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
    let result = run_scan(&mut model);
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let settings = load_settings(app.handle());
            let installs = detect_installs()
                .into_iter()
                .map(|path| path.display().to_string())
                .collect::<Vec<_>>();
            let mut settings = settings;
            if settings.wow_path.is_empty() {
                if let Some(first) = installs.first() {
                    settings.wow_path = first.clone();
                }
            }
            let accounts = list_accounts(&PathBuf::from(&settings.wow_path));
            let progress = scan_progress(&settings);
            let wow_path = settings.wow_path.clone();
            app.manage(AppState {
                inner: Mutex::new(Model {
                    settings,
                    status: "Ready.".into(),
                    installs,
                    accounts,
                    progress,
                    posted: HashMap::new(),
                }),
                watcher: Mutex::new(None),
            });
            arm_watch(app.handle(), &wow_path);

            let open = MenuItem::with_id(app, "open", "Open", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))?;
            TrayIconBuilder::with_id("unbored")
                .icon(icon)
                .menu(&menu)
                .tooltip("Unbored Companion")
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

            if !std::env::args().any(|arg| arg == "--hidden") {
                show_main(app.handle());
            }
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
