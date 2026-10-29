# Changelog

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
