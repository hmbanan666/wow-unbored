# Changelog

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
