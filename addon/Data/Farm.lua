local _, ns = ...

if ns.Game == "forever" then
  ns.Data.Farm = {}
  return
end

-- Old raids and one dungeon, for the mount at the end.
-- instanceID matches GetSavedInstanceInfo's 14th return (added 10.0.5).
-- https://warcraft.wiki.gg/wiki/API_GetSavedInstanceInfo
-- https://warcraft.wiki.gg/wiki/InstanceID
-- Mount journal ids: https://warcraft.wiki.gg/wiki/MountID
-- Each mountSources entry names one verified way to earn that mount here.
-- itemID and source expose the existing item reference to Planner tools.
-- acquisition, when vetted, describes the target: guaranteed or chance-only.
-- A boss name alone never establishes a chance-only target.
-- difficulty is required when the chosen boss only awards it in that mode.
-- condition records encounter requirements beyond difficulty.
-- Entrance coordinates are the Wowhead "Dungeon and Raid Entrances" guide
-- (guide 8974), converted from 0-100 to 0-1. Several of those are rounded
-- to whole numbers.
-- Optional appearances = { itemIDs } are filtered with
-- C_TransmogCollection.PlayerHasTransmog when that API exists.
-- pins.Alliance / pins.Horde override the default map point.

ns.Data.Farm = {
  {
    id = "farm-onyxia",
    instanceID = 249,
    fallbackTitle = "Onyxia's Lair",
    mapID = 70,
    x = 0.56,
    y = 0.71,
    estMinutes = 15,
    mounts = { 349 },
    mountSources = {
      -- https://warcraft.wiki.gg/wiki/Reins_of_the_Onyxian_Drake
      -- https://www.wowhead.com/item=49636/reins-of-the-onyxian-drake
      [349] = {
        itemID = 49636,
        source = "https://www.wowhead.com/item=49636/reins-of-the-onyxian-drake",
        boss = "Onyxia",
      },
    },
  },
  {
    id = "farm-eye",
    instanceID = 550,
    fallbackTitle = "Tempest Keep",
    mapID = 109,
    x = 0.739,
    y = 0.637,
    estMinutes = 20,
    mounts = { 183 },
    mountSources = {
      -- https://warcraft.wiki.gg/wiki/Ashes_of_Al%27ar
      -- https://www.wowhead.com/item=32458/ashes-of-alar
      [183] = {
        itemID = 32458,
        source = "https://www.wowhead.com/item=32458/ashes-of-alar",
        acquisition = "chance-only",
        boss = "Kael'thas Sunstrider",
      },
    },
  },
  {
    id = "farm-kara",
    instanceID = 1651,
    fallbackTitle = "Return to Karazhan",
    mapID = 42,
    x = 0.47,
    y = 0.70,
    estMinutes = 25,
    mounts = { 875, 883 },
    mountSources = {
      -- https://warcraft.wiki.gg/wiki/Midnight%27s_Eternal_Reins
      -- https://www.wowhead.com/item=142236/midnights-eternal-reins
      [875] = {
        itemID = 142236,
        source = "https://www.wowhead.com/item=142236/midnights-eternal-reins",
        boss = "Attumen the Huntsman", difficulty = "mythic",
      },
      -- https://warcraft.wiki.gg/wiki/Smoldering_Ember_Wyrm
      -- https://www.wowhead.com/item=142552/smoldering-ember-wyrm
      [883] = {
        itemID = 142552,
        source = "https://www.wowhead.com/item=142552/smoldering-ember-wyrm",
        boss = "Nightbane", difficulty = "mythic", condition = "timed-summon",
      },
    },
  },
  {
    id = "farm-firelands",
    instanceID = 720,
    fallbackTitle = "Firelands",
    mapID = 198,
    x = 0.47,
    y = 0.77,
    estMinutes = 25,
    mounts = { 425 },
    mountSources = {
      -- https://warcraft.wiki.gg/wiki/Flametalon_of_Alysrazor
      -- https://www.wowhead.com/item=71665/flametalon-of-alysrazor
      [425] = {
        itemID = 71665,
        source = "https://www.wowhead.com/item=71665/flametalon-of-alysrazor",
        boss = "Alysrazor",
      },
    },
  },
  {
    id = "farm-dragon-soul",
    instanceID = 967,
    fallbackTitle = "Dragon Soul",
    mapID = 71,
    x = 0.65,
    y = 0.50,
    estMinutes = 30,
    mounts = { 445, 444 },
    mountSources = {
      -- https://warcraft.wiki.gg/wiki/Experiment_12-B
      -- https://www.wowhead.com/item=78919/experiment-12-b
      [445] = {
        itemID = 78919,
        source = "https://www.wowhead.com/item=78919/experiment-12-b",
        boss = "Ultraxion", difficulty = "normal-heroic",
      },
      -- https://warcraft.wiki.gg/wiki/Life-Binder%27s_Handmaiden
      -- https://www.wowhead.com/spell=107845/life-binders-handmaiden
      [444] = { boss = "Madness of Deathwing", difficulty = "heroic" },
    },
  },
  {
    id = "farm-bod",
    instanceID = 2070,
    fallbackTitle = "Battle of Dazar'alor",
    estMinutes = 30,
    mounts = { 1217, 1219 },
    mountSources = {
      -- https://warcraft.wiki.gg/wiki/G.M.O.D.
      -- https://www.wowhead.com/item=166518/g-m-o-d
      [1217] = {
        itemID = 166518,
        source = "https://www.wowhead.com/item=166518/g-m-o-d",
        boss = "High Tinker Mekkatorque", difficulty = "normal-heroic-mythic",
      },
      -- https://warcraft.wiki.gg/wiki/Glacial_Tidestorm
      -- https://www.wowhead.com/item=166705/glacial-tidestorm
      [1219] = {
        itemID = 166705,
        source = "https://www.wowhead.com/item=166705/glacial-tidestorm",
        boss = "Lady Jaina Proudmoore", difficulty = "mythic",
      },
    },
    pins = {
      Alliance = { mapID = 1161, x = 0.70, y = 0.35 },
      Horde = { mapID = 1165, x = 0.39, y = 0.02 },
    },
  },
  {
    id = "farm-foundry",
    instanceID = 1205,
    fallbackTitle = "Blackrock Foundry",
    mapID = 543,
    x = 0.51,
    y = 0.29,
    estMinutes = 30,
    mounts = { 613 },
    mountSources = {
      -- https://warcraft.wiki.gg/wiki/Ironhoof_Destroyer
      -- https://www.wowhead.com/item=116660/ironhoof-destroyer
      [613] = {
        itemID = 116660,
        source = "https://www.wowhead.com/item=116660/ironhoof-destroyer",
        boss = "Blackhand", difficulty = "mythic",
      },
    },
  },
  {
    id = "farm-nya",
    instanceID = 2217,
    fallbackTitle = "Ny'alotha",
    mapID = 1527,
    x = 0.38,
    y = 0.44,
    estMinutes = 30,
    mounts = { 1293 },
    mountSources = {
      -- https://warcraft.wiki.gg/wiki/Ny%27alotha_Allseer
      -- https://www.wowhead.com/spell=308814/nyalotha-allseer
      [1293] = { boss = "N'Zoth the Corruptor", difficulty = "mythic" },
    },
  },
  {
    id = "farm-icc",
    instanceID = 631,
    fallbackTitle = "Icecrown Citadel",
    mapID = 118,
    x = 0.536,
    y = 0.867,
    estMinutes = 35,
    mounts = { 363 },
    mountSources = {
      -- https://warcraft.wiki.gg/wiki/Invincible%27s_Reins
      -- https://www.wowhead.com/item=50818/invincibles-reins
      [363] = {
        itemID = 50818,
        source = "https://www.wowhead.com/item=50818/invincibles-reins",
        boss = "The Lich King", difficulty = "heroic25",
      },
    },
  },
  {
    id = "farm-soo",
    instanceID = 1136,
    fallbackTitle = "Siege of Orgrimmar",
    mapID = 390,
    x = 0.74,
    y = 0.42,
    estMinutes = 35,
    mounts = { 559 },
    mountSources = {
      -- https://warcraft.wiki.gg/wiki/Kor%27kron_Juggernaut
      -- https://www.wowhead.com/item=104253/korkron-juggernaut
      [559] = {
        itemID = 104253,
        source = "https://www.wowhead.com/item=104253/korkron-juggernaut",
        boss = "Garrosh Hellscream", difficulty = "mythic",
      },
    },
  },
  {
    id = "farm-hfc",
    instanceID = 1448,
    fallbackTitle = "Hellfire Citadel",
    mapID = 534,
    x = 0.47,
    y = 0.53,
    estMinutes = 35,
    mounts = { 751, 758 },
    mountSources = {
      -- https://warcraft.wiki.gg/wiki/Felsteel_Annihilator
      -- https://www.wowhead.com/item=123890/felsteel-annihilator
      [751] = {
        itemID = 123890,
        source = "https://www.wowhead.com/item=123890/felsteel-annihilator",
        boss = "Archimonde", difficulty = "mythic",
      },
      -- https://warcraft.wiki.gg/wiki/Infernal_Direwolf
      -- https://www.wowhead.com/achievement=10149/glory-of-the-hellfire-raider
      [758] = {
        achievementID = 10149,
        source = "https://www.wowhead.com/achievement=10149/glory-of-the-hellfire-raider",
        acquisition = "guaranteed",
      },
    },
  },
  {
    id = "farm-ulduar",
    instanceID = 603,
    fallbackTitle = "Ulduar",
    mapID = 120,
    x = 0.415,
    y = 0.176,
    estMinutes = 40,
    mounts = { 304 },
    mountSources = {
      -- https://warcraft.wiki.gg/wiki/Mimiron%27s_Head
      -- https://www.wowhead.com/item=45693/mimirons-head
      [304] = {
        itemID = 45693,
        source = "https://www.wowhead.com/item=45693/mimirons-head",
        boss = "Yogg-Saron", condition = "no-keepers",
      },
    },
  },
  {
    id = "farm-antorus",
    instanceID = 1712,
    fallbackTitle = "Antorus",
    mapID = 885,
    x = 0.55,
    y = 0.62,
    estMinutes = 40,
    mounts = { 971, 954 },
    mountSources = {
      -- https://warcraft.wiki.gg/wiki/Antoran_Charhound
      -- https://www.wowhead.com/guide/raid-entrances-of-legion-6034
      [971] = { boss = "Felhounds of Sargeras" },
      -- https://warcraft.wiki.gg/wiki/Shackled_Ur%27zul
      -- https://www.wowhead.com/npc=124828/argus-the-unmaker
      [954] = { boss = "Argus the Unmaker", difficulty = "mythic" },
    },
  },
  {
    id = "farm-sepulcher",
    instanceID = 2481,
    fallbackTitle = "Sepulcher of the First Ones",
    mapID = 1970,
    x = 0.81,
    y = 0.53,
    estMinutes = 40,
    mounts = { 1587 },
    mountSources = {
      -- https://warcraft.wiki.gg/wiki/Fractal_Cypher_of_the_Zereth_Overseer
      -- https://www.wowhead.com/item=190768/fractal-cypher-of-the-zereth-overseer
      [1587] = {
        itemID = 190768,
        source = "https://www.wowhead.com/item=190768/fractal-cypher-of-the-zereth-overseer",
        boss = "The Jailer", difficulty = "mythic",
      },
    },
  },
}
