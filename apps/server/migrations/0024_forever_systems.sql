-- Publishes the systems batch on sites with existing English Forever content.
-- Like 0023, fresh databases stay empty; owner edits and slug collisions abort the batch.
LOCK TABLE content.paths IN SHARE ROW EXCLUSIVE MODE;
DO $migration$
DECLARE
  guide jsonb;
  current_page content.paths%ROWTYPE;
  stamp bigint := floor(extract(epoch FROM NOW()));
  revision constant text := 'forever-systems-2026-11-09';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM content.paths WHERE kind = 'guide' AND game = 'forever' AND locale = 'en') THEN
    RETURN;
  END IF;
  FOR guide IN SELECT value FROM jsonb_array_elements($guides$
[
  {
    "game": "forever",
    "terms": [
      {
        "key": "camp-feature",
        "name": "Camp Feature",
        "text": "A profession-made object placed at a campsite to provide a buff or service. The basic campsite has room for three, with one contribution per player.",
        "source": "https://news.blizzard.com/en-us/article/24315820/world-of-warcraft-forever-now-live"
      },
      {
        "key": "rested-xp",
        "name": "Rested XP",
        "text": "A stored experience bonus used for kills. The Camp Tent helps replenish rested experience; it does not give the sleeping bag's stacking percentage buff.",
        "source": "https://www.wow-professions.com/forever/camping-guide"
      },
      {
        "key": "well-rested",
        "name": "Well Rested",
        "text": "A Legacy perk that speeds up rested experience accumulation and raises its cap. It is separate from the experience buff earned by lying in the Cozy Sleeping Bag.",
        "source": "https://news.blizzard.com/en-us/article/24307383/get-to-know-the-world-of-warcraft-forever-legacy-system"
      }
    ],
    "sources": [
      {
        "label": "Blizzard: World of Warcraft: Forever Now Live!",
        "url": "https://news.blizzard.com/en-us/article/24315820/world-of-warcraft-forever-now-live",
        "accessed": "2026-11-09"
      },
      {
        "label": "Blizzard: Get to Know the Legacy System",
        "url": "https://news.blizzard.com/en-us/article/24307383/get-to-know-the-world-of-warcraft-forever-legacy-system",
        "accessed": "2026-11-09"
      },
      {
        "label": "wow-professions: Camping Guide",
        "url": "https://www.wow-professions.com/forever/camping-guide",
        "accessed": "2026-11-09"
      },
      {
        "label": "Mobalytics: Campfire Guide, 3 November",
        "url": "https://mobalytics.gg/wow-forever/guides/camping-guide",
        "accessed": "2026-11-09"
      },
      {
        "label": "Warcraft Tavern: Camping Guide",
        "url": "https://www.warcrafttavern.com/forever/guides/camping/",
        "accessed": "2026-11-09"
      },
      {
        "label": "Wowhead: Cozy Sleeping Bag locations and rewards, 8 November",
        "url": "https://www.wowhead.com/forever/guide/cozy-sleeping-bag-locations-rewards",
        "accessed": "2026-11-09"
      },
      {
        "label": "Method: How to Get the Cozy Sleeping Bag, 8 November",
        "url": "https://www.method.gg/wow-forever/how-to-unlock-the-cozy-sleeping-bag-in-wow-forever",
        "accessed": "2026-11-09"
      },
      {
        "label": "Warcraft Tavern: Cozy Sleeping Bag Guide",
        "url": "https://www.warcrafttavern.com/forever/guides/cozy-sleeping-bag/",
        "accessed": "2026-11-09"
      }
    ],
    "asOf": {
      "date": "2026-11-09",
      "build": "Forever launch announcements and November 2026 guides",
      "note": "Launch camping rules and sourced profession effects. Campfire tool requirements and sleeping-bag duration remain disputed; no live-client test is claimed."
    },
    "kind": "guide",
    "slug": "wow-forever-camping-guide",
    "locale": "en",
    "title": "WoW Forever Camping: Buffs and Camp Features",
    "description": "Build a campfire, choose a profession feature and combine camp benefits, food and your sleeping bag before heading back to questing.",
    "tier": null,
    "prerequisite": null,
    "blocks": [
      {
        "type": "paragraph",
        "text": "Cooking's Basic Campfire supports a shared campsite with up to three profession-made features. WoW Forever camping gives you their benefits after at least one minute of sitting or crafting nearby, so start with a feature that supplies a buff or service you actually need."
      },
      {
        "type": "paragraph",
        "text": "A camp is useful even when you arrive alone. You can use a camp someone else has made, bring your own contribution, or create a basic stop along your route. Other players supply the extra features: learning several professions does not let you fill the whole camp yourself."
      },
      {
        "type": "heading",
        "text": "Make a campfire before you leave town"
      },
      {
        "type": "paragraph",
        "text": "Learn Cooking, open the Professions window and find the Basic Campfire Kit in the Cooking list. Craft the kit, then use it from your bags to place the fire. Simple Wood is the basic material to look for at a trade or general goods vendor. Check the recipe's tool requirement before buying supplies: wow-professions says Flint and Tinder is no longer needed, while Mobalytics and Warcraft Tavern still list it."
      },
      {
        "type": "paragraph",
        "text": "The Great Outdoors and Camping 101 introduce the system near starting areas. Follow them if you want the guided introduction, but you can receive another player's camp benefits before learning to make a feature yourself. When Campfire Nearby appears among your buffs, look for the fire and its objects."
      },
      {
        "type": "paragraph",
        "text": "The kit creates the campsite. A {{term:camp-feature|Camp Feature}} adds something to it, such as an Enchanted Lute or Camp Tent. Bring a feature your profession can place as well as a kit if you want a useful camp of your own. Buying an unfamiliar profession's item does not remove its profession requirement."
      },
      {
        "type": "heading",
        "text": "Choose the feature that fills a gap"
      },
      {
        "type": "paragraph",
        "text": "Check your existing buffs before placing anything. Blizzard says camping buffs are mutually exclusive with their corresponding class buffs. An Incense Candle adds little when you already have the matching Intellect buff; a missing benefit or a vendor may be the better contribution. Exact stat gains are unconfirmed; inspect Camp Benefits on your character to read the values you received."
      },
      {
        "type": "table",
        "caption": "Camp features and what each profession contributes",
        "columns": [
          "Feature",
          "Profession",
          "What it gives",
          "Choose it when"
        ],
        "rows": [
          [
            "Mana Well",
            "Alchemy",
            "Mana regeneration",
            "Mana recovery is slowing the next stretch of quests."
          ],
          [
            "Sharpening Wheel",
            "Blacksmithing",
            "Strength",
            "You need Strength and lack the corresponding class buff."
          ],
          [
            "Enchanted Lute",
            "Enchanting",
            "Armor, attributes and resistances",
            "You want broad defensive benefits and lack Mark of the Wild."
          ],
          [
            "First Aid Kit",
            "First Aid",
            "Stamina",
            "More health would help with the next fights."
          ],
          [
            "Fish Bowl",
            "Fishing",
            "An attribute increase",
            "The group lacks the corresponding attribute buff."
          ],
          [
            "Incense Candle",
            "Herbalism",
            "Intellect",
            "Your mana-using character lacks Arcane Intellect."
          ],
          [
            "Camp Tent",
            "Leatherworking",
            "Rested experience",
            "Your rested reserve is low before more questing."
          ],
          [
            "Lodestone",
            "Mining",
            "Melee attack power",
            "You fight in melee and lack the corresponding buff."
          ],
          [
            "Camp Chair",
            "Skinning",
            "Critical strike chance",
            "That benefit is missing from your current buffs."
          ],
          [
            "Faction Banner",
            "Tailoring",
            "Spirit",
            "Your faction can use the Spirit benefit."
          ],
          [
            "Reagent Bot",
            "Engineering",
            "Vendor access",
            "You need supplies or want to sell items at camp."
          ],
          [
            "Basic Campfire",
            "Cooking",
            "The campsite for other features",
            "There is no suitable camp at your rest stop."
          ]
        ]
      },
      {
        "type": "paragraph",
        "text": "A Camp Tent is especially relevant while leveling. It helps with {{term:rested-xp|rested XP}}, which is a reserve used while earning experience from kills. Check that reserve before choosing the tent: having a tent nearby does not mean every rest produces another full dose on top of what you already have."
      },
      {
        "type": "heading",
        "text": "Stay long enough to collect the benefits"
      },
      {
        "type": "paragraph",
        "text": "Sit or craft within the campsite for at least one minute. The nearby-fire effect helps you tell whether you are in range; Camp Benefits shows the effects you collected. Before walking away, inspect that buff rather than assuming that standing beside a decorative object was enough."
      },
      {
        "type": "paragraph",
        "text": "Each player contributes one profession feature. Feature placement has a one-hour cooldown, separate from making the fire, so choose before placing. If friends join you, ask what they can contribute and cover different needs. A mana user can benefit from recovery while a melee character brings a different missing bonus; a vendor can help everyone clear bags."
      },
      {
        "type": "paragraph",
        "text": "Higher campfire tiers make room for more contributions, and higher profession features can add services. An Engineering Repair Bot adds repairs, for example, while a Blacksmithing Anvil provides a crafting station. Follow the requirement on the actual kit and recipe when upgrading. Bigger camps pay off when enough people can fill them; a solo traveler should first make reliable use of the basic fire and a feature they can supply."
      },
      {
        "type": "heading",
        "text": "Put the sleeping bag and food into the same stop"
      },
      {
        "type": "paragraph",
        "text": "If you have the Cozy Sleeping Bag, unfold it at the campsite and rest inside. The bag builds an experience bonus as you rest, while the camp supplies the benefits of its profession objects. Warcraft Tavern describes using the bag and eating at camp together, so this is a convenient moment to refresh your food rather than scheduling separate stops."
      },
      {
        "type": "paragraph",
        "text": "The sleeping bag gives 1% bonus experience per minute, up to 3%. Its duration is disputed: Wowhead says one hour and Method says two, so check your active timer. Suitable cooked food supplies its own experience benefit alongside the bag and camp effects. Read the food's effect before packing it; the fact that an item restores health does not establish that it supplies the leveling bonus you want."
      },
      {
        "type": "link",
        "label": "Get the Cozy Sleeping Bag on either faction",
        "href": "/guides/wow-forever-cozy-sleeping-bag"
      },
      {
        "type": "paragraph",
        "text": "For an evening of questing, prepare your kits, feature materials and cooked food before leaving town. At a useful stopping point, check the nearby features, add your missing contribution and rest in the sleeping bag if you own it. Eat during the stop, check the resulting buffs, then continue your route. When you do not own the bag yet, the camp and food still give the stop a purpose."
      },
      {
        "type": "heading",
        "text": "Choose Legacy perks for the part you use"
      },
      {
        "type": "paragraph",
        "text": "Blizzard names three Legacy perks directly tied to camping. Field Guide shortens the cooldown for adding features. Permanence extends camping buffs. Reagent Economy removes the material cost of tier-one camp features. They solve different inconveniences: frequent contributors care about the cooldown, long trips make duration useful, and regular basic crafting makes materials matter."
      },
      {
        "type": "paragraph",
        "text": "The {{term:well-rested|Well Rested}} Legacy perk increases rested accumulation and its cap. Gourmand extends food buffs. A character who plays in shorter stretches may value rested accumulation, while someone who stays out for a long run may prefer less frequent buff maintenance. Choose from the available points and prerequisites; none of these perks is required to start using camps."
      },
      {
        "type": "link",
        "label": "Plan your first Legacy points around your play style",
        "href": "/guides/wow-forever-legacy-talents"
      },
      {
        "type": "faq",
        "entries": [
          {
            "q": "How do I make a campfire in WoW Forever?",
            "a": "Learn Cooking, craft a Basic Campfire Kit in the Professions window and use the kit from your bags. Check its recipe for the current tool requirement because published guides disagree about Flint and Tinder."
          },
          {
            "q": "Is camping a separate profession?",
            "a": "Cooking makes the campfire. Other professions make the Camp Features that add buffs, vendors or crafting services to the campsite."
          },
          {
            "q": "Do camping buffs stack with class buffs?",
            "a": "Blizzard says they are mutually exclusive with the corresponding class buffs. Check what your character already has before spending a feature cooldown."
          },
          {
            "q": "Can I add three Camp Features by myself?",
            "a": "No. The basic campsite supports up to three features, with one contributed by each player. Other players fill the other slots."
          },
          {
            "q": "Does the Camp Tent give the sleeping-bag bonus?",
            "a": "The tent helps with rested experience. The Cozy Sleeping Bag supplies a separate stacking experience buff. Both can be part of the same camp stop."
          }
        ]
      },
      {
        "type": "link",
        "label": "Start with the WoW Forever beginner guide",
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
    "hash": "62c6d1dcb4a27cbaa61d135eca9a19c14740ec752ac22494264636fdf89a393c",
    "previousVersion": 0
  },
  {
    "game": "forever",
    "terms": [
      {
        "key": "student-fodder",
        "name": "Student Fodder",
        "text": "A consumable awarded during the sleeping-bag chain. Forever sources describe health recovery; its old Season of Discovery rested-experience effect should not be assumed here.",
        "source": "https://www.wowhead.com/forever/guide/cozy-sleeping-bag-locations-rewards"
      },
      {
        "key": "well-rested",
        "name": "Well Rested",
        "text": "The Legacy perk that increases rested experience accumulation and its cap. This is separate from the sleeping bag's stacking percentage experience buff.",
        "source": "https://news.blizzard.com/en-us/article/24307383/get-to-know-the-world-of-warcraft-forever-legacy-system"
      }
    ],
    "sources": [
      {
        "label": "Wowhead: Cozy Sleeping Bag locations and rewards, 8 November",
        "url": "https://www.wowhead.com/forever/guide/cozy-sleeping-bag-locations-rewards",
        "accessed": "2026-11-09"
      },
      {
        "label": "Method: How to Get the Cozy Sleeping Bag, 8 November",
        "url": "https://www.method.gg/wow-forever/how-to-unlock-the-cozy-sleeping-bag-in-wow-forever",
        "accessed": "2026-11-09"
      },
      {
        "label": "Mobalytics/RampageWow: Sleeping Bag walkthrough, 9 October",
        "url": "https://mobalytics.gg/wow-forever/profile/rampagewow-1zhvs5/quests/how-to-get-the-cozy-sleeping-bag-in-wow-forever",
        "accessed": "2026-11-09"
      },
      {
        "label": "ConquestCapped: Cozy Sleeping Bag Guide, 7 November",
        "url": "https://conquestcapped.com/guides/wow-forever/wow-forever-cozy-sleeping-bag/",
        "accessed": "2026-11-09"
      },
      {
        "label": "Wow Buddy: Cozy Sleeping Bag walkthrough",
        "url": "https://wowbuddyguides.com/forever/guides/cozy-sleeping-bag",
        "accessed": "2026-11-09"
      },
      {
        "label": "Warcraft Tavern: Cozy Sleeping Bag Guide",
        "url": "https://www.warcrafttavern.com/forever/guides/cozy-sleeping-bag/",
        "accessed": "2026-11-09"
      },
      {
        "label": "Blizzard: World of Warcraft: Forever Now Live!",
        "url": "https://news.blizzard.com/en-us/article/24315820/world-of-warcraft-forever-now-live",
        "accessed": "2026-11-09"
      },
      {
        "label": "Blizzard: Get to Know the Legacy System",
        "url": "https://news.blizzard.com/en-us/article/24307383/get-to-know-the-world-of-warcraft-forever-legacy-system",
        "accessed": "2026-11-09"
      }
    ],
    "asOf": {
      "date": "2026-11-09",
      "build": "Forever launch announcements and November 2026 guides",
      "note": "Forever quest sources checked on 9 November. Buff duration, camp coordinates and extra bag rewards have disagreements noted beside the affected steps."
    },
    "kind": "guide",
    "slug": "wow-forever-cozy-sleeping-bag",
    "locale": "en",
    "title": "WoW Forever Sleeping Bag: Both Faction Routes",
    "description": "Follow the Horde or Alliance sleeping bag quest route, find the hidden objects and fit the journey around leveling, camping and food.",
    "tier": null,
    "prerequisite": null,
    "blocks": [
      {
        "type": "paragraph",
        "text": "At level 14, the WoW Forever sleeping bag quest starts at Alexston Farmstead in Westfall for Alliance or south of Camp Taurajo in the Barrens for Horde. Visit the other faction's starting site next, then follow the shared chain through Stonetalon Mountains, Loch Modan and Thoradin's Wall to earn the Cozy Sleeping Bag."
      },
      {
        "type": "paragraph",
        "text": "The reward is reusable: rest inside the bag for a minute to gain 1% bonus experience, building to 3% after three minutes. The journey to obtain it crosses both continents and includes climbs, so it makes most sense when some of those stops already fit your leveling plans or when you want an evening of exploration."
      },
      {
        "type": "heading",
        "text": "Pick your faction order before setting out"
      },
      {
        "type": "paragraph",
        "text": "You are looking for small clickable objects, not a quest-giving NPC. The opening sites contain Burned-Out Remains and a nearby plank or note. Take ...and that note you found at your faction's first site, then inspect the corresponding objects at the other site to turn it in and accept Stepping Stones. Check the quest title before crossing continents."
      },
      {
        "type": "paragraph",
        "text": "Both factions visit the same places. Alliance starts in Westfall and crosses to the Barrens; Horde starts in the Barrens and crosses to Westfall. Once Stepping Stones is in your quest log, the faction-specific ordering is finished. Avoid making a second trip to an opening site after you have already picked up the shared quest."
      },
      {
        "type": "table",
        "caption": "Sleeping-bag quest route for Alliance and Horde",
        "columns": [
          "Order",
          "Quest object or step",
          "Zone and coordinates",
          "What to do"
        ],
        "rows": [
          [
            "Alliance 1 / Horde 2",
            "Burned-Out Remains and adjacent plank",
            "Westfall: about 37, 50",
            "Look at the cart wreckage at Alexston Farmstead. Start the note quest here as Alliance; finish it and take Stepping Stones here as Horde."
          ],
          [
            "Horde 1 / Alliance 2",
            "Burned-Out Remains and adjacent plank",
            "The Barrens: about 46, 74",
            "Look inside the burned tower south of Camp Taurajo. Start here as Horde; finish the note quest and take Stepping Stones here as Alliance."
          ],
          [
            "Both: Stepping Stones",
            "Pocket Litter",
            "Stonetalon Mountains: reported camp 40.6, 52.4; disputed",
            "Use the mountain path northeast of Sun Rock Retreat, reported at 50.9, 52.3. Find the abandoned camp, turn in at Pocket Litter and accept Scramble. See the coordinate note below."
          ],
          [
            "Both: Scramble",
            "Mound of Dirt",
            "Stonetalon Mountains: about 39.6, 49.8",
            "Climb north from the camp and find the mound on the ledge. Turn in and take Wet Job before leaving."
          ],
          [
            "Both: Wet Job",
            "Carved Figurine, called Eagle Figurine in some guides",
            "Loch Modan dam: about 49.4, 12.9",
            "Descend carefully onto the ledge on the Wetlands-facing side. Interact with the figurine and take Eagle's Fist."
          ],
          [
            "Both: Eagle's Fist",
            "Messenger Bag",
            "Hillsbrad Foothills: cart approach about 87.3, 49.6",
            "Approach Thoradin's Wall from Hillsbrad. Climb using the cart and broken wall, pass through the room and find the hanging bag."
          ],
          [
            "Both: This Must Be The Place",
            "Hastily Rolled-Up Satchel",
            "Thoradin's Wall, beneath the Messenger Bag",
            "Accept the final quest from the hanging bag, then interact with the satchel underneath to collect the Cozy Sleeping Bag."
          ]
        ]
      },
      {
        "type": "paragraph",
        "text": "The Stonetalon camp position needs care. Wowhead, the Mobalytics walkthrough and ConquestCapped give 40.6, 52.4; Method prints 54.63, 52.44. Wow Buddy's separate walkthrough places its character near 40.8, 52.6. Follow the path northeast of Sun Rock Retreat toward the tent and Pocket Litter, and use those landmarks if a coordinate sends you to the wrong slope."
      },
      {
        "type": "heading",
        "text": "Make the travel worthwhile"
      },
      {
        "type": "paragraph",
        "text": "Starting at level 14 is allowed, but the route does not stay in low-level territory. Horde has the awkward Westfall and Loch Modan visits, while Alliance eventually travels through the route toward Hillsbrad. If hostile guards or enemies keep stopping you, return later or travel with friends. The bag's small XP bonus does not justify an unlimited series of recovery runs."
      },
      {
        "type": "paragraph",
        "text": "For Horde leaving the Barrens, Method describes the Orgrimmar zeppelin to Grom'gol and an approach to Westfall from the coast. Warcraft Tavern also describes that crossing. If you use it, treat the water and opposing territory as travel hazards, not a guaranteed safe shortcut. After the Westfall turn-in you still need to return to Kalimdor for Stonetalon."
      },
      {
        "type": "paragraph",
        "text": "For Alliance, Warcraft Tavern describes reaching the Barrens through the Ratchet boat from Booty Bay or through other established crossings. Use the crossing you already have access to rather than assuming a portal or flight point is available. After Stonetalon, the route returns to the Eastern Kingdoms for the dam and wall. Check your Hearthstone destination before using it to shorten that return."
      },
      {
        "type": "paragraph",
        "text": "A useful stopping point is after the two Stonetalon objects. Pocket Litter and the Mound of Dirt are in the same stretch of mountains, so finish both before departing for Loch Modan. If the next crossing would consume the rest of your evening, keep Wet Job for a later trip instead of rushing the dam and wall climbs."
      },
      {
        "type": "heading",
        "text": "Find the ledges, then take the next quest"
      },
      {
        "type": "paragraph",
        "text": "At the abandoned camp, look for Pocket Litter by the camping objects. Complete Stepping Stones and accept Scramble. The optional Rekindle quest involves the campfire, but the main sleeping-bag route continues to the Mound of Dirt. You can leave the optional fire quest for later if it is unavailable."
      },
      {
        "type": "paragraph",
        "text": "From the camp, climb north and locate the dirt mound before jumping. Turn in Scramble and accept Wet Job at the mound. At Loch Modan, the figurine is below the top of the dam on the side facing the Wetlands. Line up the ledge rather than dropping all the way down. The landmark matters more than standing on a map pin while still on the road above it."
      },
      {
        "type": "paragraph",
        "text": "At Thoradin's Wall, find the cart and broken section on the Hillsbrad side. Climb into the wall and pass through the room, then look outside to the right for the hanging Messenger Bag. That bag gives the final quest. The Hastily Rolled-Up Satchel below it gives the reward; reaching the wall or clicking only the first bag does not finish the chain."
      },
      {
        "type": "heading",
        "text": "Check the rewards without counting on two bags"
      },
      {
        "type": "paragraph",
        "text": "The claim that Stepping Stones gives two 12-slot inventory bags is unconfirmed for live. ConquestCapped labels that reward list as beta data; Method reports one Old Toolbox, and Warcraft Tavern lists different single bags by faction. Inspect your quest reward before planning an inventory upgrade around two bags."
      },
      {
        "type": "paragraph",
        "text": "The chain also awards {{term:student-fodder|Student Fodder}}. Forever sources describe it as recovery food; do not spend it expecting the rested-experience reward it supplied in Season of Discovery. Published totals differ, so keep the useful items you actually receive without budgeting around a particular count."
      },
      {
        "type": "heading",
        "text": "Use the bag at your next camp stop"
      },
      {
        "type": "paragraph",
        "text": "Unfold the bag somewhere safe and move onto it to rest. Stay until you have the stacks you want before leaving. Method and the Mobalytics walkthrough list a one-hour item cooldown. The buff timer is a separate matter: Wowhead says one hour, while Method and ConquestCapped say two. Check your character's active buff for the duration in your client."
      },
      {
        "type": "paragraph",
        "text": "The bag also lets you rest, which works well alongside the {{term:well-rested|Well Rested}} Legacy perk's faster rested accumulation and larger cap. That perk and the bag's percentage XP buff are separate benefits. At a campsite, collect the profession benefits and eat suitable cooked food during the same pause. Warcraft Tavern confirms that food and the bag can be used together at camp."
      },
      {
        "type": "link",
        "label": "Choose useful camp features for the same rest stop",
        "href": "/guides/wow-forever-camping-guide"
      },
      {
        "type": "link",
        "label": "Choose Legacy perks for leveling and rested experience",
        "href": "/guides/wow-forever-legacy-talents"
      },
      {
        "type": "faq",
        "entries": [
          {
            "q": "Where does the Horde sleeping-bag quest start?",
            "a": "At the burned tower south of Camp Taurajo in the Barrens, around 46, 74. Inspect the Burned-Out Remains, take the note quest and visit Alexston Farmstead in Westfall next."
          },
          {
            "q": "Where does the Alliance sleeping-bag quest start?",
            "a": "At Alexston Farmstead in Westfall, around 37, 50. Inspect the remains and plank at the cart wreckage, take the note quest and visit the burned tower in the southern Barrens next."
          },
          {
            "q": "What level can I start the Cozy Sleeping Bag chain?",
            "a": "The sources agree on level 14. Later stops cross more dangerous territory, so you can postpone the trip if getting there is repeatedly stopping your progress."
          },
          {
            "q": "How long does the sleeping-bag XP buff last?",
            "a": "Sources disagree: Wowhead says one hour; Method says two. Read the active buff timer in your client. The item's one-hour cooldown is separate from buff duration."
          },
          {
            "q": "Is the sleeping bag worth leaving my leveling route?",
            "a": "It is a useful reusable bonus, but the quest crosses continents. Combine the stops with travel you already intend to make, or choose it as an exploration trip. There is no verified leveling-time saving that makes it mandatory immediately at level 14."
          },
          {
            "q": "Do I get two 12-slot bags from Stepping Stones?",
            "a": "That live reward is unconfirmed. One source lists two from beta data, while current walkthroughs report one or different single bags by faction. Check the quest reward before counting on the extra space."
          }
        ]
      },
      {
        "type": "link",
        "label": "Start with the WoW Forever beginner guide",
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
    "hash": "80fa5dc963ad9fde342396a4e7d5c25052d4bbf3a601a950219ee68959757b5f",
    "previousVersion": 0
  },
  {
    "game": "forever",
    "terms": [
      {
        "key": "rested-xp",
        "name": "Rested XP",
        "text": "A stored experience bonus for kills. Well Rested changes how quickly this reserve accumulates and how much can be stored.",
        "source": "https://news.blizzard.com/en-us/article/24307383/get-to-know-the-world-of-warcraft-forever-legacy-system"
      },
      {
        "key": "respec",
        "name": "Respec",
        "text": "Resetting a character's selected Legacy perks so the available points can be allocated differently. Published guides place this service at a class trainer.",
        "source": "https://www.wowhead.com/forever/guide/legacy-system-overview-rewards"
      }
    ],
    "sources": [
      {
        "label": "Blizzard: Get to Know the Legacy System",
        "url": "https://news.blizzard.com/en-us/article/24307383/get-to-know-the-world-of-warcraft-forever-legacy-system",
        "accessed": "2026-11-09"
      },
      {
        "label": "ForeverCalc: Legacy perks, beta build 1.60.1.70425",
        "url": "https://forevercalc.com/legacy/",
        "accessed": "2026-11-09"
      },
      {
        "label": "Wowhead: Legacy System Overview, 24 October",
        "url": "https://www.wowhead.com/forever/guide/legacy-system-overview-rewards",
        "accessed": "2026-11-09"
      },
      {
        "label": "Method: Best Way to Spend Legacy Points, 9 October",
        "url": "https://www.method.gg/wow-forever/the-best-way-to-spend-your-legacy-points-in-wow-forever-best-legacy-talent-builds",
        "accessed": "2026-11-09"
      },
      {
        "label": "Blizzard: World of Warcraft: Forever Now Live!",
        "url": "https://news.blizzard.com/en-us/article/24315820/world-of-warcraft-forever-now-live",
        "accessed": "2026-11-09"
      },
      {
        "label": "Wowhead: Cozy Sleeping Bag locations and rewards, 8 November",
        "url": "https://www.wowhead.com/forever/guide/cozy-sleeping-bag-locations-rewards",
        "accessed": "2026-11-09"
      },
      {
        "label": "Method: How to Get the Cozy Sleeping Bag, 8 November",
        "url": "https://www.method.gg/wow-forever/how-to-unlock-the-cozy-sleeping-bag-in-wow-forever",
        "accessed": "2026-11-09"
      },
      {
        "label": "Warcraft Tavern: Cozy Sleeping Bag Guide",
        "url": "https://www.warcrafttavern.com/forever/guides/cozy-sleeping-bag/",
        "accessed": "2026-11-09"
      }
    ],
    "asOf": {
      "date": "2026-11-09",
      "build": "Launch rules; rank reference 1.60.1.70425 (beta)",
      "note": "Blizzard launch limits; rank examples cross-checked with published tables, including ForeverCalc beta build 1.60.1.70425. Live respec price is unconfirmed."
    },
    "kind": "guide",
    "slug": "wow-forever-legacy-talents",
    "locale": "en",
    "title": "WoW Forever Legacy Talents: Your First 16 Points",
    "description": "Earn Legacy points on one character, choose perks for solo leveling, professions or PvP, and understand camping bonuses and respec limits.",
    "tier": null,
    "prerequisite": null,
    "blocks": [
      {
        "type": "paragraph",
        "text": "Your first Legacy Point opens the system, usually when your first character reaches level 25. WoW Forever Legacy talents let each character spend up to 16 account-earned points at launch, with separate choices for solo leveling, professions or PvP."
      },
      {
        "type": "paragraph",
        "text": "Start by solving the inconvenience you encounter most. For a solo quester who repeatedly stops to recover, Thrill of Adventure is a sensible first investment. A character spending the evening crafting has a different reason to choose Working Overtime. You do not need to start another character just to unlock all the character advantages."
      },
      {
        "type": "heading",
        "text": "Earn points from the character you already play"
      },
      {
        "type": "paragraph",
        "text": "Blizzard calls these spendable talents Legacy Perks. Complete a Legacy Challenge to earn a point for your account, then spend that point independently on each non-Hardcore character. Spending it on one character does not empty the other character's allocation. Open the Legacy shield icon in the menu once you earn the first point."
      },
      {
        "type": "paragraph",
        "text": "Level 25 is the usual first unlock, but Blizzard also names reaching 150 in a non-gathering primary tradeskill or exploring the entire world map. A gatherer should not confuse a gathering skill milestone with the crafting challenges. Look at the actual challenge before investing materials just to reach an assumed unlock."
      },
      {
        "type": "table",
        "caption": "Legacy points available on a single character",
        "columns": [
          "Source",
          "Points",
          "What earns them"
        ],
        "rows": [
          [
            "Leveling",
            "3",
            "Reach levels 25, 45 and 60 on that class."
          ],
          [
            "Eligible tradeskills",
            "Up to 6",
            "Reach skill 150, 225 and 300 in each of two non-gathering primary professions."
          ],
          [
            "PvP",
            "12",
            "Ranks 3, 7, 10, 13 and 14 give five; four Exalted battleground reputations give four; the week 4, 7 and 10 Field of Honor quests give three."
          ],
          [
            "Adventure",
            "2",
            "Explore the whole world map on the same character; complete the Lord Valthalak dungeon set questline."
          ],
          [
            "Dungeons",
            "3",
            "Finish the final-boss challenges for the level 15–25, 26–45 and 46–60 dungeon groups."
          ],
          [
            "Raids",
            "3",
            "Defeat Onyxia; all 13 Hyjal Summit bosses; all 8 Barrow Deeps bosses."
          ],
          [
            "Total possible",
            "29",
            "Blizzard's single-character total. The launch spending cap is still 16 per character."
          ]
        ]
      },
      {
        "type": "paragraph",
        "text": "A dungeon point comes from completing its grouped challenge. Killing a boss repeatedly does not turn that row into an unlimited point source. Likewise, the PvP row includes seasonal and reputation goals. Choose a challenge that fits what you want to play next instead of reading the table as a checklist you must finish immediately."
      },
      {
        "type": "paragraph",
        "text": "Across the account, Blizzard lists 65 challenges, including class and profession milestones beyond the single-character example. The reward track also gives reasons to earn beyond the spending cap. Your first practical target can still be the next useful perk on the character you enjoy; 16 points do not require collecting every account challenge."
      },
      {
        "type": "heading",
        "text": "Plan the first 16 points with prerequisites included"
      },
      {
        "type": "paragraph",
        "text": "The following allocations are editorial starting plans using the published rank tables. Those tables include beta data, including ForeverCalc build 1.60.1.70425, so confirm the ranks and arrows in your current Legacy window before spending. The launch cap and perk purposes come from Blizzard; these are not measured fastest-leveling or best-PvP results."
      },
      {
        "type": "table",
        "caption": "Starting plans for the first 16 points",
        "columns": [
          "Play style",
          "Spend in this order",
          "Why this allocation fits"
        ],
        "rows": [
          [
            "Solo open-world leveler",
            "5 Thrill of Adventure → 5 Well Rested → 5 Talented → 1 Field Guide",
            "Recovery first, rested support next, then earlier class talent access. The last point helps regular camp contributors."
          ],
          [
            "Crafter who also gathers and cooks",
            "5 Working Overtime → 5 Bountiful Harvest → 5 Master Chef → 1 Thrill of Adventure",
            "Covers skill-ups, scarce gathering resources and extra cooked results; the final point helps when returning to outdoor quests."
          ],
          [
            "Honor and battleground reputation",
            "3 Gourmand → 2 The Quick and the Dead → 5 For Great Honor → 5 Diplomat → 1 Reagent Economy",
            "The opening five Resourcefulness points unlock the Honor/reputation choices. The final perk follows its resurrection-perk prerequisite."
          ]
        ]
      },
      {
        "type": "paragraph",
        "text": "Follow the order rather than selecting only the attractive final perks. The published trees require spending within the same tree, and some perks have a preceding talent linked by an arrow. In the solo plan, Well Rested comes before Talented. In the PvP plan, the first five Resourcefulness points are part of the cost of reaching the Honor and reputation perks."
      },
      {
        "type": "heading",
        "text": "Solo leveling: recovery or earlier class talents?"
      },
      {
        "type": "paragraph",
        "text": "Thrill of Adventure restores health and mana after a qualifying outdoor kill. The published descriptions exclude dungeons, raids and battlegrounds. Choose it first when recovery between ordinary quest fights is your recurring problem; a character mostly leveling inside instances should not expect the same benefit there."
      },
      {
        "type": "paragraph",
        "text": "Well Rested speeds {{term:rested-xp|rested XP}} accumulation and raises its cap. It suits someone who returns to the game between other commitments. Talented brings class talent points forward, which can make an upcoming class choice available earlier. Blizzard describes access up to five levels earlier; it is most relevant while leveling toward those choices."
      },
      {
        "type": "paragraph",
        "text": "The final Field Guide point is useful only if you regularly add camp features. If you rarely contribute to camps, consider a different available perk that addresses your actual routine. Revisit the leveling allocation when your level or activity changes; a convenience for outdoor quests may contribute little to a night spent entirely in dungeons."
      },
      {
        "type": "heading",
        "text": "Professions: match the perk to what you produce"
      },
      {
        "type": "paragraph",
        "text": "Working Overtime improves the chance of a tradeskill skill-up. Bountiful Harvest helps with scarce gathering resources, so its benefit concerns those special results rather than a promise that every ordinary herb or ore stack grows. Master Chef can produce extra cooking results. The sample plan suits a character doing all three activities; a pure gatherer should reconsider spending heavily on crafting perks."
      },
      {
        "type": "paragraph",
        "text": "Dedicated Study is another option for a profession-focused character. Blizzard describes it as a daily tradeskill improvement, with Elemental Essences once the relevant skills are fully developed. The published trees place it deeper and link it through Bartering. Read those prerequisites before replacing part of the sample plan; the cost is more than just selecting the final perk."
      },
      {
        "type": "paragraph",
        "text": "For an evening of gathering and crafting, choose the benefit you will actually trigger. If your materials are ready and you are working on skill-ups, Working Overtime has a clear use. If you are spending the evening visiting nodes, Bountiful Harvest is the more direct match. Extra cooking results matter when you cook rather than buy all your food."
      },
      {
        "type": "heading",
        "text": "PvP: separate the open world from battlegrounds"
      },
      {
        "type": "paragraph",
        "text": "For Great Honor increases Honor gains, while Diplomat increases reputation gains. Those goals make the Resourcefulness plan relevant to Honor progression and battleground reputations. Gourmand and The Quick and the Dead supply food duration and recovery conveniences on the way to those perks."
      },
      {
        "type": "paragraph",
        "text": "High Alert helps detect stealth outside battlegrounds. That restriction is decisive: do not buy it as a battleground detection upgrade. For outdoor encounters while leveling, its purpose may be more relevant, but spending in Adventure means revising the point budget rather than adding it freely to the full Resourcefulness plan."
      },
      {
        "type": "heading",
        "text": "Make camp perks earn their place"
      },
      {
        "type": "paragraph",
        "text": "Field Guide shortens the feature-placement cooldown; Permanence extends camp benefits; Reagent Economy removes materials from tier-one feature crafting. If you routinely share camp objects, decide whether cooldowns, buff expiry or materials are the inconvenience. Spending for every camp perk at once competes with the other uses of the same 16 points."
      },
      {
        "type": "paragraph",
        "text": "Before an evening outside town, use a camp for its profession buffs, rest in the Cozy Sleeping Bag if you own it, and eat suitable cooked food. Well Rested affects the rested reserve, while the bag has its own stacking XP bonus. Gourmand supports the food part of the routine. Check the active effects after resting so that the perks you chose support how you actually play."
      },
      {
        "type": "link",
        "label": "Choose camping features and understand their buffs",
        "href": "/guides/wow-forever-camping-guide"
      },
      {
        "type": "link",
        "label": "Get the Cozy Sleeping Bag on your leveling route",
        "href": "/guides/wow-forever-cozy-sleeping-bag"
      },
      {
        "type": "heading",
        "text": "Reset at a trainer, with the price checked first"
      },
      {
        "type": "paragraph",
        "text": "Wowhead and Method report that you can {{term:respec|respec}} Legacy points at a class trainer; Method specifies a major city. Their price information is beta-era, and the live fee and repeated-reset scaling remain unconfirmed. Visit the trainer and read the offered cost before committing to a plan that depends on frequent resets."
      },
      {
        "type": "faq",
        "entries": [
          {
            "q": "How do I unlock Legacy talents?",
            "a": "Earn your first Legacy Point. Blizzard names level 25, skill 150 in a non-gathering primary tradeskill, or full world exploration as routes to that first point. Then open the Legacy shield icon."
          },
          {
            "q": "Do I need alts to earn 16 Legacy points?",
            "a": "No. Blizzard lists up to 29 possible points on one character across leveling, eligible tradeskills, PvP, Adventure, dungeons and raids. Each character can spend 16 at launch."
          },
          {
            "q": "Are Legacy points spent separately on each character?",
            "a": "Yes. Earned points are account-wide for non-Hardcore characters, and each character chooses its own allocation independently."
          },
          {
            "q": "Which Legacy talents should a solo leveler take first?",
            "a": "Thrill of Adventure is a practical first choice when outdoor recovery is slowing you down. Well Rested suits play with breaks between outings. The recovery perk's published restrictions exclude dungeons, raids and battlegrounds."
          },
          {
            "q": "Can I reset Legacy talents?",
            "a": "Wowhead and Method report a reset at a class trainer, with Method specifying a major city. The live cost and repeat-reset pricing remain unconfirmed; check the trainer before resetting."
          },
          {
            "q": "Does Well Rested increase all XP I earn?",
            "a": "Blizzard describes faster rested-experience accumulation and a higher rested cap. That is separate from the Cozy Sleeping Bag's percentage experience bonus."
          }
        ]
      },
      {
        "type": "link",
        "label": "Start with the WoW Forever beginner guide",
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
    "hash": "9ae8789d2009a95c3ed1a3228bcef1ec5fa6ed4af689e40f297e297d8307dc8b",
    "previousVersion": 0
  },
  {
    "game": "forever",
    "terms": [
      {
        "key": "quest-guidance",
        "name": "Quest guidance",
        "text": "Quest points of interest and objective areas shown on the map. Enhanced enables these by default; Classic starts with them off.",
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
        "label": "Blizzard: New Player's Starter Guide",
        "url": "https://news.blizzard.com/en-us/article/24315280/new-players-starter-guide-welcome-to-world-of-warcraft-forever",
        "accessed": "2026-11-09"
      },
      {
        "label": "Blizzard: Get to Know the Legacy System",
        "url": "https://news.blizzard.com/en-us/article/24307383/get-to-know-the-world-of-warcraft-forever-legacy-system",
        "accessed": "2026-11-09"
      },
      {
        "label": "Warcraft Tavern: Cozy Sleeping Bag Guide",
        "url": "https://www.warcrafttavern.com/forever/guides/cozy-sleeping-bag/",
        "accessed": "2026-11-09"
      }
    ],
    "asOf": {
      "date": "2026-11-09",
      "build": "Forever launch announcements and November 2026 guides",
      "note": "Blizzard launch and starter-guide defaults. Individual settings remain changeable; this comparison makes no performance or difficulty claim."
    },
    "kind": "guide",
    "slug": "wow-forever-enhanced-vs-classic-preset",
    "locale": "en",
    "title": "WoW Forever Enhanced or Classic: Which Preset?",
    "description": "Choose Enhanced or Classic with the six confirmed setting differences, then adjust quest guidance, bags and character appearance later.",
    "tier": null,
    "prerequisite": null,
    "blocks": [
      {
        "type": "paragraph",
        "text": "Game Menu > Options lets you change your starting settings after the first login. For WoW Forever Enhanced or Classic, choose Enhanced if you are unsure: Blizzard recommends it, and it starts with quest guidance and several interface conveniences enabled."
      },
      {
        "type": "paragraph",
        "text": "Choose Classic if you already know you want less automatic guidance and the older visual style. The useful decision is how much help and which presentation you want while exploring. You can keep the parts you like and change the others after entering the world."
      },
      {
        "type": "heading",
        "text": "The six starting settings that differ"
      },
      {
        "type": "paragraph",
        "text": "The Experience Preset screen appears before ruleset selection on your first login. Blizzard lists these defaults for each choice. Use the table to identify the setting behind a preference rather than treating every part of a preset as a package you must keep."
      },
      {
        "type": "table",
        "caption": "Classic and Enhanced starting settings",
        "columns": [
          "Setting",
          "Classic",
          "Enhanced"
        ],
        "rows": [
          [
            "Character models",
            "Standard Definition (SD)",
            "High Definition (HD)"
          ],
          [
            "Quest points of interest and objective areas",
            "Off",
            "On"
          ],
          [
            "One-bag inventory",
            "Off",
            "On"
          ],
          [
            "Transmog",
            "Off",
            "On"
          ],
          [
            "Default keyboard movement binds",
            "Camera turning",
            "Strafing"
          ],
          [
            "Screen UI layout",
            "Classic layout",
            "Centralized layout"
          ]
        ]
      },
      {
        "type": "heading",
        "text": "Change the setting that is getting in your way"
      },
      {
        "type": "paragraph",
        "text": "If finding quest destinations is frustrating, start with {{term:quest-guidance|quest guidance}}. Enhanced enables points of interest and objective areas on the map. Keeping that guidance on is a reasonable choice when you want to spend your evening on the quests themselves. Turn it off if discovering the destination from the quest text is part of the experience you want."
      },
      {
        "type": "paragraph",
        "text": "Next consider bags. Enhanced starts with one-bag enabled, which gathers the inventory into one view. That can make it easier to check what you brought before leaving town. If you prefer separate bags, change that setting without also changing the character models or quest guidance."
      },
      {
        "type": "paragraph",
        "text": "Movement deserves a quick check before fighting. Classic defaults to camera-turning keyboard binds; Enhanced defaults to strafing. Try the controls somewhere safe and keep the behavior you expect. The layout choice likewise gives you a starting arrangement; neither label establishes that one arrangement will suit every player."
      },
      {
        "type": "heading",
        "text": "Switch individual settings through Options"
      },
      {
        "type": "paragraph",
        "text": "Open Game Menu > Options and adjust the individual setting you want. Blizzard says the initial preset-choice screen will not appear again after the first login. You do not need to recreate a character to change these options, and you can combine preferences from both columns."
      },
      {
        "type": "paragraph",
        "text": "For example, keep Enhanced's quest guidance and one-bag view while choosing SD character models. Or start from Classic and enable the map guidance after you have tried questing without it. Change one thing that affects your current activity, try it, and then decide whether another adjustment is useful."
      },
      {
        "type": "heading",
        "text": "HD or SD is a character appearance choice"
      },
      {
        "type": "paragraph",
        "text": "Each time you create a character, you can select HD or SD models and animations. HD supplies the higher-detail look; SD supplies the original-style look. Blizzard states that this character-specific choice affects appearance only, with no change to abilities or progression."
      },
      {
        "type": "paragraph",
        "text": "You can change that choice later in Options or at a Barbershop. Choose the appearance you enjoy seeing while you play. The ruleset is a separate first-login decision, so coordinate that with friends using the beginner guide rather than expecting the visual preset to make the choice for you."
      },
      {
        "type": "heading",
        "text": "Set up for the evening, then head out"
      },
      {
        "type": "paragraph",
        "text": "If your next plan is a camp stop followed by questing, quest guidance and a convenient bag view are practical first settings to try. Pack cooked food and the camp supplies you intend to use. If you already own the Cozy Sleeping Bag, use it during the rest stop; its buff works alongside food and camping benefits."
      },
      {
        "type": "paragraph",
        "text": "Well Rested belongs to the Legacy system and improves rested accumulation and its cap. Choosing Enhanced does not select that perk for you. Pick your interface preferences first, then decide which camp contribution and character perks fit the way you spend the evening."
      },
      {
        "type": "link",
        "label": "Prepare a camp stop before questing",
        "href": "/guides/wow-forever-camping-guide"
      },
      {
        "type": "link",
        "label": "Follow the Cozy Sleeping Bag quest chain",
        "href": "/guides/wow-forever-cozy-sleeping-bag"
      },
      {
        "type": "faq",
        "entries": [
          {
            "q": "Should I choose Enhanced or Classic in WoW Forever?",
            "a": "Start with Enhanced if you are unsure, as Blizzard recommends. Choose Classic when you deliberately want fewer guidance features enabled and the traditional presentation."
          },
          {
            "q": "How do I switch the preset later?",
            "a": "Change its individual settings in Game Menu, then Options. Blizzard says the initial preset-choice screen does not reappear after your first login."
          },
          {
            "q": "Can I use SD models with quest guidance enabled?",
            "a": "Yes. The preset settings can be changed individually, and HD or SD is a character-specific appearance choice that can also be changed later."
          },
          {
            "q": "Does Enhanced make my character stronger?",
            "a": "Blizzard describes the presets as starting presentation and interface settings. The HD/SD character choice affects appearance only, not abilities or progression."
          }
        ]
      },
      {
        "type": "link",
        "label": "Start with the WoW Forever beginner guide",
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
    "hash": "ac92ee35bdbbc4df45e282a8c0b4599419d95534a47d14e3f355349cbc26504c",
    "previousVersion": 0
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
        "type": "link",
        "label": "Compare Enhanced and Classic settings",
        "href": "/guides/wow-forever-enhanced-vs-classic-preset"
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
        "type": "link",
        "label": "Choose camping features and buffs",
        "href": "/guides/wow-forever-camping-guide"
      },
      {
        "type": "link",
        "label": "Find the Cozy Sleeping Bag for your camp stops",
        "href": "/guides/wow-forever-cozy-sleeping-bag"
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
        "type": "link",
        "label": "Plan your first Legacy points",
        "href": "/guides/wow-forever-legacy-talents"
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
    "hash": "7b3b0d8b321901fe36707600526c993e1bfd79b191cbc063b9fb134d48d53cb5",
    "previousVersion": 2,
    "previousTitle": "WoW Forever Beginner Guide: Your First Character and First Steps",
    "previousBody": {
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
      "hero": {
        "image": "d4210a19bdb180da",
        "alt": "Dozens of new level 1 characters crowding the Valley of Trials in Durotar on WoW Forever launch day"
      },
      "items": [],
      "topics": [],
      "hash": "0d658004d9806f4c014bad674bfae409ab3695f2f9931c67e5bf1bb585b8a239",
      "editorialRevision": "forever-editorial-2026-11-06",
      "build": null
    }
  }
]
$guides$::jsonb)
  LOOP
    -- Retired markers also count: replay must preserve a later owner's publication or draft.
    IF EXISTS (SELECT 1 FROM content.paths WHERE kind = 'guide' AND slug = guide->>'slug'
        AND locale = 'en' AND body->>'editorialRevision' = revision) THEN
      CONTINUE;
    END IF;
    SELECT * INTO current_page FROM content.paths WHERE kind = 'guide'
      AND slug = guide->>'slug' AND locale = 'en' ORDER BY version DESC LIMIT 1;
    IF (guide->>'previousVersion')::integer = 0 THEN
      IF FOUND THEN
        RAISE EXCEPTION 'Systems migration needs review for %: slug already exists', guide->>'slug';
      END IF;
    ELSE
      IF NOT FOUND OR current_page.game <> 'forever' OR current_page.status <> 'published'
          OR current_page.version <> (guide->>'previousVersion')::integer
          OR current_page.title <> guide->>'previousTitle'
          OR current_page.description <> guide->>'description'
          OR current_page.body IS DISTINCT FROM guide->'previousBody' THEN
        RAISE EXCEPTION 'Systems migration needs review for %: publication changed, missing or draft exists', guide->>'slug';
      END IF;
      UPDATE content.paths SET status = 'retired', updated_at = stamp WHERE id = current_page.id;
    END IF;
    INSERT INTO content.paths (game, kind, slug, locale, title, description, version, status,
      body, updated_at, published_at)
    VALUES ('forever', 'guide', guide->>'slug', 'en', guide->>'title', guide->>'description',
      (guide->>'previousVersion')::integer + 1, 'published',
      jsonb_strip_nulls(jsonb_build_object(
        'blocks', guide->'blocks', 'terms', guide->'terms', 'sources', guide->'sources',
        'asOf', guide->'asOf', 'hero', guide->'hero', 'items', '[]'::jsonb,
        'topics', '[]'::jsonb, 'hash', guide->>'hash', 'editorialRevision', revision
      )) || '{"build":null}'::jsonb, stamp, stamp);
  END LOOP;
END $migration$;
