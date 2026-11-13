# 0102. English-only site, public game pages with a personal overlay

Status: accepted (2026-11-13)

Amends [0073](0073-website-and-account-link.md) and [0101](0101-personal-profile-and-profession-album.md). The owner decided this on 2026-11-13.

## English only

- The whole site is English, including signed-in pages, sign-in errors and Path copy.
- The browser language is ignored, and there is no language switch.
- The Russian copy maps are removed from the web. The Server API may still accept a `locale` for authored content, but the site only asks for and shows `en`.
- The addon and the Companion keep their own languages. This decision covers the website only.

## Public game pages, personal overlay

- **Site-wide rule.** Every page is public and indexable by default. Being signed in adds a personal overlay to the same page and never makes it a separate private page. Only account controls stay private: `/my`, sign-in and Forget my data.
- **Example flow.** A player comes from search to one recipe page and sees the full recipe. They sign in, and the same page now shows whether their picked character knows it, how hard it is for them and the next step.
- **Single recipe pages.** Each recipe gets its own page at `/forever/recipes/<slug>`. The slug comes from the English recipe name; when two names collide, the spell id is appended.
  - The page shows its profession and category, required skill, formula facts, reagents with counts, the skill-up thresholds (orange, yellow, green, grey), aggregated sightings and the base difficulty.
  - It links to and from its profession page.
  - It carries schema.org breadcrumbs and appears in the sitemap.
  - The overlay adds known or missing, character-relative difficulty with reasons, and "Can get now".
  - Unnamed catalog rows get no page.
- **Public pages.** Profession pages are public and indexable at game-scoped addresses, for example `/forever/professions/enchanting`. Similar pages later follow the same model: recipes, collections and quest chains.
- **What anonymous visitors see.** Every catalog recipe, grouped by category, with:
  - its formula facts: required skill, quality, bind on pickup or tradable;
  - reagents;
  - aggregated trainer and vendor sightings (NPC, zone, coordinates, cost, limited), with no Account identities;
  - a base difficulty. This is the ADR 0101 Source and Reagents parts, without the character's Skill part, labelled "base".
- **Overlay.** A signed-in player picks a character in a header menu. It lists their characters from the private API, and the choice is kept in a cookie with no secret in it; the server checks ownership on every private request.
  - With a character picked, the same page adds known versus missing slots, character-relative difficulty (the full 0101 formula), "Can get now" and Today goals.
- **No personal data in shared HTML.**
  - Public HTML and its cache never contain personal data.
  - The overlay is fetched after mount from a private, `no-store`, noindex API, and the page's SSR output is the same for everyone.
  - The canonical URL, metadata and sitemap ignore the overlay.
- **Old private addresses.** `/my/<game>/<realm>/<name>/<profession>` redirects to the public page with that character picked. `/my` stays the private account page, and the profile home from 0101 comes later.
- **Retail.** Retail uses the same model at `/retail/professions/<slug>` once its catalog supports it.

## Next track: quest chains (not built yet)

- **Pages.** Public pages for main quest chains, Forever first, at `/forever/quests/<chain>`. A picked character's overlay shows the steps done, the next step and where to pick it up when a sighting exists.
- **Completed quests.** The Forever 1.60.1 API documentation lists `C_QuestLog.GetAllCompletedQuestIDs` and `C_QuestLog.IsQuestFlaggedCompleted`, and the addon already sends the `questsDone` and `questLog` Sections in Forever (seen for a real character).
- **Chain definitions.** The Forever client tables have no usable chains. Build 1.60.1.70938 has 3 `QuestLine` rows, and `QuestV2` has no names. So chain definitions cannot come from client tables.
- **Proposed source.** Authored chain lists, each step verified against player observations: quest ids and titles from `questLog`, accept and turn-in order. No third-party quest databases are imported.
- **Before building.** This needs the owner's approval of authored chains, plus an addon change to record accept and turn-in events with quest ids.

## Planned track: character feed and community feed (after professions, recipes and quests)

- **No private sections.** The site has no private content sections. Only account controls stay private: `/my` settings, sign-in and Forget my data.
- **Character feed.** Character history becomes a feed, like a photo feed: dated events (level rises, profession ranks, learned recipes, reputation tiers, dungeons) with the player's screenshots over time. From a character feed the visitor can jump to a global community feed of player content.
- **Sharing is opt-in.**
  - A character feed and its screenshots are public only when the player turns sharing on. It is off by default.
  - The switch is in the Companion and on the site.
  - Screenshots are collected only when sharing is on: the Companion reads the game's `Screenshots` folder and uploads only images taken while sharing is on.
  - Turning sharing off hides the feed at once.
- **Deletion and media.** Forget my data deletes everything, including uploaded screenshots and their variants. The media rules stay: only compression and format conversion, no edits and no third-party images.
- **Not built yet.** Each step gets its own ADR before code. Until then, the existing private history page (0099) stays as it is.
