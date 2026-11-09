-- Publish only on an existing English Forever site; preserve all unrelated owner work.
LOCK TABLE content.paths IN SHARE ROW EXCLUSIVE MODE;
DO $migration$
DECLARE
  guide jsonb;
  current_page content.paths%ROWTYPE;
  next_group text;
  stamp bigint := floor(extract(epoch FROM NOW()));
  revision constant text := 'forever-classes-2026-11-09';
BEGIN
  IF EXISTS (SELECT 1 FROM content.editorial_migrations WHERE name = revision) THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM content.paths WHERE kind = 'guide' AND game = 'forever' AND locale = 'en') THEN RETURN; END IF;
  FOR guide IN SELECT value FROM jsonb_array_elements($guides$
[
  {
    "kind": "guide",
    "game": "forever",
    "slug": "wow-forever-warlock-leveling-guide",
    "locale": "en",
    "title": "WoW Forever Warlock Leveling Guide: Affliction",
    "description": "Follow a solo Affliction order for WoW Forever: early talents, demon choices, Soul Shards, mana recovery and which training to buy first.",
    "group": "classes",
    "tier": null,
    "prerequisite": null,
    "blocks": [
      {
        "type": "paragraph",
        "text": "Five points in Improved Corruption make Corruption instant. Our WoW Forever Warlock leveling guide starts there: choose Affliction for solo questing, then build around damage that keeps ticking while your demon takes hits and you recover health."
      },
      {
        "type": "paragraph",
        "text": "Status: talent data checked 2026-11-09 against client build 1.60.1.70862 as published by WoW Forever DB. This is our recommended solo order, not a Blizzard build or a live-client test. Patches may change it. Recheck 2026-11-10, when Blizzard plans pet and Affliction tuning."
      },
      {
        "type": "paragraph",
        "text": "Choose Demonology instead if strengthening the demon itself is the part you enjoy most. Affliction asks you to watch your own health and mana as well as the pet. Its reward is a useful recovery loop: Life Tap buys mana with health, and Drain Life restores health while hurting the enemy."
      },
      {
        "type": "heading",
        "text": "Make Corruption instant before buying comfort"
      },
      {
        "type": "paragraph",
        "text": "Corruption is a {{term:dot|DoT}}, a spell that deals damage over time. Instant Corruption lets you apply it without stopping for its cast, then move or begin another spell while it works. That is the biggest early change to the pace of this solo order; a small damage increase cannot replace the freedom to move."
      },
      {
        "type": "paragraph",
        "text": "Without the Talented Legacy perk, the first point arrives at level 10. Spending five points in Affliction opens row 2; ten opens row 3. The levels below are the earliest normal access, assuming every point goes into Affliction. Talented can move that schedule up to five levels earlier; use your available points and the tree requirements rather than blindly following a character level."
      },
      {
        "type": "table",
        "caption": "First three Affliction rows: what opens and why to take it",
        "columns": [
          "Talent / earliest level",
          "What it does",
          "Our solo priority"
        ],
        "rows": [
          [
            "Row 1: Improved Corruption, 10",
            "Five ranks make Corruption instant and add 10% damage.",
            "Take all five first, at 10–14. Movement and a faster opening matter on every pull."
          ],
          [
            "Row 1: Improved Life Tap, 10",
            "At two ranks, Life Tap returns 20% more mana.",
            "Take after the first drain and damage choices; move it earlier if mana recovery is your main interruption."
          ],
          [
            "Row 1: Suppression, 10",
            "At five ranks: +5% spell hit and 20% less threat.",
            "Move it forward if enemies keep leaving the Voidwalker for you. It helps spells land and reduces how much attention they generate."
          ],
          [
            "Row 2: Grim Reach, 15",
            "Two ranks extend Affliction spell range by 20%.",
            "Later comfort for pulls from farther away. It does not replace recovery or make the pet sturdier."
          ],
          [
            "Row 2: Soul Harvest, 15",
            "Two ranks support mana recovery after a Drain Soul kill.",
            "Take early if you finish enemies with Drain Soul; skipped finishes waste the reason to invest here."
          ],
          [
            "Row 2: Improved Drains, 15",
            "At three ranks, the affected drains improve by 20%: Drain Life, Drain Soul and mana drained by Drain Mana.",
            "Take next after instant Corruption. Better Drain Life supports solo recovery. It no longer improves Wrack."
          ],
          [
            "Row 3: Improved Bane of Agony, 20",
            "At two ranks, Bane of Agony deals 10% more damage.",
            "Take later for targets that live long enough for the spell to work."
          ],
          [
            "Row 3: Fel Concentration, 20",
            "Three ranks help prevent damage from delaying affected casts or shortening channels.",
            "Bring forward if enemies reach you and repeatedly disrupt drains. Partial-rank values need the current in-game tooltip."
          ],
          [
            "Row 3: Amplify Curse, 20",
            "Strengthens the next supported curse; current Bane of Agony behavior is disputed.",
            "Later utility for a difficult target; it is also required for Curse of Exhaustion farther down the tree."
          ],
          [
            "Row 3: Pandemic, 20",
            "Three ranks increase critical damage from the affected DoTs and drains.",
            "Our next damage investment. It improves critical hits, so do not read it as doubling every tick."
          ]
        ]
      },
      {
        "type": "paragraph",
        "text": "Our first 15 points: Improved Corruption 5 at levels 10–14; Improved Drains 3 at 15–17; Soul Harvest 2 at 18–19; Pandemic 3 at 20–22; Improved Life Tap 2 at 23–24. This order favors a solo player who regularly drains for recovery and finishes kills with Drain Soul. If your demon keeps losing enemies, spend on Suppression earlier and accept later access to the other picks."
      },
      {
        "type": "paragraph",
        "text": "{{term:threat|Threat}} is the enemy attention your actions generate. Suppression matters when Corruption and your other spells pull an enemy away from the Voidwalker. More hit also makes spells more reliable. It cannot heal a dying pet: if the Voidwalker is falling over rather than losing attention, reduce the pull and support it instead of expecting a threat talent to solve health loss."
      },
      {
        "type": "paragraph",
        "text": "After those first points, fill the weakness you actually meet: Suppression for lost attention, Improved Bane of Agony for longer fights, or Amplify Curse on the way toward Curse of Exhaustion. Continue toward Malevolence and Nightfall in row 4, then the deeper Affliction recovery tools. There is no need to commit every later point before you know whether your problem is damage, interrupted drains or a struggling demon."
      },
      {
        "type": "paragraph",
        "text": "Amplify Curse’s tooltip includes Bane of Agony, but a current client-data report says a hotfix removed that interaction and has not been checked in game. Do not take it solely for Bane damage while that conflict is unresolved; its route toward Curse of Exhaustion remains the reason to consider it here."
      },
      {
        "type": "paragraph",
        "text": "Tree conflict: Blizzard’s earlier deep dive removed Grim Reach and introduced Malediction. The checked 1.60.1.70862 tree has Grim Reach back in row 2. Follow that row only if your live tree matches; do not search for Malediction just because an older build included it. The older 1.60.1.70755 calculator is a rank cross-check, not proof of the live tree."
      },
      {
        "type": "heading",
        "text": "Keep the Voidwalker for pulls that need a tank"
      },
      {
        "type": "paragraph",
        "text": "The {{term:voidwalker|Voidwalker}} is the practical solo choice when you need a demon to hold an enemy while your spells work. A new summon gives you another tool, not an automatic replacement. Switch for the encounter: a fragile target may reward damage, while a dangerous caster may reward the Felhunter’s utility."
      },
      {
        "type": "table",
        "caption": "Demon choices while leveling",
        "columns": [
          "Demon / availability",
          "Useful job",
          "When to keep or switch"
        ],
        "rows": [
          [
            "Imp, opening levels",
            "Ranged damage before your tank demon.",
            "Keep pulls small and recover between them. Do not expect the Imp to play the Voidwalker’s role."
          ],
          [
            "Voidwalker, level 10 class quest",
            "Takes attention and damage during ordinary solo pulls.",
            "Default for controlled pulls. Send it in before committing your damage."
          ],
          [
            "Sayaad: Succubus or Incubus, level 20 class quest",
            "Damage and, after training the relevant ability, control.",
            "An alternative when you can manage incoming damage yourself. Summoning it does not immediately grant every later control ability."
          ],
          [
            "Felhunter, level 30 class quest",
            "Magic utility; later trained abilities help against casters.",
            "Choose for the tools the fight needs. Keep the Voidwalker when holding the enemy is more useful."
          ]
        ]
      },
      {
        "type": "paragraph",
        "text": "Blizzard increased Voidwalker base health by about 40 at every level on November 6. Further Hunter pet and Voidwalker durability changes are planned for November 10. Until those changes are confirmed live, judge the next pull by the pet’s current health; a promised buff cannot rescue this fight."
      },
      {
        "type": "heading",
        "text": "Collect shards at the end of a fight"
      },
      {
        "type": "paragraph",
        "text": "A {{term:soul-shard|Soul Shard}} is a bag item used by demon summons and other Warlock utility. Finish a suitable enemy with Drain Soul active to replenish them. Ordinary damage ticks can also produce shards, but Blizzard sharply reduced that chance in the November 2 notes; relying on incidental ticks makes your stock less predictable."
      },
      {
        "type": "paragraph",
        "text": "Our starting stock is about five shards for ordinary questing. Carry more before repeated summons or a long trip, and reduce the reserve if unused shards keep crowding out loot. This is a bag-management recommendation, not a spell requirement or a stack limit. Refill on easy kills before leaving town’s surroundings rather than discovering an empty supply during a recovery."
      },
      {
        "type": "paragraph",
        "text": "Keep room for the next shard before starting the finishing channel. Soul bags can reserve space for this supply, but they also occupy a bag slot that could hold general loot. Check the bag’s actual capacity and cost before buying; a larger dedicated bag is useful only if you need that reserve. Do not spend the next trainer visit’s money just to fill it."
      },
      {
        "type": "heading",
        "text": "Life Tap when you have health to spend"
      },
      {
        "type": "paragraph",
        "text": "Start a normal pull by sending the demon to the target, then apply Corruption and Bane of Agony when the enemy will live long enough for their damage. Use Drain Life when you need health. Finish with Drain Soul when you need shards or want Soul Harvest’s recovery. Avoid refreshing a DoT on an enemy already about to die; spend that mana on the next pull."
      },
      {
        "type": "paragraph",
        "text": "Life Tap is a trade between two bars. Tap while the demon is holding the enemy and your health has room to fall, then recover with Drain Life. When enemies are hitting you, health is also the margin that keeps you alive. Stop tapping if another hit could put you in trouble, use your Healthstone if needed, and eat or drink after a bad pull rather than forcing the cycle."
      },
      {
        "type": "paragraph",
        "text": "Keep a wand for cheap finishes and carry food and water. Drain Life does damage and heals, but that does not mean every enemy is a safe health refill. If the pet is low and your own bars are empty, recover before starting another fight. An early wand can be bought from another player; you do not have to learn Enchanting just to use one."
      },
      {
        "type": "paragraph",
        "text": "Later Affliction is being retuned: Blizzard relayed launch-week reports that channeling Wrack alone could beat using it alongside DoTs. Its announced November 10 adjustment aims to make the DoTs worthwhile without changing total Affliction damage. That is a reported problem and a planned fix, not a measured rotation recommendation for the live build."
      },
      {
        "type": "heading",
        "text": "Fear needs somewhere safe for the enemy to run"
      },
      {
        "type": "paragraph",
        "text": "If a second enemy joins, let the Voidwalker hold one while Fear removes the other from immediate contact. Look behind the fleeing target: Fear into another camp can turn a recoverable pull into a larger one. Keep an exit toward cleared ground, especially indoors or near tightly packed enemies."
      },
      {
        "type": "paragraph",
        "text": "Howl of Terror helps when several enemies close in. Use the space it creates to recover or leave; do not spend the escape window adding more damage to a pull you cannot finish. Drain Life is recovery during a manageable fight. Fear, Howl and a Healthstone are the tools to reach for when the fight stops being manageable."
      },
      {
        "type": "heading",
        "text": "Buy training for the fights you are actually doing"
      },
      {
        "type": "list",
        "items": [
          "At the class trainer, prioritize the damage and recovery spells you use on ordinary pulls: Corruption, Bane of Agony, Drain Life, Life Tap and Drain Soul, plus your available defensive utility. Check the new spell on your action bar after training; newly learned spells are not automatically placed there.",
          "Budget separately for pet Grimoires. Blizzard’s November 2 training totals explicitly account for buying them. Check the demon and ability named on a book before spending, and favor the demon you currently use. A new demon summon and its trained abilities are separate purchases to plan around.",
          "Keep enough for supplies and the next useful spell rank before shopping for optional gear. Tailoring and Enchanting suit cloth crafts and wands; gathering is an alternative when training money matters more than crafting your own equipment."
        ]
      },
      {
        "type": "paragraph",
        "text": "A {{term:grimoire|Grimoire}} teaches a demon ability. Check the ability afterward and decide whether you want it automatic or under your control. A control spell used at the wrong moment can be less useful than one saved for the dangerous enemy. Revisit pet training when its job changes, rather than buying every book simply because it is available."
      },
      {
        "type": "faq",
        "entries": [
          {
            "q": "What is the best Warlock leveling spec in WoW Forever?",
            "a": "Our solo recommendation is Affliction for its DoTs and Life Tap/Drain Life recovery loop. Choose Demonology if investing in the demon is the playstyle you prefer. This is a practical recommendation, not a timed leveling result."
          },
          {
            "q": "Which talents should I take first?",
            "a": "Start with five points in Improved Corruption for instant Corruption. Our normal solo order then takes Improved Drains, Soul Harvest, Pandemic and Improved Life Tap. Move Suppression earlier if your Voidwalker cannot keep attention; check the live tree against build 1.60.1.70862."
          },
          {
            "q": "Which demon should I use for solo leveling?",
            "a": "Use the Voidwalker for pulls where a tank is most helpful. The Imp covers the opening; the Sayaad and Felhunter add alternatives later. Choose from abilities you have actually trained, rather than replacing the Voidwalker solely because another demon unlocked."
          },
          {
            "q": "How do I get Soul Shards, and how many should I carry?",
            "a": "Finish enemies with Drain Soul active. Start with about five shards as a questing reserve, then adjust for your summon use and bag space. Damage ticks can give shards too, but their chance was reduced before launch."
          },
          {
            "q": "Do I need to buy Grimoires in Forever?",
            "a": "Yes. Blizzard’s November 2 notes explicitly account for their expected cost in Warlock training. Check which demon and ability each book teaches, and buy for the demon you are using before optional upgrades."
          }
        ]
      },
      {
        "type": "link",
        "label": "New to Forever? Start with your first character",
        "href": "/guides/wow-forever-beginners-guide"
      },
      {
        "type": "link",
        "label": "Compare classes for the journey to 60",
        "href": "/guides/best-leveling-class-wow-forever"
      },
      {
        "type": "link",
        "label": "Compare survival tools for solo play",
        "href": "/guides/best-solo-class-wow-forever"
      },
      {
        "type": "link",
        "label": "Choose professions that suit your class",
        "href": "/guides/wow-forever-best-professions-for-each-class"
      },
      {
        "type": "link",
        "label": "Check how Legacy talents change your next character",
        "href": "/guides/wow-forever-legacy-talents"
      },
      {
        "type": "link",
        "label": "Learn Hunter pet care and threat",
        "href": "/guides/wow-forever-hunter-pet-guide"
      },
      {
        "type": "link",
        "label": "Find more WoW Forever guides",
        "href": "/forever"
      }
    ],
    "terms": [
      {
        "key": "dot",
        "name": "Damage over time (DoT)",
        "text": "A spell that keeps dealing damage in repeated ticks after it is applied, such as Corruption or Bane of Agony.",
        "source": "https://news.blizzard.com/en-gb/article/24310968/world-of-warcraft-forever-class-deep-dives-rogue-and-warlock"
      },
      {
        "key": "threat",
        "name": "Threat",
        "text": "The attention generated by damage, healing and other actions. An enemy can leave your demon to attack you when your actions attract more attention.",
        "source": "https://wowfdb.com/classes/warlock/affliction/talents/"
      },
      {
        "key": "voidwalker",
        "name": "Voidwalker",
        "text": "The Warlock demon used to take enemy attention and hits during solo pulls. Its survival and threat still need watching.",
        "source": "https://wowfdb.com/classes/warlock/affliction/leveling/"
      },
      {
        "key": "soul-shard",
        "name": "Soul Shard",
        "text": "A resource kept in your bags for demon summons and other Warlock utility. Drain Soul can replenish it when an eligible enemy dies during the channel.",
        "source": "https://wowfdb.com/classes/warlock/affliction/leveling/"
      },
      {
        "key": "grimoire",
        "name": "Grimoire",
        "text": "A purchased book for training a demon ability. Warlock class training costs account for the separate cost of these pet books.",
        "source": "https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-november-2/2360696/9"
      }
    ],
    "sources": [
      {
        "label": "Blizzard: Warlock class deep dive",
        "url": "https://news.blizzard.com/en-gb/article/24310968/world-of-warcraft-forever-class-deep-dives-rogue-and-warlock",
        "accessed": "2026-11-09"
      },
      {
        "label": "WoW Forever DB: Affliction talents, build 1.60.1.70862",
        "url": "https://wowfdb.com/classes/warlock/affliction/talents/",
        "accessed": "2026-11-09"
      },
      {
        "label": "Forever Ever: Amplify Curse hotfix-data conflict",
        "url": "https://wowdata.app/",
        "accessed": "2026-11-09"
      },
      {
        "label": "WoW Forever DB: talent point progression",
        "url": "https://wowfdb.com/talents/",
        "accessed": "2026-11-09"
      },
      {
        "label": "ForeverCalc: older beta rank cross-check",
        "url": "https://forevercalc.com/warlock/",
        "accessed": "2026-11-09"
      },
      {
        "label": "WoW Forever Talent: Warlock tree cross-check",
        "url": "https://wowforevertalent.com/warlock/",
        "accessed": "2026-11-09"
      },
      {
        "label": "WoW Forever DB: Affliction leveling",
        "url": "https://wowfdb.com/classes/warlock/affliction/leveling/",
        "accessed": "2026-11-09"
      },
      {
        "label": "Icy Veins: Affliction leveling",
        "url": "https://www.icy-veins.com/wow-forever/affliction-warlock-leveling/",
        "accessed": "2026-11-09"
      },
      {
        "label": "WoW Forever Leveling: Warlock guide",
        "url": "https://wowforeverleveling.com/guides/warlock-leveling-guide-wow-forever",
        "accessed": "2026-11-09"
      },
      {
        "label": "Blizzard: November 2 development notes",
        "url": "https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-november-2/2360696/9",
        "accessed": "2026-11-09"
      },
      {
        "label": "Blizzard: November 6 hotfixes",
        "url": "https://news.blizzard.com/en-gb/article/24315281/wow-forever-hotfixes-november-6-2026",
        "accessed": "2026-11-09"
      },
      {
        "label": "Blizzard: planned November 10 class tuning",
        "url": "https://us.forums.blizzard.com/en/wow/t/class-tuning-incoming-november-10/2404092/1",
        "accessed": "2026-11-09"
      }
    ],
    "asOf": {
      "date": "2026-11-09",
      "build": "1.60.1.70862 talent data; November 6 hotfixes",
      "note": "Recommended solo order, not live-client testing. Grim Reach conflicts with the earlier deep dive. November 10 pet and Affliction changes are planned; recheck on that date or after an earlier patch."
    },
    "items": [],
    "topics": [],
    "previousVersion": 0,
    "hash": "0182b96731efe7b2b4df170f63a85a2d7f55c5116beb2f1bf8410044d5d29c89"
  },
  {
    "kind": "guide",
    "game": "forever",
    "slug": "wow-forever-hunter-pet-guide",
    "locale": "en",
    "title": "WoW Forever Hunter Pets: Leveling and Care",
    "description": "Choose a leveling pet in WoW Forever, find checked early tames, learn feeding and training, and fix Growl and threat before replacing your pet.",
    "group": "classes",
    "tier": null,
    "prerequisite": null,
    "blocks": [
      {
        "type": "paragraph",
        "text": "Bear Swipe hits three nearby targets, giving a solo Hunter a way to put pet damage on more than one enemy. For WoW Forever hunter pets, our first leveling choice is a Bear; choose a Boar if you want Charge to help start a pull, or keep a Cat when pet damage matters more than handling extra enemies."
      },
      {
        "type": "paragraph",
        "text": "Status: Forever sources checked 2026-11-09. Blizzard plans Hunter pet durability changes for November 10; they are not treated as live here. Recheck 2026-11-10, or sooner if a patch changes pet abilities or care."
      },
      {
        "type": "heading",
        "text": "Choose a job before chasing a rare"
      },
      {
        "type": "paragraph",
        "text": "Bears and Boars are forgiving first choices because their broad diets make food easier to carry. A Turtle’s Shell Shield is useful when the pet needs a defensive window. A Wolf’s Furious Howl is more attractive when melee party members can use the attack-power benefit. Pick the problem you want to solve, then train and feed that pet before judging it."
      },
      {
        "type": "table",
        "caption": "Useful pet families for solo leveling",
        "columns": [
          "Family",
          "Checked early tame",
          "Why choose it"
        ],
        "rows": [
          [
            "Bear",
            "Ice Claw Bear, Dun Morogh, beast levels 7–8; Young Forest Bear, Elwynn Forest, 8–9.",
            "Our default for handling extra enemies: Swipe hits nearby targets, and the broad diet simplifies feeding."
          ],
          [
            "Boar",
            "Look for a tameable Boar along your current quest route.",
            "Charge closes on the target and briefly roots it. Broad diet; useful when starting one controlled pull."
          ],
          [
            "Cat",
            "Durotar Tiger, Durotar, beast levels 7–8.",
            "A damage-focused alternative. Choose it when you can handle the incoming pressure; Prowl is the family’s distinctive tool."
          ],
          [
            "Turtle",
            "Choose when a tameable Turtle is available along your route.",
            "Shell Shield reduces damage taken during its defensive window. Consider it if keeping the pet alive is your main difficulty."
          ],
          [
            "Wolf",
            "Choose when a tameable Wolf is available along your route.",
            "Furious Howl helps melee party damage. Check the pet’s actual abilities before choosing it for that buff."
          ]
        ]
      },
      {
        "type": "paragraph",
        "text": "The listed beast levels describe the creatures you will find. You unlock taming later than some of them. Finish the Hunter’s level-10 taming training first; the beast you tame must be at or below your own level."
      },
      {
        "type": "paragraph",
        "text": "Bear and Turtle are pet families, not combat stances. Their abilities do different jobs: Swipe helps with nearby enemies, while Shell Shield protects the Turtle. Neither choice excuses opening on a whole camp. Start with a target your pet can survive, then judge how much attention and healing the next pull needs."
      },
      {
        "type": "heading",
        "text": "Finish the taming lessons, then keep your main pet safe"
      },
      {
        "type": "paragraph",
        "text": "Follow the Hunter trainer’s taming quests through the follow-up training. Getting a temporary quest beast is only part of learning pet care. If you can tame but cannot find Feed Pet, finish the follow-up rather than buying a different kind of food and hoping the button appears."
      },
      {
        "type": "paragraph",
        "text": "Use a Stable Master to put away the companion you want to keep before taming another beast. Abandoning a pet is permanent. Keep that distinction in mind when learning an ability from a temporary pet: check which companion is active before removing it, and retrieve your main pet from the stable afterward."
      },
      {
        "type": "paragraph",
        "text": "A newly tamed companion may still need levels, loyalty or ability training. Check its pet spellbook and Beast Training before deciding it is weak. A rare appearance alone tells you little about whether it has the skill you need today. For ordinary leveling, our recommendation is to keep questing with a suitable trained pet instead of waiting for a rare spawn."
      },
      {
        "type": "heading",
        "text": "Feed for happiness; build loyalty by adventuring"
      },
      {
        "type": "paragraph",
        "text": "{{term:happiness|Happiness}} is the pet’s immediate mood and affects its damage. Watch the indicator beside the pet portrait: green is happy, yellow is content and red is unhappy. Feed when it drops from green, and carry food the family accepts before leaving town."
      },
      {
        "type": "list",
        "items": [
          "Leave combat with your living pet nearby.",
          "Use Feed Pet, then select food in your bags that matches its diet.",
          "Let it eat and check the happiness indicator before starting the next pull.",
          "If the food is refused, check the family’s diet and the food’s level. Food far below the pet’s level is a separate problem from the wrong food type."
        ]
      },
      {
        "type": "paragraph",
        "text": "Bears and Boars accept meat, fish, cheese, bread, fungus and fruit. A narrower diet needs more planning: carry food your actual pet accepts, rather than assuming that a stack bought for your previous companion will work. Check the diet in the pet information and restock it during your normal town visit."
      },
      {
        "type": "paragraph",
        "text": "{{term:pet-loyalty|Pet loyalty}} develops as you care for the pet and fight alongside it. It affects the training points available for abilities. Feeding fixes immediate happiness; one meal does not replace the time spent adventuring together. A fresh tame can show few or even negative available training points while its loyalty is low. Keep it fed and use it in ordinary fights before planning expensive training."
      },
      {
        "type": "heading",
        "text": "Learn an ability, then teach it to the right pet"
      },
      {
        "type": "paragraph",
        "text": "{{term:beast-training|Beast Training}} is how you teach pet abilities you have learned. The pet trainer supplies Growl and defensive training; other active abilities can require learning from a tame that already knows them. A family’s ability list does not prove that every beast of that family comes with every rank."
      },
      {
        "type": "list",
        "items": [
          "Stable your main companion, then tame a beast known to carry the ability you need.",
          "Check its pet spellbook. Fight with it and use the ability until the game confirms you have learned it.",
          "Check your Beast Training list before putting that temporary pet away.",
          "Retrieve your main pet and teach the ability if its family, level and training points allow it."
        ]
      },
      {
        "type": "paragraph",
        "text": "Learned abilities must suit the receiving family. If training is unavailable, check those requirements before spending time on another tame. Growl comes from the pet trainer, so you do not need to hunt a rare beast to improve that basic solo tool."
      },
      {
        "type": "paragraph",
        "text": "Some current location tables disagree about which early Wolves teach Furious Howl. Inspect the tamed pet before committing to the learning process. Do not abandon your main pet or take a long trip on the strength of an unchecked teacher list."
      },
      {
        "type": "heading",
        "text": "Pet not holding aggro? Check Growl first"
      },
      {
        "type": "paragraph",
        "text": "{{term:threat|Threat}} is the attention an enemy assigns to your actions and your pet’s actions. {{term:growl|Growl}} adds threat for the pet; Cower reduces it. For solo tanking, make sure Growl is learned, available and set to autocast, and turn Cower off. A damage ability alone does not replace Growl’s job."
      },
      {
        "type": "list",
        "items": [
          "Send the pet in first and let it reach the target before opening with your strongest shots. If you start before contact, the pet has to recover attention from you.",
          "Check Growl in Beast Training and the pet’s ability bar. Visit the pet trainer for available upgrades; learning an ability for yourself and teaching it to this pet are separate checks.",
          "Turn off Cower for solo tanking. If Growl still is not firing, check whether the pet has enough focus, its resource for abilities, and reduce competing automatic attacks while you diagnose it.",
          "Keep your target aligned with the pet’s target. Shooting a second enemy does not make the pet hold it automatically; change the pet’s target deliberately or control the extra enemy.",
          "Watch health as well as attention. Use Mend Pet and smaller pulls when the pet is dying. A durability problem needs a different response from an enemy turning toward you while the pet is still healthy."
        ]
      },
      {
        "type": "paragraph",
        "text": "Blizzard acknowledged that Hunter pets and Voidwalkers were less durable than intended and planned adjustments for November 10 toward Classic Era effectiveness. That announcement confirms a problem and an intention, not the exact new stats or a complete carryover of Era pet mechanics. Keep the next pull conservative until you see the confirmed changes."
      },
      {
        "type": "paragraph",
        "text": "In a dungeon where another player is tanking, turn off Growl so the pet does not compete for the enemy’s attention. For solo recovery, remember that traps work in combat in Forever. Use control to create space instead of adding another target while Mend Pet is already struggling to keep up."
      },
      {
        "type": "heading",
        "text": "Restock food before optional pet hunts"
      },
      {
        "type": "paragraph",
        "text": "At a town stop, check ammunition, your pet’s accepted food, and useful trainer upgrades before spending on optional gear. A new family will still need care. If training money is tight, gathering while questing is a practical alternative to funding a crafting profession immediately; the profession comparison covers those tradeoffs by class."
      },
      {
        "type": "faq",
        "entries": [
          {
            "q": "What is the best Hunter pet for leveling in WoW Forever?",
            "a": "Our first pick is a Bear for Swipe and its broad diet. Choose a Boar for Charge, a Turtle for a defensive ability, or a Cat when pet damage is the priority. These are practical roles, not a measured pet damage tier list."
          },
          {
            "q": "How do I feed my Hunter pet?",
            "a": "Finish the pet-training follow-up, leave combat, use Feed Pet and select suitable food from your bags. Check both the family’s diet and the food’s level if it refuses. Watch the happiness indicator to see whether it needs more care."
          },
          {
            "q": "How does pet training work?",
            "a": "Learn Growl and available training from a pet trainer. For abilities learned from beasts, stable your companion, tame a teacher, use its ability until learned, then teach it through Beast Training to a compatible pet with the required level and points."
          },
          {
            "q": "Why is my pet not holding aggro?",
            "a": "Check Growl training and autocast, turn off Cower, and send the pet in before you shoot. Give it enough focus to use Growl and attack its target. If the pet is dying, reduce the pull and heal it; threat settings cannot fix insufficient health."
          },
          {
            "q": "Do I need a rare pet to level well?",
            "a": "No rare is required by this recommendation. Start with an accessible family that does the job, keep it fed and train its abilities. Check the individual beast’s abilities before choosing a replacement; appearance or rarity alone is not a reason to abandon a working companion."
          }
        ]
      },
      {
        "type": "link",
        "label": "New to Forever? Start with your first character",
        "href": "/guides/wow-forever-beginners-guide"
      },
      {
        "type": "link",
        "label": "Compare classes for the journey to 60",
        "href": "/guides/best-leveling-class-wow-forever"
      },
      {
        "type": "link",
        "label": "Compare survival tools for solo play",
        "href": "/guides/best-solo-class-wow-forever"
      },
      {
        "type": "link",
        "label": "Choose professions that suit your class",
        "href": "/guides/wow-forever-best-professions-for-each-class"
      },
      {
        "type": "link",
        "label": "Check how Legacy talents change your next character",
        "href": "/guides/wow-forever-legacy-talents"
      },
      {
        "type": "link",
        "label": "Learn the Affliction solo leveling order",
        "href": "/guides/wow-forever-warlock-leveling-guide"
      },
      {
        "type": "link",
        "label": "Find more WoW Forever guides",
        "href": "/forever"
      }
    ],
    "terms": [
      {
        "key": "happiness",
        "name": "Pet happiness",
        "text": "The pet’s current mood, shown beside its portrait, which affects damage. Feed suitable food when happiness falls.",
        "source": "https://www.zockify.com/forever/hunter/feed-pet/"
      },
      {
        "key": "pet-loyalty",
        "name": "Pet loyalty",
        "text": "A longer-term bond built through care and fighting together. Higher loyalty makes more training points available.",
        "source": "https://www.warcrafttavern.com/forever/guides/hunter-pet-abilities/"
      },
      {
        "key": "beast-training",
        "name": "Beast Training",
        "text": "The Hunter ability used to teach learned skills to a pet. The pet must meet the family, level and training-point requirements.",
        "source": "https://www.warcrafttavern.com/forever/guides/hunter-pet-abilities/"
      },
      {
        "key": "threat",
        "name": "Threat",
        "text": "Enemy attention generated by attacks and abilities. For solo pulls, the pet needs enough of it to keep the enemy attacking the pet.",
        "source": "https://wowfdb.com/classes/hunter/pets/"
      },
      {
        "key": "growl",
        "name": "Growl",
        "text": "A pet ability learned through the pet trainer and taught with Beast Training. It adds threat, helping the pet hold enemies during solo fights.",
        "source": "https://www.warcrafttavern.com/forever/guides/hunter-pet-abilities/"
      }
    ],
    "sources": [
      {
        "label": "Blizzard: Hunter class deep dive",
        "url": "https://news.blizzard.com/en-gb/article/24301515/world-of-warcraft-forever-class-deep-dives-hunter-and-druid",
        "accessed": "2026-11-09"
      },
      {
        "label": "Blizzard: planned November 10 class tuning",
        "url": "https://us.forums.blizzard.com/en/wow/t/class-tuning-incoming-november-10/2404092/1",
        "accessed": "2026-11-09"
      },
      {
        "label": "WoW Forever DB: Hunter pet care and families",
        "url": "https://wowfdb.com/classes/hunter/pets/",
        "accessed": "2026-11-09"
      },
      {
        "label": "Mobalytics: Forever pet families and early locations",
        "url": "https://mobalytics.gg/wow-forever/guides/hunter-pets",
        "accessed": "2026-11-09"
      },
      {
        "label": "Zockify: Feed Pet, happiness and diets",
        "url": "https://www.zockify.com/forever/hunter/feed-pet/",
        "accessed": "2026-11-09"
      },
      {
        "label": "Zockify: Forever pet controls, focus and Growl",
        "url": "https://www.zockify.com/forever/hunter/pets/",
        "accessed": "2026-11-09"
      },
      {
        "label": "Warcraft Tavern: Forever pet loyalty and training",
        "url": "https://www.warcrafttavern.com/forever/guides/hunter-pet-abilities/",
        "accessed": "2026-11-09"
      },
      {
        "label": "allthings.how: Forever pet families and diets",
        "url": "https://allthings.how/wow-forever-hunter-pets/",
        "accessed": "2026-11-09"
      }
    ],
    "asOf": {
      "date": "2026-11-09",
      "build": "Forever class announcement and pet guides checked November 9",
      "note": "Family choices are editorial advice. Only matching two-source tame records are listed. November 10 durability changes remain planned; early Wolf ability teachers disagree. Recheck November 10."
    },
    "items": [],
    "topics": [],
    "previousVersion": 0,
    "hash": "b447fa11466ca7ce85e2ad136aae9751ad9e7927ed7e8417c0fea0070f22966d"
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
      },
      {
        "label": "Blizzard: November 6 hotfixes",
        "url": "https://news.blizzard.com/en-gb/article/24315281/wow-forever-hotfixes-november-6-2026",
        "accessed": "2026-11-09"
      },
      {
        "label": "Blizzard: planned November 10 class tuning",
        "url": "https://us.forums.blizzard.com/en/wow/t/class-tuning-incoming-november-10/2404092/1",
        "accessed": "2026-11-09"
      }
    ],
    "asOf": {
      "date": "2026-11-09",
      "build": "1.60.1.70790 / 1.60.1.70862",
      "note": "FORECAST from beta and client data, not measured live runs or solo clears. Rechecked November 9 with November 6 hotfixes; November 10 pet and Affliction changes remain planned. Recheck November 10."
    },
    "kind": "guide",
    "slug": "best-leveling-class-wow-forever",
    "locale": "en",
    "title": "Best Leveling Class in WoW Forever: Hunter First",
    "description": "Beast Mastery Hunter is the first leveling pick to consider. Compare its petless start and upkeep with Warlock recovery and Frost Mage control.",
    "tier": null,
    "prerequisite": null,
    "blocks": [
      {
        "type": "paragraph",
        "text": "Beast Mastery Hunter is the first class to consider for mostly solo leveling in WoW Forever. Its pet takes the hits from level 10, and travel tools help between fights. Choose Affliction Warlock if you prefer managing health and mana to buying ammunition and pet food; choose Frost Mage if you enjoy keeping enemies at a distance with slows and roots."
      },
      {
        "type": "paragraph",
        "text": "FORECAST: these class recommendations still rely on beta and client-data comparisons, not measured live 1–60 runs or verified solo dungeon clears. Sources rechecked 2026-11-09. Blizzard’s November 6 hotfix added about 40 base health to the Voidwalker at every level and fixed Soul Siphon making Wrack amplify itself."
      },
      {
        "type": "paragraph",
        "text": "Status: Blizzard plans Hunter pet and Voidwalker durability changes for November 10. It also relayed launch-week reports that Wrack alone could outperform Affliction’s DoTs and announced adjustments to make those spells worthwhile together. Those changes are planned, not confirmed live. Recheck 2026-11-10 before changing the recommendation."
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
      },
      {
        "type": "link",
        "label": "Follow an Affliction solo talent and resource order",
        "href": "/guides/wow-forever-warlock-leveling-guide"
      },
      {
        "type": "link",
        "label": "Choose, feed and train a Hunter pet",
        "href": "/guides/wow-forever-hunter-pet-guide"
      },
      {
        "type": "link",
        "label": "Find more WoW Forever guides",
        "href": "/forever"
      }
    ],
    "topics": [],
    "items": [],
    "previousTitle": "Best Leveling Class in WoW Forever: Hunter or an Alternative?",
    "previousVersion": 2,
    "hash": "e5c2a5d25f19ecdd8dbb5ed9363ef9174aeef5373184d9d9848e391d2931d2fc",
    "previousDescription": "Beast Mastery Hunter is the first leveling pick to consider. Compare its petless start and upkeep with Warlock recovery and Frost Mage control.",
    "group": "classes",
    "previousBody": {
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
      "items": [],
      "topics": [],
      "hash": "303b20931409b1c80a760d06b7d2bb957b56aa665b2258e05c05cb45e99f2d6d",
      "editorialRevision": "forever-editorial-2026-11-06",
      "build": null
    }
  },
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
      },
      {
        "key": "voidwalker",
        "name": "Voidwalker",
        "text": "The Warlock demon used to hold an enemy’s attention and take hits while the Warlock casts. Pet health and threat still need watching.",
        "source": "https://wowfdb.com/tier-lists/solo-pve/"
      },
      {
        "key": "soul-shard",
        "name": "Soul Shard",
        "text": "A bag resource spent on demon summons and other Warlock utility. Carrying and replenishing them is part of solo Warlock upkeep.",
        "source": "https://wowfdb.com/tier-lists/solo-pve/"
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
      },
      {
        "label": "Blizzard: November 6 hotfixes",
        "url": "https://news.blizzard.com/en-gb/article/24315281/wow-forever-hotfixes-november-6-2026",
        "accessed": "2026-11-09"
      },
      {
        "label": "Blizzard: planned November 10 class tuning",
        "url": "https://us.forums.blizzard.com/en/wow/t/class-tuning-incoming-november-10/2404092/1",
        "accessed": "2026-11-09"
      }
    ],
    "asOf": {
      "date": "2026-11-09",
      "build": "1.60.1.70790 / 1.60.1.70862",
      "note": "FORECAST from beta and client data, not measured live runs or solo clears. Rechecked November 9 with November 6 hotfixes; November 10 pet and Affliction changes remain planned. Recheck November 10."
    },
    "kind": "guide",
    "slug": "best-solo-class-wow-forever",
    "locale": "en",
    "title": "Best Solo Class in WoW Forever: Warlock First",
    "description": "Start with Affliction Warlock for self-sufficient solo play, then compare Hunter, Paladin and Mage by recovery, safety and control.",
    "tier": null,
    "prerequisite": null,
    "blocks": [
      {
        "type": "paragraph",
        "text": "Affliction Warlock is the starting point for a self-sufficient solo character in WoW Forever: damage over time, a demon and health-to-mana tools work together to keep fights going. Prefer Beast Mastery Hunter if you want a pet to take the hits while you shoot, Protection Paladin if surviving packs matters more than speed, or Frost Mage if you enjoy controlling distance."
      },
      {
        "type": "paragraph",
        "text": "FORECAST: these class recommendations still rely on beta and client-data comparisons, not measured live 1–60 runs or verified solo dungeon clears. Sources rechecked 2026-11-09. Blizzard’s November 6 hotfix added about 40 base health to the Voidwalker at every level and fixed Soul Siphon making Wrack amplify itself."
      },
      {
        "type": "paragraph",
        "text": "Status: Blizzard plans Hunter pet and Voidwalker durability changes for November 10. It also relayed launch-week reports that Wrack alone could outperform Affliction’s DoTs and announced adjustments to make those spells worthwhile together. Those changes are planned, not confirmed live. Recheck 2026-11-10 before changing the recommendation."
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
        "text": "The {{term:voidwalker|Voidwalker}} tanks a target while your damage-over-time spells work. Fear controls another enemy, Howl of Terror helps when several get close, and you make your own Healthstones for healing. The cost is attention: you carry {{term:soul-shard|Soul Shards}}, watch the pet and manage your health in cloth armor."
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
      },
      {
        "type": "link",
        "label": "Follow an Affliction solo talent and resource order",
        "href": "/guides/wow-forever-warlock-leveling-guide"
      },
      {
        "type": "link",
        "label": "Choose, feed and train a Hunter pet",
        "href": "/guides/wow-forever-hunter-pet-guide"
      },
      {
        "type": "link",
        "label": "Find more WoW Forever guides",
        "href": "/forever"
      }
    ],
    "topics": [],
    "items": [],
    "previousTitle": "Best Solo Class in WoW Forever: Choose Your Tradeoff",
    "previousVersion": 2,
    "hash": "1355382cb76a8ad8c13aa1c5a012e25ec6aed1b91dadc3eb04e195fd261534bf",
    "previousDescription": "Start with Affliction Warlock for self-sufficient solo play, then compare Hunter, Paladin and Mage by recovery, safety and control.",
    "group": "classes",
    "previousBody": {
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
      "items": [],
      "topics": [],
      "hash": "f69e40699700759b27600056ac962132b70597a7aa5d20860f122c557607b82f",
      "editorialRevision": "forever-editorial-2026-11-06",
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
        RAISE EXCEPTION 'Class guides migration needs review for %: slug already exists', guide->>'slug';
      END IF;
      next_group := guide->>'group';
    ELSE
      IF NOT FOUND OR current_page.game <> 'forever' OR current_page.status <> 'published'
          OR current_page.version <> (guide->>'previousVersion')::integer
          OR current_page.title <> guide->>'previousTitle'
          OR current_page.description <> guide->>'previousDescription'
          OR current_page.body IS DISTINCT FROM guide->'previousBody'
          OR current_page.guide_group IS NULL
          OR EXISTS (SELECT 1 FROM content.paths WHERE kind = 'guide'
            AND slug = guide->>'slug' AND locale = 'en' AND status = 'draft') THEN
        RAISE EXCEPTION 'Class guides migration needs review for %: missing or changed publication or draft', guide->>'slug';
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
