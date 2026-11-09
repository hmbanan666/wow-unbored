-- Replaces only the five existing English Forever publications; empty databases stay empty.
-- Owner drafts or intervening edits abort the transaction rather than being overwritten.
LOCK TABLE content.paths IN SHARE ROW EXCLUSIVE MODE;
DO $migration$
DECLARE
  guide jsonb;
  current_page content.paths%ROWTYPE;
  stamp bigint := floor(extract(epoch FROM NOW()));
  revision constant text := 'forever-editorial-2026-11-06';
BEGIN
  FOR guide IN SELECT value FROM jsonb_array_elements($guides$
[
  {
    "game": "forever",
    "terms": [
      {
        "key": "life-tap",
        "name": "Life Tap",
        "text": "Trades health for mana. It helps a Warlock keep casting, but spending health while enemies are hitting you reduces your safety margin.",
        "source": "https://wowfdb.com/tier-lists/solo-pve/",
        "kind": "spell"
      },
      {
        "key": "crowd-control",
        "name": "Crowd control",
        "text": "Ways to keep an enemy from freely attacking, such as Fear, roots or slows. Control can buy time to recover or separate a dangerous pull.",
        "source": "https://wowfdb.com/tier-lists/solo-pve/",
        "kind": "concept"
      },
      {
        "key": "feign-death",
        "name": "Feign Death",
        "text": "A Hunter escape used to reset a bad pull. It is a reason to value recovery from mistakes separately from how quickly a class kills.",
        "source": "https://wowfdb.com/tier-lists/solo-pve/",
        "kind": "spell"
      }
    ],
    "sources": [
      {
        "label": "WoW Forever DB: solo PvE forecast, 3 Nov 2026",
        "url": "https://wowfdb.com/tier-lists/solo-pve/",
        "accessed": "2026-11-09"
      },
      {
        "label": "Blizzard: development notes titled Updated November 2",
        "url": "https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-november-2/2360696/9",
        "accessed": "2026-11-09"
      },
      {
        "label": "BrokenMeta: level-60 simulation method, 4 Nov 2026",
        "url": "https://brokenmeta.gg/en/wow-forever/tier-list/",
        "accessed": "2026-11-09"
      }
    ],
    "asOf": {
      "date": "2026-11-09",
      "build": "1.60.1.70790 / 1.60.1.70862",
      "note": "WoW Forever DB’s 3 Nov solo forecast covers ordinary quest and dungeon gear at level 60. Higher-level demon performance still relies partly on Classic Era assumptions."
    },
    "kind": "guide",
    "slug": "best-solo-class-wow-forever",
    "locale": "en",
    "title": "Best Solo Class in WoW Forever: Choose Your Tradeoff",
    "description": "Start with Affliction Warlock for self-sufficient solo play, then compare Hunter, Paladin and Mage by recovery, safety and control.",
    "tier": null,
    "prerequisite": null,
    "blocks": [
      {
        "type": "paragraph",
        "text": "Affliction Warlock is the starting point for a self-sufficient solo character in WoW Forever: damage over time, a demon and health-to-mana tools work together to keep fights going. Prefer Beast Mastery Hunter if you want a pet to take the hits while you shoot, Protection Paladin if surviving packs matters more than speed, or Frost Mage if you enjoy controlling distance."
      },
      {
        "type": "heading",
        "text": "First decide what “solo” needs to mean"
      },
      {
        "type": "paragraph",
        "text": "For open-world farming and difficult quests, compare how each class recovers without a healer and handles extra enemies. Leveling from 1 brings a different set of problems: pets, escape spells and key talents arrive along the way. Check when the tools you want become available before choosing a class for them."
      },
      {
        "type": "link",
        "label": "Choosing a character to level from 1?",
        "href": "/guides/best-leveling-class-wow-forever"
      },
      {
        "type": "heading",
        "text": "Warlock: keep going, but watch both resource bars"
      },
      {
        "type": "paragraph",
        "text": "Affliction’s appeal is the connection between its tools. Damage-over-time spells continue working while you manage the fight. {{term:life-tap|Life Tap}} supplies mana at a health cost; Drain Life and Siphon Life help recover health. That gives you a reason to favor Warlock if frequent food-and-drink stops are what you dislike about playing alone."
      },
      {
        "type": "paragraph",
        "text": "The Voidwalker tanks a target while your damage-over-time spells work. Fear controls another enemy, Howl of Terror helps when several get close, and you make your own Healthstones for healing. The cost is attention: you carry Soul Shards, watch the pet and manage your health in cloth armor."
      },
      {
        "type": "heading",
        "text": "Hunter, Paladin or Mage: which inconvenience would you rather have?"
      },
      {
        "type": "list",
        "items": [
          "Beast Mastery Hunter separates you from the enemy with a pet and offers traps plus Feign Death. In exchange, you manage ammunition, pet food and mana. It suits a player who likes a ranged rhythm and accepts upkeep.",
          "Protection Paladin offers shields, absorbs and self-healing for standing your ground. Repeated Consecration uses mana, and low damage can turn a safe fight into a long one. It lacks an interrupt, so caster enemies are a particular weakness. Prefer it when surviving the pull matters more than shortening it.",
          "Frost Mage uses roots, slows and Blink to control distance, with Ice Block and Ice Barrier among its defenses. It makes its own food and water, but still has to stop and drink. Prefer it if you enjoy positioning and keeping enemies at range."
        ]
      },
      {
        "type": "paragraph",
        "text": "If a second enemy is your main worry, compare {{term:crowd-control|crowd control}} and escape tools before damage. Hunter’s {{term:feign-death|Feign Death}} helps reset a bad pull; Paladin’s defenses help you survive it. Choose according to how you want to recover when a fight goes wrong."
      },
      {
        "type": "heading",
        "text": "Avoid choosing from the biggest damage number"
      },
      {
        "type": "paragraph",
        "text": "BrokenMeta’s damage simulations use a stationary level-63 boss, raid buffs and optimized known gear, and exclude solo play. For outdoor fights, weigh the recovery between enemies, travel and ways to escape a bad pull alongside damage."
      },
      {
        "type": "paragraph",
        "text": "Before rerolling to farm a specific dungeon alone, look for a current-build clear with the gear and pull method shown. Level-60 solo dungeon clears remain unverified in the cited forecast."
      },
      {
        "type": "heading",
        "text": "Before you commit"
      },
      {
        "type": "list",
        "items": [
          "Pick the drawback you can tolerate every evening: Warlock resource and shard management, Hunter supplies, Paladin kill time or Mage drinking and positioning.",
          "Try the basic combat rhythm before planning around later talents. A convenient escape at higher level cannot rescue an opening you dislike.",
          "Revisit this choice after changes to pet survivability, drains or control spells. Blizzard’s November development notes explicitly anticipate further tuning after players progress beyond 30."
        ]
      },
      {
        "type": "link",
        "label": "Budget for training and everyday supplies",
        "href": "/guides/how-to-make-gold-early-in-wow-forever"
      },
      {
        "type": "link",
        "label": "New to Forever? Set up your first character",
        "href": "/guides/wow-forever-beginners-guide"
      }
    ],
    "topics": [],
    "items": [],
    "previousTitle": "Best Solo Class in WoW Forever (Launch Week Forecast)",
    "previousVersion": 1,
    "hash": "f69e40699700759b27600056ac962132b70597a7aa5d20860f122c557607b82f"
  },
  {
    "game": "forever",
    "terms": [
      {
        "key": "downtime",
        "name": "Downtime",
        "text": "Time between useful fights spent restoring health or mana. A class can hit hard yet level less comfortably if it repeatedly needs to stop and recover.",
        "source": "https://wowfdb.com/tier-lists/leveling/",
        "kind": "concept"
      },
      {
        "key": "aspect-cheetah",
        "name": "Aspect of the Cheetah",
        "text": "Hunter movement ability listed at level 20 in the source build. It helps with travel between quest locations.",
        "source": "https://wowfdb.com/tier-lists/leveling/",
        "kind": "spell"
      }
    ],
    "sources": [
      {
        "label": "WoW Forever DB: leveling forecast, 3 Nov 2026",
        "url": "https://wowfdb.com/tier-lists/leveling/",
        "accessed": "2026-11-09"
      },
      {
        "label": "Blizzard: development notes titled Updated November 2",
        "url": "https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-november-2/2360696/9",
        "accessed": "2026-11-09"
      }
    ],
    "asOf": {
      "date": "2026-11-09",
      "build": "1.60.1.70790 / 1.60.1.70862",
      "note": "Class comparisons use WoW Forever DB’s leveling forecast; later talents and elite performance are projected. Timed 1–60 runs remain unverified."
    },
    "kind": "guide",
    "slug": "best-leveling-class-wow-forever",
    "locale": "en",
    "title": "Best Leveling Class in WoW Forever: Hunter or an Alternative?",
    "description": "Beast Mastery Hunter is the first leveling pick to consider. Compare its petless start and upkeep with Warlock recovery and Frost Mage control.",
    "tier": null,
    "prerequisite": null,
    "blocks": [
      {
        "type": "paragraph",
        "text": "Beast Mastery Hunter is the first class to consider for mostly solo leveling in WoW Forever. Its pet takes the hits from level 10, and travel tools help between fights. Choose Affliction Warlock if you prefer managing health and mana to buying ammunition and pet food; choose Frost Mage if you enjoy keeping enemies at a distance with slows and roots."
      },
      {
        "type": "heading",
        "text": "The Hunter recommendation starts with an awkward exception"
      },
      {
        "type": "paragraph",
        "text": "Levels 1–9 are petless. The feature behind the recommendation has not arrived yet, so the opening is a poor test of how Beast Mastery will feel later. At 10 the pet changes the arrangement: it takes pressure while you deal ranged damage. Mend Pet follows at 12 in the source’s leveling sequence."
      },
      {
        "type": "paragraph",
        "text": "Start with one target and learn when you need to help or heal your pet. Add complexity only when you can recover reliably. Hunter also brings recurring ammunition and food costs; leave room for them before spending on an optional upgrade."
      },
      {
        "type": "heading",
        "text": "Compare time spent traveling and recovering"
      },
      {
        "type": "paragraph",
        "text": "Questing is a loop of fighting, moving and recovering. Hunter’s {{term:aspect-cheetah|Aspect of the Cheetah}} arrives at 20 in the source build, which gives you a concrete reason to value it on long journeys. A damage ranking misses that part of leveling."
      },
      {
        "type": "paragraph",
        "text": "Warlock tackles {{term:downtime|downtime}} differently. Life Tap exchanges health for mana, while drains help restore health. Its Voidwalker arrives at 10; the source describes levels 6–10 as an uncomfortable stretch before that toolkit develops. Warlock has no movement-speed tool before the level-40 Felsteed in this comparison, so fewer drink stops do not automatically mean less travel time."
      },
      {
        "type": "paragraph",
        "text": "Frost Mage lets you make your own food and water and keep enemies away with slows and roots. Drinking still takes time. Choose it if you enjoy positioning and can accept recovery breaks between fights."
      },
      {
        "type": "heading",
        "text": "Choose by the part of questing you want to simplify"
      },
      {
        "type": "list",
        "items": [
          "Want the enemy hitting something other than you? Start with Hunter. Your responsibility shifts toward the pet, ammunition and supplies.",
          "Want to keep a resource cycle going across fights? Try Affliction Warlock. Watch health before spending it on mana, and expect shard management.",
          "Want direct control over where enemies stand? Try Frost Mage. Budget for pauses and positioning; weakened Blizzard and Cone of Cold slows mean old mass-kiting advice needs checking."
        ]
      },
      {
        "type": "heading",
        "text": "Three checks before leaving town"
      },
      {
        "type": "list",
        "items": [
          "After training, check your action bars. Blizzard’s November notes say newly learned spells are no longer placed there automatically.",
          "Keep money for class training and the supplies your class uses. Blizzard puts the total cost of learning class abilities from 1–60 at 206–207 gold per class. Reserve money for the next trainer visit as you go.",
          "Choose the next quest area for your current level and abilities. If an elite stops progress, find help or return later."
        ]
      },
      {
        "type": "link",
        "label": "Keep leveling costs covered with an early gold plan",
        "href": "/guides/how-to-make-gold-early-in-wow-forever"
      },
      {
        "type": "link",
        "label": "Compare solo strengths beyond leveling",
        "href": "/guides/best-solo-class-wow-forever"
      }
    ],
    "topics": [],
    "items": [],
    "previousTitle": "Best Leveling Class in WoW Forever (Early Forecast)",
    "previousVersion": 1,
    "hash": "303b20931409b1c80a760d06b7d2bb957b56aa665b2258e05c05cb45e99f2d6d"
  },
  {
    "game": "forever",
    "terms": [
      {
        "key": "disenchant",
        "name": "Disenchanting",
        "text": "Breaks an eligible piece of equipment into Enchanting materials. Compare the value of the intact item before destroying it; the result depends on the item and the material roll.",
        "source": "https://wowfdb.com/professions/enchanting/",
        "kind": "concept"
      },
      {
        "key": "arcane-salvager",
        "name": "Arcane Salvager",
        "text": "An Enchanting camp craft listed at skill 140 that improves disenchanting efficiency. Learn its Blueprint before buying the crafting materials.",
        "source": "https://wowfdb.com/professions/enchanting/",
        "kind": "item"
      },
      {
        "key": "required-level",
        "name": "Required level",
        "text": "The character level needed to equip an item. The disenchanting table groups material bands by this number; its calculator uses item level when no required level is shown.",
        "source": "https://forevermastery.com/en/tools/disenchant",
        "kind": "concept"
      }
    ],
    "sources": [
      {
        "label": "WoW Forever DB: Enchanting camp recipes and gear restrictions",
        "url": "https://wowfdb.com/professions/enchanting/",
        "accessed": "2026-11-09"
      },
      {
        "label": "Forever Mastery: disenchanting table and EU Normal auction sample, 9 Nov 2026",
        "url": "https://forevermastery.com/en/tools/disenchant",
        "accessed": "2026-11-09"
      },
      {
        "label": "WoW Forever DB: launch economy forecast, 27 Oct 2026",
        "url": "https://wowfdb.com/tier-lists/professions-gold-launch/",
        "accessed": "2026-11-09"
      },
      {
        "label": "WoW Forever DB: Arcane Salvager Blueprint drop locations",
        "url": "https://wowfdb.com/making-gold/",
        "accessed": "2026-11-09"
      }
    ],
    "asOf": {
      "date": "2026-11-09",
      "build": "Camp recipes; disenchant eligibility table 1.60.1.70374",
      "note": "Camp recipes are listed by WoW Forever DB. Forever Mastery combines community yield estimates and beta eligibility data with EU Normal auction listings dated 9 Nov 2026."
    },
    "kind": "guide",
    "slug": "wow-forever-enchanting-guide",
    "locale": "en",
    "title": "WoW Forever Enchanting: Start, Disenchant or Sell?",
    "description": "Start Enchanting, find Disenchant, compare gear with its dust or essences, and plan the Enchanted Lute and later camp crafts.",
    "tier": null,
    "prerequisite": null,
    "blocks": [
      {
        "type": "paragraph",
        "text": "Learn Enchanting in WoW Forever if you want to make enchants and camp crafts and are willing to invest materials in the profession. If your immediate goal is money for training, compare gathering first. Before destroying a green item, weigh its equipment value against the likely value of its materials."
      },
      {
        "type": "heading",
        "text": "What you are buying into"
      },
      {
        "type": "paragraph",
        "text": "Enchanting adds permanent weapon and armor bonuses and makes wands, rods and oils. Forever also lists class-specific staves, off-hand orbs and relics. Choose a craft you want to use, then check how to learn it and what it costs."
      },
      {
        "type": "paragraph",
        "text": "The new gear’s binding and enchanter-only restrictions remain unconfirmed in WoW Forever DB’s beta-tooltip evidence. Inspect the current recipe and item restrictions before investing for one of those pieces."
      },
      {
        "type": "heading",
        "text": "Before disenchanting a useful-looking item"
      },
      {
        "type": "paragraph",
        "text": "After learning Enchanting, open the Professions window and find Disenchant in the Enchanting box, not the spellbook. Drag it to an action bar, press it, then select the item in your bags. Forever Mastery documents this location from the October beta; the item is destroyed when you disenchant it."
      },
      {
        "type": "paragraph",
        "text": "{{term:disenchant|Disenchanting}} turns equipment into materials. Make three comparisons before using it. First, could you equip the item? Second, what would a vendor pay, and is there a credible buyer for the intact item? Third, what materials could it yield, and what could you actually sell those for? An auction listing still needs a buyer."
      },
      {
        "type": "list",
        "items": [
          "Need gold now? A vendor sale gives a known return. An auction may pay more but requires a buyer.",
          "Need materials for a recipe you have checked? Disenchanting may supply them, but count the equipment’s forgone sale value as part of the recipe cost.",
          "Buying gear just to disenchant? Check the possible yields and current material prices first. If the margin depends on the best possible result, keep your gold."
        ]
      },
      {
        "type": "heading",
        "text": "Which items give dust or essences?"
      },
      {
        "type": "paragraph",
        "text": "Forever Mastery’s community estimates put green armor at about 75% dust and 20% essence; green weapons reverse those chances, at about 75% essence and 20% dust. Both have a listed 3–5% shard chance. A single item can give a less valuable result, so leave room for that risk when buying equipment to disenchant."
      },
      {
        "type": "paragraph",
        "text": "Use {{term:required-level|the item’s required level}} to find its material band in the table. For example, the 1–10 band lists Strange Dust or Lesser Magic Essence; the 21–25 band lists Soul Dust, Greater Astral Essence or Large Glimmering Shard. The calculator uses item level when an item has no required level."
      },
      {
        "type": "paragraph",
        "text": "The calculator now uses live EU Normal auction listings, dated 9 November 2026 when checked, from one contributor. Its material prices average the cheapest 15% of listings and refresh every 15 minutes. Check your own market before buying: the expected material value can change, and listings alone cannot tell you how quickly the materials will sell."
      },
      {
        "type": "heading",
        "text": "A small camp project before a large shopping list"
      },
      {
        "type": "paragraph",
        "text": "The Enchanted Lute is a small first project: skill 20, 1 Simple Wood and 1 Strange Dust. Learn it from a trainer or Camping 101: Enchanting. It contributes armor, stats and resistances at camp. If camp crafting interests you, start with those two materials and that recipe."
      },
      {
        "type": "paragraph",
        "text": "The later {{term:arcane-salvager|Arcane Salvager}} needs skill 140 and its Blueprint. WoW Forever DB lists drops from Shade of the Archmage in City of Dalaran, Charlga Razorflank in Razorfen Kraul and Rath’mael in Ruins of Lordaeron. Once you have learned it, the craft takes 2 Vision Dust and 1 Lesser Nether Essence."
      },
      {
        "type": "paragraph",
        "text": "Arcane Forge is listed at skill 300 and is needed for some recipes. It also requires a Blueprint, but its drop location is still unverified in the cited sources. Confirm how to obtain it before buying materials for a craft that needs the Forge."
      },
      {
        "type": "heading",
        "text": "Pairing with Tailoring: compare the cloth, item and materials"
      },
      {
        "type": "paragraph",
        "text": "Tailoring can make equipment to disenchant. Before crafting, compare three uses for the cloth: selling it, selling the finished item or disenchanting that item for materials. Include the value of cloth you gathered yourself in the cost. This helps you choose whether the pairing supports the recipes you want."
      },
      {
        "type": "heading",
        "text": "How to choose your next recipe"
      },
      {
        "type": "list",
        "items": [
          "Open the current recipe and confirm ingredients, skill requirement and how it is learned. Forever has changed reagents, so check each ingredient before using a Classic shopping list.",
          "Buy or gather enough for a small batch, then check the result and remaining skill gains before restocking.",
          "Keep class-training money separate. Stop funding the craft when it prevents the progress you wanted it to support."
        ]
      },
      {
        "type": "link",
        "label": "Need spendable gold first? Compare gathering",
        "href": "/guides/how-to-make-gold-early-in-wow-forever"
      },
      {
        "type": "link",
        "label": "Understand camps and other new Forever systems",
        "href": "/guides/wow-forever-beginners-guide"
      }
    ],
    "topics": [],
    "items": [],
    "previousTitle": "WoW Forever Enchanting Guide: Disenchanting and Gold",
    "previousVersion": 1,
    "hash": "2102bde3ec359e4b3be580c4a12adce959a9d4b0bc085479d800ecf6c45ad4b4"
  },
  {
    "game": "forever",
    "terms": [
      {
        "key": "waylaid-crate",
        "name": "Waylaid Crate",
        "text": "A supply request that accepts one of its listed material bundles. Filling it creates a bound Sealed crate for a faction-camp turn-in; the materials have a cost even if you gathered them.",
        "source": "https://www.wow-professions.com/forever/merchants-favor-durotar-supply-azeroth-commerce",
        "kind": "item"
      },
      {
        "key": "merchants-favor",
        "name": "Merchant’s Favor",
        "text": "Currency earned by delivering filled Waylaid Crates. Camp vendors take it for rewards such as recipes; it is separate from both gold and the reputation some purchases require.",
        "source": "https://www.wow-professions.com/forever/merchants-favor-durotar-supply-azeroth-commerce",
        "kind": "concept"
      },
      {
        "key": "craftsmans-writ",
        "name": "Craftsman’s Writ",
        "text": "A crafting delivery used to earn reputation with the supply camp. Some rewards require both reputation and a Merchant’s Favor currency payment.",
        "source": "https://www.wow-professions.com/forever/merchants-favor-durotar-supply-azeroth-commerce",
        "kind": "item"
      }
    ],
    "sources": [
      {
        "label": "WoW Forever DB: launch economy forecast, 27 Oct 2026",
        "url": "https://wowfdb.com/tier-lists/professions-gold-launch/",
        "accessed": "2026-11-09"
      },
      {
        "label": "WoW-Professions: Merchant’s Favor and Waylaid Crates",
        "url": "https://www.wow-professions.com/forever/merchants-favor-durotar-supply-azeroth-commerce",
        "accessed": "2026-11-09"
      },
      {
        "label": "Blizzard: development notes titled Updated November 2",
        "url": "https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-november-2/2360696/9",
        "accessed": "2026-11-09"
      },
      {
        "label": "Still Sixty: Waylaid Crate levels, rewards and first Shipping Label",
        "url": "https://www.stillsixty.com/guides/waylaid-crates",
        "accessed": "2026-11-09"
      }
    ],
    "asOf": {
      "date": "2026-11-09",
      "build": "1.60.1.70658",
      "note": "Gathering comparisons use the 27 Oct forecast, build 1.60.1.70658; live sale returns remain unmeasured. Crate requirements and rewards were checked on 9 Nov."
    },
    "kind": "guide",
    "slug": "how-to-make-gold-early-in-wow-forever",
    "locale": "en",
    "title": "How to Make Gold Early in WoW Forever: Gather and Spend Wisely",
    "description": "Choose gathering for your questing style, check Waylaid Crates before filling them, and protect training money without relying on launch price predictions.",
    "tier": null,
    "prerequisite": null,
    "blocks": [
      {
        "type": "paragraph",
        "text": "For early gold in WoW Forever, gather materials while questing and sell what you do not need before investing in a crafting profession. Start with two gathering professions if gold is the priority. Herbalism is a reasonable first candidate; choose Mining or Skinning as the second according to whether you prefer looking for nodes or collecting from beasts you already kill."
      },
      {
        "type": "heading",
        "text": "Choose a gathering pair you will actually use"
      },
      {
        "type": "paragraph",
        "text": "Herbs supply Waylaid Crates and the new First Aid potions. Mining supplies ore to crafters and crates. Skinning fits quests with plenty of beasts: you can collect leather from enemies you already kill. Pick a pair whose materials you will collect during ordinary questing."
      },
      {
        "type": "list",
        "items": [
          "Herbalism plus Skinning: consider it when your quests already involve beasts and you want gathering to follow the journey.",
          "Herbalism plus Mining: consider it when you enjoy seeking out nodes. Watch how much extra travel gathering adds before assuming it improves your income.",
          "Already committed to a craft? Keep the gathering profession that supplies it only if you want that craft now. Selling the same materials may better serve an immediate training bill."
        ]
      },
      {
        "type": "paragraph",
        "text": "Gathering lets you offer materials for sale without first paying for crafting inputs. Test demand with a small quantity before spending an evening on one material or buying stock to resell."
      },
      {
        "type": "heading",
        "text": "Protect the money that keeps your character moving"
      },
      {
        "type": "paragraph",
        "text": "Blizzard’s November development notes put total class-ability training from 1–60 at 206–207 gold for every class, with Warlock costs adjusted for expected pet Grimoires. Reserve money as you level so the next trainer visit stays affordable."
      },
      {
        "type": "list",
        "items": [
          "Cover the next training visit and your class’s normal supplies first.",
          "Before buying an upgrade, ask which current problem it solves. A purchase that empties your training reserve should have a clear purpose.",
          "Before crafting for sale, compare the full ingredient cost with a realistic sale return. Gathered materials are not free: selling them is an alternative you give up."
        ]
      },
      {
        "type": "heading",
        "text": "Waylaid Crates: make the reward beat the cost"
      },
      {
        "type": "paragraph",
        "text": "A {{term:waylaid-crate|Waylaid Crate}} asks for supplies and drops from enemies and some chests; you can also buy one at auction. Apprentice and Journeyman crates open from level 10. Fill one of the listed bundles to create a Sealed crate, which binds to you for delivery to your faction’s supply camp."
      },
      {
        "type": "paragraph",
        "text": "A white Apprentice crate pays 5 Merchant’s Favor plus 2 silver 50 copper. Green Apprentice crates pay 10 Favor and 5 silver. Check the crate’s rank and color before costing its materials."
      },
      {
        "type": "paragraph",
        "text": "For a concrete example, the cited Apprentice Textiles crate accepts 40 Linen Cloth or 20 Light Leather. Compare the value of each bundle with the crate’s silver reward. If selling the materials would yield more silver, filling the crate is a choice to buy progress with the difference, not a gold-making shortcut."
      },
      {
        "type": "paragraph",
        "text": "{{term:merchants-favor|Merchant’s Favor}} buys camp recipes and other goods. Your first filled crate or started writ gives a Shipping Label quest worth an extra 50 Favor and 2,000 reputation, once per character. Complete that quest at the camp to collect the bonus. Further reputation comes from {{term:craftsmans-writ|Craftsman’s Writs}}, and some purchases require both reputation and Favor."
      },
      {
        "type": "paragraph",
        "text": "For Horde, deliver to Dokimi outside the west gate of the Crossroads in the Barrens. For Alliance, find Marcy Baker at Three Corners on the western edge of Redridge Mountains. Include the delivery trip in your decision: a modest reward is less attractive when it pulls you far from your quests."
      },
      {
        "type": "heading",
        "text": "When to move from gathering into crafting"
      },
      {
        "type": "paragraph",
        "text": "Move when you can name the recipe, confirm how to learn it, price its ingredients and identify a use or buyer for the result. For Tailoring bags, compare the cloth cost with bag listings and sales. For Enchanting, choose the recipe you want before buying equipment to turn into materials."
      },
      {
        "type": "paragraph",
        "text": "Avoid bulk buying based on a projected raid date or a remembered Classic vendor trick. Begin with a small batch and inspect what actually sells. If the return is weak, selling raw materials leaves you more freedom than a bag full of crafted stock."
      },
      {
        "type": "heading",
        "text": "Your next town visit"
      },
      {
        "type": "list",
        "items": [
          "Set aside training and supply money before deciding what is available to invest.",
          "Compare a small batch of gathered materials with current competing listings; record your actual sale result before scaling up.",
          "Read any crate’s requested bundle and rewards before buying missing materials. Fill it for a named unlock or a favorable return."
        ]
      },
      {
        "type": "link",
        "label": "Thinking about Enchanting? Check the investment first",
        "href": "/guides/wow-forever-enchanting-guide"
      },
      {
        "type": "link",
        "label": "Compare the everyday costs of leveling classes",
        "href": "/guides/best-leveling-class-wow-forever"
      }
    ],
    "topics": [],
    "items": [],
    "previousTitle": "How to Make Gold Early in WoW Forever",
    "previousVersion": 1,
    "hash": "52adb69c5bca3a3fc1eb955fac65922256303d7c2dd3fa9b0d694a785380ed5b"
  },
  {
    "game": "forever",
    "terms": [
      {
        "key": "experience-preset",
        "name": "Experience Preset",
        "text": "A starting bundle of presentation and interface settings. Classic and Enhanced set different defaults; individual settings remain changeable in Game Menu > Options.",
        "source": "https://news.blizzard.com/en-us/article/24315820/world-of-warcraft-forever-now-live",
        "kind": "concept"
      },
      {
        "key": "ruleset",
        "name": "Ruleset",
        "text": "The broad play environment you choose instead of a traditional realm. Normal, PvP, Roleplay and Roleplay PvP differ in player-combat expectations and roleplay rules.",
        "source": "https://news.blizzard.com/en-us/article/24315820/world-of-warcraft-forever-now-live",
        "kind": "concept"
      },
      {
        "key": "camp-features",
        "name": "Camp Features",
        "text": "Profession-crafted additions to a shared campsite. Up to three nearby players can each contribute one; sit or craft for at least a minute to receive their benefits.",
        "source": "https://news.blizzard.com/en-us/article/24315820/world-of-warcraft-forever-now-live",
        "kind": "concept"
      },
      {
        "key": "legacy",
        "name": "Legacy System",
        "text": "Account-wide progression through challenges, perks and rewards. Its character advantages can all be unlocked on one character, so leveling alts is optional.",
        "source": "https://news.blizzard.com/en-us/article/24315820/world-of-warcraft-forever-now-live",
        "kind": "concept"
      }
    ],
    "sources": [
      {
        "label": "Blizzard: Forever launch features and raid opening",
        "url": "https://news.blizzard.com/en-us/article/24315820/world-of-warcraft-forever-now-live",
        "accessed": "2026-11-09"
      },
      {
        "label": "Blizzard: Forever access and optional editions",
        "url": "https://news.blizzard.com/en-us/article/24302093/carve-a-new-path-with-world-of-warcraft-forever",
        "accessed": "2026-11-09"
      },
      {
        "label": "Blizzard: development notes titled Updated November 2",
        "url": "https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-november-2/2360696/9",
        "accessed": "2026-11-09"
      }
    ],
    "asOf": {
      "date": "2026-11-09",
      "build": "Launch information; November development notes",
      "note": "Official launch features, access requirements and November development notes checked on 9 Nov 2026."
    },
    "kind": "guide",
    "slug": "wow-forever-beginners-guide",
    "locale": "en",
    "title": "WoW Forever Beginner Guide: Your First Character and First Steps",
    "description": "Choose a preset and ruleset, check Skyborne access, and understand training, camps and Legacy before setting out in WoW Forever.",
    "tier": null,
    "prerequisite": null,
    "blocks": [
      {
        "type": "paragraph",
        "text": "Start WoW Forever with Enhanced settings if you are unsure, choose Normal if you want player combat to be your decision, and pick a class whose everyday fights appeal to you. A WoW subscription or Game Time includes access. Skyborne characters require an optional upgrade edition."
      },
      {
        "type": "heading",
        "text": "Before creating a character: check what you want to play"
      },
      {
        "type": "paragraph",
        "text": "Forever is a separate, permanent game alongside modern and Classic WoW, set across the original continents with a level cap of 60. It launched globally on 4 November 2026. Use Forever-specific class and profession advice: familiar abilities and recipes can work differently here."
      },
      {
        "type": "paragraph",
        "text": "If you specifically want a Skyborne character, the Skyborne Heroic Pack or a higher edition includes that race and the Zephras Isle starting experience. Horde-aligned Windshapers can become Shaman; Alliance-aligned High-Order Skyborne can become Mages. Check that pairing before buying for a character you have in mind."
      },
      {
        "type": "heading",
        "text": "Preset: begin with guidance, then adjust it"
      },
      {
        "type": "paragraph",
        "text": "Your {{term:experience-preset|Experience Preset}} sets the initial presentation. Enhanced turns on quest points of interest and objective areas, uses a combined bag view and starts with HD models. Classic favors the older presentation and less automatic guidance. For a newcomer, Enhanced removes several setup decisions at once."
      },
      {
        "type": "paragraph",
        "text": "You can change individual settings under Game Menu > Options. HD and SD models affect appearance only, and you can switch them later too. Adjust the presentation after playing a few quests, once you know which details you want on screen."
      },
      {
        "type": "heading",
        "text": "Ruleset: decide how much interruption you want"
      },
      {
        "type": "paragraph",
        "text": "Forever asks you to choose a {{term:ruleset|ruleset}} instead of a traditional realm. Pick Normal for adventuring with player combat at your discretion. Pick PvP if the risk of attacks from opposing players is part of what you want from the journey. That is a more consequential choice for a first evening than the visual preset."
      },
      {
        "type": "list",
        "items": [
          "Roleplay adds naming and behavior rules for players who want to inhabit a character in the world.",
          "Roleplay PvP combines those expectations with the risk of player attacks.",
          "Hardcore is announced for after launch, with no availability date in the checked launch information. Choose one of the available rulesets for your first character."
        ]
      },
      {
        "type": "paragraph",
        "text": "Each character uses two names, with the pair unique within a region. Choose them together, particularly if you selected a roleplay ruleset. New class combinations include Human Hunters, Undead Paladins and Dwarf Shamans, so check the actual character choices before assuming an older restriction still applies."
      },
      {
        "type": "heading",
        "text": "Class: choose the fights, then the long-term plan"
      },
      {
        "type": "paragraph",
        "text": "For a solo start, compare Hunter’s pet-based fighting, Warlock’s resource recovery and Mage’s control. You will spend many fights with the ordinary toolkit before reaching a finished build. Decide whether managing a pet, balancing health and mana, or keeping enemies at range sounds appealing."
      },
      {
        "type": "link",
        "label": "Choose a class for the leveling journey",
        "href": "/guides/best-leveling-class-wow-forever"
      },
      {
        "type": "heading",
        "text": "Once you are in: train, check your bars, keep some money"
      },
      {
        "type": "paragraph",
        "text": "After learning an ability, check that it is on the action bar you intend to use. The November development notes say new spells are no longer added automatically. If a newly trained spell seems to be missing, check your learned abilities before assuming training failed."
      },
      {
        "type": "paragraph",
        "text": "Keep money for later training and class supplies. Gathering while you quest can fund those costs. Start crafting when you have a particular recipe or use in mind."
      },
      {
        "type": "link",
        "label": "Make early gold without committing to a costly craft",
        "href": "/guides/how-to-make-gold-early-in-wow-forever"
      },
      {
        "type": "heading",
        "text": "At a camp, take the minute the system asks for"
      },
      {
        "type": "paragraph",
        "text": "Cooking’s Basic Campfire becomes a shared campsite. Nearby players can add up to three {{term:camp-features|Camp Features}}, one per player. Sit or craft there for at least one minute to gain their benefits. Their buffs are mutually exclusive with the corresponding class buffs, so check what the camp adds to your existing benefits."
      },
      {
        "type": "paragraph",
        "text": "If you enjoy contributing something useful to other travelers, camp crafts give professions a concrete purpose. Explore a recipe you can actually learn before investing in a whole profession route."
      },
      {
        "type": "link",
        "label": "See what Enchanting contributes at camp",
        "href": "/guides/wow-forever-enchanting-guide"
      },
      {
        "type": "heading",
        "text": "You can build a Legacy on one character"
      },
      {
        "type": "paragraph",
        "text": "The {{term:legacy|Legacy System}} adds account-wide challenges, perks and rewards. It encourages trying different classes and tradeskills, but all character advantages can be unlocked on a single character. Stay with the character you like and explore its challenges first."
      },
      {
        "type": "heading",
        "text": "What waits beyond the starting areas"
      },
      {
        "type": "paragraph",
        "text": "Forever adds more than 1,000 quests across levels 1–60. The Riverglades offers new questing across much of the mid-30s to mid-40s, while Zephras Isle is a 1–12 starting experience. Keep the Riverglades in mind when you reach that level range."
      },
      {
        "type": "paragraph",
        "text": "Blizzard’s launch article schedules Barrow Deeps, Hyjal Summit and Onyxia’s Lair to open on December 9 for level-60 players. Start by learning your class through quests: check each newly trained ability and try it in an ordinary fight before taking on harder enemies."
      }
    ],
    "topics": [],
    "items": [],
    "hero": {
      "image": "d4210a19bdb180da",
      "alt": "Dozens of new level 1 characters crowding the Valley of Trials in Durotar on WoW Forever launch day"
    },
    "previousTitle": "WoW Forever Beginner Guide: What to Know Before You Start",
    "previousVersion": 1,
    "hash": "0d658004d9806f4c014bad674bfae409ab3695f2f9931c67e5bf1bb585b8a239"
  }
]
$guides$::jsonb)
  LOOP
    -- The marker survives retirement: rerunning cannot replace a later owner's version.
    IF EXISTS (SELECT 1 FROM content.paths WHERE kind = 'guide'
        AND slug = guide->>'slug' AND locale = 'en' AND body->>'editorialRevision' = revision) THEN
      CONTINUE;
    END IF;
    SELECT * INTO current_page FROM content.paths WHERE kind = 'guide'
      AND slug = guide->>'slug' AND locale = 'en' ORDER BY version DESC LIMIT 1;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF current_page.game <> 'forever' OR current_page.status <> 'published'
        OR current_page.version <> (guide->>'previousVersion')::integer
        OR current_page.title <> guide->>'previousTitle'
        OR current_page.body->'hero' IS DISTINCT FROM guide->'hero' THEN
      RAISE EXCEPTION 'Editorial migration needs review for %: publication changed or draft exists', guide->>'slug';
    END IF;
    UPDATE content.paths SET status = 'retired', updated_at = stamp WHERE id = current_page.id;
    INSERT INTO content.paths (game, kind, slug, locale, title, description, version, status,
      body, updated_at, published_at)
    VALUES ('forever', 'guide', guide->>'slug', 'en', guide->>'title', guide->>'description',
      current_page.version + 1, 'published',
      jsonb_strip_nulls(jsonb_build_object(
        'blocks', guide->'blocks', 'terms', guide->'terms', 'sources', guide->'sources',
        'asOf', guide->'asOf', 'hero', guide->'hero', 'items', '[]'::jsonb,
        'topics', '[]'::jsonb, 'hash', guide->>'hash', 'editorialRevision', revision
      )) || '{"build":null}'::jsonb, stamp, stamp);
  END LOOP;
END $migration$;
