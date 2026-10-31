# Unbored v0.9 decisions (self-grill 2026-10-31, owner said "grill yourself, pick the recommended answers"; approved by the owner 2026-10-31)

Repo state read: `main` at 2fb2821 (v0.8.0 shipped, tech debt PR #28 and pnpm 12 PR #29 merged, server on hk). Inputs: docs/decisions-v0.7.md (D47-D82), docs/decisions-v0.8.md (D83-D121), ADR 0035-0045, TESTING.md (0.8.0), `addon/` (Core/Data/World.lua calendar section, Providers/Events.lua, Providers/Quests.lua, Core/Advice.lua, Core/Suggestions.lua, UI/Mascot.lua, Core/Profile.lua:188), `apps/server/src/suggestions.ts` (TODO at :364), `apps/server/src/blizzard.ts`, `apps/companion/ui` + `src-tauri/src/{mood,gui}.rs`, `/workspace/unbored/ideas-backlog.md` section "0.9 состав" (owner decision 2026-10-31), owner message 2026-10-31 on chat and choices, owner feedback on 0.8.0 (screenshot `0.8-time-leak.jpg`).
Format as in v0.7/v0.8: question, chosen answer, short reason. **TODO(verify-in-game)** marks client behaviour not confirmed from docs.
Theme of 0.9: **Bory offers, the player picks.** First the two 0.8 card bugs (section I). Events and unfinished quest chains become ideas built from the player's own data; tooltips get personal from Account data; Bory's face follows what is going on. Plus the leftovers (signing key, ru names, Companion in Russian, Blizzard API).

Hard constraints (owner, unchanged plus 0.9): native game UI only, no overlay, no clipboard. **No free-text input anywhere, ever: no Ask, no chat, no wish field.** The player only picks from offered options; a plan is built from the pick. No time budget in any form. Fewer buttons. ReloadUI only from a player click that needs it (Send / Refresh / Load). Addon has no network; SV read at login/reload, written at reload/logout. One unified release `v0.9.0`. The 0.8 card is the base of 0.9: no new windows. Never invent ids or game data; a catalog row needs a primary source URL, otherwise it is left out.

Out of scope: site, distribution, monetization.

## API research (warcraft.wiki.gg, read 2026-10-31, retail 12.x, TOC 120107)

Calendar:
- `C_Calendar.OpenCalendar()` requests data and fires `CALENDAR_UPDATE_EVENT_LIST`; **if called during loading (even at PLAYER_ENTERING_WORLD) the query does not return.** https://warcraft.wiki.gg/wiki/API_C_Calendar.OpenCalendar . Today `Core/Init.lua` calls it at ADDON_LOADED and PLAYER_ENTERING_WORLD only, so the `calendar` Section may be empty unless Blizzard's own UI asked. Fix in D127.
- `C_Calendar.GetDayEvent(monthOffset, day, index)` -> `CalendarDayEvent`: `eventID`, `title`, `startTime`, `endTime`, `calendarType`, `sequenceType` (START/ONGOING/END), `iconTexture` (fileID), `numSequenceDays`, `sequenceIndex`, `dontDisplayEnd`, plus invite fields we must not read (D48). Predicates `MayReturnNothing`, `SecretInChatMessagingLockdown` (12.x). "Inaccurate until PLAYER_ENTERING_WORLD". https://warcraft.wiki.gg/wiki/API_C_Calendar.GetDayEvent
- `C_Calendar.GetHolidayInfo(monthOffset, day, index)` -> `name`, `description`, `texture`, `startTime?`, `endTime?`; **monthOffset only 0 or 1.** https://warcraft.wiki.gg/wiki/API_C_Calendar.GetHolidayInfo
- monthOffset is relative to the month the calendar frame shows (`C_Calendar.SetMonth`), the wiki text says "from today"; the addon already reads by offset from the viewed month and never calls SetMonth. TODO(verify-in-game) with the calendar frame open on another month.
- Limits: no stable public holiday id. `eventID` is not the Holiday.db2 id (Hallow's End matched by `iconTexture`, see `Data/Holidays.lua`). Timewalking weeks appear as `HOLIDAY` rows, matched by texture or localized title: TODO(verify-in-game), we record what the client returns first (D126). Only the calendar shows what is on; nothing tells which dungeons/bonus a week has beyond title/description text.

Quest chains:
- `C_QuestLine.GetQuestLineInfo(questID [, uiMapID [, displayableOnly]])` -> `questLineName`, `questLineID`, `questName`, `x`, `y`, `isCampaign`, `isImportant`, `isLocalStory`, `isAccountCompleted`, `inProgress`, `isQuestStart`, `isMeta`, `isDaily`, `startMapID` (11.0.7). https://warcraft.wiki.gg/wiki/API_C_QuestLine.GetQuestLineInfo
- `C_QuestLine.GetAvailableQuestLines(uiMapID)` -> same struct list; only after `C_QuestLine.RequestQuestLinesForMap(uiMapID)` (async; `QUESTLINE_UPDATE(requestRequired)`). https://warcraft.wiki.gg/wiki/API_C_QuestLine.GetAvailableQuestLines , https://warcraft.wiki.gg/wiki/API_C_QuestLine.RequestQuestLinesForMap , https://warcraft.wiki.gg/wiki/QUESTLINE_UPDATE
- `C_QuestLine.GetQuestLineQuests(questLineID)` -> questIDs; `C_QuestLine.IsComplete(questLineID)` -> bool. https://warcraft.wiki.gg/wiki/API_C_QuestLine.GetQuestLineQuests , https://warcraft.wiki.gg/wiki/API_C_QuestLine.IsComplete
- `C_CampaignInfo.GetAvailableCampaigns()`, `GetState(campaignID)` (Complete / InProgress / Stalled), `GetCampaignInfo` (`name`, `description`, `hideFutureChapters` 12.0.1), `GetChapterIDs`, `GetCurrentChapterID`, `GetCampaignChapterInfo` (`name`, `rewardQuestID`). https://warcraft.wiki.gg/wiki/Category:API_systems/WarCampaign
- `C_QuestLog.GetZoneStoryInfo(uiMapID)` -> zone story `achievementID`. https://warcraft.wiki.gg/wiki/API_C_QuestLog.GetZoneStoryInfo
- Limits: **no global list of quest lines.** A chain is visible only through a quest in the log, a map we ask about, or a campaign. Names come from the client in the client language (good for ru). Map queries are async and per map. Order of `GetQuestLineQuests` as chain order: TODO(verify-in-game). Account-completed filtering (warband) hides lines on alts: TODO(verify-in-game) what `GetAvailableQuestLines` returns for an alt.
- All of the above are `AllowedWhenUntainted`, out of combat only, as every collector (D50).

---

## A. No free text (owner 2026-10-31)

- D122 Q: What goes? A: the **Ask** menu item and view (`MENU_ASK`, `askView`, `ShowAsk("ask")`, `ASK_*` strings), the "nearby" question box, and the **Something else** wish field with its minutes field (`wishEdit`, `minutesEdit`, `WISH_*`, `custom` path in Survey). Local intents that answered Ask ("what is nearby", "achievements here") become ideas (D139) or are dropped. Reason: owner: no chat, ever; typed input costs a reload per message and gives the player work.
- D123 Q: What stays as "by request"? A: **[Surprise me]** (server Request with no wish) and every idea chip (Request with the idea attached). "Что это за предмет?" / drop an item on Bory stays: it is a pick, not text. Reason: owner: "new things on request, he just clicks".
- D124 Q: Old SV and server? A: the addon ignores a saved `request.custom` draft (drops it at login, no error); a `queued` custom request from 0.8 is still sent once. The server keeps accepting `mode/topic = "custom"` from 0.8 addons; `answer_request` unchanged. Reason: no lost request, no break for old installs.
- D125 Q: ADR 0037 (minutes only in the custom form)? A: amended: **no time anywhere** in the addon; the server field `budget` stays readable for old requests. New ADR 0046 "Choices only, no free text" supersedes the Ask parts of 0004 and the custom wish of 0037. Reason: one rule, written down.

## B. Events as ideas

- D126 Q: What does the `calendar` Section carry? A: v2: per event add `texture` (`iconTexture`), `sequenceType`, `numSequenceDays`, and for today's and tomorrow's holidays `description` from `GetHolidayInfo` (offset 0/1 only, capped 300 bytes). Still only HOLIDAY/SYSTEM/RAID_RESET/RAID_LOCKOUT, 14 days. Reason: texture is the only stable key we know of; the owner's own uploads then show the real eventIDs/textures for Timewalking, and catalog rows get added from data plus a wiki/wowhead source.
- D127 Q: Make the calendar actually load? A: call `C_Calendar.OpenCalendar()` again 5 s after PLAYER_ENTERING_WORLD (C_Timer, out of combat), read the Section and rebuild ideas on `CALENDAR_UPDATE_EVENT_LIST` (settled 2 s), still once per login. Never `SetMonth`. Reason: the wiki says loading-time calls do not return; today we depend on luck. TODO(verify-in-game): event fires after the delayed call.
- D128 Q: Catalog for events? A: `Data/Holidays.lua` grows into the event catalog: each row `match = { textures, titles, holidayIDs }`, `tasks` with ids only from a source URL. New kind of row: **Timewalking** (one row per expansion week) with tasks: the weekly "5 Timewalking dungeons" quest (questID only if sourced), currency Timewarped Badge (id from a source), vendor/drop mounts and toys (ids from warcraft.wiki.gg MountID / wowhead). Rows without a verified match key stay commented out with TODO(verify-in-game). Reason: owner's example (TW, 5 dungeons, a mount you lack); no invented ids.
- D129 Q: How is an event made personal? A: a task is shown only when it is still open for this player: achievement not done on the Account, mount/toy not owned on the Account, weekly quest not done this week by this character (`IsQuestFlaggedCompleted`), and with a `condition` (D95) for currency targets ("If you have 5,000 {currency:ID}") so the live counter shows progress. An event with no open task gives no idea. Alt line: "None of your N characters has it" (D105 rule 5). Reason: an event is only interesting when it gives you something you lack.
- D130 Q: Coming up vs on now? A: on now: score 100 (+20 ends in 3 days) as D105. Starting within 3 days: score 70 with why "Starts in 2 days"; picking it before it starts gives a plan for when it starts, with a muted line "Starts <weekday>". Reason: lets the player prepare (badges, alts) without a reminder system.
- D131 Q: Local vs server? A: both, as D111: the addon builds event ideas live from today's calendar + catalog (works without Companion, no reload), the server builds them from the `calendar` Section + Account sets (alts, account mounts). Dedupe by event + reward id, server first. Reason: the addon-only player still sees TW; the server adds Account knowledge.

## C. Unfinished quest chains as ideas

- D132 Q: Which chains count as "unfinished"? A: three sources, per Character, in order: (1) **campaigns** with `GetState` InProgress or Stalled; (2) **chains of quests in the log** (`GetQuestLineInfo(questID)` for each log quest); (3) **started chains on recent maps**: `GetAvailableQuestLines(mapID)` for the current map and the 3 most played mapIDs from `sessions`, rows with `inProgress = true` or (`isCampaign` or `isImportant`) and `isQuestStart = true`. Skip `isDaily`, `isHidden`, `isCombatAllyQuest`, `isMeta`. Reason: these are the chains the game itself knows the player is in or is offered; there is no global list (see limits).
- D133 Q: Progress? A: `GetQuestLineQuests(questLineID)` against `IsQuestFlaggedCompleted` gives done/total and the next quest; `IsComplete` short-cuts finished lines. Campaign: chapter name from `GetCampaignChapterInfo(GetCurrentChapterID)`. TODO(verify-in-game): quest order and whether the list includes optional side quests. Reason: real numbers ("3 of 8") from the client.
- D134 Q: New Section? A: `questLines` (scope C, v1, prio after `questLog`): up to 40 rows `{ questLineID, name, campaignID?, chapter?, mapID, x?, y?, done, total, nextQuestID?, flags = "c|i|l" }`, read at login +20 s staged and on `QUEST_TURNED_IN` (settled), map requests only for the 4 maps of D132 with a 10 s wait for `QUESTLINE_UPDATE`. Names are in the client language. Budget ~4 KB. Reason: same Section pattern as 0.7; the server gets chain state for every alt.
- D135 Q: Idea for a chain? A: kind `chain`: title = chain name (client text, <= 40 chars cut at a word), goal "Continue: 3 of 8 done" / "Продолжи: сделано 3 из 8", next quest as `{quest:ID}` token, pin from `x,y` when the start is on a map, reward = the zone story achievement via `GetZoneStoryInfo(mapID)` when open. Score 70; campaign +10; `isAccountCompleted` on another character -> why "Your <Alt> already finished it" (story known, faster). Reason: owner wants unfinished chains; names and ids all come from the game.
- D136 Q: What happens on pick? A: a **local Quick plan at once, no reload**: step 1 = next quest (take it at the pin, or "in your log" when active), then the remaining quest titles of the chain as steps (titles via `GetTitleForQuestID`, plain text when unknown), auto-advance on `QUEST_TURNED_IN` (existing completion). Card shows title, "3 of 8", reward. **[Want a proper plan?]** stays as D109 for a server plan with context. Reason: the chain already is a plan; no server wait needed.
- D137 Q: Alt angle on the server? A: a rule over all Characters' `questLines` and `questsDone`: a chain started on one alt and dropped (no progress for 14 days) shows up on that alt with why "You stopped here 2 weeks ago". Reason: Account memory is the moat; local code cannot see this.
- D138 Q: Planner context? A: `get_game_data` sections list includes `questLines`; `list_requests` description: a request with `suggestion.kind = "chain"` carries `questLineID` and `nextQuestID` as ground truth. Reason: the Planner builds on ids it got, never guesses chain quests.

## D. The choice Bubble in 0.9

- D139 Q: Layout? A: "What shall we do?" then **up to 4 idea chips** (mixed kinds: event, chain, achievement, rare, collection), then one row **[Surprise me] [More ideas]**. More ideas reveals the next ideas (up to 6 more) and the five old presets inline; no Something else. With no ideas at all: the presets and Surprise me. Reason: one less button than 0.8, no text box, choice first.
- D140 Q: How many ideas reach the game? A: server `perCharacter` 6 -> **10**, `perRule` 2 -> 3, Suggestions.lua budget stays (20 KB, 2k literals); local ideas up to 3 (event, chain in log, rare here). Reason: More ideas needs something behind it; budget still fits.
- D141 Q: Freshness? A: an idea disappears when it is done live (achievement earned, mount learned, chain quest turned in), not only at relog; event ideas expire at the event end. Reason: never offer what the player just did.

## E. Personal tooltips from Account data

What exists (ADR 0035): plan item, quest-start item not done, new for the Account's collection, Personal advice from the Planner (`put_item_advice`), Alt routing for reagents. Generic lines are gone; no line is the default.

- D142 Q: What is new? A: **"Also on your characters"**: where else this item is on the Account, from the uploaded `bags`, `bank`, `reagentBank` Sections of every Character and the account `warband` Section: "Also: Grubbyman 40, Warband bank 200" / "Ещё: Grubbyman 40, банк отряда 200". Up to 3 places, then "+N". Never counts this character's own bags (the addon has them live). Reason: the single most useful fact only the Server knows; no guessing.
- D143 Q: How does it reach the addon? A: the server builds an **Account holdings index** on each snapshot (debounced like Suggestions) and the Companion writes it into `Advice.lua` as `UnboredAdvice.holdings = { places = { "Grubbyman-Realm", ..., "warband" }, items = { [itemID] = "1:40,3:2,w:200" } }` (one string per item, 2 literals). Only items held somewhere other than this install's current character; cap 3,000 items, <= 60 KB, inside the D76 Prefetch budget (raise the total to 260 KB, literals < 20k). Places last seen over 60 days ago are left out. Reason: compact, fits SV limits, same file and path as Personal advice.
- D144 Q: How many lines? A: **at most two Bory lines**: the first matching action line (existing order: plan, quest start, collection, personal, alt routing) plus the holdings line, muted, under it. Holdings alone is fine. ADR 0035 amended (new ADR 0048). Reason: "where else" is a fact, not an action; it should not hide routing advice.
- D145 Q: Better alt routing with Account data? A: routing uses the server Account digest (already in 0.7, D76) for professions of alts not seen on this PC, plus the holdings: when an alt that uses the reagent already has a stack, the line says "Send to Grubbyman (has 40)". Reason: same line, more personal.
- D146 Q: Quest-start items, alt-aware ("your alt already did it")? A: **not in 0.9**; the line stays per character as today. Reason: the server has no item -> quest map, so it would need invented data.
- D147 Q: No data? A: no Companion, data sharing off (D62), or item not in the index -> no holdings line, exactly as today. Settings toggle "Bory lines in tooltips" covers both lines. Reason: owner: nothing without personal data.

## F. Bory moods (static pictures only)

The four moods (idle, thinking, waiting = yawn, happy) already exist in the addon (`Media/Bory*128.tga`) and the Companion (`ui/img/bory-*.png`), from `art/bory/bory-moods.jpg`.

- D148 Q: New animation? A: **no.** The 0.8 float/glow while thinking (D88) stays as it is; nothing new moves. Mood = swap of the Bory layer only. Reason: owner: pictures change, no animation.
- D149 Q: Which mood when? A: one table `MOOD_FOR_VIEW` in `UI/Mascot.lua` (and the same idea in `mood.rs`), every view gets exactly one mood:
  - hello / ideas: idle; ideas with an event on now or a chain "almost done" (1-2 quests left): happy;
  - confirm: idle; sent and waiting under ETA: thinking; past ETA ("should be ready"): waiting;
  - plan ready / offer: happy; step Done: happy for 4 s then back (a C_Timer swap, no animation); plan finished: happy;
  - error, expired, Companion not running: waiting; idle with no plan for 10 min after login: waiting (one swap, reset on any click).
  Reason: Bory reacts to what happens with the art we have.
- D150 Q: More moods (sad, excited)? A: not in 0.9; new art needs the owner's drafts and the same 2-layer pipeline (`art/build_assets.py`). The table makes adding one a one-line change. Reason: no art, no feature.

## G. Leftovers

Signing key:
- D151 Q: How is 0.9 signed? A: with the **old** secret `TAURI_SIGNING_PRIVATE_KEY` (installs on 0.8 trust only the old key); the 0.9 binary embeds the **new** pubkey (already in `tauri.conf.json`). The release dry run asserts the embedded pubkey equals `apps/companion/src-tauri/updater-pubkey-v2.pub` (committed public half only) so a revert cannot slip in. Reason: the only order that keeps auto-update working.
- D152 Q: When to switch, and who? A: **the bot owner (Nick's Unbored bot) does it, not the implementing agent.** After `v0.9.0` is published and every known install reports Companion 0.9 (MCP `list_devices` shows the version), the bot sets `TAURI_SIGNING_PRIVATE_KEY` to the new key (kept outside the repo) and removes `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. 0.9.1+ are signed with the new key. An install still on <= 0.8 then needs a manual reinstall: TESTING and README note it. Reason: Tauri v2 takes one pubkey; today the only installs are the owner's; secrets are not the agent's to touch.

Account key hash:
- D153 Q: Migration? A: activates on the first upload from Companion 0.9 (ADR 0044). Release check: MCP `data_catalog` shows the GRUBBYMAN rows under the hashed key and none under the plain one; then the bot owner deletes the pre-migration data copies on hk (not the implementing agent). Reason: planned in 0.8; verify before deleting.

Russian names for rares (suggestions.ts:364):
- D154 Q: Where does a ru rare name come from? A: catalog rows get `npcID` (sourced, wowhead/warcraft.wiki.gg). When Blizzard API keys are on, the server fetches `GET /data/wow/creature/{npcID}?namespace=static-{region}&locale=ru_RU` once, caches name per locale in SQLite (same cache as the id check), and uses it in ru ideas. Without keys or on error: English name, as today. The addon, when the rare is live on the minimap, uses the vignette name (client language). Reason: names from Blizzard or the client only; no hand-typed translations.
- D155 Q: `{npc:ID}` for rares? A: yes, ru and en ideas use the npc token with the entity side table (name from the cache, mapID from the row). Reason: clickable as owner asked in 0.8.

Companion in Russian:
- D156 Q: Which language? A: automatic, no setting: the `lang` the addon wrote in the latest `char` Section on this PC (the language Bory speaks), else the Windows UI language (`sys-locale`), else English. Supported: en, ru. Reason: matches the game; fewer buttons.
- D157 Q: What is translated? A: every player-visible string: window (`index.html`, `app.ts`), moods/headlines/hints (`mood.rs`), tray menu and tooltip, Windows toasts, errors, the privacy line and its README anchor (Russian section). One table per language in Rust (`i18n.rs`), the UI gets the strings through the existing state payload, `<html lang>` set from it. A test fails when a key is missing in one language. Reason: one source, no drift.
- D158 Q: Installer? A: NSIS gets English + Russian chosen by the Windows language (`languages`, `displayLanguageSelector: false`); MSI stays English (one file name `_en-US.msi` per D117). TODO: confirm the Tauri v2 NSIS options at build time. Reason: no extra click.

Blizzard API:
- D159 Q: Turn the id check on? A: **done (2026-10-31).** `BLIZZARD_CLIENT_ID`, `BLIZZARD_CLIENT_SECRET`, `BLIZZARD_REGION=eu` are set on the hk service; the server logs "Blizzard id check on (eu)". The implementing agent does not touch the server env; tests mock the Blizzard API. Reason: "never invent ids" gets a real check, and D154 needs it.

unresolvedIds (Profile.lua:188 TODO):
- D160 Q: Is `unresolvedIds` the right Section for unmatched advice items? A: yes, keep it there with kind `"advice"`; remove the TODO; `data_catalog` shows counts per kind. Reason: one place for "ids Bory could not help with"; a new Section adds nothing.

## H. Release, docs, tests

- D161 Q: Version and release? A: `0.9.0` everywhere the 0.8.0 bump touched; one tag `v0.9.0` (ADR 0026); dry run first (D117) incl. D151 check; notes per ADR 0022/0041. The owner tags. Reason: owner rules.
- D162 Q: ADRs? A: next free numbers after 0045 (Connect again), checked against `docs/adr` at 2fb2821: 0046 Choices only, no free text (D122-D125); 0047 Events and quest chains as ideas (D126-D141, amends 0040); 0048 Account holdings in tooltips (D142-D147, amends 0035); 0049 Companion language (D156-D158); 0050 Updater key rotation (D151-D152). `CONTEXT.md`: terms Idea (player word for Suggestion), Chain, Holdings, Mood; _Avoid_ "Ask", "chat", "wish". Copy this file to `docs/decisions-v0.9.md`.
- D163 Q: Tests? A: Lua: no Ask/Something else views or strings left; old `custom` draft dropped; calendar v2 reader with mocked delayed OpenCalendar; questLines collector (campaign, log, map, done/total, combat skip); chain idea + local Quick plan + auto-advance; idea removal on live completion; holdings line (2 lines max, own bags excluded, +N, no data -> nothing); mood table covers every view kind. TS: event rule with TW fixture (open/done/owned), chain rule + dropped-alt rule, perCharacter 10, holdings index (places, cap, stale cut), creature name cache ru/en/fallback. Rust: i18n key parity, language pick order, Advice.lua with holdings within budget.
- D164 Q: TESTING.md? A: rewrite for 0.9.0 (Russian): no "Спросить", no "Что-то другое" anywhere; TW / holiday ideas from the real calendar; chains ("Продолжи: 3 из 8", pin, quick plan, auto-advance); holdings line on a reagent your alt also has; moods in each state; Companion in Russian on a ru client; signing check; hash migration check; each TODO(verify-in-game) above. Remove 0.8 items that no longer apply.

## I. Quick fixes from the 0.8.0 feedback (do first)

Owner 2026-10-31, screenshot `0.8-time-leak.jpg`: the card is collapsed ("Show more"), and the line "about 1 h 40 min" floats on its own in the middle of the screen, outside the card. The chevron next to "Show more" points up while the card is closed.

- D165 Q: Why does the time line leak? A: root cause in `UI/Mascot.lua`: `LayoutCard` returns early when the card is closed (`if not view.open then return end`), so `self.where` (the footer: route point, distance, "about 1 h 40 min" from `Steps.Footer`) is never passed to `put()` and never hidden. It keeps its old anchor `TOPLEFT` of the bubble at the y it had when the card was open, so after the bubble shrinks it is drawn below the bubble, over the world. Fix: `Layout` first hides and clears every region it may place (one list: `meta`, `header`, `title`, `condition`, `message`, `why`, `sub`, `where`, `goal`, `details`, `pipRow`, `list`, `rewardsHeader`, every `rewardLines[i]`, `cardToggle`), then places only what the view shows. The footer time belongs to the open card only, as D91 amended says. Reason: one reset at the top means an early return can never leave a region shown again.
- D166 Q: Chevron direction? A: `Media/IconChevron.tga` points **left** (checked in the file: a "<" shape). `textToggle.SetOpen` rotates it by `open and pi/2 or -pi/2`; `Texture:SetRotation` turns counter-clockwise, so today closed shows "^" and open shows "v", which is the wrong way round (the screenshot shows "^" on a closed card). Fix: closed -> `pi/2` (points down, "v": there is more below), open -> `-pi/2` (points up, "^": fold it up). Same check for the card collapse icon (`self.collapse`, `IconChevron`) with its own `SetTexCoord` flip. Remove the TODO at `Mascot.lua:538` and replace it with a comment that states the source direction. Reason: the owner's rule: closed down, open up.
- D167 Q: Guard? A: Lua tests with a mocked frame layer: (1) open card with `where`, then closed: `where`, `goal`, `details`, `list`, `pipRow`, reward lines 2+ are hidden; (2) closed -> open -> closed leaves no region shown that the closed view does not list; (3) `SetOpen(false)` sets rotation `pi/2`, `SetOpen(true)` sets `-pi/2`. TESTING.md: collapse a card that has a time line and look under the bubble; arrow down when closed, up when open. Reason: both bugs were silent in tests; make them loud.

## Open risks
1. Calendar: OpenCalendar timing, Timewalking match keys and the month offset are TODO(verify-in-game). Until the owner's data shows TW textures/ids, TW ideas come only from title matching.
2. Quest chains: no global list; order of `GetQuestLineQuests` and warband filtering on alts are TODO(verify-in-game). Map requests are async, so the first login may miss map chains.
3. Event catalog quality: TW rows need sourced quest/currency/mount ids; without them a TW idea has no reward link.
4. Signing cutover: an install that skips 0.9 cannot auto-update after the key swap (manual reinstall).
7. D165/D166 are read from code and the screenshot; the rotation sign of `SetRotation` is what the screenshot shows, confirm in game after the fix.
5. Holdings index size on big Accounts: the cap may cut items; cut order is "fewest places first".
6. The planner routine prompt must learn: no custom requests, `chain` ideas, `questLines` Section (owner's bot updates it).

## Needs the owner
- Nothing. Blizzard API keys are set (D159). The signing secret swap after 0.9 (D152) and the data copy cleanup (D153) are the bot owner's steps after the release.
