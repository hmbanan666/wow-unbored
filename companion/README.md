# Unbored Companion

A Windows tray app. It carries a plan into WoW as a file, and reads session progress back out of SavedVariables after you `/reload` or log out. It does not read game memory, inject code, or attach to `Wow.exe`. Same idea as the Raider.IO client, the TSM app, or WeakAuras Companion.

The in-game addon is the other half. This folder is the desktop half.

## Install

1. Download the setup `.exe` or the `.msi` from the GitHub release tagged `companion-v0.2.0`.
2. Windows SmartScreen will say it prevented an unrecognized app from starting. The installer is not Authenticode-signed. Choose **More info**, then **Run anyway**. That warning is expected.
3. The window opens. It also sits in the tray. Closing the window hides it; Quit is on the tray menu.
4. **Start with Windows** is off until you check it. The login shortcut passes `--hidden`, so the window stays in the tray.

You can also build it yourself on Windows, from this directory:

```
npm install
npm run tauri build
```

The installer lands in `src-tauri/target/release/bundle/`.

## Flow

1. Launch the app. It creates a device id and secret (app data, and Windows Credential Manager when that store accepts it) and calls `POST /v1/devices/register` on `https://unbored.kosarev.space`. The window says **Waiting for approval** and asks again about every 30 seconds.
2. The owner approves that device with the planner MCP tool `approve_device`. The app then uses the device secret as the bearer for `GET /v1/plan` and `POST /v1/progress`. It cannot write a plan.
3. Retail is detected from the Blizzard registry (`InstallPath` under `Blizzard Entertainment\World of Warcraft`), `C:\Program Files (x86)\World of Warcraft` and `C:\Program Files\World of Warcraft`, and Battle.net's `product.db` / `Battle.net.config` when those files mention a World of Warcraft path. A hit contains `Wow.exe` or `_retail_\Wow.exe`. The folder field appears only when none of those work.
4. The latest GitHub release asset `Unbored-v*.zip` whose tag is `v*` (not `companion-v*`) is unpacked into `_retail_\Interface\AddOns\Unbored`. A newer tag replaces it. SavedVariables are read from `WTF\Account\*\*\SavedVariables\Unbored.lua` with no account picker.
5. In the Unbored window, pick what you want and how long, type an optional wish, and press **Get plan**. That click saves the request and reloads the UI, so the game writes SavedVariables. This app posts the request with the player's position, level, class, item level, gold, hearth, and tracked quests, so the planner can start near you. When the plan comes back it writes `Unbored_Plan` and shows a toast: **Unbored: plan ready, press Load plan**. Press **Load plan** in game (or reload any other way) and the plan starts.
6. The plan file is `Interface\AddOns\Unbored_Plan\`, which this app owns. It is created on the first sync, even empty, so the addon knows a companion is present. It is rewritten only when the plan or request status changes.
7. After `/reload` or logout the app reads `Unbored.lua` and posts progress once per change.

Advanced settings can replace the planner URL. There is no token field. An empty URL means `https://unbored.kosarev.space`.

## Updates

**The app** checks for a new build 20 seconds after start and every 4 hours. It downloads the signed NSIS installer, runs it quietly, and restarts in the tray. The feed is a fixed prerelease, so an addon release on GitHub's "latest" does not get in the way:

`https://github.com/hmbanan666/wow-unbored/releases/download/companion-updater/latest.json`

The `companion-v*` workflow signs the build with `TAURI_SIGNING_PRIVATE_KEY` (and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, empty for the current key) and copies `latest.json` to that prerelease. The public key is in `plugins.updater.pubkey`. If the secret is missing, the workflow warns, builds the installers without updater artifacts, and leaves the feed alone; installed apps simply stay on their version. The private key is never in the repo. To rotate it, run `npm run tauri signer generate -- -w unbored-companion.key`, put the new `.pub` in `tauri.conf.json`, and replace the secret. Apps signed with the old key cannot verify the new one, so they need one manual install.

**The addon** is checked every 30 minutes against the newest `v*` GitHub release. The version comes from the installed `Unbored.toc`, so a manual install counts. A newer zip is unpacked into `Unbored.new`, then swapped in with two renames, so the game never sees a half-written folder and a failed swap restores the old one. If `Wow.exe` is running a toast says to type `/reload`.

**Start with Windows** is turned on the first time the app runs. It starts with `--hidden`, so only the tray icon appears. The window opens on a manual launch, or when the Retail folder is still unknown. Unticking the box in the window is remembered.

## Tests

From the repo root, with a current stable Rust:

```
cargo test --manifest-path companion/src-tauri/Cargo.toml --lib --no-default-features
```

That covers SavedVariables parsing (including the request context), `UNB1` decoding with waypoint routes, choosing between a direct plan and a request, writing `Unbored_Plan/Plan.lua` only on change, the atomic addon swap, Retail folder detection, and the JSON body posted to the planner. It does not open a window.
