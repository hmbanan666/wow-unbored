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
        "text": "Ways to keep an enemy from freely attacking, such as Fear, roots or slows. Control can buy time to recover or separate a dangerous pull; it is not extra damage.",
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
        "accessed": "2026-11-06"
      },
      {
        "label": "Blizzard: development notes titled Updated November 2",
        "url": "https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-november-2/2360696/9",
        "accessed": "2026-11-06"
      },
      {
        "label": "BrokenMeta: level-60 simulation method, 4 Nov 2026",
        "url": "https://brokenmeta.gg/en/wow-forever/tier-list/",
        "accessed": "2026-11-06"
      }
    ],
    "asOf": {
      "date": "2026-11-06",
      "build": "1.60.1.70790",
      "note": "This comparison uses 3 Nov client-data forecasts, not tested level-60 clears. Pet performance above 30 remains uncertain; source build 1.60.1.70790."
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
        "text": "Killing quest enemies quickly, surviving a messy pull and clearing a dungeon alone are different jobs. This comparison is about open-world farming, difficult quest enemies and recovery without a healer. It assumes ordinary quest and dungeon gear. If your immediate question is how to get from level 1 to 60, use the leveling comparison: a class’s mature toolkit does not describe its first ten levels."
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
        "text": "The price is more management. You carry Soul Shards, watch a pet and wear cloth armor. The solo forecast also assumes parts of the level-60 demon toolkit from Classic Era because its Forever evidence is incomplete. Do not choose Warlock solely on a promise that its pet will hold every elite: compare the resource cycle, then judge the fights you actually face."
      },
      {
        "type": "heading",
        "text": "Hunter, Paladin or Mage: which inconvenience would you rather have?"
      },
      {
        "type": "list",
        "items": [
          "Beast Mastery Hunter separates you from the enemy with a pet and offers traps plus Feign Death. In exchange, you manage ammunition, pet food and mana. It suits a player who likes a ranged rhythm and accepts upkeep.",
          "Protection Paladin offers shields, absorbs and self-healing for standing your ground. Repeated Consecration uses mana, and low damage can turn a safe fight into a long one. Prefer it when surviving the pull matters more than shortening it.",
          "Frost Mage uses roots, slows and Blink to control distance, with Ice Block and Ice Barrier among its defenses. It makes its own food and water, but still has to stop and drink. Prefer it if positioning is part of the fun rather than a chore."
        ]
      },
      {
        "type": "paragraph",
        "text": "A concrete way to choose: if a second enemy is your main worry, compare {{term:crowd-control|crowd control}} and escape tools before damage. Hunter’s {{term:feign-death|Feign Death}} addresses recovering from a bad pull; Paladin’s defenses address staying in it. Neither is the same promise as finishing the fight faster."
      },
      {
        "type": "heading",
        "text": "Avoid choosing from the biggest damage number"
      },
      {
        "type": "paragraph",
        "text": "A stationary boss simulation cannot tell you how much time you spend recovering between outdoor fights. BrokenMeta’s published method uses a level-63 boss, raid buffs and optimized known gear; it explicitly does not simulate solo play. Those results answer a raid-damage question. They do not overturn a choice based on resource recovery, movement or escape."
      },
      {
        "type": "paragraph",
        "text": "Likewise, old dungeon farming is not a guaranteed benefit of picking a highly rated solo class. The source comparison has no tested level-60 clear to offer. If a specific dungeon is your reason to reroll, wait for evidence of that dungeon on the current build, including gear and pull method."
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
    "hash": "38b37198c458c00313145982d6e9f77632a4f0a76e8a3e7ec392ac015dbc3624"
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
        "text": "Hunter movement ability listed at level 20 in the source build. It matters when comparing travel between quests, not just damage during a fight.",
        "source": "https://wowfdb.com/tier-lists/leveling/",
        "kind": "spell"
      }
    ],
    "sources": [
      {
        "label": "WoW Forever DB: leveling forecast, 3 Nov 2026",
        "url": "https://wowfdb.com/tier-lists/leveling/",
        "accessed": "2026-11-06"
      },
      {
        "label": "Blizzard: development notes titled Updated November 2",
        "url": "https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-november-2/2360696/9",
        "accessed": "2026-11-06"
      }
    ],
    "asOf": {
      "date": "2026-11-06",
      "build": "1.60.1.70790",
      "note": "Leveling advice uses the 3 Nov forecast for source build 1.60.1.70790, not timed 1–60 runs. Later talents and elite performance are projections."
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
        "text": "Beast Mastery Hunter is the first class to consider for mostly solo leveling in WoW Forever. Its pet takes the hits from level 10, and travel tools help between fights. Choose Affliction Warlock instead if you prefer managing health and mana to buying ammunition and pet food; choose Frost Mage if you want to control enemies yourself rather than rely on a pet."
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
        "text": "That separation is useful, but it is not permission to gather every nearby enemy. Start with one target and learn when you need to help or heal your pet. Add complexity only when you can recover reliably. Hunter also brings recurring ammunition and food costs; leave room for them before spending on an optional upgrade."
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
        "text": "Frost Mage offers a third bargain: you make your own food and water and keep enemies away with slows and roots, but drinking still costs time. Free supplies and uninterrupted progress are different things. Pick Mage because you like controlling a fight, not because conjured water removes the recovery break."
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
          "Keep money for class training and the supplies your class uses. The official 1–60 ability-training total is 206–207 gold per class; that is the whole journey, not a bill due at the start.",
          "Choose the next quest area for your current character, not for a level-60 talent you have not learned. If an elite stops progress, find help or return later rather than treating a forecast as a requirement to solo it."
        ]
      },
      {
        "type": "heading",
        "text": "What this comparison can settle"
      },
      {
        "type": "paragraph",
        "text": "It can help you choose the kind of friction you prefer. It cannot supply a verified fastest time or a full quest route. A measured leveling result would also need its build, route, gear, grouping and recovery time; a tier letter does not contain those details. Once you like the class’s ordinary fights, the useful next decision is how to fund its progress."
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
    "hash": "dc531e9e19ff517f1da09bac50abedae07bf37e3cb17111ab9db674f259108f3"
  },
  {
    "game": "forever",
    "terms": [
      {
        "key": "disenchant",
        "name": "Disenchanting",
        "text": "Breaks an eligible piece of equipment into Enchanting materials. Compare the value of the intact item before destroying it; the materials are not automatically worth more.",
        "source": "https://wowfdb.com/professions/enchanting/",
        "kind": "concept"
      },
      {
        "key": "arcane-salvager",
        "name": "Arcane Salvager",
        "text": "An Enchanting camp craft listed at skill 140 that improves disenchanting efficiency. It requires its Blueprint as well as skill, so reaching 140 alone does not unlock it.",
        "source": "https://wowfdb.com/professions/enchanting/",
        "kind": "item"
      },
      {
        "key": "required-level",
        "name": "Required level",
        "text": "The character level needed to equip an item. In the cited disenchanting table, this selects the material band; it is not your Enchanting skill.",
        "source": "https://forevermastery.com/en/tools/disenchant",
        "kind": "concept"
      }
    ],
    "sources": [
      {
        "label": "WoW Forever DB: Enchanting, source build 1.60.1.70790",
        "url": "https://wowfdb.com/professions/enchanting/",
        "accessed": "2026-11-06"
      },
      {
        "label": "Forever Mastery: disenchanting table and beta-price method",
        "url": "https://forevermastery.com/en/tools/disenchant",
        "accessed": "2026-11-06"
      },
      {
        "label": "WoW Forever DB: launch economy forecast, 27 Oct 2026",
        "url": "https://wowfdb.com/tier-lists/professions-gold-launch/",
        "accessed": "2026-11-06"
      }
    ],
    "asOf": {
      "date": "2026-11-06",
      "build": "1.60.1.70790",
      "note": "Recipe evidence uses source build 1.60.1.70790. The disenchanting calculator uses beta data, including 15 Oct prices; no live recipe route or profit is verified."
    },
    "kind": "guide",
    "slug": "wow-forever-enchanting-guide",
    "locale": "en",
    "title": "WoW Forever Enchanting: Start, Disenchant or Sell?",
    "description": "Decide whether to learn Enchanting, compare gear with its materials, and plan camp crafts without relying on disputed recipes or beta prices.",
    "tier": null,
    "prerequisite": null,
    "blocks": [
      {
        "type": "paragraph",
        "text": "Learn Enchanting in WoW Forever if you want to make enchants and camp crafts and are willing to invest materials in the profession. If your only goal is money for training, start by comparing gathering instead. Owning a green item is not a reason to destroy it: compare selling the equipment with the likely value of its materials first."
      },
      {
        "type": "heading",
        "text": "What you are buying into"
      },
      {
        "type": "paragraph",
        "text": "Enchanting adds permanent weapon and armor bonuses and makes wands, rods and oils. Forever also lists class-specific staves, off-hand orbs and relics. Think of those as reasons to investigate a craft you want, not proof that leveling the profession will pay for itself."
      },
      {
        "type": "paragraph",
        "text": "The Enchanting source still marks the new gear’s binding and enchanter-only restrictions as unconfirmed, based on beta tooltips. If one of those items is your reason to take the profession, inspect the current recipe and item restrictions before investing. This uncertainty belongs to that gear choice, not to every sentence about Enchanting."
      },
      {
        "type": "heading",
        "text": "Before disenchanting a useful-looking item"
      },
      {
        "type": "paragraph",
        "text": "{{term:disenchant|Disenchanting}} turns equipment into materials. Make three comparisons before using it. First, could you equip the item? Second, what would a vendor pay, and is there a credible buyer for the intact item? Third, what materials could it yield, and what could you actually sell those for? A listed auction price is an asking price, not a completed sale."
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
        "text": "Use the material table for identification, not a price promise"
      },
      {
        "type": "paragraph",
        "text": "The linked Forever Mastery table separates green armor, green weapons and higher-quality items, then groups them by {{term:required-level|the item’s required level}}. For example, it lists Strange Dust or Lesser Magic Essence in the 1–10 band, and Soul Dust, Greater Astral Essence or Large Glimmering Shard in the 21–25 band. These examples explain how to read it; they are not guaranteed yields for every item."
      },
      {
        "type": "paragraph",
        "text": "Its calculator attaches an average value to the materials using a single-player beta auction sample. Replace that price input with current evidence before using the result to buy gear. When an item has no required level, the tool uses item level instead; do not substitute your character level or profession skill."
      },
      {
        "type": "heading",
        "text": "A small camp project before a large shopping list"
      },
      {
        "type": "paragraph",
        "text": "The Enchanted Lute is an early, concrete project: the source lists skill 20 and training from a trainer or Camping 101: Enchanting. It contributes armor, stats and resistances at camp. If camp crafting is why the profession interests you, check that recipe first rather than buying materials for the entire skill journey."
      },
      {
        "type": "paragraph",
        "text": "The later {{term:arcane-salvager|Arcane Salvager}} is listed at 140, while Arcane Forge is listed at 300 and is needed for some recipes. Both require Blueprint items. Treat finding the right Blueprint as a separate prerequisite; a skill threshold is not a promise that a trainer will teach it."
      },
      {
        "type": "heading",
        "text": "Pairing with Tailoring: a supply chain, not free dust"
      },
      {
        "type": "paragraph",
        "text": "Tailoring can make equipment to disenchant, which connects the two crafts. But cloth you gather still has a sale value. Compare selling the cloth, selling the crafted item and using its materials before turning that connection into a production routine. It is a sensible pairing when you want both professions; it does not establish a profit margin."
      },
      {
        "type": "heading",
        "text": "How to choose your next recipe"
      },
      {
        "type": "list",
        "items": [
          "Open the current recipe and confirm ingredients, skill requirement and how it is learned. Forever has changed reagents; a Classic shopping list is not sufficient.",
          "Buy or gather enough for a small batch, then check the result and remaining skill gains before restocking.",
          "Keep class-training money separate. Stop funding the craft when it prevents the progress you wanted it to support."
        ]
      },
      {
        "type": "paragraph",
        "text": "A trustworthy recipe-by-recipe leveling route needs agreed current skill targets, ingredients and acquisition details. Those are not established by the sources checked here, so this guide does not publish a speculative sequence. Your next safe action is to verify one useful recipe, not commit to an unverified bulk order."
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
    "hash": "36c1a80b96dcc58073331c3254439d39f8a098efb09b6cc308b3c5f6c787a588"
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
        "text": "A crafting delivery used to earn reputation with the supply camp. Do not confuse that reputation requirement with the Merchant’s Favor currency price.",
        "source": "https://www.wow-professions.com/forever/merchants-favor-durotar-supply-azeroth-commerce",
        "kind": "item"
      }
    ],
    "sources": [
      {
        "label": "WoW Forever DB: launch economy forecast, 27 Oct 2026",
        "url": "https://wowfdb.com/tier-lists/professions-gold-launch/",
        "accessed": "2026-11-06"
      },
      {
        "label": "WoW-Professions: Merchant’s Favor and Waylaid Crates",
        "url": "https://www.wow-professions.com/forever/merchants-favor-durotar-supply-azeroth-commerce",
        "accessed": "2026-11-06"
      },
      {
        "label": "Blizzard: development notes titled Updated November 2",
        "url": "https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-november-2/2360696/9",
        "accessed": "2026-11-06"
      }
    ],
    "asOf": {
      "date": "2026-11-06",
      "build": "1.60.1.70658",
      "note": "Gathering comparisons draw on the 27 Oct forecast, build 1.60.1.70658. No live auction-price sample or gold-per-hour result was verified."
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
        "text": "Herbalism has a clear demand story: herbs feed supply crates and the new First Aid potions. Mining supplies ore to crafters and crates. Skinning fits a questing stretch with plenty of beasts, because collecting leather can follow the fights you were already doing. These are reasons to compare them, not proof that a particular material will sell at a high price."
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
        "text": "The launch profession forecast favors gathering because it avoids buying crafting inputs before making a sale. Its own limitation matters: it has no recorded live Forever prices behind the ratings. Test demand with a small quantity before spending an evening gathering one material or buying stock to resell."
      },
      {
        "type": "heading",
        "text": "Protect the money that keeps your character moving"
      },
      {
        "type": "paragraph",
        "text": "Blizzard’s November development notes put total class-ability training from 1–60 at 206–207 gold for every class, with Warlock costs adjusted for expected pet Grimoires. This is a lifetime training total for that level range, not an amount you need immediately. Use it as a reason to reserve money as you level, not as a target to grind before leaving the starting area."
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
        "text": "A {{term:waylaid-crate|Waylaid Crate}} asks for supplies and can be found in the world or bought at auction. Check the bundles before filling it: you need one listed bundle, not every option. The resulting Sealed crate binds to you and is delivered to your faction’s supply camp."
      },
      {
        "type": "paragraph",
        "text": "For a concrete example, the cited Apprentice Textiles crate accepts 40 Linen Cloth or 20 Light Leather. Compare the value of each bundle with the crate’s silver reward. If selling the materials would yield more silver, filling the crate is a choice to buy progress with the difference, not a gold-making shortcut."
      },
      {
        "type": "paragraph",
        "text": "The other reward is {{term:merchants-favor|Merchant’s Favor}}, which buys camp recipes and other goods. Some purchases also require reputation, earned through {{term:craftsmans-writ|Craftsman’s Writs}}. Decide which reward you want before buying a crate. Currency for an unlock and money for a trainer solve different problems."
      },
      {
        "type": "paragraph",
        "text": "The Horde camp is outside the west gate of the Crossroads in the Barrens; the Alliance camp is at Three Corners on the western edge of Redridge Mountains. Include the delivery trip in your decision. A modest reward is less attractive when it pulls you far away from your quests."
      },
      {
        "type": "heading",
        "text": "When to move from gathering into crafting"
      },
      {
        "type": "paragraph",
        "text": "Move when you can name the recipe, confirm how to learn it, price its ingredients and identify a use or buyer for the result. Tailoring’s bags are a product to investigate; Enchanting’s materials and recipes are an investment to evaluate. Neither becomes profitable just because a guide gives it a high rating."
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
          "Read any crate’s requested bundle and rewards before buying missing materials. Fill it for a named unlock or a favorable return, not merely because it dropped."
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
    "hash": "0f4f14e07caefc6834b26d6dd99095ea768916509e1848981215dc0d130e73ae"
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
        "accessed": "2026-11-06"
      },
      {
        "label": "Blizzard: Forever access and optional editions",
        "url": "https://news.blizzard.com/en-us/article/24302093/carve-a-new-path-with-world-of-warcraft-forever",
        "accessed": "2026-11-06"
      },
      {
        "label": "Blizzard: development notes titled Updated November 2",
        "url": "https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-november-2/2360696/9",
        "accessed": "2026-11-06"
      }
    ],
    "asOf": {
      "date": "2026-11-06",
      "build": "Launch information; November development notes",
      "note": "Official launch information and November development notes checked on this date. Source build label is not a claim of in-game testing."
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
        "text": "Start WoW Forever with Enhanced settings if you are unsure, choose Normal if you want player combat to be your decision, and pick a class whose everyday fights appeal to you. A WoW subscription or Game Time includes access; you do not need an optional upgrade edition just to begin. Skyborne access is a separate purchase consideration."
      },
      {
        "type": "heading",
        "text": "Before creating a character: check what you want to play"
      },
      {
        "type": "paragraph",
        "text": "Forever is a separate, permanent game alongside modern and Classic WoW, set across the original continents with a level cap of 60. It launched globally on 4 November 2026. Treat its classes, professions and new systems as Forever rules: a familiar name does not make a Retail or Classic guide interchangeable."
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
        "text": "This is a starting configuration, not a permanent commitment. You can change individual settings under Game Menu > Options. Character HD or SD model choice changes appearance rather than abilities or progression, and can also be changed later. Adjust what bothers you after playing; there is no need to solve every preference at character creation."
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
          "Hardcore is announced for after launch; the checked launch information gives no availability date. Do not plan a first character around it being open."
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
        "text": "For a solo start, compare Hunter’s pet-based fighting, Warlock’s resource recovery and Mage’s control. You will spend many fights with the ordinary toolkit before reaching a finished build. A ranking cannot tell you whether you enjoy managing a pet or stopping to drink; the leveling guide explains those tradeoffs."
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
        "text": "Keep money for later training and class supplies. You do not have to master the auction economy on your first evening: gathering while you quest is a starting option, while crafting is better approached with a particular recipe or use in mind."
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
        "text": "Cooking’s Basic Campfire becomes a shared campsite. Nearby players can add up to three {{term:camp-features|Camp Features}}, one per player. Sit or craft there for at least one minute to gain their benefits. Simply passing the camp is not the same action, and the buffs are mutually exclusive with their corresponding class buffs."
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
        "text": "The {{term:legacy|Legacy System}} adds account-wide challenges, perks and rewards. It encourages trying different classes and tradeskills, but all character advantages can be unlocked on a single character. Stay with the character you like; making alts is an option, not an entry requirement."
      },
      {
        "type": "heading",
        "text": "What waits beyond the starting areas"
      },
      {
        "type": "paragraph",
        "text": "Forever adds more than 1,000 quests across levels 1–60. The Riverglades offers new questing across much of the mid-30s to mid-40s, while Zephras Isle is a 1–12 starting experience. Those are later choices to explore, not a checklist you need to memorize before setting out."
      },
      {
        "type": "paragraph",
        "text": "Blizzard’s current launch article announces December 9 for Barrow Deeps, Hyjal Summit and Onyxia’s Lair. That is a scheduled raid opening, not a deadline for your first character. For now, choose your settings and ruleset, learn a few fights, check your trained abilities and follow the part of Azeroth that interests you."
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
    "hash": "234c9e576c058fee053b3030e97d6c155636e1f463f6a500dfe1732325827cec"
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
