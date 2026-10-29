# Context

The words we use for Unbored. Use them in code, docs, UI copy, and talk with the owner. Decisions behind them are in [`docs/adr/`](docs/adr/).

Goal: a helper players want to use, that never annoys and genuinely helps.

**Wisp**
The mascot: a small glowing spirit, and the whole in-game companion UI. Russian: Висп. Voice: warm, light humour, short, no cringe.
_Avoid_: tracker, window, panel, helper, assistant.

**Bubble**
One chat-style message from Wisp, to the right of its portrait. The newest one is the current thing; at most two older short ones stay above it, fading. Never a heavy list.
_Avoid_: popup, tooltip, frame, toast (the toast is the Companion's Windows notification).

**Preset**
A one-click Plan starter chip in the Bubble, such as "Get a mount" or "Surprise me". Starts a Quick plan and sends a Request.
_Avoid_: wizard, mode card, option, filter.

**Plan**
What to do this session: 3 to 7 Steps. Wisp shows one Step at a time; the full list opens on click.
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
What the player asks for: a Plan, an item, or a question. Travels through SavedVariables to the Companion, then to the Server.
_Avoid_: ticket, job, query, call.

**Answer**
The Planner's reply to an item or question Request, shown in a Bubble after Load.
_Avoid_: response, result, reply message.

**Companion**
The desktop app. It pairs the Device, installs and updates the addon, and bridges SavedVariables to the Server.
_Avoid_: client, launcher, agent, uploader.

**Device**
One paired Companion install. The owner approves it via MCP.
_Avoid_: account, user, token, key (in anything the player sees).

**Planner**
Whoever fulfils Requests. Today an external agent reached by webhook; later an LLM on the Server.
_Avoid_: AI, bot, GPT, the server (the Server only stores and relays).

**Load**
The click (or keybind) that reloads the UI to pick up new data. It is a hardware event, so it is allowed to run ReloadUI.
_Avoid_: refresh, sync, reload button, apply.

**Waypoint**
A map point on a Step: the in-game pin and arrow. A Step may have a route of several.
_Avoid_: marker, pin (fine for the game's own map pin), POI, GPS.

**Player context**
The snapshot of the character sent with a Request: location, level, class, gold, progress, and the like.
_Avoid_: telemetry, tracking, stats.

**Player profile**
The fuller, up-to-date player state the Server keeps per character (Player context plus bags, bank, currencies, collections, recent sessions), uploaded by the Companion on each reload.
_Avoid_: account data, telemetry, tracking, dossier.

**Knowledge base**
The small tables bundled with the addon (`Data/*.lua`) that let Wisp answer locally.
_Avoid_: database, wiki, cache.

**Avoid in anything user-facing**: tracker, wizard, token, URL, server address, API key, registration, login.
