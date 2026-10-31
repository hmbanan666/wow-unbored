local _, ns = ...

-- The event catalog (D128). A row matches a live calendar event if ANY key in
-- `match` hits:
--   holidayIDs  Holiday.db2 ids; NOT reliable as CalendarDayEvent.eventID
--   textures    CalendarDayEvent.iconTexture file IDs
--   titles      exact title, case-insensitive; English client only
-- Hallow's End textures 235460, 235461, 235462 are the ids HandyNotes
-- checks on C_Calendar.GetDayEvent().iconTexture (they replaced the old
-- "Calendar_HallowsEnd" string). Other holidays do not have a file ID
-- confirmed from a primary source here, so they fall back to title.
-- A task is offered only while it is still open for this player (D129):
--   achievementIDs  first one that exists and is not done on the Account
--                   (faction pairs are listed as two ids)
--   mountID         not collected; cost = { currencyID, amount } adds a
--                   condition with the live counter (D95)
--   toyID           not owned
--   questID         a weekly quest this character has not turned in
-- Mount ids: https://warcraft.wiki.gg/wiki/MountID (Headless Horseman 219,
-- Swift Brewfest Ram 202, Great Brewfest Kodo 226, X-45 Heartbreaker 352,
-- Swift Lovebird 431, Swift Springstrider 430).

ns.Data.Holidays = {
  {
    id = "hallows-end",
    -- iconTexture values, not Holiday.db2 324. See the file header.
    match = { holidayIDs = { 324 }, textures = { 235460, 235461, 235462 }, titles = { "Hallow's End" } },
    fallbackTitle = "Hallow's End",
    tasks = {
      { id = "hallows-head", achievementIDs = { 291 }, estMinutes = 20, fallbackTitle = "Check Your Head" },
      {
        id = "hallows-mount",
        mountID = 219,
        estMinutes = 20,
        fallbackTitle = "Headless Horseman's Mount",
        note = "Queue the Headless Horseman while the holiday is up.",
      },
      {
        id = "hallows-kalimdor",
        achievementIDs = { 965, 963 },
        estMinutes = 40,
        fallbackTitle = "Tricks and Treats of Kalimdor",
      },
      { id = "hallows-meta", achievementIDs = { 1656, 1657 }, estMinutes = 60, fallbackTitle = "Hallowed Be Thy Name" },
    },
  },
  {
    id = "brewfest",
    match = { holidayIDs = { 372 }, titles = { "Brewfest" } },
    fallbackTitle = "Brewfest",
    tasks = {
      { id = "brew-month", achievementIDs = { 2796 }, estMinutes = 10, fallbackTitle = "Brew of the Month" },
      { id = "brew-diet", achievementIDs = { 1185 }, estMinutes = 20, fallbackTitle = "The Brewfest Diet" },
      {
        id = "brew-dire",
        achievementIDs = { 295 },
        estMinutes = 20,
        fallbackTitle = "Direbrewfest",
        note = "Coren Direbrew, under Blackrock Mountain.",
      },
      { id = "brew-ram", mountID = 202, estMinutes = 25, fallbackTitle = "Swift Brewfest Ram" },
      { id = "brew-kodo", mountID = 226, estMinutes = 25, fallbackTitle = "Great Brewfest Kodo" },
      { id = "brew-meta", achievementIDs = { 1683, 1684 }, estMinutes = 50, fallbackTitle = "Brewmaster" },
    },
  },
  {
    id = "midsummer",
    match = { holidayIDs = { 341 }, titles = { "Midsummer Fire Festival" } },
    fallbackTitle = "Midsummer Fire Festival",
    tasks = {
      { id = "fire-dance", achievementIDs = { 271 }, estMinutes = 10, fallbackTitle = "Burning Hot Pole Dance" },
      { id = "fire-king", achievementIDs = { 1145 }, estMinutes = 30, fallbackTitle = "King of the Fire Festival" },
      {
        id = "fire-warden",
        achievementIDs = { 1038 },
        faction = "Alliance",
        estMinutes = 40,
        fallbackTitle = "The Flame Warden",
      },
      {
        id = "fire-keeper",
        achievementIDs = { 1039 },
        faction = "Horde",
        estMinutes = 40,
        fallbackTitle = "The Flame Keeper",
      },
    },
  },
  {
    id = "winter-veil",
    match = { holidayIDs = { 141 }, titles = { "Feast of Winter Veil" } },
    fallbackTitle = "Feast of Winter Veil",
    tasks = {
      { id = "veil-metzen", achievementIDs = { 273 }, estMinutes = 15, fallbackTitle = "On Metzen!" },
      { id = "veil-snow", achievementIDs = { 1687 }, estMinutes = 20, fallbackTitle = "Let It Snow" },
      { id = "veil-meta", achievementIDs = { 1691, 1692 }, estMinutes = 45, fallbackTitle = "Merrymaker" },
    },
  },
  {
    id = "love-in-the-air",
    match = { holidayIDs = { 423 }, titles = { "Love is in the Air" } },
    fallbackTitle = "Love is in the Air",
    tasks = {
      { id = "love-tooth", achievementIDs = { 1702 }, estMinutes = 15, fallbackTitle = "Sweet Tooth" },
      { id = "love-lonely", achievementIDs = { 1291 }, estMinutes = 15, fallbackTitle = "Lonely?" },
      { id = "love-bird", mountID = 431, estMinutes = 15, fallbackTitle = "Swift Lovebird" },
      {
        id = "love-rocket",
        mountID = 352,
        estMinutes = 20,
        fallbackTitle = "X-45 Heartbreaker",
        note = "Shadowfang Keep, during the holiday.",
      },
      { id = "love-meta", achievementIDs = { 1693, 1707 }, estMinutes = 40, fallbackTitle = "Fool For Love" },
    },
  },
  {
    id = "lunar-festival",
    match = { holidayIDs = { 327 }, titles = { "Lunar Festival" } },
    fallbackTitle = "Lunar Festival",
    tasks = {
      { id = "lunar-finery", achievementIDs = { 626 }, estMinutes = 15, fallbackTitle = "Lunar Festival Finery" },
      { id = "lunar-kalimdor", achievementIDs = { 911 }, estMinutes = 30, fallbackTitle = "Elders of Kalimdor" },
      { id = "lunar-meta", achievementIDs = { 913 }, estMinutes = 60, fallbackTitle = "To Honor One's Elders" },
    },
  },
  {
    id = "noblegarden",
    match = { holidayIDs = { 181 }, titles = { "Noblegarden" } },
    fallbackTitle = "Noblegarden",
    tasks = {
      { id = "noble-meta", achievementIDs = { 2797, 2798 }, estMinutes = 30, fallbackTitle = "Noble Gardener" },
      { id = "noble-mount", mountID = 430, estMinutes = 20, fallbackTitle = "Swift Springstrider" },
    },
  },
  {
    id = "pilgrims-bounty",
    match = { holidayIDs = { 404 }, titles = { "Pilgrim's Bounty" } },
    fallbackTitle = "Pilgrim's Bounty",
    tasks = {
      { id = "pilgrim-turkey", achievementIDs = { 3559 }, estMinutes = 15, fallbackTitle = "Turkey Lurkey" },
      { id = "pilgrim-turkinator", achievementIDs = { 3578 }, estMinutes = 20, fallbackTitle = "The Turkinator" },
      { id = "pilgrim-meta", achievementIDs = { 3478, 3656 }, estMinutes = 40, fallbackTitle = "Pilgrim" },
    },
  },
  {
    id = "darkmoon-faire",
    match = { holidayIDs = { 374, 375, 376 }, titles = { "Darkmoon Faire" } },
    fallbackTitle = "Darkmoon Faire",
    tasks = {
      { id = "dmf-attend", achievementIDs = { 6019 }, estMinutes = 10, fallbackTitle = "Come One, Come All!" },
      { id = "dmf-cannon", achievementIDs = { 6021 }, estMinutes = 10, fallbackTitle = "Blastenheimer Bullseye" },
    },
  },
  -- Timewalking weeks (D128). Holiday ids are the wowhead event pages, one per
  -- expansion (https://www.wowhead.com/event=559 Outland, =562 Northrend,
  -- =587 Cataclysm, =643 Mists of Pandaria, =1056 Warlords of Draenor,
  -- =1263 Legion; the page text names the expansion). Every week is titled
  -- "Timewalking Dungeon Event", so titles cannot tell them apart and are not
  -- used. TODO(verify-in-game): that CalendarDayEvent.eventID carries these
  -- ids; the calendar Section (v2) records iconTexture to add textures later.
  -- Left out, not sourced: the weekly "five dungeons" quest ids (wowhead lists
  -- several level versions per week), vendor prices (so no currency
  -- condition yet), the Classic, Battle for Azeroth, Shadowlands and
  -- Dragonflight weeks, and the Warlords mounts (side per mount not sourced).
  -- Mounts, https://warcraft.wiki.gg/wiki/MountID with vendors from
  -- https://warcraft.wiki.gg/wiki/Timewarped_Badge : Eclipse Dragonhawk 778
  -- (Cupri), Ironbound Wraithcharger 552 (Auzin), Yu'lei, Daughter of Jade 476
  -- (Mistweaver Xia), Val'sharah Hippogryph 1521 (Aridormi). Reins of the
  -- Infinite Timereaver 781 drops from any Timewalking boss
  -- (https://warcraft.wiki.gg/wiki/Timewalking , Notes).
  {
    id = "tw-outland",
    match = { holidayIDs = { 559 } },
    fallbackTitle = "Timewalking: The Burning Crusade",
    tasks = {
      { id = "tw-outland-mount", mountID = 778, estMinutes = 30, fallbackTitle = "Eclipse Dragonhawk" },
      { id = "tw-outland-timereaver", mountID = 781, estMinutes = 30, fallbackTitle = "Infinite Timereaver" },
    },
  },
  {
    id = "tw-northrend",
    match = { holidayIDs = { 562 } },
    fallbackTitle = "Timewalking: Wrath of the Lich King",
    tasks = {
      { id = "tw-northrend-mount", mountID = 552, estMinutes = 30, fallbackTitle = "Ironbound Wraithcharger" },
      { id = "tw-northrend-timereaver", mountID = 781, estMinutes = 30, fallbackTitle = "Infinite Timereaver" },
    },
  },
  {
    id = "tw-cataclysm",
    match = { holidayIDs = { 587 } },
    fallbackTitle = "Timewalking: Cataclysm",
    tasks = {
      { id = "tw-cataclysm-timereaver", mountID = 781, estMinutes = 30, fallbackTitle = "Infinite Timereaver" },
    },
  },
  {
    id = "tw-pandaria",
    match = { holidayIDs = { 643 } },
    fallbackTitle = "Timewalking: Mists of Pandaria",
    tasks = {
      { id = "tw-pandaria-mount", mountID = 476, estMinutes = 30, fallbackTitle = "Yu'lei, Daughter of Jade" },
      { id = "tw-pandaria-timereaver", mountID = 781, estMinutes = 30, fallbackTitle = "Infinite Timereaver" },
    },
  },
  {
    id = "tw-draenor",
    match = { holidayIDs = { 1056 } },
    fallbackTitle = "Timewalking: Warlords of Draenor",
    tasks = {
      { id = "tw-draenor-timereaver", mountID = 781, estMinutes = 30, fallbackTitle = "Infinite Timereaver" },
    },
  },
  {
    id = "tw-legion",
    match = { holidayIDs = { 1263 } },
    fallbackTitle = "Timewalking: Legion",
    tasks = {
      { id = "tw-legion-mount", mountID = 1521, estMinutes = 30, fallbackTitle = "Val'sharah Hippogryph" },
      { id = "tw-legion-timereaver", mountID = 781, estMinutes = 30, fallbackTitle = "Infinite Timereaver" },
    },
  },
}
