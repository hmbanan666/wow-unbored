# Unbored Companion

A Windows tray app. It carries a plan into WoW as a file, and reads session progress back out of SavedVariables after you `/reload` or log out. It does not read game memory, inject code, or attach to `Wow.exe`. Same idea as the Raider.IO client, the TSM app, or WeakAuras Companion.

The in-game addon is the other half. This folder is the desktop half.

## Install

1. Download `Unbored Companion_0.1.1_x64-setup.exe` or the `.msi` from the GitHub release tagged `companion-v0.1.1`.
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
5. The plan file is still `Interface\AddOns\Unbored_Plan\`, which this app owns. In game, `/reload`, then **Use it** or `/unbored companion`.
6. After `/reload` or logout the app reads `Unbored.lua` and posts progress once per change.

Advanced settings can replace the planner URL. There is no token field. An empty URL means `https://unbored.kosarev.space`.

## Updates

`tauri.conf.json` points the updater at

`https://github.com/hmbanan666/wow-unbored/releases/latest/download/latest.json`

Signed update artifacts are **off** until a minisign key exists. Generate one on a machine you control:

```
npm run tauri signer generate -- -w "$HOME/unbored-companion.key"
```

Put the public key in `plugins.updater.pubkey`, set the GitHub secret `TAURI_SIGNING_PRIVATE_KEY` to the private key, and set `bundle.createUpdaterArtifacts` to `true`. Do not commit the private key. Until then the app still builds and installs; it just does not apply automatic updates. `latest` on GitHub may also be an addon-only release without `latest.json`, in which case an update check 404s and changes nothing.

## Tests

From the repo root, with a current stable Rust:

```
cargo test --manifest-path companion/src-tauri/Cargo.toml --lib --no-default-features
```

That covers SavedVariables parsing, `UNB1` decoding, writing `Unbored_Plan/Plan.lua`, Retail folder detection, and the JSON body posted to the planner. It does not open a window.
