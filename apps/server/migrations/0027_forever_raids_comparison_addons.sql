-- Publish only on an existing English Forever site; preserve all unrelated owner work.
LOCK TABLE content.paths IN SHARE ROW EXCLUSIVE MODE;
DO $migration$
DECLARE
  guide jsonb;
  current_page content.paths%ROWTYPE;
  next_group text;
  stamp bigint := floor(extract(epoch FROM NOW()));
  revision constant text := 'forever-batch-three-2026-11-09';
BEGIN
  IF EXISTS (SELECT 1 FROM content.editorial_migrations WHERE name = revision) THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM content.paths WHERE kind = 'guide' AND game = 'forever' AND locale = 'en') THEN RETURN; END IF;
  FOR guide IN SELECT value FROM jsonb_array_elements($guides$
[
  {
    "kind": "guide",
    "game": "forever",
    "slug": "wow-forever-raids",
    "locale": "en",
    "title": "WoW Forever Raid Release Date: December 9",
    "description": "WoW Forever raids open December 9. Check raid sizes, planned resets, Onyxia entry requirements and what to prepare before your first run.",
    "group": "dungeons-raids",
    "tier": null,
    "prerequisite": null,
    "blocks": [
      {
        "type": "paragraph",
        "text": "December 9, 2026 is the WoW Forever raid release date: level 60 players can enter Barrow Deeps, Hyjal Summit and Onyxia's Lair. Blizzard confirms all three for that date, so choose the raid your group wants to prepare for."
      },
      {
        "type": "paragraph",
        "text": "Status: confirmed by Blizzard, checked 2026-11-09. Recheck: 2026-12-09, or sooner if a patch changes the announcement."
      },
      {
        "type": "link",
        "label": "Read Blizzard’s raid opening announcement",
        "href": "https://news.blizzard.com/en-us/article/24315820/world-of-warcraft-forever-now-live"
      },
      {
        "type": "heading",
        "text": "Pick the raid that fits your group"
      },
      {
        "type": "table",
        "caption": "Raid entry and preparation facts, checked 2026-11-09",
        "columns": [
          "Raid",
          "Players",
          "Reset plan",
          "Attunement",
          "Loot",
          "Resistance"
        ],
        "rows": [
          [
            "Barrow Deeps",
            "10",
            "Weekly, planned",
            "Not announced",
            "Full loot table not announced",
            "Requirement not announced"
          ],
          [
            "Hyjal Summit",
            "20",
            "Weekly, planned",
            "Not announced",
            "Full loot table not announced",
            "Requirement not announced"
          ],
          [
            "Onyxia’s Lair",
            "40",
            "Weekly, planned",
            "Carry the Drakefire Amulet",
            "Full loot table not announced",
            "Blizzard advises fire resistance; amount not announced"
          ]
        ]
      },
      {
        "type": "paragraph",
        "text": "Blizzard’s raid overview supplies the sizes and entry facts above. Its roadmap also announces new tier sets and a legendary reward for the new raid content, without a full item list. “Not announced” means the checked Blizzard articles do not state that detail."
      },
      {
        "type": "paragraph",
        "text": "Barrow Deeps takes you into Illidan’s former prison, with entrances connected through Mount Hyjal, Winterspring and Blackmaw Hold. Hyjal Summit lies near Nordrassil and offers branching paths across the mountain. Onyxia waits in Dustwallow Marsh."
      },
      {
        "type": "link",
        "label": "See Blizzard’s descriptions and entry overview",
        "href": "https://news.blizzard.com/en-us/article/24303009/world-of-warcraft-forever-raid-overviewlocations-raid-sizes-and-attunement"
      },
      {
        "type": "paragraph",
        "text": "Our advice: begin by asking who can attend regularly. Barrow Deeps suits a smaller roster; Hyjal Summit and Onyxia require more people to coordinate. A smaller group size does not establish an easier fight. Pick for attendance and interest until encounter experience gives your group a better basis for judging difficulty."
      },
      {
        "type": "heading",
        "text": "Start Onyxia’s entry chain before raid night"
      },
      {
        "type": "paragraph",
        "text": "Every member needs the {{term:drakefire-amulet|Drakefire Amulet}} in their bags. Blizzard confirms a faction-specific {{term:attunement|attunement}} chain and advises leaving time for elite quests and dungeon trips. The amulet does not need to be equipped."
      },
      {
        "type": "paragraph",
        "text": "Check your own quest progress before arranging a dungeon run with friends. If your group is at different points, agree which unfinished objective the trip will cover. Someone else having the amulet will not satisfy your character’s entry requirement."
      },
      {
        "type": "paragraph",
        "text": "Use the faction tabs in Blizzard’s linked overview for the chain. A familiar raid name is not enough reason to copy an old Classic Era route, resistance target or loot list into your Forever plans."
      },
      {
        "type": "heading",
        "text": "What to prepare before December 9"
      },
      {
        "type": "paragraph",
        "text": "The following is our preparation advice. Apart from the confirmed level and Onyxia entry item, these are priorities for spending your play time, not additional Blizzard entry requirements."
      },
      {
        "type": "list",
        "items": [
          "Reach level 60 while learning the abilities you expect to use with a group. If you are still leveling when raids open, agree a later first run instead of treating opening day as a personal deadline.",
          "Use quests and dungeon runs to improve weak equipment slots and practise your intended role. Ask prospective teammates what they need before buying a costly item for a role you may not play.",
          "Choose a profession project you can finish and use. Price its materials before crafting; an unfinished shopping list does not help your first raid.",
          "Set aside consumables for your role, food or water where useful, and gold for repairs. Buy for the runs you have arranged rather than stocking an assumed season’s worth of supplies.",
          "For Onyxia, follow Blizzard’s fire-resistance advice and finish the amulet chain. No numerical resistance target is given in the checked overview, so do not treat an old guide’s number as a Forever requirement."
        ]
      },
      {
        "type": "link",
        "label": "Choose a profession pair for your class",
        "href": "/guides/wow-forever-best-professions-for-each-class"
      },
      {
        "type": "link",
        "label": "Build a supply and repair budget while leveling",
        "href": "/guides/how-to-make-gold-early-in-wow-forever"
      },
      {
        "type": "heading",
        "text": "Agree your schedule before spending gold"
      },
      {
        "type": "paragraph",
        "text": "Blizzard currently plans weekly raid resets. The checked overview does not give a regional reset hour or detailed lockout-sharing rules. Agree a regular evening with your group, then verify the live schedule before booking repeat runs around it."
      },
      {
        "type": "paragraph",
        "text": "A useful first plan names the raid, the people who intend to come and any unfinished entry work. Leave purchases that depend on an exact loot table or resistance threshold until that information is available. You can still prepare your character without guessing what every boss will demand."
      },
      {
        "type": "faq",
        "entries": [
          {
            "q": "When do WoW Forever raids open?",
            "a": "December 9, 2026. Blizzard names Barrow Deeps, Hyjal Summit and Onyxia’s Lair for level 60 players."
          },
          {
            "q": "What are the raid sizes?",
            "a": "Barrow Deeps takes 10 players, Hyjal Summit 20 and Onyxia’s Lair 40, according to Blizzard’s raid overview."
          },
          {
            "q": "Does Onyxia need attunement in Forever?",
            "a": "Yes. Each player must earn and carry the Drakefire Amulet. Blizzard links a faction-specific quest chain; the amulet need not be equipped."
          },
          {
            "q": "What is the raid lockout?",
            "a": "Blizzard says weekly resets are planned. Exact regional reset timing and detailed lockout-sharing rules are not announced in the checked overview."
          },
          {
            "q": "Is there a required gear or resistance target?",
            "a": "No numeric gear or resistance target appears in the checked announcements. Blizzard does advise building fire resistance for Onyxia. Full boss loot tables and Barrow Deeps or Hyjal attunements are not announced there."
          }
        ]
      },
      {
        "type": "link",
        "label": "Start your first Forever character",
        "href": "/guides/wow-forever-beginners-guide"
      },
      {
        "type": "link",
        "label": "Check Forever access and common questions",
        "href": "/guides/wow-forever-faq"
      },
      {
        "type": "link",
        "label": "Browse all Forever guides",
        "href": "/forever"
      }
    ],
    "terms": [
      {
        "key": "drakefire-amulet",
        "name": "Drakefire Amulet",
        "text": "The item each player must carry to enter Onyxia’s Lair. Earn it through the faction-specific quest chain; it can stay in your bags.",
        "source": "https://news.blizzard.com/en-us/article/24303009/world-of-warcraft-forever-raid-overviewlocations-raid-sizes-and-attunement"
      },
      {
        "key": "attunement",
        "name": "Attunement",
        "text": "The entry quest work required before a character can enter a raid. For Onyxia in Forever, the faction-specific chain awards the required Drakefire Amulet.",
        "source": "https://news.blizzard.com/en-us/article/24303009/world-of-warcraft-forever-raid-overviewlocations-raid-sizes-and-attunement"
      }
    ],
    "sources": [
      {
        "label": "Blizzard: Forever Now Live",
        "url": "https://news.blizzard.com/en-us/article/24315820/world-of-warcraft-forever-now-live",
        "accessed": "2026-11-09"
      },
      {
        "label": "Blizzard: Raid Overview, Locations, Raid Sizes and Attunement",
        "url": "https://news.blizzard.com/en-us/article/24303009/world-of-warcraft-forever-raid-overviewlocations-raid-sizes-and-attunement",
        "accessed": "2026-11-09"
      },
      {
        "label": "Blizzard: What’s Next Panel Recap",
        "url": "https://news.blizzard.com/en-gb/article/24303862/world-of-warcraft-forever-whats-next-panel-recap",
        "accessed": "2026-11-09"
      }
    ],
    "asOf": {
      "date": "2026-11-09",
      "build": "Forever launch announcements and project documentation",
      "note": "Sources checked on 9 November 2026; no live-client testing. Recheck on the date below or when a patch lands."
    },
    "items": [],
    "topics": [],
    "previousVersion": 0,
    "hash": "3f9198cabddc8cedfef420d699fe9bba8a81a39c1122db5519367dd9475e8a4e"
  },
  {
    "kind": "guide",
    "game": "forever",
    "slug": "wow-forever-vs-classic",
    "locale": "en",
    "title": "WoW Forever vs Classic: Which Should You Play?",
    "description": "Compare WoW Forever with Classic Era by quests, races, talents, graphics, Legacy, camps and raids, then choose the game that fits your plans.",
    "group": "comparisons",
    "tier": null,
    "prerequisite": null,
    "blocks": [
      {
        "type": "paragraph",
        "text": "Mount Hyjal, Shen’dralas, the Riverglades and Zephras Isle give Forever new places to explore on the original continents, with a level cap of 60. For WoW Forever vs Classic, choose Forever if you want fresh adventures and revised systems; choose Classic Era if familiar quests and established class builds are the main attraction."
      },
      {
        "type": "paragraph",
        "text": "“Classic” here means Classic Era, the version that retains the original game’s progression. Expansion-progressing Classic and special rulesets are separate choices. Blizzard’s historical Era explanation establishes that distinction; the Era column below describes long-established behavior, without applying old service offers or prices to today."
      },
      {
        "type": "paragraph",
        "text": "Raid status: December 9, 2026 confirmed by Blizzard, checked 2026-11-09. Recheck this comparison on 2026-12-09 or when a patch changes a listed system."
      },
      {
        "type": "heading",
        "text": "What changes when you choose Forever"
      },
      {
        "type": "table",
        "caption": "Forever launch systems and the familiar Classic Era baseline",
        "columns": [
          "System",
          "WoW Forever",
          "Classic Era"
        ],
        "rows": [
          [
            "Zones and quests",
            "New and reimagined areas including Mount Hyjal, Shen’dralas, the Riverglades and Zephras Isle; more than 1,000 new quests. Blizzard: Now Live.",
            "Familiar original-continent zones and quest progression."
          ],
          [
            "Races and class choices",
            "Skyborne and combinations such as Undead Paladin, Human Hunter and Dwarf Shaman. Skyborne/start access comes with Heroic or higher. Blizzard: Now Live / Carve a New Path.",
            "Original racial roster and class restrictions; no Skyborne."
          ],
          [
            "Talents and abilities",
            "Revised talents and new abilities retain class identity while changing choices. Blizzard: What’s Next.",
            "Established Era talent trees and class abilities."
          ],
          [
            "Presets and graphics",
            "Classic or Enhanced presentation presets; HD or SD character appearance can be changed. Blizzard: Now Live.",
            "Familiar Era presentation and interface settings; no Forever preset selection."
          ],
          [
            "Legacy progression",
            "Account-wide Challenges, Perks and Rewards; advantages can be unlocked on one character. Blizzard: Now Live.",
            "No Forever Legacy System."
          ],
          [
            "Camping",
            "Cooking’s Basic Campfire becomes a shared campsite with profession-crafted features. Blizzard: Now Live.",
            "Campfires do not supply the Forever Camp Feature system."
          ],
          [
            "Raids and dates",
            "Barrow Deeps, Hyjal Summit and Onyxia’s Lair open December 9, 2026 for level 60 players. Blizzard: Now Live.",
            "Established original raid progression; no Forever launch schedule."
          ],
          [
            "Addons and client",
            "Select a release explicitly supporting Forever. Questie’s project lists Forever separately from Classic.",
            "Use the addon’s Classic Era release; shared project names do not establish cross-client compatibility."
          ]
        ]
      },
      {
        "type": "link",
        "label": "Read Blizzard’s launch system descriptions",
        "href": "https://news.blizzard.com/en-us/article/24315820/world-of-warcraft-forever-now-live"
      },
      {
        "type": "heading",
        "text": "New quests matter more than a familiar zone name"
      },
      {
        "type": "paragraph",
        "text": "If you already know the old roads, Forever gives you reasons to look around again. Mount Hyjal follows the aftermath of Archimonde’s defeat; Shen’dralas connects a new adventure to the Shen’dralar, Dire Maul and nearby centaur tribes. Those are changes to where you go and what you do, beyond a different character appearance."
      },
      {
        "type": "paragraph",
        "text": "Our advice: choose Forever if revisiting Azeroth sounds appealing only when there is something new to discover. Choose Era if remembering where a quest leads is part of the pleasure. Neither preference requires rushing toward raids."
      },
      {
        "type": "heading",
        "text": "Check the character you actually want to make"
      },
      {
        "type": "paragraph",
        "text": "Forever’s new race/class combinations can settle the choice immediately. An Undead Paladin or Dwarf Shaman is a concrete reason to choose it. Skyborne players choose Horde-aligned Windshapers with access to Shaman, or Alliance-aligned High-Order Skyborne with access to Mage. Access to that race and its Zephras Isle start comes with the Skyborne Heroic Pack or a higher edition."
      },
      {
        "type": "paragraph",
        "text": "If your preferred race/class already exists in Era, the question becomes how much change you want in its abilities. Blizzard describes Forever’s talent and ability updates as preserving class identity while opening new possibilities. Recheck a build written for Forever before spending your points; familiarity with Era does not establish that an old build still fits."
      },
      {
        "type": "link",
        "label": "Read Blizzard’s class-design direction",
        "href": "https://news.blizzard.com/en-gb/article/24303862/world-of-warcraft-forever-whats-next-panel-recap"
      },
      {
        "type": "heading",
        "text": "The Classic preset still plays Forever"
      },
      {
        "type": "paragraph",
        "text": "Selecting Classic at Forever’s first setup changes presentation defaults. It does not turn the game into Classic Era. Enhanced enables conveniences such as quest points of interest and a single-bag display by default; individual settings remain changeable under Game Menu > Options."
      },
      {
        "type": "paragraph",
        "text": "HD and SD character models affect appearance only. Choose the look you prefer without treating it as a combat or progression choice. If modern interface guidance is useful but you prefer older character art, adjust those settings separately."
      },
      {
        "type": "link",
        "label": "Compare the Classic and Enhanced settings",
        "href": "/guides/wow-forever-enhanced-vs-classic-preset"
      },
      {
        "type": "heading",
        "text": "Legacy and camps give ordinary play more uses"
      },
      {
        "type": "paragraph",
        "text": "The {{term:legacy|Legacy System}} adds account-wide Challenges, Perks and Rewards. Blizzard says its character advantages can all be unlocked on one character, so you do not need to commit to leveling a roster of alts to benefit."
      },
      {
        "type": "paragraph",
        "text": "Camping turns Cooking’s Basic Campfire into a shared rest stop. Nearby players contribute profession-crafted Camp Features; sitting or crafting there earns their benefits. If you like professions and stopping to prepare with other players, that gives Forever a useful extra reason to make those stops."
      },
      {
        "type": "link",
        "label": "Understand Legacy progression before choosing perks",
        "href": "/guides/wow-forever-legacy-talents"
      },
      {
        "type": "heading",
        "text": "Choose by the evenings you want to spend"
      },
      {
        "type": "list",
        "items": [
          "Pick Forever for new quests in the original world, expanded character choices and new progression systems. Expect to learn changed mechanics as you go.",
          "Pick Classic Era for its established questing and class progression. This is the stronger fit when recreating a familiar character matters more than discovering new systems.",
          "If you already play modern WoW, decide whether original-continent adventuring appeals to you on its own. Forever is a separate permanent game alongside modern WoW; an Enhanced interface does not promise the same character build or activities."
        ]
      },
      {
        "type": "paragraph",
        "text": "For a group deciding together, name the activity you want to share first. A plan to explore new zones points toward Forever; a plan built around familiar Era progression points toward Era. Check that everyone is choosing the same game before using the word “Classic” as shorthand."
      },
      {
        "type": "link",
        "label": "Choose a Forever raid and prepare for its opening",
        "href": "/guides/wow-forever-raids"
      },
      {
        "type": "link",
        "label": "Check addon support before copying your setup",
        "href": "/guides/best-wow-forever-addons"
      },
      {
        "type": "faq",
        "entries": [
          {
            "q": "Is WoW Forever Classic Plus?",
            "a": "“Classic Plus” is a community shorthand for expanding the original game. Blizzard calls this separate permanent game World of Warcraft: Forever. Use that name when choosing a client or finding a guide."
          },
          {
            "q": "Does the Classic preset turn Forever into Classic Era?",
            "a": "No. It selects presentation defaults inside Forever. The quests, races and progression remain Forever’s; you can adjust the individual settings later."
          },
          {
            "q": "Are the talents the same as Classic Era?",
            "a": "Blizzard has announced changed talents and abilities for Forever. Check a Forever build for your class rather than assuming an established Era build transfers unchanged."
          },
          {
            "q": "Can I use old-looking character models in Forever?",
            "a": "Yes. Blizzard offers SD and HD character models. The choice affects appearance, and you can change it later."
          },
          {
            "q": "Should I choose Forever or Retail?",
            "a": "Our advice: try Forever when you want a new journey through original Azeroth and its revised systems. Stay with modern WoW when the activities and characters you already enjoy there are what you want to spend your time on."
          }
        ]
      },
      {
        "type": "link",
        "label": "Start your first Forever character",
        "href": "/guides/wow-forever-beginners-guide"
      },
      {
        "type": "link",
        "label": "Check Forever access and common questions",
        "href": "/guides/wow-forever-faq"
      },
      {
        "type": "link",
        "label": "Browse all Forever guides",
        "href": "/forever"
      }
    ],
    "terms": [
      {
        "key": "legacy",
        "name": "Legacy System",
        "text": "Forever’s account-wide progression through Challenges, Perks and Rewards. All character advantages can be unlocked on one character; leveling alts is optional.",
        "source": "https://news.blizzard.com/en-us/article/24315820/world-of-warcraft-forever-now-live"
      }
    ],
    "sources": [
      {
        "label": "Blizzard: Carve a New Path",
        "url": "https://news.blizzard.com/en-us/article/24302093/carve-a-new-path-with-world-of-warcraft-forever",
        "accessed": "2026-11-09"
      },
      {
        "label": "Blizzard: Forever Now Live",
        "url": "https://news.blizzard.com/en-us/article/24315820/world-of-warcraft-forever-now-live",
        "accessed": "2026-11-09"
      },
      {
        "label": "Blizzard: What’s Next Panel Recap",
        "url": "https://news.blizzard.com/en-gb/article/24303862/world-of-warcraft-forever-whats-next-panel-recap",
        "accessed": "2026-11-09"
      },
      {
        "label": "Blizzard: Playing Ahead, Making Choices in WoW Classic",
        "url": "https://news.blizzard.com/en-us/article/23666981/playing-ahead-making-choices-in-wow-classic",
        "accessed": "2026-11-09"
      },
      {
        "label": "Questie: supported game flavors",
        "url": "https://www.curseforge.com/wow/addons/questie/files/all",
        "accessed": "2026-11-09"
      }
    ],
    "asOf": {
      "date": "2026-11-09",
      "build": "Forever launch announcements and project documentation",
      "note": "Sources checked on 9 November 2026; no live-client testing. Recheck on the date below or when a patch lands."
    },
    "items": [],
    "topics": [],
    "previousVersion": 0,
    "hash": "2f1fa01882637b873cfbbd4fdb3efcb49aa1bb02fe78d57f1bbcdf62b74d3fd9"
  },
  {
    "kind": "guide",
    "game": "forever",
    "slug": "best-wow-forever-addons",
    "locale": "en",
    "title": "WoW Forever Addons: Picks, Install and Fixes",
    "description": "Choose checked WoW Forever addons for quests, bags and auctions. Find the right folder, install with CurseForge or manually, and fix missing addons.",
    "group": "addons",
    "tier": null,
    "prerequisite": null,
    "blocks": [
      {
        "type": "paragraph",
        "text": "Questie v12.6.4 has a Forever release listed on CurseForge, checked November 9, 2026. For WoW Forever addons, start with the problem you want to solve: Questie for quest-map help, Baganator for bag organization or Auctionator for buying and selling."
      },
      {
        "type": "paragraph",
        "text": "Build listings checked 2026-11-09. Recheck: 2026-11-16 or the next client patch, whichever comes first. These are author-supported releases; no in-game testing is claimed here."
      },
      {
        "type": "heading",
        "text": "Choose an addon for a job you need"
      },
      {
        "type": "table",
        "caption": "Forever releases checked on 2026-11-09",
        "columns": [
          "Need",
          "Addon",
          "Checked Forever release",
          "Why choose it / when to skip"
        ],
        "rows": [
          [
            "Quest-map help",
            "Questie",
            "v12.6.4, November 7",
            "Adds quest-map information. New Forever quest availability can still be incomplete; do not treat every marker as a quest you can accept."
          ],
          [
            "Organized bags",
            "Baganator",
            "846, November 8",
            "Category and single-view layouts. Skip it if the built-in one-bag display already makes your inventory easy to use."
          ],
          [
            "Auction shopping and selling",
            "Auctionator",
            "343, November 8",
            "Helps with auction searches, selling and item values. Install when you use the auction house; it does not make a purchase profitable."
          ]
        ]
      },
      {
        "type": "link",
        "label": "Questie: open the checked file list",
        "href": "https://www.curseforge.com/wow/addons/questie/files/all"
      },
      {
        "type": "link",
        "label": "Baganator: open the checked file list",
        "href": "https://www.curseforge.com/wow/addons/baganator/files/all"
      },
      {
        "type": "link",
        "label": "Auctionator: open the checked file list",
        "href": "https://www.curseforge.com/wow/addons/auctionator/files/all"
      },
      {
        "type": "paragraph",
        "text": "Our advice: install the addon that fixes your current annoyance, then try normal play before adding another. A questing character who rarely visits the auction house has less reason to start with Auctionator. If bag categories are what you want, Baganator addresses that directly."
      },
      {
        "type": "paragraph",
        "text": "Forever’s Enhanced preset already enables quest points of interest and one-bag display. Try those settings first if your only goal is to find objectives or see your bags together. Add an extra tool when you can name the information or arrangement still missing."
      },
      {
        "type": "link",
        "label": "Adjust the built-in Classic and Enhanced settings",
        "href": "/guides/wow-forever-enhanced-vs-classic-preset"
      },
      {
        "type": "heading",
        "text": "Check the Forever file before downloading"
      },
      {
        "type": "paragraph",
        "text": "The checked projects list Forever as a supported {{term:flavor|flavor}}. Open Files and inspect the selected release’s game versions. A project can support several games while its prominent download points at a different one; Questie’s listing, for example, shows a main file under another Classic version as well as a Forever entry."
      },
      {
        "type": "paragraph",
        "text": "The checked Forever client is 1.60.1 with Interface 16001, documented by Questie’s development notes and InvurseUI’s launch compatibility notes. The {{term:toc|TOC}} identifies the interface an addon targets. That number is useful for diagnosing an old package, but editing it cannot supply missing code or game data."
      },
      {
        "type": "paragraph",
        "text": "Prefer the project’s packaged release. A source-code archive from a repository may be intended for development rather than installation. If the release includes companion folders or required dependencies, keep them together and follow the project’s instructions."
      },
      {
        "type": "heading",
        "text": "Install with CurseForge"
      },
      {
        "type": "list",
        "items": [
          "Select your Forever installation in CurseForge before choosing an addon. Check the installation directory as well as the game label, especially if Retail, Era or a beta client is also installed.",
          "Open the addon’s file list and choose a file marked Forever or the checked 1.60.1 game version. Inspect the exact file if the project supports multiple games.",
          "Install, then fully close and restart Forever. At character selection, open AddOns and enable the addon for the character you intend to play."
        ]
      },
      {
        "type": "paragraph",
        "text": "If CurseForge installs the wrong flavor, check the selected game installation and file again. A compatible release on the website does not establish that your app selected it. Correct that selection before reinstalling; repeatedly installing the same file into another client’s folder will leave Forever unchanged."
      },
      {
        "type": "heading",
        "text": "Install manually on Windows or Mac"
      },
      {
        "type": "paragraph",
        "text": "Quit the game, download the packaged Forever release and extract it. Put each addon folder inside Forever’s Interface/AddOns directory. The Windows path below starts at your existing World of Warcraft folder; the Mac path is the default documented by the project and can differ if you moved the game."
      },
      {
        "type": "list",
        "items": [
          "Windows, relative to your game installation: World of Warcraft\\_forever_\\Interface\\AddOns\\",
          "macOS default: /Applications/World of Warcraft/_forever_/Interface/AddOns/"
        ]
      },
      {
        "type": "paragraph",
        "text": "Keep the addon’s TOC inside its own folder directly under AddOns. For example, an extra outer archive folder between AddOns and the actual addon can keep the game from finding it. Extract the release’s contents, not just the ZIP file, and retain any required sibling folders."
      },
      {
        "type": "paragraph",
        "text": "Fully restart Forever after copying a new addon. Then open AddOns at character selection and check that it is listed and enabled. If it is absent, inspect the directory before changing in-game settings."
      },
      {
        "type": "link",
        "label": "Project installation and compatibility reference",
        "href": "https://github.com/InvurseStudio/InvurseUI"
      },
      {
        "type": "heading",
        "text": "Find why an addon is not showing up"
      },
      {
        "type": "list",
        "items": [
          "Absent from the AddOns list: check that the files are in the live _forever_ directory, that they were extracted, and that no extra wrapper folder hides the addon folder. Restart the game after correcting the location.",
          "Listed but disabled: enable it for the intended character. If it is marked outdated, look for a newer Forever release before using the outdated-addon checkbox.",
          "Listed as outdated: “Load out of date AddOns” can let the game try an older package. Use it only after checking the author’s compatibility notes. It does not convert an Era or Retail package into a Forever one.",
          "Loads but behaves incorrectly: disable it and check the project’s known issues. Test a clean, current release before adding other interface changes, so you can tell which change caused the problem."
        ]
      },
      {
        "type": "heading",
        "text": "Questie can load while a quest marker is wrong"
      },
      {
        "type": "paragraph",
        "text": "Questie’s maintainers explain that new Forever quests need database work to identify availability conditions. A marker can therefore be missing or point to a quest you cannot yet accept even when the addon loaded correctly. Check the quest itself before reinstalling a working addon to fix its data."
      },
      {
        "type": "link",
        "label": "Read Questie’s maintained quest-availability issue",
        "href": "https://github.com/Questie/Questie/issues/7999"
      },
      {
        "type": "paragraph",
        "text": "Unbored is a Retail addon and does not support Forever yet."
      },
      {
        "type": "faq",
        "entries": [
          {
            "q": "Does Questie work in WoW Forever?",
            "a": "Questie’s own file page lists a Forever release, v12.6.4, checked November 9, 2026. Its maintainers still flag incomplete or incorrect availability for new quests."
          },
          {
            "q": "Can CurseForge install WoW Forever addons?",
            "a": "The checked projects publish Forever files on CurseForge. Select your Forever installation and inspect the file’s game version before installing; a project’s main download may also target another game."
          },
          {
            "q": "Where is the WoW Forever AddOns folder?",
            "a": "Inside your game installation, open _forever_, then Interface, then AddOns. The documented Mac default is /Applications/World of Warcraft/_forever_/Interface/AddOns/."
          },
          {
            "q": "Why is my addon not showing up?",
            "a": "First check the live Forever folder, extracted addon folder structure and whether the game was fully restarted. If it appears in the list, check that it is enabled for your character and inspect any outdated warning."
          },
          {
            "q": "Should I use Load out of date AddOns?",
            "a": "Check for a current Forever release first. The checkbox can let an older addon attempt to load, but it does not repair incompatible code or supply missing quest data."
          }
        ]
      },
      {
        "type": "link",
        "label": "Choose a class for your leveling journey",
        "href": "/guides/best-leveling-class-wow-forever"
      },
      {
        "type": "link",
        "label": "Make auction decisions around your actual costs",
        "href": "/guides/how-to-make-gold-early-in-wow-forever"
      },
      {
        "type": "link",
        "label": "Start your first Forever character",
        "href": "/guides/wow-forever-beginners-guide"
      },
      {
        "type": "link",
        "label": "Check Forever access and common questions",
        "href": "/guides/wow-forever-faq"
      },
      {
        "type": "link",
        "label": "Browse all Forever guides",
        "href": "/forever"
      }
    ],
    "terms": [
      {
        "key": "flavor",
        "name": "Game flavor",
        "text": "The game edition an addon file supports, such as Forever or Classic. Check the file’s listed flavor as well as the project name.",
        "source": "https://www.curseforge.com/wow/addons/questie/files/all"
      },
      {
        "key": "toc",
        "name": "TOC file",
        "text": "An addon’s table-of-contents file. It declares the client interface and the addon files to load. A matching interface declaration alone does not prove that every feature works.",
        "source": "https://github.com/Questie/Questie/blob/master/docs/forever-development.md"
      }
    ],
    "sources": [
      {
        "label": "Questie: Forever files",
        "url": "https://www.curseforge.com/wow/addons/questie/files/all",
        "accessed": "2026-11-09"
      },
      {
        "label": "Questie: Forever development and interface",
        "url": "https://github.com/Questie/Questie/blob/master/docs/forever-development.md",
        "accessed": "2026-11-09"
      },
      {
        "label": "Questie: new quest availability, issue 7999",
        "url": "https://github.com/Questie/Questie/issues/7999",
        "accessed": "2026-11-09"
      },
      {
        "label": "Auctionator: Forever files",
        "url": "https://www.curseforge.com/wow/addons/auctionator/files/all",
        "accessed": "2026-11-09"
      },
      {
        "label": "Auctionator: features",
        "url": "https://www.curseforge.com/wow/addons/auctionator",
        "accessed": "2026-11-09"
      },
      {
        "label": "Baganator: Forever files",
        "url": "https://www.curseforge.com/wow/addons/baganator/files/all",
        "accessed": "2026-11-09"
      },
      {
        "label": "Baganator: features",
        "url": "https://www.curseforge.com/wow/addons/baganator",
        "accessed": "2026-11-09"
      },
      {
        "label": "InvurseUI: installation and launch-client compatibility",
        "url": "https://github.com/InvurseStudio/InvurseUI",
        "accessed": "2026-11-09"
      },
      {
        "label": "Blizzard: Forever presets",
        "url": "https://news.blizzard.com/en-us/article/24315820/world-of-warcraft-forever-now-live",
        "accessed": "2026-11-09"
      }
    ],
    "asOf": {
      "date": "2026-11-09",
      "build": "Forever launch announcements and project documentation",
      "note": "Sources checked on 9 November 2026; no live-client testing. Recheck on the date below or when a patch lands."
    },
    "items": [],
    "topics": [],
    "previousVersion": 0,
    "hash": "c769fc6aac9f3bf077be317eec7e19874190ea56895c6498f8cca5317e38df29"
  },
  {
    "group": "first-steps",
    "game": "forever",
    "terms": [
      {
        "key": "ruleset",
        "name": "Ruleset",
        "text": "The play environment chosen before character creation. Normal, PvP, Roleplay and Roleplay PvP set different combat expectations and community rules.",
        "source": "https://news.blizzard.com/en-us/article/24315280/new-players-starter-guide-welcome-to-world-of-warcraft-forever"
      }
    ],
    "sources": [
      {
        "label": "Blizzard: World of Warcraft: Forever Now Live!",
        "url": "https://news.blizzard.com/en-us/article/24315820/world-of-warcraft-forever-now-live",
        "accessed": "2026-11-09"
      },
      {
        "label": "Blizzard: Carve a New Path with World of Warcraft: Forever",
        "url": "https://news.blizzard.com/en-us/article/24302093/carve-a-new-path-with-world-of-warcraft-forever",
        "accessed": "2026-11-09"
      },
      {
        "label": "Blizzard: New Player's Starter Guide",
        "url": "https://news.blizzard.com/en-us/article/24315280/new-players-starter-guide-welcome-to-world-of-warcraft-forever",
        "accessed": "2026-11-09"
      }
    ],
    "asOf": {
      "date": "2026-11-09",
      "build": "Blizzard Forever launch and starter announcements",
      "note": "Official pages checked 9 November 2026. No currency prices quoted; Hardcore has no announced date, and the opened announcements name no console version."
    },
    "kind": "guide",
    "slug": "wow-forever-faq",
    "locale": "en",
    "title": "Is WoW Forever Free? Price and Release FAQ",
    "description": "Check subscription access, optional Skyborne editions, the raid opening date, Hardcore plans and console status before starting WoW Forever.",
    "tier": null,
    "prerequisite": null,
    "blocks": [
      {
        "type": "paragraph",
        "text": "Is WoW Forever free? No: you need an active WoW subscription or Game Time to play its level-60 adventure, with no separate base-game purchase."
      },
      {
        "type": "paragraph",
        "text": "If you already have active WoW game access, you can start Forever without buying a Skyborne pack. The optional upgrades matter if you want the new Skyborne race and its Zephras Isle start, or the other extras in a particular edition."
      },
      {
        "type": "heading",
        "text": "Key dates and status, checked 9 November 2026"
      },
      {
        "type": "table",
        "caption": "What is live, scheduled or still undated",
        "columns": [
          "Feature",
          "Date or status",
          "What that means"
        ],
        "rows": [
          [
            "Global launch",
            "4 November 2026, 3:00 p.m. PST / 23:00 UTC",
            "Forever is live and included with a WoW subscription or Game Time."
          ],
          [
            "First raids",
            "9 December 2026",
            "Level 60 players can enter Barrow Deeps, Hyjal Summit and Onyxia's Lair."
          ],
          [
            "Hardcore ruleset",
            "Sometime after launch; no announced date",
            "Wait for a dated Blizzard announcement before planning a Hardcore start."
          ],
          [
            "Level cap",
            "60",
            "The launch leveling journey ends at level 60."
          ],
          [
            "Skyborne access",
            "Heroic Pack or higher",
            "The new race and Zephras Isle starting experience require an optional upgrade."
          ],
          [
            "Console version",
            "Not named in the opened Blizzard announcements",
            "The starter guide names Windows and Mac; gamepad support is available."
          ]
        ]
      },
      {
        "type": "heading",
        "text": "Choose access before choosing an edition"
      },
      {
        "type": "paragraph",
        "text": "The optional paid editions are the Skyborne Heroic Pack, Skyborne Epic Pack and Warcraft Forever Collection. Skyborne and the Zephras Isle starting experience come with the Heroic Pack and higher editions. You can play the base Forever game with a subscription or Game Time without adding one of these editions."
      },
      {
        "type": "paragraph",
        "text": "Our advice is to start with your existing access if you are unsure about the new race. If Skyborne is the reason you want to play, check the edition contents before purchasing. Blizzard's edition page links to the shop for the current offer in your region."
      },
      {
        "type": "link",
        "label": "Check Blizzard's optional edition contents and shop links",
        "href": "https://news.blizzard.com/en-us/article/24302093/carve-a-new-path-with-world-of-warcraft-forever"
      },
      {
        "type": "heading",
        "text": "Decide whether its adventure is worth your time"
      },
      {
        "type": "paragraph",
        "text": "Forever is a permanent game alongside modern WoW and Classic, set on the original continents with new quests and reimagined places. Blizzard describes more than 1,000 new quests across levels 1 to 60. If exploring that world and building a new character appeals to you, our advice is to try the opening journey using access you already have."
      },
      {
        "type": "paragraph",
        "text": "If your reason to start is Hardcore, wait for its announcement. If your reason is raiding, use 9 December as the opening date and allow for reaching level 60. A console-only player should wait for platform news rather than buying an edition on the strength of gamepad support."
      },
      {
        "type": "link",
        "label": "Check raid sizes, entry requirements and preparation",
        "href": "/guides/wow-forever-raids"
      },
      {
        "type": "paragraph",
        "text": "For a start with friends, agree on faction and {{term:ruleset|ruleset}} before creating characters. Blizzard's starter guide says grouping, guilds, dungeons and raids require the same ruleset and faction. That choice matters more to your first evening together than which optional cosmetic pack you own."
      },
      {
        "type": "faq",
        "entries": [
          {
            "q": "Is WoW Forever free, or does it need a subscription?",
            "a": "Forever is included with an active World of Warcraft subscription or Game Time. It is not a permanently free-to-play game, and a separate Forever base-game purchase is not required."
          },
          {
            "q": "Which WoW Forever edition do I need?",
            "a": "A subscription or Game Time covers the base game. Skyborne Heroic Pack, Skyborne Epic Pack and Warcraft Forever Collection are optional paid upgrades. The Heroic Pack and higher add Skyborne and the Zephras Isle start; check Blizzard's edition page for the current contents and shop offer."
          },
          {
            "q": "Is WoW Forever worth it?",
            "a": "Our advice: try it if you want a new level-60 journey through the original continents with new quests and systems, especially if you already have active WoW access. Wait if your main reason is Hardcore or a console release, since neither has a confirmed launch date in the announcements checked."
          },
          {
            "q": "Is WoW Forever on console or Xbox?",
            "a": "The Blizzard announcements checked on 9 November name no console or Xbox version. The starter guide names Windows and Mac. Gamepad support is available, but that announcement does not announce a console release."
          },
          {
            "q": "What is the WoW Forever Hardcore release date?",
            "a": "Blizzard says the Hardcore ruleset will arrive sometime after launch. No calendar date is announced in the pages checked on 9 November 2026."
          },
          {
            "q": "When do WoW Forever raids open?",
            "a": "Blizzard confirms 9 December 2026 for level 60 players: Barrow Deeps, Hyjal Summit and Onyxia's Lair. This date is official, not a third-party forecast."
          },
          {
            "q": "What is the level cap in WoW Forever?",
            "a": "The level cap is 60. Forever is a separate permanent adventure alongside modern WoW and Classic."
          },
          {
            "q": "What is the new race, and is it included with the subscription?",
            "a": "Skyborne is the new race, with a Zephras Isle starting experience. Access to both requires the Skyborne Heroic Pack or a higher edition, in addition to WoW game access. The subscription alone covers the base game."
          }
        ]
      },
      {
        "type": "link",
        "label": "Choose your first character, preset and ruleset",
        "href": "/guides/wow-forever-beginners-guide"
      },
      {
        "type": "link",
        "label": "Keep your first training bills affordable",
        "href": "/guides/how-to-make-gold-early-in-wow-forever"
      },
      {
        "type": "link",
        "label": "Choose a profession pair for your class",
        "href": "/guides/wow-forever-best-professions-for-each-class"
      },
      {
        "type": "link",
        "label": "Learn what crates and Merchant's Favor give you",
        "href": "/guides/wow-forever-merchants-favor-waylaid-crates"
      },
      {
        "type": "link",
        "label": "Find the next guide on the Forever hub",
        "href": "/forever"
      }
    ],
    "topics": [],
    "items": [],
    "previousVersion": 1,
    "previousTitle": "Is WoW Forever Free? Price and Release FAQ",
    "hash": "c7e3d377aba396c643056222ec87e9263b15b666520d7eeb5ba013d76a6a6a7f",
    "previousBody": {
      "blocks": [
        {
          "type": "paragraph",
          "text": "Is WoW Forever free? No: you need an active WoW subscription or Game Time to play its level-60 adventure, with no separate base-game purchase."
        },
        {
          "type": "paragraph",
          "text": "If you already have active WoW game access, you can start Forever without buying a Skyborne pack. The optional upgrades matter if you want the new Skyborne race and its Zephras Isle start, or the other extras in a particular edition."
        },
        {
          "type": "heading",
          "text": "Key dates and status, checked 9 November 2026"
        },
        {
          "type": "table",
          "caption": "What is live, scheduled or still undated",
          "columns": [
            "Feature",
            "Date or status",
            "What that means"
          ],
          "rows": [
            [
              "Global launch",
              "4 November 2026, 3:00 p.m. PST / 23:00 UTC",
              "Forever is live and included with a WoW subscription or Game Time."
            ],
            [
              "First raids",
              "9 December 2026",
              "Level 60 players can enter Barrow Deeps, Hyjal Summit and Onyxia's Lair."
            ],
            [
              "Hardcore ruleset",
              "Sometime after launch; no announced date",
              "Wait for a dated Blizzard announcement before planning a Hardcore start."
            ],
            [
              "Level cap",
              "60",
              "The launch leveling journey ends at level 60."
            ],
            [
              "Skyborne access",
              "Heroic Pack or higher",
              "The new race and Zephras Isle starting experience require an optional upgrade."
            ],
            [
              "Console version",
              "Not named in the opened Blizzard announcements",
              "The starter guide names Windows and Mac; gamepad support is available."
            ]
          ]
        },
        {
          "type": "heading",
          "text": "Choose access before choosing an edition"
        },
        {
          "type": "paragraph",
          "text": "The optional paid editions are the Skyborne Heroic Pack, Skyborne Epic Pack and Warcraft Forever Collection. Skyborne and the Zephras Isle starting experience come with the Heroic Pack and higher editions. You can play the base Forever game with a subscription or Game Time without adding one of these editions."
        },
        {
          "type": "paragraph",
          "text": "Our advice is to start with your existing access if you are unsure about the new race. If Skyborne is the reason you want to play, check the edition contents before purchasing. Blizzard's edition page links to the shop for the current offer in your region."
        },
        {
          "type": "link",
          "label": "Check Blizzard's optional edition contents and shop links",
          "href": "https://news.blizzard.com/en-us/article/24302093/carve-a-new-path-with-world-of-warcraft-forever"
        },
        {
          "type": "heading",
          "text": "Decide whether its adventure is worth your time"
        },
        {
          "type": "paragraph",
          "text": "Forever is a permanent game alongside modern WoW and Classic, set on the original continents with new quests and reimagined places. Blizzard describes more than 1,000 new quests across levels 1 to 60. If exploring that world and building a new character appeals to you, our advice is to try the opening journey using access you already have."
        },
        {
          "type": "paragraph",
          "text": "If your reason to start is Hardcore, wait for its announcement. If your reason is raiding, use 9 December as the opening date and allow for reaching level 60. A console-only player should wait for platform news rather than buying an edition on the strength of gamepad support."
        },
        {
          "type": "paragraph",
          "text": "For a start with friends, agree on faction and {{term:ruleset|ruleset}} before creating characters. Blizzard's starter guide says grouping, guilds, dungeons and raids require the same ruleset and faction. That choice matters more to your first evening together than which optional cosmetic pack you own."
        },
        {
          "type": "faq",
          "entries": [
            {
              "q": "Is WoW Forever free, or does it need a subscription?",
              "a": "Forever is included with an active World of Warcraft subscription or Game Time. It is not a permanently free-to-play game, and a separate Forever base-game purchase is not required."
            },
            {
              "q": "Which WoW Forever edition do I need?",
              "a": "A subscription or Game Time covers the base game. Skyborne Heroic Pack, Skyborne Epic Pack and Warcraft Forever Collection are optional paid upgrades. The Heroic Pack and higher add Skyborne and the Zephras Isle start; check Blizzard's edition page for the current contents and shop offer."
            },
            {
              "q": "Is WoW Forever worth it?",
              "a": "Our advice: try it if you want a new level-60 journey through the original continents with new quests and systems, especially if you already have active WoW access. Wait if your main reason is Hardcore or a console release, since neither has a confirmed launch date in the announcements checked."
            },
            {
              "q": "Is WoW Forever on console or Xbox?",
              "a": "The Blizzard announcements checked on 9 November name no console or Xbox version. The starter guide names Windows and Mac. Gamepad support is available, but that announcement does not announce a console release."
            },
            {
              "q": "What is the WoW Forever Hardcore release date?",
              "a": "Blizzard says the Hardcore ruleset will arrive sometime after launch. No calendar date is announced in the pages checked on 9 November 2026."
            },
            {
              "q": "When do WoW Forever raids open?",
              "a": "Blizzard confirms 9 December 2026 for level 60 players: Barrow Deeps, Hyjal Summit and Onyxia's Lair. This date is official, not a third-party forecast."
            },
            {
              "q": "What is the level cap in WoW Forever?",
              "a": "The level cap is 60. Forever is a separate permanent adventure alongside modern WoW and Classic."
            },
            {
              "q": "What is the new race, and is it included with the subscription?",
              "a": "Skyborne is the new race, with a Zephras Isle starting experience. Access to both requires the Skyborne Heroic Pack or a higher edition, in addition to WoW game access. The subscription alone covers the base game."
            }
          ]
        },
        {
          "type": "link",
          "label": "Choose your first character, preset and ruleset",
          "href": "/guides/wow-forever-beginners-guide"
        },
        {
          "type": "link",
          "label": "Keep your first training bills affordable",
          "href": "/guides/how-to-make-gold-early-in-wow-forever"
        },
        {
          "type": "link",
          "label": "Choose a profession pair for your class",
          "href": "/guides/wow-forever-best-professions-for-each-class"
        },
        {
          "type": "link",
          "label": "Learn what crates and Merchant's Favor give you",
          "href": "/guides/wow-forever-merchants-favor-waylaid-crates"
        },
        {
          "type": "link",
          "label": "Find the next guide on the Forever hub",
          "href": "/forever"
        }
      ],
      "terms": [
        {
          "key": "ruleset",
          "name": "Ruleset",
          "text": "The play environment chosen before character creation. Normal, PvP, Roleplay and Roleplay PvP set different combat expectations and community rules.",
          "source": "https://news.blizzard.com/en-us/article/24315280/new-players-starter-guide-welcome-to-world-of-warcraft-forever"
        }
      ],
      "sources": [
        {
          "label": "Blizzard: World of Warcraft: Forever Now Live!",
          "url": "https://news.blizzard.com/en-us/article/24315820/world-of-warcraft-forever-now-live",
          "accessed": "2026-11-09"
        },
        {
          "label": "Blizzard: Carve a New Path with World of Warcraft: Forever",
          "url": "https://news.blizzard.com/en-us/article/24302093/carve-a-new-path-with-world-of-warcraft-forever",
          "accessed": "2026-11-09"
        },
        {
          "label": "Blizzard: New Player's Starter Guide",
          "url": "https://news.blizzard.com/en-us/article/24315280/new-players-starter-guide-welcome-to-world-of-warcraft-forever",
          "accessed": "2026-11-09"
        }
      ],
      "asOf": {
        "date": "2026-11-09",
        "build": "Blizzard Forever launch and starter announcements",
        "note": "Official pages checked 9 November 2026. No currency prices quoted; Hardcore has no announced date, and the opened announcements name no console version."
      },
      "items": [],
      "topics": [],
      "hash": "17a27bcafda69ae858093ed91363b6650921f87d57140d20cd8667b416fc90b8",
      "editorialRevision": "forever-money-2026-11-09",
      "build": null
    }
  }
]
$guides$::jsonb)
  LOOP
    SELECT * INTO current_page FROM content.paths WHERE kind = 'guide'
      AND slug = guide->>'slug' AND locale = 'en' ORDER BY version DESC LIMIT 1;
    IF (guide->>'previousVersion')::integer = 0 THEN
      IF FOUND THEN
        RAISE EXCEPTION 'Batch three migration needs review for %: slug already exists', guide->>'slug';
      END IF;
      next_group := guide->>'group';
    ELSE
      IF NOT FOUND OR current_page.game <> 'forever' OR current_page.status <> 'published'
          OR current_page.version <> (guide->>'previousVersion')::integer
          OR current_page.title <> guide->>'previousTitle'
          OR current_page.description <> guide->>'description'
          OR current_page.body IS DISTINCT FROM guide->'previousBody'
          OR current_page.guide_group IS NULL
          OR EXISTS (SELECT 1 FROM content.paths WHERE kind = 'guide'
            AND slug = guide->>'slug' AND locale = 'en' AND status = 'draft') THEN
        RAISE EXCEPTION 'Batch three migration needs review for %: missing or changed publication or draft', guide->>'slug';
      END IF;
      -- Keep the owner's group; the revised body uses a compatible group-free content hash.
      next_group := current_page.guide_group;
      UPDATE content.paths SET status = 'retired', updated_at = stamp WHERE id = current_page.id;
    END IF;
    INSERT INTO content.paths (game, kind, slug, locale, title, description, version, status,
      guide_group, body, updated_at, published_at)
    VALUES ('forever', 'guide', guide->>'slug', 'en', guide->>'title', guide->>'description',
      (guide->>'previousVersion')::integer + 1, 'published', next_group,
      jsonb_strip_nulls(jsonb_build_object(
        'blocks', guide->'blocks', 'terms', guide->'terms', 'sources', guide->'sources',
        'asOf', guide->'asOf', 'hero', guide->'hero', 'items', '[]'::jsonb,
        'topics', '[]'::jsonb, 'hash', guide->>'hash', 'editorialRevision', revision
      )) || '{"build":null}'::jsonb, stamp, stamp);
  END LOOP;
  INSERT INTO content.editorial_migrations (name) VALUES (revision);
END $migration$;
