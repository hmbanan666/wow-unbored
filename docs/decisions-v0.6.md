# Unbored v0.6 decisions (grill 2026-10-29, owner accepted all recommended answers)

Sources: the owner's 0.5 real-client notes and the reload-free research (facts with file:line evidence), both kept outside the repo. Recorded as ADRs 0012-0021.

## G1 Reload-free (supersedes ADR-0001 "reload per click")
- D1 No reload during normal interaction. Load (ReloadUI) becomes optional and is never required.
- D2 Local first: Wisp answers from live game APIs (vignettes, area POIs, world quests, mount/toy/pet/transmog journals, quest log, achievements) + bundled data (zone -> achievement ids etc. for current expansion, <~300 KB, loaded per expansion).
- D3 Server round trip without reload = clipboard bridge. Outbound: Wisp shows a pre-selected compact request string (UNBQ1:...) and says "Ctrl+C". Companion watches the clipboard, detects our prefix, POSTs it. Inbound: Companion puts the answer (UNBA1:...) on the clipboard only if our own request string is still there (never overwrite user's clipboard otherwise), toast "Wisp answered, press Ctrl+V in game". Player presses Ctrl+V on Wisp (Wisp's EditBox focused automatically / one click on Wisp). One-time short tutorial bubble.
- D4 Clipboard carries only request id + minimal text (question, itemID, zone/coords). Profile/snapshots still travel via SavedVariables at natural loads.
- D5 Prefetch: Companion writes full plans, nearby answers and item answers ahead into Plan.lua so they're present at the next natural load (login, user reload). Zoning does not reload.
- D6 Natural-load fallback: if Companion not running / user skips paste, answer appears at next natural load.
- D6b Reload is NEVER triggered per message. Only when Companion has prepared something big (Full plan, fresh personal advice) Wisp shows one friendly bubble "New stuff is ready. Refresh now?" [Refresh] [Later]; Later = picked up at next natural load. No reload button otherwise visible.
- D6c Load-on-demand mailbox addon trick: not shipped (exploits the barrier Blizzard built).
- D7 Rejected: chatlog tail, whisper-to-self, addon messages, combat log, load-on-demand mailbox addon (against Blizzard intent).
- D8 Get plan: instant Quick plan locally (already), Full plan via the same clipboard bridge (Ctrl+C request, Ctrl+V plan) or prefetch; no reload.

## G2 Request bug (must fix first)
- D9 Root cause: Companion sends mode="" for item/question -> server 400 -> Companion marks failed without reason. Fix: Companion sends mode/budget only for plan; server treats empty/null mode as absent for non-plan types.
- D10 Server logs one line per request (method, path, status, reject reason; no secrets).
- D11 Reason codes end to end (not_approved, companion_offline, server_unreachable, rejected, timeout, planner_failed) mapped to friendly Wisp lines; never raw text, never "problem on my side".
- D12 Contract test: Companion and server share the same plan/item/question payload fixtures; CI fails on mismatch.

## G3 Ask (in-game chatbot) - core feature
- D13 "Ask something" is a core product feature: player asks free text in ru/en (e.g. "what achievements can I do in this zone?"), Wisp answers like a chat bot in up to 3 bubbles, optionally with waypoints or a follow-up plan.
- D14 Local intent first for common questions (what to do here, achievements here, rares here, collectibles here) answered instantly from APIs/data; others go via clipboard bridge to the Planner (answer_request).
- D15 Answer language follows the question language.

## G4 Items
- D16 Primary: drag an item onto Wisp (already built; make discoverable: Wisp hint when player picks up an item "drop it on me to ask").
- D17 Tooltip line always on for every item (Auctionator/Bagnon style): count owned (bags+bank), collected or not for mount/pet/toy/transmog, used in active plan, vendor price, keep/sell hint; unknown items show "Drop on Wisp to ask".
- D18 Menu "What is this item?" = pick mode: next item picked up with cursor is read and put back (works with Bagnon etc.); Esc cancels. Remove Alt+Right-click. No overlay frames on bag slots.
- D19 Unknown item goes straight to server on drop (no extra "try server" step).

## G5 Bubble UI
- D20 Remove WispGlow ring. Avatar smaller (~48-56 px at 100%), avatar scale independent of bubble scale (bubble not child-scaled by avatar; separate settings).
- D21 Bubble always shows full text: fix ns.UI.Measure fixed height; auto-grow height, wrap, no ellipsis on title or body; max width fixed.
- D22 Meta line on top: "1/5 · ~12 min" small, muted.
- D23 One action bar below the text, same style for all icon buttons (same size, same frame, same texture family), tooltips on hover: Done, Skip, list (all steps), and for Ask the Send button in the same style.
- D24 Collapse: chevron instead of red minus; collapsed state = small "..." pill next to avatar; clicking the pill or the avatar (single click) restores the bubble; menu opens via right-click or the menu icon. Never a dead end.
- D25 Step change feedback: short fade/slide transition, counter ticks, Wisp line "Ok, next:" on Skip, "Nice!" on Done.
- D26 Max 3 messages stacked; older ones fade after 90 s (resolves TODO).
- D27 Presets always reachable even with an active plan ("New plan" in menu and after last step); on login with an old plan Wisp asks "Continue <plan> or something new?".

## G6 Minimap button
- D28 LibDBIcon-style: round button with gold border on the minimap rim outside the map, draggable around the edge, position saved; left click = toggle Wisp, right click = menu.

## G7 Glossary/doc hygiene
- D29 CONTEXT.md: replace "apply" avoidance conflict: Wisp says "Press Load to finish the update" only for addon updates; add terms Clipboard bridge, Prefetch, Local answer, Reason code.
- D30 Combat: bubble hides in combat (keep), thresholds 10 min "taking long", 15 min "Companion isn't running" accepted.

## G8 Personal tooltip advice (core product thesis)
- D31 Product thesis: Wisp helps THIS character. Every bag/bank item tooltip gets one teal line "Wisp: <action>" (two if a quest pin), actionable, not an explanation: Turn in for <quest> (+map pin), Use: starts quest, Use: learns mount/toy/pet, Already known: sell, Equip once to learn look, Upgrade +N ilvl, Disenchant/Scrap, Sell (N gold), Junk: sell, Reagent for your <Profession> (skill N) - bank it, Open it, Keep: needed for your plan. First match wins (rules table in research-reload-free.md Part E).
- D32 Three sources, no reload: (1) local rules engine on live APIs (item info, C_Container quest info, transmog/toy/mount/pet journals, C_TooltipInfo lines, professions + skill, equipped ilvl); (2) bundled advice table for current-expansion items (~250-400 KB, shipped with addon updates); (3) personal server advice per character computed from the uploaded profile, written by Companion into a data file, used from next natural load. Mid-session loot uses (1)+(2).
- D33 Safety: v1 never says "delete"; never "sell/vendor" epic or BoE items.
- D34 Auction price only when Auctionator/TSM installed (via their public APIs), else vendor price.
- D35 Log unmatched items (itemID only) into profile so we can grow rules/table.
- D36 Native-UI blend: only tooltip lines + Wisp + bubble; no extra frames over game UI.

## G9 Player data + history (server side)
- D37 BUG: profile snapshot taken at logout reads empty bags/gold/ilvl/spec (live server now: bags 0, gold 0, ilvl 0 at 18:24; earlier reload upload had 141 bag items, gold, ilvl). Fix: keep a running snapshot updated on BAG_UPDATE_DELAYED, PLAYER_MONEY, PLAYER_EQUIPMENT_CHANGED, spec/professions/skill changes; at PLAYER_LOGOUT only stamp time. Never overwrite good data with empty values (server-side merge too). Add professions with skill levels, bank (when opened), reagent bank, equipped items.
- D38 Server keeps history: every Request, Answer, Plan, step progress, and profile snapshots over time (dated), per character. Data model ready for a future player website (history, progress over time) and paid subscription; website itself not in v0.6. MCP: get_player_history.
- D39 Personal advice job: server endpoint/MCP to store per-character item advice (put_item_advice), Companion downloads it into the addon data file.

## Owner addition (accepted 2026-10-29, part of G8/G9)
- D40 Personalization is per ACCOUNT, not only per character. The Server aggregates all characters of one Battle.net account (warband): professions + skill levels, bags/bank/warband bank, collections, quests per character.
- D41 Advice may route items to an alt: character A looted a herb, alt B is an Alchemist at skill N who uses it -> tooltip on A: "Wisp: Send to <B> (Alchemy) - warband bank or mail". Same for ore/leather/cloth/enchanting mats, recipes the alt can learn, gear/transmog an alt can use, quest items an alt needs. Prefer the warband bank when the item is warbound/account-bound, mail otherwise. Never suggest sending soulbound items.
- D42 The addon keeps a local account-wide alt registry in account-wide SavedVariables (each character's professions/skills/level/class/realm, updated whenever that character logs in), so the local rules engine can do alt routing with no server and no reload. Server personal advice uses the full account profile on top.
- D43 Data model: Account -> Characters; profile snapshots, requests, history stored per character and linked to the account; get_player_profile / get_player_history MCP accept account scope and return all characters.

## Owner change to G1 (accepted 2026-10-29, overrides D2-D5 clipboard bridge)
- The clipboard bridge is removed entirely: no UNBQ1/UNBA1 strings, no Ctrl+C / Ctrl+V steps, no clipboard watching in the Companion. Rejected as too hacky for casual users.
- New flow: (1) Wisp answers locally whatever it can (tooltips, alt routing, zone/achievements from bundled data, presets/quick plans). (2) Server answers, personal advice and Full plans are prepared by the Companion in the background and written to the data file. (3) They are picked up only on login/character switch (teleports and loading screens do not re-read SavedVariables) or via the single friendly bubble "New stuff is ready. Refresh now?" [Refresh] [Later]. For Ask questions the local answer comes instantly; if the server answer is pending, Wisp says once "I'll have a fuller answer after a refresh" with the same Refresh/Later choice. Never reload per message.
