# Unbored v0.7 decisions (self-grill 2026-10-30, owner said "grill yourself, pick the recommended answers")

Repo state read: `main` at f8f9dc9 (Node 24, PR #22). Inputs: CONTEXT.md, AGENTS.md, docs/adr/0001-0026, docs/decisions-v0.6.md (D1-D46), /workspace/unbored/ideas-backlog.md (0.7 candidate sections), owner feedback 2026-10-29/30.
Priority order set by the owner on 2026-10-30: **H (Data) is the main pillar of 0.7.** B (request flow), C (clickable entities), D (tooltip cleanup), A (feature audit) are smaller and secondary.
Format: each item is a question I asked myself, the recommended answer (chosen), and a one-line reason. Items marked **verify in game** are API behaviour I could not confirm from docs alone.

Hard constraints (owner, unchanged): native game UI only (tooltips, Wisp avatar + Bubble), no overlay, no clipboard bridge; Companion = background bridge + installer. SavedVariables (SV) are read only at login, reload or character switch and written only at reload, logout or character switch. No reload per message; the only reload is a player click (Refresh / Load / Send now). Addon has no network, no memory reading, no keypress emulation. Personalization per Account. No BYO API keys. Never invent ids or data.

API sources (warcraft.wiki.gg, read 2026-10-30, retail 12.0.x, TOC 120105):
- Secret values (12.0.0): https://warcraft.wiki.gg/wiki/Secret_Values , https://warcraft.wiki.gg/wiki/Patch_12.0.0/API_changes
- SV loading and SAVED_VARIABLES_TOO_LARGE: https://warcraft.wiki.gg/wiki/AddOn_loading_process ; constant table limit (262,144 unique literals per SV file): https://github.com/Stanzilla/WoWUIBugs/issues/241
- Quests: https://warcraft.wiki.gg/wiki/API_C_QuestLog.GetAllCompletedQuestIDs , https://warcraft.wiki.gg/wiki/API_C_QuestLog.GetTitleForQuestID , https://warcraft.wiki.gg/wiki/API_GetQuestLink
- Professions: https://warcraft.wiki.gg/wiki/API_C_TradeSkillUI.GetAllRecipeIDs , https://warcraft.wiki.gg/wiki/API_C_TradeSkillUI.GetProfessionInfoBySkillLineID
- Reputation: https://warcraft.wiki.gg/wiki/API_C_Reputation.GetFactionDataByIndex
- Great Vault: https://warcraft.wiki.gg/wiki/API_C_WeeklyRewards.GetActivities
- Lockouts: https://warcraft.wiki.gg/wiki/API_GetSavedInstanceInfo
- M+: https://warcraft.wiki.gg/wiki/API_C_PlayerInfo.GetPlayerMythicPlusRatingSummary , https://warcraft.wiki.gg/wiki/API_C_MythicPlus.GetOwnedKeystoneLevel
- Played time: https://warcraft.wiki.gg/wiki/API_RequestTimePlayed
- Calendar: https://warcraft.wiki.gg/wiki/API_C_Calendar.OpenCalendar
- Mail: https://warcraft.wiki.gg/wiki/API_GetInboxHeaderInfo ; Auctions: https://warcraft.wiki.gg/wiki/API_C_AuctionHouse.GetOwnedAuctions
- Talents: https://warcraft.wiki.gg/wiki/API_C_Traits.GenerateImportString
- Achievements: https://warcraft.wiki.gg/wiki/API_GetAchievementInfo ; Mounts: https://warcraft.wiki.gg/wiki/API_C_MountJournal.GetMountInfoByID ; Transmog: https://warcraft.wiki.gg/wiki/API_C_TransmogCollection.GetCategoryCollectedCount
- Links and pins: https://warcraft.wiki.gg/wiki/Hyperlinks (item, quest, achievement, spell, currency, worldmap, addon types), https://warcraft.wiki.gg/wiki/API_C_Map.SetUserWaypoint , https://warcraft.wiki.gg/wiki/API_C_SuperTrack.SetSuperTrackedUserWaypoint , https://warcraft.wiki.gg/wiki/API_C_Spell.GetSpellLink

---

## H. Data: collect everything the game legally gives us (MAIN PILLAR)

Why: the owner wants to learn what we can build. The moat is private accumulated data (owner 2026-10-29). Today the profile (ADR 0011/0020) covers context, bags, banks, currencies, mount/pet/toy counts, renown, active quests, sessions. 0.7 turns it into a versioned, sectioned **Game data snapshot** per Character and per Account, uploaded once per session.

- D47 Q: Do we keep ADR 0009/0011 "for a public product trim to what each Request needs"? A: **No, superseded.** Collect every own-player source the addon can read; trimming is replaced by transparency (D61) and an opt-out (D62). Reason: owner's 0.7 direction is data first; trimming would throw away the moat.
- D48 Q: What is never collected? A: anything about **other players**: chat, whispers, mail sender/subject/body, group or guild rosters, other players' names, combat log. Also no protected/secure calls, nothing in combat. Reason: legal and Blizzard-safe, and it is not our data.
- D49 Q: When do we read? A: three moments: **login pass** (after PLAYER_ENTERING_WORLD + 10 s, out of combat, staged over frames with a ~4 ms per-frame budget), **event deltas** (existing EVENT_PARTS pattern, 2 s settle), **window-open reads** (bank, profession, mailbox, AH, only while open). PLAYER_LOGOUT only stamps time (D37 rule kept). Reason: reads at logout come back empty; staged reads avoid hitches.
- D50 Q: Midnight secret values? A: never read in combat (`InCombatLockdown()`), and every collector drops a field when `issecretvalue(v)` is true (guarded, `issecretvalue` may be nil on old clients). Reason: 12.0 combat APIs can return secrets that error on compare/arithmetic in tainted code.
- D51 Q: Which sources, and with what priority? A: the inventory below. **P0 and P1 ship in 0.7**, P2 is later. Reason: P0/P1 are cheap, need no extra UI, and unlock the next features (undone quests, events, routing); P2 needs open windows or has privacy edges.

### H inventory (scope: C = per Character file `UnboredCharDB`, A = account file `UnboredDB`)

| # | Section | API (retail 12.x) | Scope | Size est. | Cost / risk | When | Prio |
|---|---|---|---|---|---|---|---|
| 1 | `char` core: class, race, faction, level, xp, rested, spec, hero spec, ilvl, gold, hearth, guild rank flag only | UnitClass/UnitRace/UnitLevel, UnitXP, GetXPExhaustion, GetSpecialization+GetSpecializationInfo, C_ClassTalents.GetActiveHeroTalentSpec, GetAverageItemLevel, GetMoney, GetBindLocation | C | <1 KB | none (exists as context) | login + events | P0 |
| 2 | `gear` equipped item strings (with bonus ids) + ilvl | GetInventoryItemLink 1-19, C_Item.GetDetailedItemLevelInfo | C | ~3 KB | none (exists) | login + PLAYER_EQUIPMENT_CHANGED | P0 |
| 3 | `bags` itemID+count; for gear also item string | C_Container.GetContainerNumSlots/GetContainerItemInfo | C | ~10 KB | exists; raise MAX_ITEMS 600 -> 1500 | login + BAG_UPDATE_DELAYED | P0 |
| 4 | `bank`, `reagentBank` (character bank tabs in 11.2+), `warband` bank | same, Enum.BagIndex by name (existing BagIds) | C / A | ~15 KB | only while bank open (exists) | BANKFRAME_OPENED + bag events while open | P0 |
| 5 | `currencies` id, qty, max, weekly, account-wide flag | C_CurrencyInfo.GetCurrencyListSize/GetCurrencyListInfo (expand headers via ExpandCurrencyList, restore after: **verify in game**) | C | ~4 KB | touching collapse state: restore it | login + CURRENCY_DISPLAY_UPDATE | P0 |
| 6 | `professions` name, skillLine, skill per expansion tier, max, concentration | GetProfessions/GetProfessionInfo, C_TradeSkillUI.GetProfessionInfoBySkillLineID | C | ~2 KB | none (exists, add tiers) | login + SKILL_LINES_CHANGED | P0 |
| 7 | `recipes` learned recipe ids per profession | C_TradeSkillUI.GetAllRecipeIDs + GetRecipeInfo(id).learned | C | 5-15 KB packed | empty until the profession window was opened; thousands of GetRecipeInfo calls: staged | TRADE_SKILL_LIST_UPDATE while open | P1 |
| 8 | `questsDone` all completed quest ids | C_QuestLog.GetAllCompletedQuestIDs (one sorted array) | C | 10k-40k ids -> ~40-120 KB packed | one cheap call; packing staged; dailies/WQ only for today | login + QUEST_TURNED_IN append | P0 |
| 9 | `questLog` active quests, objectives done, tracked | C_QuestLog.GetNumQuestLogEntries/GetInfo/GetQuestObjectives | C | ~3 KB | exists | QUEST_LOG_UPDATE (settled) | P0 |
| 10 | `reputation` factionID, reaction, standing, thresholds, account-wide flag; renown levels; friendship | C_Reputation.GetNumFactions/GetFactionDataByIndex (11.0+), C_MajorFactions (exists), C_GossipInfo.GetFriendshipReputation | C (+A for account-wide) | ~10 KB | collapsed headers hide children: expand and restore (**verify in game**) | login + UPDATE_FACTION | P1 |
| 11 | `achievements` completed ids (account) + points; earned-by-me flag set | GetCategoryList/GetCategoryNumAchievements/GetAchievementInfo, GetTotalAchievementPoints | A (+C small) | ~5k ids -> ~20 KB packed | full scan is heavy (~10k calls): staged, **once per 24 h per Account**, then ACHIEVEMENT_EARNED appends | daily scan + event | P1 |
| 12 | `mounts` collected mountIDs | C_MountJournal.GetMountIDs + GetMountInfoByID (isCollected) | A | ~1.2k ids -> ~5 KB | filter-independent, cheap | login + NEW_MOUNT_ADDED | P0 |
| 13 | `pets` owned species + level/quality | C_PetJournal (display list depends on journal filters: use a filter-independent path or save/restore filters, **verify in game**) | A | ~1k -> ~8 KB | filter side effects | login (staged) + NEW_PET_ADDED | P1 |
| 14 | `toys` owned toy itemIDs | PlayerHasToy over C_ToyBox ids (same filter caveat, **verify in game**) | A | ~800 -> ~4 KB | filter side effects | login (staged) + NEW_TOY_ADDED | P1 |
| 15 | `transmog` collected/total per category | C_TransmogCollection.GetCategoryCollectedCount/GetCategoryTotal | A | <1 KB | cheap | login | P0 |
| 16 | `transmogFull` every collected appearance source | C_TransmogCollection source iteration | A | 50k-100k ids, MB-scale | too big for SV constant limit and load time | n/a | P2 |
| 17 | `lockouts` raid/dungeon locks, encounters done; world bosses | RequestRaidInfo -> UPDATE_INSTANCE_INFO, GetNumSavedInstances/GetSavedInstanceInfo, GetNumSavedWorldBosses | C | ~2 KB | none | login + BOSS_KILL / UPDATE_INSTANCE_INFO | P1 |
| 18 | `mplus` season score, best runs per dungeon, owned keystone map+level | C_PlayerInfo.GetPlayerMythicPlusRatingSummary("player"), C_MythicPlus.GetOwnedKeystoneLevel/GetOwnedKeystoneChallengeMapID (may need C_MythicPlus.RequestMapInfo first, **verify in game**) | C | ~1 KB | MayReturnNothing at early login: retry once | login + CHALLENGE_MODE_COMPLETED | P1 |
| 19 | `vault` Great Vault activities, thresholds, progress, level | C_WeeklyRewards.GetActivities | C | ~1 KB | none known (**verify** it works without opening the vault UI) | login + WEEKLY_REWARDS_UPDATE | P1 |
| 20 | `calendar` holidays and events today..+14 days | C_Calendar.OpenCalendar -> CALENDAR_UPDATE_EVENT_LIST, C_Calendar.GetNumDayEvents/GetDayEvent | A | ~3 KB | OpenCalendar does not return during loading: call 15 s after enter world; do not change the month the player is viewing | once per login per Account | P1 |
| 21 | `played` total and level time | RequestTimePlayed -> TIME_PLAYED_MSG | C | tiny | prints to chat: suppress our own request only (temporarily wrap ChatFrame display of time played, the Altoholic pattern, **verify in game** no taint) | once per login | P1 |
| 22 | `talents` active loadout import string per spec, loadout names | C_ClassTalents.GetActiveConfigID/GetConfigIDsBySpecID, C_Traits.GenerateImportString, C_Traits.GetConfigInfo | C | ~1 KB | no data before TRAIT_CONFIG_LIST_UPDATED | event + TRAIT_CONFIG_UPDATED | P1 |
| 23 | `sessions` start/stop, zones with mapID and minutes, deaths count, level ups | existing NoteZone + C_Map.GetBestMapForUnit, PLAYER_DEAD, PLAYER_LEVEL_UP | C | ~3 KB (last 20 sessions) | exists, add mapID + minutes | events | P0 |
| 24 | `addons` flags: TomTom, Auctionator, TSM, Bagnon present | C_AddOns.IsAddOnLoaded | A | tiny | none | login | P1 |
| 25 | `mail` items, money, COD, daysLeft per mail; **no sender/subject/body** | CheckInbox, GetInboxNumItems/GetInboxHeaderInfo/GetInboxItem | C | ~3 KB | only with mailbox open; privacy (D48) | MAIL_INBOX_UPDATE while open | P2 |
| 26 | `auctions` own auctions: itemID, qty, buyout, status, time band | C_AuctionHouse.GetOwnedAuctions (after QueryOwnedAuctions, **verify**) | C | ~3 KB | only with AH open | AH open | P2 |
| 27 | `achievementCriteria` progress for watched achievements only | GetAchievementNumCriteria/GetAchievementCriteriaInfo | A | small per watch | full criteria dump is huge | on demand from a Plan | P2 |
| 28 | `delves`, profession knowledge, equipment sets, heirlooms, titles | C_DelvesUI, C_ProfSpecs, C_EquipmentSet, C_Heirloom, GetTitleName | C/A | small each | APIs churn per patch | later | P2 |

- D52 Q: SV layout? A: new tables `UnboredCharDB.data` and `UnboredDB.data`, each `{ schema = 2, sections = { <name> = { v = <section version>, at = <time read>, src = "login"|"event"|"window"|"daily", body = {...} } } }`. The old `profile` table stays readable one release (Companion maps it) and is removed in 0.8. Reason: per-section versions let a collector change without breaking the rest; per-character file keeps big quest lists out of the account file.
- D53 Q: How do we store big id sets (quests, achievements, recipes, mounts, toys, pets)? A: a **packed id set**: sorted ids, delta-encoded, base36, comma-joined, split into chunks of at most 4,000 characters (`{ "ids1", "<chunk>", "<chunk>" }`). One shared Lua packer and a Rust and TS unpacker, all tested on the same fixture. Reason: 40k numeric literals would eat the SV constant table (262,144 unique literals) and bloat load; very long single lines are risky.
- D54 Q: Size budget? A: per-character `UnboredCharDB` target **<= 400 KB**, hard cap 1 MB; account `UnboredDB` target <= 300 KB, cap 1 MB; total unique literals per file < 30k (test asserts it on a worst-case fixture). Over cap, the collector drops lowest-priority sections first and records `dropped` in the snapshot. Reason: login time is the player's cost; SAVED_VARIABLES_TOO_LARGE must never happen.
- D55 Q: Full or diff in SV? A: the addon always keeps **full current state** per section (SV holds state, not a log). The **Companion** computes a hash per section and uploads only changed sections. Reason: SV can be rolled back or lost (.bak), so diffs inside SV would corrupt; hashing at the edge is simple.
- D56 Q: Upload trigger? A: Companion watches each SV file (existing watch); on write (reload, logout, character switch) it uploads changed sections for that Character and the Account, gzip, to a new `POST /v1/snapshot` (body: account, character, realm, schema, savedAt, sections{name:{v,at,hash,body}}). Server limit 4 MB compressed body. Old `POST /v1/profile` keeps working (mapped server-side to sections) for 0.6 addons. Reason: "once per session" is exactly when the game writes SV.
- D57 Q: Server storage? A: SQLite tables `accounts(id, label, first_seen, last_seen)`, `characters(id, account_id, name, realm, class, level, last_seen)`, `sections_latest(owner_kind 'char'|'account', owner_id, section, v, hash, at, saved_at, body_json)`, `section_history(id, owner_kind, owner_id, section, at, saved_at, hash, kind 'full'|'diff', body_json)`. History: for id sets store **diff** (added/removed ids, between previous and this savedAt); for small sections store full when the hash changes; for bags store diff of item counts. Existing `profiles`/`profile_snapshots` are backfilled once into the new tables and then read-only. Reason: diffs give "what the player did this session" (new quests done, new mounts, gold delta), the most useful planner signal, at small storage cost.
- D58 Q: Account key? A: keep the current WTF account folder name as the Account key in 0.7, never shown to the player; **TODO before public: hash it on the Companion** (sha256 with a per-install salt) with a server migration. Reason: hashing now would break existing links for a single user; recorded as a pre-public task.
- D59 Q: MCP read tools for the Planner and the future site? A: add
  - `get_account_overview(account?)`: characters with class, level, ilvl, gold, professions, last seen, section freshness.
  - `get_game_data(character?|account?, sections[])`: latest bodies; packed id sets unpacked only when `expand=true` and capped, else counts.
  - `check_ids(kind: quest|achievement|mount|toy|pet|recipe, ids[], account?, character?)`: which ids are done/owned per character. This is how the LLM asks "has anyone on this account done quest X" without loading 40k ids into context.
  - `get_data_changes(account?, character?, since?)`: per-section diffs since a time (default last session).
  - `data_catalog()`: the **Data explorer** (D60).
  Keep `get_player_profile`/`get_player_history` working (they read the new tables). Reason: the planner needs questions answered, not dumps.
- D60 Q: How does the owner see what was collected? A: **MCP `data_catalog`** (every Account and Character, every section with v, at, savedAt, size in bytes, item/id counts, last diff summary, dropped sections, unknown sections) plus **MCP `get_game_data` for raw**. Plus a read-only `GET /owner/data` JSON endpoint behind the existing owner MCP bearer auth for quick checks. No HTML UI in 0.7. Reason: the owner works through his agents; a site comes later.
- D61 Q: Privacy note? A: README section "What Wisp knows about you" (player language: only your own characters, what is collected, when it is sent, what is never collected per D48, how to turn it off), the same in Russian; the Companion first-run screen shows one short line with a link. `docs/DEVELOPMENT.md` lists every section. Reason: collecting broadly is only OK if it is plain and visible.
- D62 Q: Opt-out? A: Wisp settings checkbox "Share game data to make Wisp smarter" (default on). Off: only `char`, `gear`, `questLog`, `sessions` sections are written (what a Plan Request needs). Owner-only MCP `delete_account_data(account)` exists for erasure (no player UI yet). Reason: a cheap honest switch now, a real consent flow comes with the site.
- D63 Q: Server accepts unknown sections or future versions? A: yes, stored raw with `unknown=true` and shown in `data_catalog`; validation is structural (object, size) per known section via `packages/contracts/schema/snapshot.schema.json`. Reason: an addon update must never lose data because the Server is older.

## A. Feature audit of Wisp 0.6 (secondary)

Rule: Wisp is not real time. Local first; data arrives with the next natural load; the Server is used only for a deliberate, rare Request with clear intent (a Plan after a short survey).

| 0.6 feature | Local live API | Data at login (Prefetch) | Deliberate server Request | Cut |
|---|---|---|---|---|
| Presets -> Quick plan (Providers: Roam, Quests, Events, Achievements, Farm) | yes | | | |
| Preset / wish -> Full plan | | Full plan arrives | **yes, after survey (B)** | |
| "Something else" free wish | | | yes, as the survey's free text | |
| Ask: local intents (here, achievements, rares, collect) | yes | | | |
| Ask: free text the intents cannot answer -> Planner | | | | **cut**: Wisp offers "Make a plan from this?" which goes through the survey |
| Item: drop on Wisp / pick mode -> local facts | yes | Personal advice | | |
| Item: unknown item -> server item Request | | | | **cut** (per-item waits of minutes are pointless) |
| Tooltip Advice: generic lines (vendor price, Sell N gold, Junk, Open it, Disenchant, Upgrade +N, count owned) | | | | **cut** (D75) |
| Tooltip Advice: personal lines (Alt routing, plan item, new collectible for Account, quest item not done) | yes | | | |
| Bundled AdviceTable.lua (689 bytes) | | | | **cut**, replaced by Personal advice |
| Personal advice (put_item_advice) | | yes | | |
| Steps, Done/Skip, completion detection, Waypoints, route, TomTom | yes | | | |
| Welcome back "continue or new" | yes | | | |
| Refresh offer, Load for updates | yes | | | |
| Minimap button, settings | yes | | | |
| "Nothing found, try another" + Refresh/Later/X before sending (QUICK_EMPTY in waiting view) | | | | **cut** (B) |
| Profile, history, unmatched items | | | uploaded by Companion | becomes H |

- D64 Q: Which server Request types stay in 0.7? A: **only `plan`**. `item` and `question` types stay in the contract for old addons but the 0.7 addon never sends them. Reason: owner: server time is for a plan after a survey.

## B. Request flow (secondary)

Root causes in 0.6 code: `Mascot:Choose` runs `QuickPlan` and `Ask` at once, so an empty Quick plan shows QUICK_EMPTY ("nothing found") inside the waiting view; a new Request needs a reload to reach the Companion, so Refresh/Later appear immediately; `waitSeen` after OK hides the waiting view and drops back to presets; mood "thinking" swaps textures and restarts the bob animation on every `Refresh()`.

- D65 Q: Flow? A: one state machine, persisted in `UnboredCharDB.request.state`:
  `idle -> quick (local Quick plan shown; one button "Want a proper plan?") -> survey (preset already chosen; 1-2 chips: time 15/30/60/120 min, optional one-line wish) -> confirm (summary line; primary [Send now]; small "or send at logout") -> sent (after the reload) -> waiting -> ready -> offer ([Use this plan] / [Keep mine]) -> idle`; side states `failed` (reason line + [Try again]) and `expired`. If the Quick plan is empty, the preset goes straight to survey with "Nothing quick here. Want me to think it through?". One primary button per state. Reason: owner asked for choose, send, visible wait, done.
- D66 Q: What does "Send now" do? A: it is the Refresh click: writes the Request and calls ReloadUI from the button's hardware event; the button tooltip says "Wisp sends it with a quick reload". "Send at logout" just keeps it queued (state `queued`, shown as "I'll send it when you log out"). Reason: SV are written only on reload/logout, so honesty beats a fake "sending" spinner.
- D67 Q: Lock during waiting? A: yes. In `queued`/`sent`/`waiting` Wisp shows only the waiting Bubble: "I'm on it. Usually a few minutes. Keep playing, I'll ping you." Presets, New plan, Ask and item drop are disabled with a short line "One thing at a time, I'm still thinking". Cancel lives only in the right-click menu ("Cancel my request"). The current Quick plan Steps stay usable (playing is not blocked). Reason: owner: "lock it, make clear to wait"; the game itself must stay playable.
- D68 Q: How does Wisp know it is ready, with no network? A: it cannot; it uses an **ETA**: the Companion writes `eta` (server p50 of recent planner times, default 180 s, clamp 60-900 s) into Unbored_Plan with the request status; after `sentAt + eta` the Bubble turns to "Should be ready. Refresh?" with one [Refresh]. If after Refresh it is still pending: "Almost. Give me a couple more minutes" and the next check is +120 s. The Companion also shows its Windows toast when the answer lands. Reason: best honest signal available.
- D69 Q: Timeouts and errors? A: keep ADR 0018 thresholds: 10 min "taking long" (+[Try again]), 15 min no Companion heartbeat "Companion isn't running"; new: 60 min -> `expired` ("That one got lost. Try again?"); server-side requests pending over 60 min are marked `timeout`. Reason codes per ADR 0013. Reason: no silent waits.
- D70 Q: Reload, logout, character switch while waiting? A: state is in per-character SV, so it survives; on login the state machine resumes from `request.state` + Unbored_Plan status. Another character sees its own state only (Requests are per character, data is per Account). Reason: simplest correct model.
- D71 Q: Animation? A: one portrait texture; "thinking" = slow alpha pulse (0.85-1.0, 1.6 s, IN_OUT) plus the existing bob; AnimationGroups are created once and only Play/Stop on state change, never recreated or restarted on re-render; no texture swap while looping. Reason: the 0.6 jitter comes from restart on every Refresh().

## C. Clickable entities in Plans (secondary)

- D72 Q: Markup contract? A: in `packages/contracts` (`markup.md` + schema + fixtures), used in Step `title`, `text`, and plan messages:
  `{item:ID}`, `{quest:ID}`, `{ach:ID}`, `{spell:ID}`, `{currency:ID}`, `{npc:ID}`, `{pin:MAPID:X:Y}`, each with optional `|label` (`{npc:12345|Fixer Kev}`). X and Y are map percent 0-100 with at most one decimal. NPC and pin details live in a side table on the Plan: `entities.npc[ID] = { name, mapID, x, y }`. Max 12 tokens per Step. Reason: short tokens are easy for the LLM, and the side table keeps names out of inline syntax.
- D73 Q: Server validation? A: `put_plan`/`answer_request` parse tokens: unknown type, malformed id, npc without an entity, pin out of range -> token replaced by its label (or dropped) and a `warnings` list is returned to the Planner. Existence check against the Blizzard Game Data API (item, quest, achievement, spell, creature) with a SQLite cache **only if Blizzard API credentials are configured** on the Server; otherwise structural checks plus client resolution. Reason: "never invent ids" needs a real check; credentials are an owner item (see risks).
- D74 Q: Addon rendering? A: tokens become native hyperlinks in the Bubble (frame `SetHyperlinksEnabled(true)`, OnHyperlinkEnter -> GameTooltip:SetHyperlink, Leave hides, Click -> default SetItemRef; shift-click inserts into chat). item: `Item:CreateFromItemID(id):ContinueOnItemLoad` then the item link; ach: `GetAchievementLink(id)`; spell: `C_Spell.GetSpellLink(id)`; currency: `C_CurrencyInfo.GetCurrencyLink(id)`; quest: build `|cffffff00|Hquest:ID:-1|h[title]|h|r` with `C_QuestLog.GetTitleForQuestID` (no need to be in the log) and `QuestEventListener:AddCallback` when the title is not cached (`GetQuestLink` only works for quests in the log); npc: `|Haddon:Unbored:npc:ID|h[name]|h` with our own tooltip (name, zone via C_Map.GetMapInfo, coords) handled through `EventRegistry:RegisterCallback("SetItemRef")`; pin: `|Haddon:Unbored:pin:MAP:X:Y|h[label or zone x, y]|h`, click -> existing `ns.Waypoint` (C_Map.SetUserWaypoint + C_SuperTrack.SetSuperTrackedUserWaypoint(true); TomTom too when loaded, as today). Unresolvable id after load wait (3 s) -> plain label, id logged to `unresolvedIds` in the snapshot. Hyperlink handling in a non-chat frame and quest tooltip from a built link: **verify in game**. Reason: native look, no overlay, names always from the game.

## D. Tooltip Advice cleanup (secondary)

- D75 Q: Which lines stay in 0.7? A: only lines with a personal signal: (1) Alt routing "Send to <Alt> (<Profession> <skill>)" via warband bank or mail (ADR 0021); (2) "Needed for your plan: <Step>"; (3) "New for your collection" when no character on the Account has the mount/pet/toy/appearance; (4) quest-starting item only if this character has not completed that quest (uses `questsDone`); (5) Personal advice from the Server. Everything else from D31/ADR 0019 is removed; no line at all is the default. Settings toggle "Wisp lines in tooltips" (default on). Reason: owner: generic lines have no value.

## E. Data at login (Prefetch, secondary)

- D76 Q: What does the Companion write into Unbored_Plan? A: Full plan offer (with `entities`), request status + `eta`, Personal advice (cap 500 items), and an Account digest from the Server (Alts seen on other PCs, so routing works for Alts not logged on this install). Budget <= 200 KB and < 20k literals. Calendar/events digest is not in 0.7 (the addon reads the calendar itself, P1 #20). Reason: only what makes the next session smarter.

## F. Scope and release

- D77 Q: In 0.7? A: H P0+P1 sections, packer, SV schema 2, `/v1/snapshot`, new tables + backfill, MCP tools D59-D60, privacy note + toggle; B state machine + animation; C markup for all seven token types (server structural validation, Blizzard API check behind config); D personal-only tooltip lines; A cuts (no item/question Requests from the addon). Reason: data pillar plus the three UX fixes the owner reported.
- D78 Q: Later? A: P2 sections (mail, auctions, full transmog, criteria, delves etc.), site, events preset/digest, monetization, own planner LLM or webhook provider change, account key hashing before public. Reason: not needed to learn what data we have.
- D79 Q: Release? A: one tag `v0.7.0` (ADR 0026), addon + Companion + Server share the version; release notes per ADR 0022 with the Install section. The implementing agent does not tag or release; the owner triggers it after testing. Reason: owner rule.

## G. Testing

- D80 Q: Tests? A: CI as today (`pnpm test`, `pnpm lint`). New: Lua tests for the packer (round trip, 40k ids, chunking), every collector with mocked APIs (including secret values and combat guard), the request state machine (every transition, reload/resume), the markup parser and renderer (each token, malformed, unresolved); contracts fixtures `snapshot.json`/`snapshot.lua` and `markup` fixtures read by Lua, Rust and TS tests; a worst-case size test asserting D54 limits; server tests for sections_latest/history diffs, backfill, every new MCP tool, `/v1/profile` compatibility; Companion tests for section hashing and gzip upload. `TESTING.md` (Russian) gets: data upload check via `data_catalog`, the new request flow, link hover/click per type, tooltip lines with and without Alts. Reason: data and parsers are where silent bugs hide.

## Open risks for the owner
1. Blizzard Game Data API credentials on the Server (for id validation, D73). Without them we only validate structure.
2. Privacy for a public release: default-on collection with an opt-out is fine for the owner now; public needs a real consent flow and account key hashing (D58, D62).
3. Several collectors are marked **verify in game** (currency/reputation header expand, pet/toy filters, time played chat suppression, vault without UI, hyperlinks in a non-chat frame).
4. Dokploy MCP still points at the old panel; deploy of 0.7 server goes through Инженер Мыслитель (new Hostkey panel, autodeploy not wired yet).
