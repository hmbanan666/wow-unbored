# 0101. Personal profile home and profession album

Status: accepted (2026-11-13)

Following [0073](0073-website-and-account-link.md), [0097](0097-recipe-sightings-and-advice.md), [0098](0098-profession-skill-plans.md) and [0099](0099-character-history.md). The site reads like a set of text pages. The signed-in player should land on their own character, their road to 60 and one clear thing to do today. Forever comes first. We do not build reference pages: no recipe, item or NPC database pages.

## Sign-in

- The primary sign-in stays the one-time Companion link from 0073. The Companion button becomes "Open my profile", and the link lands on the character the player last played instead of the `/my` list.
- To open the site on a phone, a signed-in page shows "Open on phone": a QR code for a fresh one-time link for the same Device. It is single use, lasts 10 minutes and follows the same session rules (30 days, ends when the Device is revoked or after Forget my data). No password and no third party.
- Battle.net OAuth is deferred. The QR link covers the phone case without a new dependency, and Blizzard profile data does not cover Forever characters. If it comes later, it only links to an Account that a Companion session already opened. It never creates Accounts.

## Profile home

- The hero shows the character name, class, faction, Game, level and a "Road to 60" bar (Retail uses its own level cap).
- The journey strip comes from the 0099 events: level rises, the first rank in each profession, reputation tiers and notable learned recipes. Zone and dungeon stops need a zone-per-session fact from the addon. They are a separate follow-up and are never inferred.
- One "What next" line repeats the first open Today goal.

## Profession page

- **Album.** Every catalog recipe is a slot, grouped by client category. A known slot is filled. A missing slot is empty, carries a difficulty dot and opens a detail panel with the reasons, reagents and formula facts.
- **Required skill.** Forever client thresholds report orange = 1 for every recipe, so the required skill R comes only from the teaching item's `ItemSparse.RequiredSkillRank` or from a trainer sighting's `required_skill`. Otherwise R is unknown.
- **New import fields.** The game-table import adds `RequiredSkillRank`, `OverallQualityID` and `Bonding` to the `ItemSparse` allow-list. `BuyPrice` stays unshown, as in 0098.
- **Difficulty.** Each missing recipe gets D = Source + Skill + Reagents:

  | Part | Case | Points |
  | --- | --- | --- |
  | Source | trainer sighting | 0 |
  | Source | no teaching item and no sighting | 1 |
  | Source | vendor sighting, unlimited | 1 |
  | Source | vendor sighting, limited | 2 |
  | Source | tradable formula (Bonding not 1) with no sighting | 2 |
  | Source | bind-on-pickup formula, white or green | 3 |
  | Source | bind-on-pickup formula, blue or epic | 4 |
  | Skill | R ≤ current skill | 0 |
  | Skill | R unknown | 1 |
  | Skill | R ≤ current rank maximum | 1 |
  | Skill | R above the rank maximum | 2 |
  | Skill | R more than 100 above current skill | +1 |
  | Reagents | 4 or more distinct reagents | +1 |

  The labels are easy (0–1), medium (2–3) and hard (4 or more). Each label lists its reasons in plain words, for example "Tradable green formula: auction house or a friend · Needs 80: you have it".
- **Data we don't have.** Drop rates, mob or zone levels, faction, quest chains and auction prices are never shown or guessed.
- **Filters.**
  - Can get now: R known and ≤ skill, plus a trainer or vendor sighting or a tradable formula.
  - Missing.
  - Source group: trainer, vendor, tradable formula, get it yourself, not seen yet.
  - Zone: enabled only when sightings exist.
  - Category.

## Today

There are at most 3 deterministic goals, in this order:

1. **Skill.** The 0098 rank-training Step when the player is at the rank maximum, otherwise the first skill stretch with its crafts and reagent totals.
2. **Easiest recipe.** The easiest Can get now recipe with its observed Waypoint (zone and coordinates), or "auction house" for a tradable formula.
3. **Coverage.** "Open your trainer or a recipe vendor once" while unseen recipes exist, otherwise the next unlock: the lowest R above the current skill.

Goals complete on their own when a sync shows the skill or recipe. "Mark done" is a browser-only hint.

## Scope

- The pages are private, noindex, and in English only. Amended by [0102](0102-english-only-public-pages-with-personal-overlay.md): English only, and profession pages are public game pages with a personal overlay.
- Data comes only from the player's Sections and events, the client tables from wago.tools and player sightings.
- The Retail page reuses the same layout later.
- Implementation follows as tickets after the mockup is approved.

## Implementation: Today (slice c)

`packages/contracts/src/today-goals.ts` selects and checks the goals. An unread profession first asks for its recipe window to be opened; missing recipes stay unknown until that read. The Server persists the current set in migration `0033_character_goals.sql`, with a stable kind/target hash per goal, a unique set id, UTC day and creation/completion times. Ingest ticks existing sets, including coverage completed by an Alt's new sighting in the same Account/Game; a page or MCP read creates the next set on a new day or when the stored set was already complete. A read that itself completes the last goal returns its tick before the following read rotates the set. Completed cards remain visible if no supported replacement can be made.

The web role has conditional SELECT access only. The private character API requests Today through the Server's live sealed-session endpoint; `get_today_goals` uses the same service under the existing Account/Game lease checks. Browser hints are keyed by set and goal id in localStorage and never sent back. Forget my data deletes the rows and character deletion cascades. The Today block and character strip use English copy and the shared palette.

## Implementation: profile home (P7)

`/my` mounts the shared character picker, honors an owned `unbored_character` selection, and otherwise selects the first character from the private list ordered by `last_seen DESC` (Game/name/realm break ties). The selection is written through the existing cookie helper so public profession overlays use the same character. The private profile API checks the live session and ownership; hero, professions, Today and journey load only after mount. Switching or retrying clears the previous character immediately and ignores late responses. Account phone sign-in and the existing private history remain accessible; no personal data enters SSR or shared caches.

The hero uses `char`, `played` and the current profession summaries. Forever's cap is 60; the optional `char.levelCap` reads the client's `GetMaxPlayerLevel` during the existing guarded Section read for Retail. Older Retail snapshots show Level and XP without a guessed cap until the next addon update/sync. Unknown statistics remain labelled as unseen. Class monograms and journey marks are our own SVGs, using the Brand palette.

Journey milestones are read independently of history pagination: recorded levels (every fifth level when more than twelve level events exist), the first recorded skill per profession, reputation rises and the first three learned-recipe events per UTC day with a known catalog name. A first recorded skill is labelled as such, never invented as a training date. Recipe and faction names use the latest English client catalog; unknown faction names use “Reputation”, never an id. The existing `sessions.list` supports one “Most time in <zone>” stop per session-start UTC day: sum observed map minutes only for names present in that session's zones list; a single zone is unambiguous, while multiple zones require exact English UiMap matches. Sessions carry totals, not timestamped movements, so crossing-midnight minutes cannot be split accurately. Missing or ambiguous minutes produce no stop. This adds observed zone stops to the original scope, as approved in P7; it never infers a dungeon.

“What next” and the existing Today strip use the same browser completion hints and persisted goals, in returned profession order. No open goal gives “Open a profession window in the game once”; a failed Today read offers retry. Profession cards link to the public Game-scoped pages. Anonymous and non-owner legacy profession addresses redirect there with 302 too; only an owned character sets the selection cookie. No migration or new sharing behavior is needed.

The Retail cap field follows the client's documented [`GetMaxPlayerLevel`](https://github.com/Gethe/wow-ui-source/blob/live/Interface/AddOns/Blizzard_APIDocumentationGenerated/PlayerScriptDocumentation.lua), read on 2026-11-13. Shared JSON/Lua snapshot fixtures include the optional value; old snapshots are still accepted.
