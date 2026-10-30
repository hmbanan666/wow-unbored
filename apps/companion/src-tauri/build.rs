fn main() {
    // Library tests do not bundle the window. The Tauri build script looks
    // for icons, the frontend, and command permissions, which only the app
    // build needs.
    if std::env::var_os("CARGO_FEATURE_GUI").is_none() {
        return;
    }

    let manifest = tauri_build::AppManifest::new().commands(&[
        "get_state",
        "detect_wow",
        "set_wow_path",
        "set_account",
        "set_endpoint",
        "set_autostart",
        "write_plan_text",
        "fetch_plan",
        "rescan_progress",
        "open_privacy",
    ]);
    if let Err(error) =
        tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
    {
        panic!("failed to run tauri-build: {error:#}");
    }
}
