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

- The pages are private, noindex, and in English or Russian as in 0073.
- Data comes only from the player's Sections and events, the client tables from wago.tools and player sightings.
- The Retail page reuses the same layout later.
- Implementation follows as tickets after the mockup is approved.
