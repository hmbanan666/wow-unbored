-- Publish only on an existing English Forever site; preserve all unrelated owner work.
LOCK TABLE content.paths IN SHARE ROW EXCLUSIVE MODE;
DO $migration$
DECLARE
  guide jsonb;
  current_page content.paths%ROWTYPE;
  next_group text;
  stamp bigint := floor(extract(epoch FROM NOW()));
  revision constant text := 'forever-money-2026-11-09';
BEGIN
  IF EXISTS (SELECT 1 FROM content.editorial_migrations WHERE name = revision) THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM content.paths WHERE kind = 'guide' AND game = 'forever' AND locale = 'en') THEN RETURN; END IF;
  FOR guide IN SELECT value FROM jsonb_array_elements($guides$
[
  {
    "group": "professions-gold",
    "game": "forever",
    "terms": [
      {
        "key": "favor",
        "name": "Merchant's Favor",
        "text": "The trade camps' currency for recipes and other rewards. Favor, ordinary gold and faction reputation are separate requirements; having one does not supply the others.",
        "source": "https://www.wow-professions.com/forever/merchants-favor-durotar-supply-azeroth-commerce"
      },
      {
        "key": "writ",
        "name": "Craftsman's Writ",
        "text": "A crafting delivery that earns trade-faction reputation. It asks for a finished item to take to a customer. Some camp recipes need reputation as well as Favor.",
        "source": "https://www.wow-professions.com/forever/merchants-favor-durotar-supply-azeroth-commerce"
      }
    ],
    "sources": [
      {
        "label": "stillsixty: Waylaid Crates, bundles and rewards",
        "url": "https://www.stillsixty.com/guides/waylaid-crates",
        "accessed": "2026-11-09"
      },
      {
        "label": "wow-professions: Merchant's Favor & Reputation Guide",
        "url": "https://www.wow-professions.com/forever/merchants-favor-durotar-supply-azeroth-commerce",
        "accessed": "2026-11-09"
      },
      {
        "label": "Road to 60Forever: How to get free gold without buying it",
        "url": "https://roadto60forever.com/professions/gold-making-guide/",
        "accessed": "2026-11-09"
      },
      {
        "label": "Blizzard: Get to Know the Forever Legacy System",
        "url": "https://news.blizzard.com/en-us/article/24307383/get-to-know-the-world-of-warcraft-forever-legacy-system",
        "accessed": "2026-11-09"
      }
    ],
    "asOf": {
      "date": "2026-11-09",
      "build": "Forever launch crate guides and Blizzard Legacy announcement",
      "note": "Crate bundles and early rewards cross-checked on 9 November. Exact Expert and Artisan payouts remain unconfirmed; no live auction prices or client test."
    },
    "kind": "guide",
    "slug": "wow-forever-merchants-favor-waylaid-crates",
    "locale": "en",
    "title": "WoW Forever Merchant's Favor: Crates and Rewards",
    "description": "Fill Waylaid Crates, find Marcy Baker or Dokimi, claim your first-crate bonus, and decide when to sell materials instead of earning Favor.",
    "tier": null,
    "prerequisite": null,
    "blocks": [
      {
        "type": "paragraph",
        "text": "Your first crate quest gives an extra 50 Favor and 2,000 reputation with your faction's trade camp. Earn WoW Forever Merchant's Favor by filling Waylaid Crates and delivering them to Marcy Baker for Alliance or Dokimi for Horde, then spend it on camp recipes and cosmetics."
      },
      {
        "type": "paragraph",
        "text": "A crate in your bags leaves you three useful choices: sell it empty, sell the materials it asks for, or fill it for Favor. Choose the last option when you want a camp reward. If your next class-training bill is the problem, selling the crate or its ingredients is usually the better starting point."
      },
      {
        "type": "heading",
        "text": "Read the label before gathering supplies"
      },
      {
        "type": "paragraph",
        "text": "Waylaid Crates drop from ordinary monsters, some chests and dungeon monsters. Empty crates can be traded and bought on the auction house. Right-click a plain crate to read its label, then open the labelled crate to see the bundles it accepts."
      },
      {
        "type": "paragraph",
        "text": "Fill it with any one complete listed bundle, held in a single stack. An Apprentice Herbs crate can take 20 Peacebloom or 20 Silverleaf. Ten of each does not complete either bundle. Put the chosen amount together in your bags before selecting the stack; you do not need to supply every material named on the label."
      },
      {
        "type": "paragraph",
        "text": "Filling produces a Sealed crate that binds to your character. Decide whether to sell before sealing it. The crate tier sets the character level required to open it, so a Journeyman crate is already usable at level 10 even though the name sounds like a later step."
      },
      {
        "type": "table",
        "caption": "Crate levels, example bundles and hand-in rewards",
        "columns": [
          "Crate / tier",
          "Level",
          "One complete bundle",
          "Hand in to",
          "Reward"
        ],
        "rows": [
          [
            "Apprentice Herbs",
            "10",
            "20 Peacebloom OR 20 Silverleaf",
            "Marcy Baker / Dokimi",
            "5 Favor + 2 silver 50 copper"
          ],
          [
            "Apprentice Textiles",
            "10",
            "40 Linen Cloth OR 20 Light Leather",
            "Marcy Baker / Dokimi",
            "5 Favor + 2 silver 50 copper"
          ],
          [
            "Apprentice Ore",
            "10",
            "20 Copper Ore OR 20 Tin Ore",
            "Marcy Baker / Dokimi",
            "5 Favor + 2 silver 50 copper"
          ],
          [
            "Apprentice Curiosities",
            "10",
            "20 Strange Dust OR 4 Greater Magic Essence",
            "Marcy Baker / Dokimi",
            "5 Favor + 2 silver 50 copper"
          ],
          [
            "Apprentice Parts",
            "10",
            "16 Handful of Copper Bolts OR 4 Copper Modulator",
            "Marcy Baker / Dokimi",
            "10 Favor + 5 silver"
          ],
          [
            "Journeyman Ore",
            "10",
            "10 Silver Ore OR 20 Iron Ore",
            "Marcy Baker / Dokimi",
            "10 Favor + 5 silver"
          ],
          [
            "Expert Textiles",
            "20",
            "40 Mageweave Cloth OR 20 Heavy Leather",
            "Marcy Baker / Dokimi",
            "Favor + silver; exact payout unconfirmed"
          ],
          [
            "Artisan Textiles",
            "35",
            "40 Runecloth OR 20 Thick Leather",
            "Marcy Baker / Dokimi",
            "Favor + silver; exact payout unconfirmed"
          ]
        ]
      },
      {
        "type": "paragraph",
        "text": "These are examples of accepted bundles. Read your own label before buying supplies. Herbs, Ore, Textiles and Curiosities take materials; Parts asks for Engineering components. A green Apprentice Parts crate pays more than a white Apprentice Ore crate, but the extra Favor and silver may cost more in ingredients."
      },
      {
        "type": "heading",
        "text": "Alliance: Marcy Baker at Three Corners"
      },
      {
        "type": "paragraph",
        "text": "Take sealed crates to Marcy Baker at Three Corners on the western edge of Redridge Mountains. This is the Azeroth Commerce Authority camp. It is also where Alliance players shop for the camp rewards, so check the profession vendors while you are there."
      },
      {
        "type": "heading",
        "text": "Horde: Dokimi outside the Crossroads"
      },
      {
        "type": "paragraph",
        "text": "Take sealed crates to Dokimi just outside the west gate of the Crossroads in the Barrens. The Horde camp belongs to Durotar Supply and Logistics. Plan the hand-in around a nearby quest or town visit if the reward does not justify a separate journey."
      },
      {
        "type": "heading",
        "text": "Complete the first Shipping Label quest"
      },
      {
        "type": "paragraph",
        "text": "Your first crate introduces the Shipping Label quest. Complete it at your trade camp for the extra 50 Favor and 2,000 reputation, once per character. Sources differ on whether the label appears when you fill the crate or turn it in; check your bags and quest log during that first delivery. wow-professions also lists starting a writ as an introduction to the same quest."
      },
      {
        "type": "paragraph",
        "text": "Keep that one-time reputation award separate from repeat crate rewards. Regular sealed-crate hand-ins pay {{term:favor|Merchant's Favor}} and some silver. Further reputation comes from {{term:writ|Craftsman's Writs}}; filling another crate is not a repeat of the introductory 2,000-reputation quest."
      },
      {
        "type": "heading",
        "text": "Sell the crate, sell its contents, or earn Favor"
      },
      {
        "type": "list",
        "items": [
          "Sell the empty crate when you want coin and have no camp purchase in mind. Check its auction listing value before spending materials on it.",
          "Sell the materials when other players want the bundle and you would rather fund training or repairs. Gathered supplies still have a sale value.",
          "Fill the crate when a recipe or cosmetic you want requires Favor. Check that reward's reputation and profession requirements before buying extra crates."
        ]
      },
      {
        "type": "paragraph",
        "text": "For Apprentice Textiles, 20 Light Leather beats 40 Linen Cloth on cost only when one leather costs less than two cloth. Price the whole bundle. If the materials would sell for more than 2 silver 50 copper, the white Apprentice payout does not repay their sale value; the Favor is what you are spending the difference to obtain."
      },
      {
        "type": "paragraph",
        "text": "Buying a crate adds its price to that decision. Include the empty crate and the materials in your budget, then subtract the silver returned. The remaining cost is money you are choosing to put toward Favor. There is no fixed gold value for Favor that makes every hand-in profitable."
      },
      {
        "type": "heading",
        "text": "What Favor buys, and what the Legacy perk changes"
      },
      {
        "type": "paragraph",
        "text": "The trade camps sell profession recipes and cosmetic rewards. Some purchases also require faction reputation. Before farming a large stock of Favor, find the recipe you intend to learn and inspect its requirements; a currency balance alone does not make it usable."
      },
      {
        "type": "paragraph",
        "text": "Blizzard says the Legacy perk Performance Bonus sometimes increases the Favor received from the Azeroth Commerce Authority or Durotar Supply and Logistics. Treat that as a possible extra when planning hand-ins. Budget using the ordinary rewards; a possible Favor bonus should not be what makes a purchase affordable."
      },
      {
        "type": "faq",
        "entries": [
          {
            "q": "Where do Alliance and Horde turn in Waylaid Crates?",
            "a": "Alliance delivers sealed crates to Marcy Baker at Three Corners, Redridge Mountains, for the Azeroth Commerce Authority. Horde delivers to Dokimi outside the west gate of the Crossroads, Barrens, for Durotar Supply and Logistics."
          },
          {
            "q": "What goes in Apprentice Ore, Parts and Curiosities crates?",
            "a": "Ore accepts 20 Copper Ore or 20 Tin Ore. Parts accepts, for example, 16 Handful of Copper Bolts or 4 Copper Modulator. Curiosities accepts, for example, 20 Strange Dust or 4 Greater Magic Essence. Use one complete listed bundle in a single stack."
          },
          {
            "q": "Do I need to fill every material on the crate label?",
            "a": "No. Any one listed bundle fills it. For Apprentice Herbs, use 20 Peacebloom or 20 Silverleaf; combining half of each does not complete a bundle."
          },
          {
            "q": "What does the first crate quest reward?",
            "a": "Complete the introductory Shipping Label quest at your faction camp for 50 extra Favor and 2,000 reputation, once per character. That bonus is separate from the ordinary crate payout."
          },
          {
            "q": "Do Merchant's Favor recipes also need reputation?",
            "a": "Some do. Inspect the recipe at the camp before farming its Favor cost. Writs provide further reputation; ordinary sealed crates give Favor and silver."
          },
          {
            "q": "Are Waylaid Crates a good way to make gold?",
            "a": "Fill them when you want Favor rewards. For spendable coin, check whether selling the empty crate or its materials is worth more than the silver paid at hand-in."
          }
        ]
      },
      {
        "type": "link",
        "label": "Keep training money safe while earning early gold",
        "href": "/guides/how-to-make-gold-early-in-wow-forever"
      },
      {
        "type": "link",
        "label": "Choose professions for your class and your budget",
        "href": "/guides/wow-forever-best-professions-for-each-class"
      },
      {
        "type": "link",
        "label": "Start your first Forever character",
        "href": "/guides/wow-forever-beginners-guide"
      },
      {
        "type": "link",
        "label": "Browse all WoW Forever guides",
        "href": "/forever"
      }
    ],
    "topics": [],
    "items": [],
    "hash": "4aa1de7bc0870801b67386a6962a77b466ba8bca8aba3932ea5bcb5c72429488",
    "previousVersion": 0
  },
  {
    "group": "professions-gold",
    "game": "forever",
    "terms": [
      {
        "key": "disenchant",
        "name": "Disenchant",
        "text": "An Enchanting ability that destroys an eligible item to recover enchanting materials. Compare the item's sale value with the value of those materials before using it.",
        "source": "https://wowfdb.com/professions/enchanting/"
      },
      {
        "key": "favor",
        "name": "Merchant's Favor",
        "text": "Currency earned from filled Waylaid Crates and spent at the faction trade camps on recipes and other rewards. It is separate from gold and faction reputation.",
        "source": "https://www.wow-professions.com/forever/merchants-favor-durotar-supply-azeroth-commerce"
      }
    ],
    "sources": [
      {
        "label": "Blizzard: Create the Hero You Want to Be",
        "url": "https://news.blizzard.com/en-us/article/24304075/create-the-hero-you-want-to-be-in-world-of-warcraft-forever",
        "accessed": "2026-11-09"
      },
      {
        "label": "AllThingsHow: Every Profession and Best Pair, November 8",
        "url": "https://allthings.how/wow-forever-professions/",
        "accessed": "2026-11-09"
      },
      {
        "label": "ForeverDB: Best professions for each class, November 9",
        "url": "https://foreverdb.net/guide/best-professions-by-class",
        "accessed": "2026-11-09"
      },
      {
        "label": "Builds Forge: Best professions for each class, November 5",
        "url": "https://buildsforge.com/en/wow-forever/guides/best-professions-by-class/",
        "accessed": "2026-11-09"
      },
      {
        "label": "WoW Forever DB: Enchanting, build 1.60.1.70790",
        "url": "https://wowfdb.com/professions/enchanting/",
        "accessed": "2026-11-09"
      },
      {
        "label": "WoW Forever DB: Launch Gold Professions, October 27 forecast",
        "url": "https://wowfdb.com/tier-lists/professions-gold-launch/",
        "accessed": "2026-11-09"
      },
      {
        "label": "Road to 60Forever: How to get free gold without buying it",
        "url": "https://roadto60forever.com/professions/gold-making-guide/",
        "accessed": "2026-11-09"
      },
      {
        "label": "Overgear: How to Make Gold, November 2",
        "url": "https://overgear.com/guides/wow-forever/earning-gold/",
        "accessed": "2026-11-09"
      },
      {
        "label": "Blizzard: Get to Know the Forever Legacy System",
        "url": "https://news.blizzard.com/en-us/article/24307383/get-to-know-the-world-of-warcraft-forever-legacy-system",
        "accessed": "2026-11-09"
      },
      {
        "label": "wow-professions: Merchant's Favor & Reputation Guide",
        "url": "https://www.wow-professions.com/forever/merchants-favor-durotar-supply-azeroth-commerce",
        "accessed": "2026-11-09"
      }
    ],
    "asOf": {
      "date": "2026-11-09",
      "build": "Forever launch profession guides; October 27 gold forecast",
      "note": "Class pairs are starter advice, not measured rankings. The gold list uses a pre-launch forecast without recorded Forever prices; no cheapest crafting route is claimed."
    },
    "kind": "guide",
    "slug": "wow-forever-best-professions-for-each-class",
    "locale": "en",
    "title": "WoW Forever Best Professions for Each Class",
    "description": "Choose a solo crafting pair or a gathering pair for every Forever class, with reasons, gold tradeoffs and the role of Merchant's Favor.",
    "tier": null,
    "prerequisite": null,
    "blocks": [
      {
        "type": "paragraph",
        "text": "WoW Forever's best professions for each class start with useful equipment: Tailoring and Enchanting for cloth wearers, Leatherworking and Skinning for leather users, and Blacksmithing and Mining for Warriors and Paladins. Choose two gathering professions instead when funding training matters more than making your own gear."
      },
      {
        "type": "paragraph",
        "text": "A self-supply pair gives you a use for the materials you collect. A gold pair leaves those materials available to sell. Neither choice guarantees a cheap leveling journey: crafting consumes inputs you could have sold, while gathering loses its advantage if you spend the evening chasing distant nodes."
      },
      {
        "type": "heading",
        "text": "Pick a pair for your first character"
      },
      {
        "type": "paragraph",
        "text": "These are our starter recommendations for all nine classes in Blizzard's Forever roster. The solo column assumes you want to make equipment as you level. The gold column assumes you prefer selling materials. AllThingsHow and ForeverDB agree on these crafting pairs; they are useful starting choices, not measured best-in-slot or maximum-profit results."
      },
      {
        "type": "table",
        "caption": "Starter profession pairs by class",
        "columns": [
          "Class",
          "Solo / leveling pair",
          "Gold pair",
          "Why this fits"
        ],
        "rows": [
          [
            "Druid",
            "Leatherworking + Skinning",
            "Herbalism + Skinning",
            "Make leather gear from skinned materials; sell herbs and leather when equipment crafting can wait."
          ],
          [
            "Hunter",
            "Leatherworking + Skinning",
            "Herbalism + Skinning",
            "Use leather for your own gear, or sell it alongside herbs gathered between beast quests."
          ],
          [
            "Mage",
            "Tailoring + Enchanting",
            "Herbalism + Mining",
            "Make cloth gear and recover enchanting materials from unwanted items; gathering keeps supplies available to sell."
          ],
          [
            "Paladin",
            "Blacksmithing + Mining",
            "Mining + Skinning",
            "Ore supports your armor and weapons; keep Mining and sell leather when training money takes priority."
          ],
          [
            "Priest",
            "Tailoring + Enchanting",
            "Herbalism + Mining",
            "Cloth crafts and enchanting materials support self-supply; the gold pair serves herb and ore buyers."
          ],
          [
            "Rogue",
            "Leatherworking + Skinning",
            "Mining + Skinning",
            "Turn leather into your own armor, or sell it with ore collected on your quest route."
          ],
          [
            "Shaman",
            "Leatherworking + Skinning",
            "Herbalism + Skinning",
            "Leatherworking supplies usable armor; herb and leather sales avoid spending those inputs on crafts."
          ],
          [
            "Warlock",
            "Tailoring + Enchanting",
            "Herbalism + Mining",
            "Cloth gear feeds the crafting pair; herbs and ore suit a character saving coin instead."
          ],
          [
            "Warrior",
            "Blacksmithing + Mining",
            "Mining + Skinning",
            "Mine supplies for armor and weapons; sell ore and leather if crafting would consume your training reserve."
          ]
        ]
      },
      {
        "type": "paragraph",
        "text": "Your route can overturn any gold pick in the table. Choose Herbalism plus Skinning when quests already involve beasts. Choose Herbalism plus Mining when you enjoy looking for nodes and both materials find buyers. Mining plus Skinning is a reasonable melee starter when you expect to use ore later and are already killing beasts."
      },
      {
        "type": "heading",
        "text": "Cloth wearers: decide what you can afford to disenchant"
      },
      {
        "type": "paragraph",
        "text": "Tailoring supplies cloth equipment, and Enchanting can break eligible unwanted equipment into materials through {{term:disenchant|Disenchant}}. That relationship makes the pair attractive for a Mage, Priest or Warlock who wants to make things for personal use. It also ties up cloth and equipment that could have paid for the next trainer visit."
      },
      {
        "type": "paragraph",
        "text": "Keep an item you will wear. For an item you will replace, compare its vendor or auction value with the enchanting materials before destroying it. Crafting cloth items purely to disenchant is a spending decision too: check the cloth cost before making a batch. The pair works best when you actually want the resulting crafts or enchants."
      },
      {
        "type": "paragraph",
        "text": "WoW Forever DB recommends Tailoring plus Enchanting for Affliction, Demonology and Destruction Warlocks. For Shadow Priest, that one source suggests Enchanting plus Alchemy as its PvE pair. Treat the Shadow recommendation as an alternative to investigate once you know which crafts you want; it does not make two crafting professions the cheapest starter choice for every Priest."
      },
      {
        "type": "link",
        "label": "Start Enchanting and decide what to disenchant",
        "href": "/guides/wow-forever-enchanting-guide"
      },
      {
        "type": "heading",
        "text": "Leather and metal users: gather for a named craft"
      },
      {
        "type": "paragraph",
        "text": "Skinning plus Leatherworking gives Druids, Hunters, Rogues and Shamans a direct connection between beast kills and equipment crafting. Mining plus Blacksmithing does the same for Warriors and Paladins through ore. These pairs are easiest to justify when you have found a recipe for an item you will use soon."
      },
      {
        "type": "paragraph",
        "text": "Before using a stack, inspect the recipe, its ingredients and the item it makes. If a quest or dungeon has already filled that equipment slot, selling the materials may help more than crafting another replacement. Keep enough coin for training and ordinary supplies before buying missing ingredients."
      },
      {
        "type": "paragraph",
        "text": "A Hunter who likes the idea of Engineering should identify a specific craft before changing the table's self-supply pick. The same applies to a Rogue choosing gadgets or a Paladin considering Alchemy. Choose around the item you want to make and how you will supply it, rather than a blanket claim that one profession is mandatory for the class."
      },
      {
        "type": "heading",
        "text": "Which professions are available?"
      },
      {
        "type": "paragraph",
        "text": "The primary gathering professions are Herbalism, Mining and Skinning. The primary crafts are Alchemy, Blacksmithing, Enchanting, Engineering, Leatherworking and Tailoring. You can learn two primary professions. Cooking, Fishing and First Aid are secondary professions and do not replace either of those two slots."
      },
      {
        "type": "paragraph",
        "text": "Do not choose Alchemy solely because you remember making healing potions in Classic. In Forever, healing potions moved to First Aid. Herbs therefore have a use beyond supplying Alchemy, and taking a gathering pair does not mean giving up First Aid."
      },
      {
        "type": "heading",
        "text": "Read gold tier lists as forecasts"
      },
      {
        "type": "paragraph",
        "text": "WoW Forever DB's October 27 launch list rates Herbalism S, Mining and Skinning A, and Enchanting D. It is a pre-launch forecast with no recorded Forever auction prices. Its useful distinction is the cost to start: gatherers can offer raw supplies without first consuming them in a craft."
      },
      {
        "type": "paragraph",
        "text": "Our first gold recommendation is Herbalism plus Skinning for a quest route with beasts. Switch the second choice to Mining if you prefer node gathering and ore sales justify the detours. If neither material is selling, reduce the time spent gathering before putting more coin into stock or crafting inputs."
      },
      {
        "type": "paragraph",
        "text": "Test a small amount for sale before gathering a large supply of one item. Count sold auctions rather than high asking prices. When you want to begin crafting for income, name the buyer or personal use, price the complete ingredients, and start with a small batch you can afford to keep."
      },
      {
        "type": "link",
        "label": "Build an early-gold routine without draining training money",
        "href": "/guides/how-to-make-gold-early-in-wow-forever"
      },
      {
        "type": "heading",
        "text": "Budget for Favor recipes and gathering perks"
      },
      {
        "type": "paragraph",
        "text": "Some profession recipes are bought with {{term:favor|Merchant's Favor}} at the trade camps. Earning it means filling Waylaid Crates, so a recipe can cost you both the materials used for Favor and the materials used in the craft. Check any reputation requirement before collecting more currency."
      },
      {
        "type": "paragraph",
        "text": "Blizzard says Bountiful Harvest helps you find additional Scarce resources while mining, herbing or skinning. It is a Legacy perk to consider if gathering is what you actually do. Its effect is not a promise that every node gives a bonus or that a particular profession will sell best."
      },
      {
        "type": "link",
        "label": "Fill crates and choose which Merchant's Favor rewards to pursue",
        "href": "/guides/wow-forever-merchants-favor-waylaid-crates"
      },
      {
        "type": "faq",
        "entries": [
          {
            "q": "What are the best professions for a Hunter in WoW Forever?",
            "a": "Our self-supply pick is Leatherworking plus Skinning. Choose Herbalism plus Skinning instead when you want to sell materials during beast quests. Investigate Engineering when you have a specific craft in mind and can supply it."
          },
          {
            "q": "What should a Warlock or Mage take?",
            "a": "Tailoring plus Enchanting is our starter crafting pick for cloth gear and enchanting materials. Herbalism plus Mining suits saving gold instead, provided your route and buyers make node gathering worthwhile."
          },
          {
            "q": "Which professions suit a Paladin or Warrior?",
            "a": "Blacksmithing plus Mining connects ore gathering to equipment you can use. Mining plus Skinning keeps those resources available for sale if crafting would leave too little training money."
          },
          {
            "q": "What should a Shaman or Druid choose?",
            "a": "Start with Leatherworking plus Skinning if you want to make your own armor. Herbalism plus Skinning is our gold alternative when your quest route includes beasts and herbs."
          },
          {
            "q": "Is there a proven best profession for gold?",
            "a": "The launch tier list is a forecast, not a measurement of live sales. Start with gathering that fits your quest route, test what sells, and choose a craft only when its costs and use are clear."
          },
          {
            "q": "Can I take First Aid with two primary professions?",
            "a": "Yes. First Aid, Cooking and Fishing are secondary professions. In Forever, First Aid makes healing potions, so you do not need to give up a primary slot for that purpose."
          }
        ]
      },
      {
        "type": "link",
        "label": "Choose a class for self-sufficient solo play",
        "href": "/guides/best-solo-class-wow-forever"
      },
      {
        "type": "link",
        "label": "Compare leveling classes and their everyday costs",
        "href": "/guides/best-leveling-class-wow-forever"
      },
      {
        "type": "link",
        "label": "Set up your first Forever character",
        "href": "/guides/wow-forever-beginners-guide"
      },
      {
        "type": "link",
        "label": "Browse all WoW Forever guides",
        "href": "/forever"
      }
    ],
    "topics": [],
    "items": [],
    "hash": "5acf072b9b52219b1c5dc341c0be80e36e3cf6eea215668e4f7588ff6e1a5f51",
    "previousVersion": 0
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
    "hash": "17a27bcafda69ae858093ed91363b6650921f87d57140d20cd8667b416fc90b8",
    "previousVersion": 0
  },
  {
    "group": "professions-gold",
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
      },
      {
        "label": "Forever Guides: Legit Ways to Earn Gold at Launch",
        "url": "https://theforeverguides.com/gold-making/",
        "accessed": "2026-11-09"
      }
    ],
    "asOf": {
      "date": "2026-11-09",
      "build": "1.60.1.70658",
      "note": "Gathering uses the October 27 forecast, build 1.60.1.70658. Crate tiers, single-stack bundles, faction camps and the gold-buying warning rechecked 9 November; live sale returns remain unmeasured."
    },
    "kind": "guide",
    "slug": "how-to-make-gold-early-in-wow-forever",
    "locale": "en",
    "title": "How to Make Gold Early in WoW Forever",
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
        "text": "A {{term:waylaid-crate|Waylaid Crate}} asks for supplies and drops from enemies and some chests; you can also buy one at auction. Apprentice and Journeyman crates open from level 10, Expert from 20 and Artisan from 35. Fill any one complete listed bundle held in a single stack to create a Sealed crate, which binds to you for delivery to your faction’s supply camp."
      },
      {
        "type": "paragraph",
        "text": "A white Apprentice crate pays 5 Merchant’s Favor plus 2 silver 50 copper. Green Apprentice crates pay 10 Favor and 5 silver. Check the crate’s rank and color before costing its materials."
      },
      {
        "type": "paragraph",
        "text": "The Apprentice Textiles crate accepts 40 Linen Cloth or 20 Light Leather. Apprentice Herbs accepts 20 Peacebloom or 20 Silverleaf. Use one complete bundle in a single stack; mixing part of each does not fill it. Compare the value of each bundle with the crate’s silver reward. If selling the materials would yield more silver, filling the crate is a choice to buy progress with the difference, not a gold-making shortcut."
      },
      {
        "type": "paragraph",
        "text": "{{term:merchants-favor|Merchant’s Favor}} buys camp recipes and other goods. Your first filled crate or started writ gives a Shipping Label quest worth an extra 50 Favor and 2,000 reputation, once per character. Complete that quest at the camp to collect the bonus. Further reputation comes from {{term:craftsmans-writ|Craftsman’s Writs}}, and some purchases require both reputation and Favor."
      },
      {
        "type": "paragraph",
        "text": "For Horde, deliver to Dokimi outside the west gate of the Crossroads in the Barrens, at Durotar Supply and Logistics. For Alliance, find Marcy Baker at Three Corners on the western edge of Redridge Mountains, at the Azeroth Commerce Authority. Include the delivery trip in your decision: a modest reward is less attractive when it pulls you far from your quests."
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
        "text": "Never buy gold"
      },
      {
        "type": "paragraph",
        "text": "Never buy gold. Blizzard can freeze trade, mail and auction-house access on suspect accounts. A purchased shortcut can leave you unable to use the same services that turn your gathered materials into training money. Earn it through normal play and sales instead."
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
      },
      {
        "type": "link",
        "label": "Check crate levels, bundles and Merchant's Favor rewards",
        "href": "/guides/wow-forever-merchants-favor-waylaid-crates"
      },
      {
        "type": "link",
        "label": "Choose professions for your class and your gold plans",
        "href": "/guides/wow-forever-best-professions-for-each-class"
      }
    ],
    "topics": [],
    "items": [],
    "hash": "5d4c12485dde63c48a9e12143351f023a85f3adde5caca91449886f13f45b2e4",
    "previousVersion": 2,
    "previousTitle": "How to Make Gold Early in WoW Forever: Gather and Spend Wisely"
  }
]
$guides$::jsonb)
  LOOP
    SELECT * INTO current_page FROM content.paths WHERE kind = 'guide'
      AND slug = guide->>'slug' AND locale = 'en' ORDER BY version DESC LIMIT 1;
    IF (guide->>'previousVersion')::integer = 0 THEN
      IF FOUND THEN
        RAISE EXCEPTION 'Money migration needs review for %: slug already exists', guide->>'slug';
      END IF;
      next_group := guide->>'group';
    ELSE
      IF NOT FOUND OR current_page.game <> 'forever' OR current_page.status <> 'published'
          OR current_page.version <> (guide->>'previousVersion')::integer
          OR current_page.title <> guide->>'previousTitle'
          OR current_page.description <> guide->>'description'
          OR md5(current_page.body::text) <> '64b56c57de6701d792ab6f7911713f55'
          OR current_page.guide_group IS NULL
          OR EXISTS (SELECT 1 FROM content.paths WHERE kind = 'guide'
            AND slug = guide->>'slug' AND locale = 'en' AND status = 'draft') THEN
        RAISE EXCEPTION 'Money migration needs review for %: missing or changed publication or draft', guide->>'slug';
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
