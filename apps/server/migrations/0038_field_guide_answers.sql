-- Reviewed English publications. Preserve the current row's item data and build.
LOCK TABLE content.paths IN SHARE ROW EXCLUSIVE MODE;
DO $migration$
DECLARE
  guide jsonb;
  current_page content.paths%ROWTYPE;
  stamp bigint := floor(extract(epoch FROM NOW()));
  revision constant text := 'field-guide-answers-2026-11-18';
BEGIN
  FOR guide IN SELECT value FROM jsonb_array_elements($guides$
[
  {
    "game": "forever",
    "group": "addons",
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
      },
      {
        "label": "Forever Layer Hop project and Forever releases",
        "url": "https://www.curseforge.com/wow/addons/forever-layer-hop",
        "accessed": "2026-11-18"
      },
      {
        "label": "Forever Nodes project and Forever releases",
        "url": "https://www.curseforge.com/wow/addons/forever-nodes",
        "accessed": "2026-11-18"
      }
    ],
    "asOf": {
      "date": "2026-11-18",
      "build": "Forever 1.60.1 addon listings",
      "note": "Authors list Forever support. The file versions in the comparison were checked on November 9. Recheck the selected file after a client update."
    },
    "kind": "guide",
    "slug": "best-wow-forever-addons",
    "title": "WoW Forever Addons for Layers, Mining and Quests",
    "description": "Request a layer invite with Forever Layer Hop, find ore with Forever Nodes and get quest markers with Questie. Choose the right Forever file and folder.",
    "blocks": [
      {
        "type": "paragraph",
        "text": "For a layer invite in WoW Forever, try Forever Layer Hop. For a mining route, use Forever Nodes to see recorded ore locations on your map, or pick Questie for quest markers."
      },
      {
        "type": "heading",
        "text": "Request a layer invite"
      },
      {
        "type": "paragraph",
        "text": "Forever Layer Hop looks for another user who can invite you to a group on the destination layer. Choose a destination with a helper available. An empty listing gives you nobody to invite you."
      },
      {
        "type": "link",
        "label": "Get Forever Layer Hop",
        "href": "https://www.curseforge.com/wow/addons/forever-layer-hop"
      },
      {
        "type": "heading",
        "text": "Find ore for your next mining run"
      },
      {
        "type": "paragraph",
        "text": "Forever Nodes comes with mining locations already marked on the world map. Pick a cluster along your quest route and check the veins as you pass. A pin marks a possible spawn, so the ore may already have been mined."
      },
      {
        "type": "link",
        "label": "Get Forever Nodes",
        "href": "https://www.curseforge.com/wow/addons/forever-nodes"
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
        "text": "Forever’s Enhanced preset already enables quest points of interest and one-bag display. Try those settings first if your only goal is to find objectives or see your bags together. Add an extra tool when you can name the information or arrangement still missing."
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
          },
          {
            "q": "Will these addons work on a WoW private server?",
            "a": "These files target Blizzard’s WoW Forever client. For a private server, check its client version and its own addon instructions. Compatibility with those clients is unverified."
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
        "label": "Browse all Forever guides",
        "href": "/forever"
      }
    ],
    "items": [],
    "locale": "en",
    "tier": null,
    "prerequisite": null,
    "topics": [],
    "previousVersion": 1,
    "previousTitle": "WoW Forever Addons: Picks, Install and Fixes",
    "previousDescription": "Choose checked WoW Forever addons for quests, bags and auctions. Find the right folder, install with CurseForge or manually, and fix missing addons.",
    "previousHash": "c769fc6aac9f3bf077be317eec7e19874190ea56895c6498f8cca5317e38df29",
    "hash": "d4a899c379f15541018dcf452b588e19a7252d0a580e1fbfc8b10120d7e6eed4"
  },
  {
    "game": "forever",
    "group": "classes",
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
      },
      {
        "label": "Petopia Forever family finder",
        "url": "https://www.wow-petopia.com/forever/",
        "accessed": "2026-11-18"
      },
      {
        "label": "Petopia Forever pet abilities and ranks",
        "url": "https://www.wow-petopia.com/forever/abilities.php",
        "accessed": "2026-11-18"
      }
    ],
    "asOf": {
      "date": "2026-11-18",
      "build": "Petopia Forever family and ability listings",
      "note": "Early tame locations were cross-checked on November 9. Petopia identifies its beta records as a work in progress."
    },
    "kind": "guide",
    "slug": "wow-forever-hunter-pet-guide",
    "title": "WoW Forever Hunter Pets: First Tames and Petopia",
    "description": "Choose a Bear or Boar for solo leveling, find early Hunter tames in WoW Forever, and use Petopia to look up the beast that teaches your next ability.",
    "blocks": [
      {
        "type": "paragraph",
        "text": "For solo leveling in WoW Forever, start with a Bear for Swipe or a Boar for Charge. After your level-10 taming lessons, look for a Young Forest Bear in Elwynn Forest or use Petopia Forever to find a beast near you."
      },
      {
        "type": "heading",
        "text": "Find a tame or an ability in Petopia Forever"
      },
      {
        "type": "paragraph",
        "text": "Petopia has a dedicated Forever edition. Choose a family to browse tameable looks, or open Pet Abilities and select the rank you need to find beasts that already know it. Check a rare tame’s entry before making a long trip: some records still come from beta."
      },
      {
        "type": "link",
        "label": "Browse Forever pet families",
        "href": "https://www.wow-petopia.com/forever/"
      },
      {
        "type": "link",
        "label": "Look up a pet ability by rank",
        "href": "https://www.wow-petopia.com/forever/abilities.php"
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
        "label": "Check how Legacy talents change your next character",
        "href": "/guides/wow-forever-legacy-talents"
      },
      {
        "type": "link",
        "label": "Find more WoW Forever guides",
        "href": "/forever"
      }
    ],
    "items": [],
    "locale": "en",
    "tier": null,
    "prerequisite": null,
    "topics": [],
    "previousVersion": 1,
    "previousTitle": "WoW Forever Hunter Pets: Leveling and Care",
    "previousDescription": "Choose a leveling pet in WoW Forever, find checked early tames, learn feeding and training, and fix Growl and threat before replacing your pet.",
    "previousHash": "b447fa11466ca7ce85e2ad136aae9751ad9e7927ed7e8417c0fea0070f22966d",
    "hash": "79cfe7b19ae7bb4f861d1f83bb211332aa63bb4cc919fae1507b9d9745d616bf"
  },
  {
    "game": "forever",
    "group": "classes",
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
        "label": "WoW Forever DB: Affliction talents, build 1.60.1.70959",
        "url": "https://wowfdb.com/classes/warlock/affliction/talents/",
        "accessed": "2026-11-18"
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
      "date": "2026-11-18",
      "build": "Affliction talents, Forever client 1.60.1.70959",
      "note": "The early talent order is a solo recommendation. Recheck ranks and prerequisites when the talent tree changes."
    },
    "kind": "guide",
    "slug": "wow-forever-warlock-leveling-guide",
    "title": "WoW Forever Warlock Leveling Guide: Affliction",
    "description": "Make Corruption instant with your first five Affliction points in WoW Forever. Choose a demon for solo pulls, manage Soul Shards and plan your training.",
    "blocks": [
      {
        "type": "paragraph",
        "text": "Make Corruption instant before buying comfort. For solo Affliction leveling in WoW Forever, spend your first five talent points on Improved Corruption so you can cast it while moving."
      },
      {
        "type": "heading",
        "text": "Your first five talent points"
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
        "text": "Grim Reach appears in row two of the checked tree. Its extra range is worth taking when a longer opening pull helps your route."
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
        "type": "heading",
        "text": "Fear needs somewhere safe for the enemy to run"
      },
      {
        "type": "paragraph",
        "text": "If a second enemy joins, let the Voidwalker hold one while Fear removes the other from immediate contact. Look behind the fleeing target: Fear into another camp can turn a recoverable pull into a larger one. Keep an exit toward cleared ground, especially indoors or near tightly packed enemies."
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
            "a": "Start with five points in Improved Corruption for instant Corruption. Our normal solo order then takes Improved Drains, Soul Harvest, Pandemic and Improved Life Tap. Move Suppression earlier if your Voidwalker cannot keep attention; check the live tree against build 1.60.1.70959."
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
        "label": "Compare survival tools for solo play",
        "href": "/guides/best-solo-class-wow-forever"
      },
      {
        "type": "link",
        "label": "Check how Legacy talents change your next character",
        "href": "/guides/wow-forever-legacy-talents"
      },
      {
        "type": "link",
        "label": "Find more WoW Forever guides",
        "href": "/forever"
      }
    ],
    "items": [],
    "locale": "en",
    "tier": null,
    "prerequisite": null,
    "topics": [],
    "previousVersion": 1,
    "previousTitle": "WoW Forever Warlock Leveling Guide: Affliction",
    "previousDescription": "Follow a solo Affliction order for WoW Forever: early talents, demon choices, Soul Shards, mana recovery and which training to buy first.",
    "previousHash": "0182b96731efe7b2b4df170f63a85a2d7f55c5116beb2f1bf8410044d5d29c89",
    "hash": "20ee00abfcda7d6ff189f7822e12acfe7b6b9e17bb263f7f9567c53b6fb48bfe"
  },
  {
    "game": "forever",
    "group": "professions-gold",
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
      },
      {
        "label": "Enchanted Lute materials in the Forever client catalog",
        "url": "https://playunbored.com/forever/recipes/enchanted-lute",
        "accessed": "2026-11-18"
      }
    ],
    "asOf": {
      "date": "2026-11-18",
      "build": "Forever recipe catalog and November 9 yield estimates",
      "note": "Enchanted Lute materials checked November 18. The disenchant estimates below use the community sample dated November 9."
    },
    "kind": "guide",
    "slug": "wow-forever-enchanting-guide",
    "title": "WoW Forever Enchanting: Start, Disenchant or Sell?",
    "description": "Find Disenchant in the WoW Forever Professions window, decide which gear to sell, and make an Enchanted Lute with one Simple Wood and one Strange Dust.",
    "blocks": [
      {
        "type": "paragraph",
        "text": "Open the Professions window after learning Enchanting and drag Disenchant onto your action bar. For a first camp craft, an Enchanted Lute takes one Simple Wood and one Strange Dust."
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
        "text": "Set aside one Simple Wood and one Strange Dust for the Enchanted Lute. Check the recipe before travelling for training. No trainer visit has been recorded for it in our Forever catalog as of November 18."
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
    "items": [],
    "locale": "en",
    "tier": null,
    "prerequisite": null,
    "topics": [],
    "previousVersion": 2,
    "previousTitle": "WoW Forever Enchanting: Start, Disenchant or Sell?",
    "previousDescription": "Start Enchanting, find Disenchant, compare gear with its dust or essences, and plan the Enchanted Lute and later camp crafts.",
    "previousHash": "2102bde3ec359e4b3be580c4a12adce959a9d4b0bc085479d800ecf6c45ad4b4",
    "hash": "1c4a89a326ec7324df3550708ebc7074976a6639b720d1b8aaa92e8ea72d6073"
  },
  {
    "game": "retail",
    "kind": "guide",
    "slug": "how-to-get-the-grand-expedition-yak",
    "title": "Grand Expedition Yak: Uncle Bigpocket, 120,000 Gold",
    "description": "Buy the Grand Expedition Yak from Uncle Bigpocket in Kun-Lai Summit for 120,000 gold. Compare his cheaper riding yaks before making the trip to Pandaria.",
    "blocks": [
      {
        "type": "paragraph",
        "text": "Take 120,000 gold to Uncle Bigpocket in Kun-Lai Summit, Pandaria, to buy the Grand Expedition Yak in WoW Retail. Choose the expedition yak if you want the vendors who ride with you."
      },
      {
        "type": "heading",
        "text": "What you need first"
      },
      {
        "type": "list",
        "items": [
          "Bring 120,000 gold for the mount.",
          "The reins list Apprentice Riding as a requirement.",
          "Buy the yak once to add it to your account-wide mount collection."
        ]
      },
      {
        "type": "heading",
        "text": "Cheaper yaks from the same vendor"
      },
      {
        "type": "paragraph",
        "text": "Uncle Bigpocket also sells the Grey Riding Yak and the Blonde Riding Yak for 3,000 gold each. Choose one of those for a riding mount if you can do without the vendors."
      },
      {
        "type": "heading",
        "text": "More mounts for gold"
      },
      {
        "type": "link",
        "label": "Mounts you can buy with gold",
        "href": "/collections/wow-mounts-you-can-buy-with-gold"
      },
      {
        "type": "link",
        "label": "Mounts to get first",
        "href": "/collections/top-mounts-to-get-first"
      }
    ],
    "items": [],
    "locale": "en",
    "tier": null,
    "prerequisite": null,
    "topics": [],
    "previousVersion": 2,
    "previousTitle": "How to get the Grand Expedition Yak in WoW",
    "previousDescription": "Where to buy the Grand Expedition Yak, what it costs (120,000 gold), what you need first, and the cheaper yaks sold by the same vendor.",
    "sources": [
      {
        "label": "Blizzard’s Pandaria mount vendor and price list",
        "url": "https://news.blizzard.com/en-us/article/23463728/mists-of-pandaria-mounts-pets-and-more",
        "accessed": "2026-11-18"
      }
    ],
    "asOf": {
      "date": "2026-11-18",
      "build": "Pandaria vendor list and Retail build 12.1.5.70783"
    },
    "previousBlocks": [
      {
        "type": "paragraph",
        "text": "The [[mount:460]] is the mount people mean when they say \"the vendor yak\". It seats three players, and in the game's own words it is \"complete with helpful grummles for all your vendor needs\": the vendors ride along with you."
      },
      {
        "type": "heading",
        "text": "Where to buy it"
      },
      {
        "type": "paragraph",
        "text": "Uncle Bigpocket in Kun-Lai Summit sells it. The price is 120,000 gold. There is no reputation to grind, no achievement and no drop chance: once you have the gold, it is yours."
      },
      {
        "type": "heading",
        "text": "What you need first"
      },
      {
        "type": "list",
        "items": [
          "120,000 gold.",
          "Apprentice Riding: the item lists it as a requirement.",
          "Nothing else. The mount is account-wide, so you buy it once for every character on your account."
        ]
      },
      {
        "type": "heading",
        "text": "Getting the gold together"
      },
      {
        "type": "paragraph",
        "text": "This is a savings goal, not a skill check. Pick a target, put a share of every session's gold aside and leave it there until you reach 120,000."
      },
      {
        "type": "heading",
        "text": "Cheaper yaks from the same vendor"
      },
      {
        "type": "paragraph",
        "text": "Uncle Bigpocket also sells the [[mount:486]] and the [[mount:487]] for 3,000 gold each. They are regular riding mounts without the vendors, a nice first purchase while you save up."
      },
      {
        "type": "heading",
        "text": "More mounts for gold"
      },
      {
        "type": "paragraph",
        "text": "Facts on this page come from the game client's data (build 12.1.5.70783) and the item's in-game tooltip."
      },
      {
        "type": "link",
        "label": "Mounts you can buy with gold",
        "href": "/collections/wow-mounts-you-can-buy-with-gold"
      },
      {
        "type": "link",
        "label": "Mounts to get first",
        "href": "/collections/top-mounts-to-get-first"
      }
    ],
    "previousHero": {
      "kind": "mount",
      "id": 460,
      "alt": "Grand Expedition Yak, a World of Warcraft mount"
    },
    "hash": "036521e6a434e56fe6b6ecf12b5b4dc5ed0ca3754e12188984792a42d611306a"
  }
]
$guides$::jsonb)
  LOOP
    IF EXISTS (SELECT 1 FROM content.paths WHERE kind = 'guide' AND locale = 'en'
        AND slug = guide->>'slug' AND body->>'editorialRevision' = revision) THEN CONTINUE; END IF;
    SELECT * INTO current_page FROM content.paths WHERE kind = 'guide' AND locale = 'en'
      AND slug = guide->>'slug' ORDER BY version DESC LIMIT 1;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF current_page.status <> 'published' OR current_page.game <> guide->>'game'
        OR current_page.version <> (guide->>'previousVersion')::integer
        OR current_page.title <> guide->>'previousTitle'
        OR current_page.description <> guide->>'previousDescription'
        OR (guide ? 'previousHash' AND current_page.body->>'hash' IS DISTINCT FROM guide->>'previousHash')
        OR (guide ? 'previousHero' AND current_page.body->'hero' IS DISTINCT FROM guide->'previousHero')
        OR (guide ? 'previousBlocks' AND current_page.body->'blocks' IS DISTINCT FROM guide->'previousBlocks')
        OR EXISTS (SELECT 1 FROM content.paths WHERE kind = 'guide' AND locale = 'en'
          AND slug = guide->>'slug' AND status = 'draft') THEN
      RAISE EXCEPTION 'Guide refresh needs review for %: publication changed or draft exists', guide->>'slug';
    END IF;
    UPDATE content.paths SET status = 'retired', updated_at = stamp WHERE id = current_page.id;
    INSERT INTO content.paths (game, kind, slug, locale, title, description, version, status,
      guide_group, body, updated_at, published_at)
    VALUES (current_page.game, 'guide', current_page.slug, 'en', guide->>'title', guide->>'description',
      current_page.version + 1, 'published', current_page.guide_group,
      (CASE WHEN guide ? 'previousHero' THEN current_page.body - 'hero' ELSE current_page.body END)
      || jsonb_build_object('blocks', guide->'blocks', 'asOf', guide->'asOf',
        'sources', guide->'sources', 'hash', guide->>'hash', 'editorialRevision', revision), stamp, stamp);
  END LOOP;
END $migration$;
