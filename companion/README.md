# Unbored Companion

A Windows tray app. It carries a plan into WoW as a file, and reads session progress back out of SavedVariables after you `/reload` or log out. It does not read game memory, inject code, or attach to `Wow.exe`. Same idea as the Raider.IO client, the TSM app, or WeakAuras Companion.

The in-game addon is the other half. This folder is the desktop half.

## Install

1. Download `Unbored Companion_0.1.0_x64-setup.exe` or the `.msi` from the GitHub release tagged `companion-v0.1.0` (the workflow builds it; it is not published until that tag exists).
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

1. **Detect** looks at the registry (`HKLM\SOFTWARE\WOW6432Node\Blizzard Entertainment\World of Warcraft\InstallPath` and the 32-bit and HKCU twins) and at `C:\Program Files (x86)\World of Warcraft` and `C:\Program Files\World of Warcraft`. A hit is a folder that contains `_retail_\Wow.exe`, or is itself `_retail_`.
2. You can paste the `_retail_` path if detection misses. Accounts are the directories under `WTF\Account`.
3. Paste an `UNB1:` plan (same string as `/unbored import`, see `docs/plan-format.md`) and press **Write plan**. Or set an HTTPS planner URL and press **Fetch plan**. The URL contract is `docs/companion-api.md`. Nothing is fetched until you set a URL.
4. The app writes `Interface\AddOns\Unbored_Plan\`, a tiny addon it owns (the TSM AppHelper pattern). It does **not** edit SavedVariables while the game is running: WoW overwrites those files on logout, so a write during a session would be thrown away or would race the client.
5. In game, `/reload`. Enable **Unbored Plan** if the addon list asks. Unbored prints that a companion plan is ready. **Use it** in the window, or `/unbored companion`. **Not now** hides that same plan until the file changes.
6. When you `/reload` or log out, WoW writes `WTF\Account\<account>\<realm>\<character>\SavedVariables\Unbored.lua`. The app watches that folder and refreshes the list when `Unbored.lua` changes. **Read progress** does the same on demand. If a planner URL is set, a changed file is POSTed once; the same contents are not sent again until the file or the URL changes.

The poll interval fetches a new plan from the planner. It is the number of minutes you saved, not a fixed one-minute tick. `0` means only the buttons. The SavedVariables watch runs whether or not that poll is on, including while the window is hidden in the tray.

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
