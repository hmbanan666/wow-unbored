# Context

The words we use for Unbored. Use them in code, docs, UI copy, and talk with the owner. Decisions behind them are in [`docs/adr/`](docs/adr/).

Goal: a helper players want to use, that never annoys and genuinely helps.

**Wisp**
The mascot: a small glowing spirit, and the whole in-game companion UI. Russian: Висп. Voice: warm, light humour, short, no cringe.
_Avoid_: tracker, window, panel, helper, assistant.

**Bubble**
One chat-style message from Wisp, to the right of its portrait. The newest one is the current thing; at most three stay stacked, and older ones fade after 90 seconds. Never a heavy list.
_Avoid_: popup, tooltip, frame, toast (the toast is the Companion's Windows notification).

**Preset**
A one-click Plan starter chip in the Bubble, such as "Get a mount" or "Surprise me". Starts a Quick plan and sends a Request.
_Avoid_: wizard, mode card, option, filter.

**Plan**
What to do next: usually 3 to 7 Steps, but a Plan for one goal covers all of it in order, however many Steps that takes, never cut to a time (ADR 0037). Wisp shows it as one card: the current Step, a short Next preview, and the full list inline on click (ADR 0038).
_Avoid_: route (a Waypoint list inside a Step), session, quest list, tracker.

**Step**
One actionable item in a Plan, written so the player can just do it.
_Avoid_: task (fine in code, not in UI copy), objective, goal.

**Quick plan**
A Plan the addon builds at once, locally, from its Providers and Data.
_Avoid_: fallback plan, offline plan, draft.

**Full plan**
A detailed Plan from the Planner. Replaces the Quick plan only when the player agrees.
_Avoid_: server plan, AI plan, real plan.

**Request**
What the player asks for from the Planner: a Full plan, after a short Survey. Saved in SavedVariables, which the game writes at Send now, a Refresh or logout; the Companion then sends it to the Server. Items and questions are answered locally (ADR 0032).
_Avoid_: ticket, job, query, call.

**Survey**
The short question Wisp asks before a Request: an optional one-line wish, never how much time (ADR 0037). Then a summary with [Send now].
_Avoid_: form, questionnaire, wizard.

**ETA**
Wisp's estimate of when a Full plan should be ready, from the Server's recent planner times, written by the Companion. After it passes Wisp offers one Refresh.
_Avoid_: timer, countdown, progress bar.

**Entity token**
A short id in Plan text, such as `{item:ID}`, `{quest:ID}` or `{pin:MAPID:X:Y}`, that Wisp turns into a native game link with the name from the game. Code and contract word only.
_Avoid_ (in UI copy): token, markup, tag, id.

**Answer**
The Planner's fuller reply to an item or question Request, after Wisp's instant Local answer. Shown in a Bubble at the next login or Refresh.
_Avoid_: response, result, reply message.

**Companion**
The desktop app. It pairs the Device, installs and updates the addon, sends Requests and profiles from SavedVariables to the Server, and writes Answers, Plans and Personal advice into the helper addon in the background.
_Avoid_: client, launcher, agent, uploader.

**Device**
One paired Companion install. The owner approves it via MCP.
_Avoid_: account, user, token, key (in anything the player sees).

**Planner**
Whoever fulfils Requests. Today an external agent reached by webhook; later an LLM on the Server.
_Avoid_: AI, bot, GPT, the server (the Server only stores and relays).

**Load**
The click that reloads the UI after an addon update: "Press Load to finish the update". For new data the same click is called Refresh (see Refresh offer). Both are hardware events, so they may run ReloadUI; neither is ever needed for normal play.
_Avoid_: sync, reload button, apply (in anything the player sees).

**Refresh offer**
The one Bubble that may reload the UI on the player's click: "New stuff is ready. Refresh now?" or, after an Ask, "I'll have a fuller answer after a refresh", with [Refresh] and [Later]. Later means the next login. Never shown per message.
_Avoid_: reload prompt, sync, update (that word is for addon updates).

**Prefetch**
The Companion writing Full plans, Answers and Personal advice into the helper addon in the background, so they are there at the next login, character switch, or Refresh. Teleports and loading screens do not read them.
_Avoid_: cache, preload, download.

**Local answer**
An Answer Wisp builds at once in the game from live APIs and the Knowledge base, with no Request.
_Avoid_: offline answer, fallback.

**Reason code**
A short machine word for why a Request failed (`not_approved`, `companion_offline`, `server_unreachable`, `rejected`, `timeout`, `planner_failed`). Wisp turns each into its own friendly line; the player never sees the code.
_Avoid_: error code, status text (in UI copy).

**Advice**
The one teal "Wisp: <action>" line in an item tooltip, shown only with a personal signal: Alt routing, needed for your Plan, new for your collection, a quest you have not done, or Personal advice. No line is the default (ADR 0035).
_Avoid_: hint, tip, recommendation engine, rule.

**Personal advice**
Advice the Server computes for one character from its Account profile, delivered by the Companion and used from the next natural load.
_Avoid_: server advice, AI advice.

**Player history**
The dated record the Server keeps per character: Requests, Answers, Plans, Step progress, and profile snapshots.
_Avoid_: log, telemetry, tracking.

**Account**
One Battle.net account (its warband): all the player's characters together. Personalization is per Account.
_Avoid_: user, login, profile (in UI copy).

**Alt**
Another character on the same Account. The addon remembers each Alt's class, level, realm and professions with skill when it logs in.
_Avoid_: twink, secondary.

**Warband bank**
The game's account-wide bank shared by all characters of an Account. The route for warbound items.
_Avoid_: account bank, shared bank.

**Alt routing**
Advice that sends an item to the Alt who can use it ("Send to Mira (Alchemy)"): warband bank for warbound items, mail otherwise, never for soulbound items.
_Avoid_: transfer, mule.

**Waypoint**
A map point on a Step: the in-game pin and arrow. A Step may have a route of several.
_Avoid_: marker, pin (fine for the game's own map pin), POI, GPS.

**Player context**
The snapshot of the character sent with a Request: location, level, class, gold, progress, and the like.
_Avoid_: telemetry, tracking, stats.

**Player profile**
The fuller, up-to-date player state the Server keeps per character (Player context plus bags, bank, currencies, collections, recent sessions), uploaded by the Companion after each natural load and linked to the Account. It is a rolling snapshot: an empty field never overwrites a good one. From 0.7 it is read from the Game data snapshot Sections.
_Avoid_: account data, telemetry, tracking, dossier.

**Game data snapshot**
Everything the game legally tells the addon about the player's own characters and Account, kept in SavedVariables in Sections and uploaded by the Companion when the game writes them. Never anything about other players.
_Avoid_: telemetry, tracking, dossier, dump (in anything the player sees: "what Wisp knows about you").

**Section**
One named, versioned part of the Game data snapshot (`char`, `bags`, `questsDone`, `mounts`, ...), with its version, read time, source and body.
_Avoid_: table, chunk, blob.

**Packed id set**
How a big list of ids is stored in a Section: sorted, delta-encoded, base36, in chunks of at most 4,000 characters after `"ids1"`. Keeps SavedVariables small and safe to load.
_Avoid_: compressed list, bitmap, hash.

**Data explorer**
The owner's view of what was collected: MCP `data_catalog` (and `GET /owner/data`), listing every Account, Character and Section with freshness, size and counts.
_Avoid_: dashboard, admin panel, analytics.

**Plan title**
The short human name of a Plan, like a quest title: 3 to 40 characters, no ids, no counts ("Badges for a Timereaver"). Facts go in the Plan details, never in the title.
_Avoid_: name, header, label, summary.

**Goal**
One sentence on a Plan card: what you will do and why it is worth it. May carry Entity tokens.
_Avoid_: objective, description, mission.

**Rewards**
What the player gets from a Plan or Step, shown quest style under "You will get:" as native links (up to 6 per Plan, 3 per Step).
_Avoid_: loot, drops, prizes.

**Condition**
An optional "If ..." on a Step that the addon checks live from the game (a currency, item, level, quest or achievement); met shows "Ready", unmet shows the progress and marks the Step "not yet".
_Avoid_: requirement, prerequisite, gate, rule.

**Suggestion**
A ready idea for this Character, computed by the Server from the Game data snapshot and the Catalog (or by the addon from what it sees live), shown as a chip in the choice Bubble. Picking one sends a Request.
_Avoid_: recommendation, quest, offer (that word is the Refresh offer), AI idea.

**Catalog**
The vetted ids from the Knowledge base (`addon/Data/*.lua`), exported to `packages/contracts/catalog/catalog.json` for the Server. Every row has a primary source URL.
_Avoid_: database, game DB, wiki dump.

**Knowledge base**
The small tables bundled with the addon (`Data/*.lua`) that let Wisp answer locally.
_Avoid_: database, wiki, cache.

**Avoid in anything user-facing**: tracker, All steps (window), wizard, token, URL, server address, API key, registration, login, delete (Advice never says it).
