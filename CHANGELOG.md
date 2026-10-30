# Changelog

History only. Each GitHub release shows just its own changes, generated from Conventional Commits (docs/adr/0022).

## 0.7.0

- Plans cover the whole goal, with no time limit to pick. Want a proper plan? Answer one short question, send it, and Wisp shows she is working on it until it is ready, with one Refresh when it is.
- Steps have real game links: hover an item, quest, achievement, spell or currency for its tooltip, click a place or NPC for the map pin.
- Item tooltips only speak when it is about you: your plan, something new for your collection, a quest you have not done, or a reagent for one of your alts, even one you played on another PC. A setting turns the lines off.
- Wisp learns about your own characters (quests, collections, reputations, professions and more) so plans fit what you have left. Nothing about other players is read. See "What Wisp knows about you" in the README to turn it off.
- Questions and items are answered in the game; anything bigger becomes a plan.

## 0.6.0

- No reloads while you play (docs/adr/0012). Presets, Ask and items never reload the UI. Wisp answers locally first; the Companion prepares Full plans, Answers and Personal advice in the background, and Wisp picks them up at the next log in or after one "New stuff is ready. Refresh now?" with Refresh or Later.
- Ask is a chat: common questions (what's here, achievements here, rares here, what to collect) are answered at once in English or Russian, in up to three bubbles. Anything else goes to the planner with "I'll have a fuller answer after a refresh".
- Items: What is this item? is a pick mode (pick the item up, Esc cancels); picking up any item shows "Drop it on me to ask". Alt+Right-click is gone.
- Tooltip Advice: every bag item gets one Wisp line with what to do (use, turn in, equip, sell, disenchant, keep for your profession, send to an alt by warband bank or mail). Never says delete, never sells epic or BoE items, never sends soulbound items. Personal advice from the server arrives in `Unbored_Plan/Advice.lua`.
- Alts: Wisp remembers each character's professions and level account-wide, so advice can route items to the alt who uses them.
- New bubble: always shows the full text, a small meta line, one row of matching icon buttons, a pill when folded, separate Wisp and bubble sizes. No glow ring. "Continue <plan> or something new?" after logging back in.
- Minimap button on the rim, draggable around the edge.
- Requests: item and question requests no longer fail on an empty mode. Every failure has a plain reason line (not approved, Companion offline, planner unreachable, rejected, taking long, planner failed).
- Profile: kept up to date while you play, so a log out no longer uploads empty bags or gold; the server never overwrites good data with empty values. The server keeps per-character history linked to the account (MCP `get_player_history`, `put_item_advice`).
- Companion 0.6.0: downloads Personal advice, says "Wisp picks it up next time you log in, or click Refresh in Wisp's bubble" instead of asking for Load.
- Releases: notes list only this version's changes with an Install / Download section on top; README is player-first in English and Russian; technical docs moved to docs/DEVELOPMENT.md.

## 0.5.0

- Everything happens in Wisp's bubble. What is this item?, Ask something, and What to do nearby? open in the bubble (Alt+Right-click an item shows it there too). The old main window is gone; Import, Export, and Build left the menu (`/unbored import` still works).
- Wisp always says what is going on while a request waits: the Companion still needs a one-time OK, the PC was disconnected, the planner can't be reached, or the Companion isn't running. After 10 minutes it says it is taking long and offers Try again. A failed request says so in plain words with Try again; raw errors and ids are never shown.
- When the Companion installs a newer Wisp, she says "I've been updated! Press Load to apply." (Load or Later). If Load did not pick it up, she asks for one game restart.
- In combat the bubble hides and Wisp dims; clicks wait until combat ends.
- A finished plan plays a cheer and says "All done, nice work! What next?". A preset with nothing to do here says so instead of an empty plan.
- Lua errors are caught: Wisp prints one short line, and `/unbored errors` lists the last ten for a bug report.
- Companion 0.5.0: writes a small status block into `Unbored_Plan/Plan.lua` for Wisp (docs/companion-api.md). Finds the game and installs Wisp before the PC is approved, and without the server. Clear pairing: "Connecting...", "Waiting for a one-time OK" with the PC name, then "Connected! You're all set" and a toast. A setup checklist in the window. Friendly errors (technical text only under Advanced). Wakes up as soon as the game saves, instead of every 30 seconds. A request the planner rejects becomes a failed request in the game instead of a silent wait.

## 0.4.3

- Bubble stack (docs/adr/0004): above the current bubble at most two older one-line messages ("Done: ...", "Skipped: ...", an answer you read) stay for a while and fade, so Wisp never shows more than three.
- Player profile (docs/adr/0011): the addon saves a profile on every logout and reload (context, bags, last-seen bank and warband bank, currencies, collections, renown, recent sessions and steps). Companion 0.4.1 uploads it to `POST /v1/profile`; the server keeps one per character, and the new MCP tool `get_player_profile` returns it.
- Docs: ADR 0010 (local first, server brain), ADR 0011, ADR 0004 updated, the product goal in README and CONTEXT, and the decision process in AGENTS.md.

## 0.4.2

- Quick plan, then Full plan (docs/adr/0005). A Preset click builds a Quick plan in game at once from the Providers for that chip's mode, then sends the Request and reloads in the same click. While the Full plan cooks, the Bubble shows the Quick plan's step with "A better one is cooking" and Load.
- When the Full plan arrives, Wisp asks "Better plan's ready! Load it in?" with Switch or Keep this one, instead of replacing the Quick plan. Steps already finished carry over: they count in the progress and are dropped from the Full plan.
- Plans built in game have at most 7 steps.
- New docs: `CONTEXT.md` (glossary), `docs/adr/` (decisions 0001-0009), and `AGENTS.md`.

## 0.4.1

- Starting a plan is all Wisp. With no plan Wisp greets "Hi! What shall we do?" and shows big preset chips in the bubble: Stay here, do stuff nearby; Get a mount; Collect stuff nearby; Grind / level / renown; Farm gold / mats; Surprise me. One click saves the request and reloads, and Wisp says "Got it, cooking a plan..." until Load. Small 30m / 1h / 2h chips are optional (1h by default). Something else... is one text box in the bubble.
- The presets are one table, `Data/Presets.lua`. A preset request carries `topic` (`nearby`, `mount`, `collect`, `grind`, `gold`, `surprise`) so the planner knows which chip it was.
- A finished plan: Wisp celebrates ("Nice! What next?") and offers the chips again.
- The menu puts the step first when a plan is running: What next?, Skip this step, Show route on map, then New plan, What is this item?, Ask something, Settings. Settings are basic (Size, Lock position, Hide, Keybinds); the rest is under More.
- The old wizard (mode cards, time buttons, wish box) is gone. `/unbored`, `/unbored roam|quests|events|fun|farm`, `/unbored 30|60|120`, and the other slash commands still work.

## 0.4.0

- Wisp, a teal glowing spirit with a compass and a backpack, is the whole in-game UI: a round portrait you can move and lock, with one chat bubble beside it. The bubble shows the current step as written, its note, the route point, a small `2/5`, and ✓ Done / ➜ Skip. Text wraps and the bubble grows; − folds it to the portrait. It opens toward the middle of the screen.
- Click Wisp for the game's own menu: New plan, What is this item?, What to do nearby?, Ask something, Settings, Hide. The old tracker is Settings → Show all steps.
- New plan is the same three questions, asked by Wisp. Ask something is one box and Send. What to do nearby? sends a nearby question, or builds a Roam list without the companion.
- While a request is out Wisp bobs and glows, the bubble says "Thinking...", and the one button is **Load**. Every send still saves and reloads in the same click.
- Answers from the planner appear in the bubble as written. Waypoints in an answer become one step in front of the current plan.
- What is this item?: drop an item on the slot or on Wisp, or Alt+Right-click it in your bags (a post-hook on `HandleModifiedItemClick`, bag buttons are not touched). The screen says what Unbored knows and offers Ask about it.
- Item tooltips get one Wisp line when there is something to say: the planner's answer for that item, a note from `Data/Items.lua`, "Needed for your plan", or a missing mount, pet, or toy.
- Every new string is in the locale table, in English and Russian. The mascot name is one string, `ns.MASCOT_NAME`.
- Server and MCP: requests have a `type` (`plan`, `question`, `item`) with `question`, `topic`, and `item`; the webhook body includes them. New tool `answer_request` (message up to 1,000 bytes, optional waypoints, optional plan). `list_requests` shows the type; `fail_request` works for every type.
- Companion 0.4.0: one Wisp window with a big status line ("All set, go play", "Waiting for approval", "Updating addon...", "Plan ready, press Load in game"), a bobbing Wisp while busy, a folder picker, and everything technical under Advanced. Wisp is the app, tray, and toast icon. The companion carries answers into `Unbored_Plan`.

## 0.3.0

- The main window is a three-step request: what (mode cards with a one-line description), how long, and an optional wish. One button, Get plan, saves the request and reloads in the same click. While the plan is being made, the only control is Load plan.
- A companion plan for this character's request starts on the next load, with no prompt. Use it and Not now are gone.
- New tracker window for the active plan, in the quest-tracker style: step count, minutes left, the current step with its full note, dimmed next steps that expand on click, Done and Skip icons, collapse, lock, and a saved position. It stays when the main window closes.
- The current step sets the waypoint and super-tracks it, plus a TomTom arrow when TomTom is loaded. No chat lines unless turned on.
- Plan tasks accept `waypoints`, a route of up to 10 points that advances within 30 yards. The tracker shows Point 2/4 and the distance.
- Get plan sends the player context (zone, position, level, class and spec, item level, gold, skyriding, instance, hearth, tracked quests, active plan) so plans start near you.
- Load plan keybinding. Import and export moved to the gear menu.
- Companion: toast "plan ready, press Load plan", self-update from signed GitHub builds every 4 hours, atomic addon updates with a /reload toast when WoW is running, and Start with Windows on by default.

## 0.2.0

- Get plan in the Unbored window. Pick a mode and a budget, add an optional wish, then reload. The companion brings the plan back and Use it appears when that request is ready.

## 0.1.0

- A plan written by Unbored Companion (`Unbored_Plan`) is offered on load. Use it, or Not now.
- Load on Interface 120105 and 120100.
- Hallow's End matches calendar icon textures, not only the holiday id. Other holidays also match the English calendar title.
- The first Skip moves a task to the end. The second Skip drops it.
- Huolon is the one curated rare, keyed by tracking quest 33311.

- First Retail-only session planner: Roam, Quests, Events, Fun achievements, Farm.
- One current task, the next task, and the rest collapsed. One waypoint at a time.
- Done, Skip, and Waypoint, plus event auto-complete.
- `UNB1:` plan import and `UNB1P:` progress export.
- SavedVariables session, optional companion `Plan.lua` seam, minimap and addon compartment button.
