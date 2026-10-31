# Unbored Companion

A Windows tray app. It carries plans, answers and item tips into WoW as files, and reads requests and progress back out of SavedVariables after the game saves them (at logout or a Refresh). It does not read game memory, inject code, or attach to `Wow.exe`. Same idea as the Raider.IO client, the TSM app, or WeakAuras Companion.

The in-game addon is the other half. This folder is the desktop half.

## Install

1. Download the setup `.exe` or the `.msi` from the newest GitHub release (tag `v*`). Releases before 0.7 used `companion-v*`.
2. Windows SmartScreen will say it prevented an unrecognized app from starting. The installer is not Authenticode-signed. Choose **More info**, then **Run anyway**. That warning is expected.
3. The window opens. It also sits in the tray as Bory. Closing the window hides it; Quit is on the tray menu.
4. **Start with Windows** is on by default. The login shortcut passes `--hidden`, so the window stays in the tray.

## The window

One friendly window with Bory, one big status line, a one-line hint under it, and a short setup checklist (World of Warcraft folder found, Bory installed in the game with its version, this PC approved):

| Status | What it means |
| --- | --- |
| Connecting... | First start, before the planner has answered. |
| Show me where World of Warcraft is | No Retail folder found. **Choose folder** opens a folder picker (the game folder or `_retail_` both work); **Look again** re-runs detection. |
| Waiting for a one-time OK | The planner owner has not approved this PC yet. The hint names the PC. Bory is already installed in the game, and quick plans there work. |
| Connected! You're all set | Shown for 10 minutes after approval, with a toast. |
| This PC was disconnected | The device was revoked. |
| Updating addon... / Updating myself... | An update is being installed. |
| Bory was updated, press Load in game | A new addon was installed while the game was running. |
| Thinking about your request... | A request from the game is with the planner. |
| Your plan is ready in the game / Your answer is ready in the game | The answer is in `Unbored_Plan`. Bory picks it up next time you log in, or offers a Refresh. Shown for 15 minutes. |
| Can't reach the planner right now | The last sync failed. The hint says it keeps trying; server errors are only in Advanced. |
| All set, go play | Approved, addon installed, nothing waiting. |

Bory bobs with a spinning ring while busy, thinking, or waiting for approval, and is happy when something is ready. The tray tooltip says the same status. Toasts come from Bory. The planner URL, poll interval, manual plan string, folder path, and per-character progress are under **Advanced**, closed by default.

You can also build it yourself on Windows, from this directory:

```
npm install
npm run tauri build
```

The installer lands in `src-tauri/target/release/bundle/`.

## Flow

1. Launch the app. It creates a device id and secret (app data, and Windows Credential Manager when that store accepts it) and calls `POST /v1/devices/register` on `https://unbored.kosarev.space`. The window says **Waiting for a one-time OK** and asks again about every 30 seconds. Steps 3 and 4 (finding the game and installing the addon) do not wait for this.
2. The owner approves that device with the planner MCP tool `approve_device`. The app then uses the device secret as the bearer for `GET /v1/plan` and `POST /v1/progress`. It cannot write a plan.
3. Retail is detected from the Blizzard registry (`InstallPath` under `Blizzard Entertainment\World of Warcraft`), `C:\Program Files (x86)\World of Warcraft` and `C:\Program Files\World of Warcraft`, and Battle.net's `product.db` / `Battle.net.config` when those files mention a World of Warcraft path. A hit contains `Wow.exe` or `_retail_\Wow.exe`. The folder field appears only when none of those work.
4. The latest GitHub release asset `Unbored-v*.zip` whose tag is `v*` (not `companion-v*`) is unpacked into `_retail_\Interface\AddOns\Unbored`. A newer tag replaces it. SavedVariables are read from `WTF\Account\*\*\SavedVariables\Unbored.lua` with no account picker.
5. In game, pick a preset chip in Bory's bubble (or Something else...), ask something, or drop an item on Bory. Bory answers at once from what the game knows and saves the request; nothing reloads (docs/adr/0012). The game writes SavedVariables at logout, or right away if the player clicks **Refresh** in Bory's one Refresh offer. This app then posts the request (`type` plan, question, or item) with the player's position, level, class, item level, gold, hearth, and tracked quests, so the planner can start near you. When the plan or answer comes back it writes `Unbored_Plan` and shows a toast: **Your plan is ready in the game** or **Your answer is ready in the game**. Bory takes it next time the player logs in or switches characters; after about three minutes he offers one Refresh ("New stuff is ready. Refresh now?") that the player can put off with Later.
6. The plan file is `Interface\AddOns\Unbored_Plan\`, which this app owns. It is created on the first sync, even empty, so the addon knows a companion is present. It is rewritten only when the plan or request status changes. A request the planner rejects (a 4xx other than 401) gets a failed entry, so Bory offers Try again instead of waiting forever.
7. The same file ends with a small status block, `UnboredCompanionStatus` (pairing, online, the addon version on disk, this app's version, and when it last checked, rounded to 5 minutes), rewritten when that changes. Bory uses it to say "waiting for a one-time OK", "can't reach the planner", "the Companion isn't running", or "Press Load to finish the update" for an update. See [docs/companion-api.md](../docs/companion-api.md#companion-status).
8. After a Refresh or logout the app reads `Unbored.lua` and posts progress once per change. A change to SavedVariables wakes the sync at once instead of waiting for the next 30-second tick.
9. It also posts each character's player profile (bags, bank, currencies, collections, professions, recent sessions) once per save, so the planner can read it with `get_player_profile`, and downloads Personal advice (`GET /v1/advice`) into `Unbored_Plan/Advice.lua` for the item tooltips. A failed profile upload or advice download never holds back plans.

Advanced settings can replace the planner URL. There is no token field. An empty URL means `https://unbored.kosarev.space`.

## Updates

**The app** checks for a new build 20 seconds after start and every 4 hours. It downloads the signed NSIS installer, runs it quietly, and restarts in the tray. The feed is a fixed prerelease, so an addon release on GitHub's "latest" does not get in the way:

`https://github.com/hmbanan666/wow-unbored/releases/download/companion-updater/latest.json`

The `vX.Y.Z` release workflow signs the build with `TAURI_SIGNING_PRIVATE_KEY` (and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, empty) and copies `latest.json` to that prerelease. The public key is `plugins.updater.pubkey`. Tauri v2 accepts one key, not a list. The key in the config is the new one; **0.9 is still signed with the previous private key** so Companions on 0.8 can install it, and the GitHub secret changes to the new private key only before **0.9.1**. The steps are in [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md). If the secret is missing, the workflow warns, builds the installers without updater artifacts, and leaves the feed alone. The private key is never in the repo.

**The addon** is checked every 30 minutes against the newest `v*` GitHub release. The version comes from the installed `Unbored.toc`, so a manual install counts. A newer zip is unpacked into `Unbored.new`, then swapped in with two renames, so the game never sees a half-written folder and a failed swap restores the old one. If `Wow.exe` is running, a toast says "I updated Bory. Click Load in Bory's bubble once to finish." (on a first install: "Restart World of Warcraft once to meet him"), and Bory in the game says the same through the status block. A failed check is retried in about 5 minutes.

**Start with Windows** is turned on the first time the app runs. It starts with `--hidden`, so only the tray icon appears. The window opens on a manual launch, or when the Retail folder is still unknown. Unticking the box in the window is remembered.

## Tests

From the repo root, with a current stable Rust:

```
cargo test --manifest-path apps/companion/src-tauri/Cargo.toml --lib --no-default-features
```

That covers SavedVariables parsing (including the request context and request types), the status line, `UNB1` decoding with waypoint routes, choosing between a direct plan, a request plan, and an answer, writing `Unbored_Plan/Plan.lua` only on change, the atomic addon swap, Retail folder detection, and the JSON body posted to the planner. It does not open a window.
