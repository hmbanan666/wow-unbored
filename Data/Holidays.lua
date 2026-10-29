local _, ns = ...

-- A row matches a live calendar holiday if ANY of these hit:
--   holidayID / holidayIDs  (Holiday.db2 id; NOT reliable as event.eventID)
--   textures                (CalendarDayEvent.iconTexture file IDs)
--   fallbackTitle / titles  (exact title, case-insensitive; English client)
-- Hallow's End textures 235460, 235461, 235462 are the ids HandyNotes
-- checks on C_Calendar.GetDayEvent().iconTexture (they replaced the old
-- "Calendar_HallowsEnd" string). Other holidays do not have a file ID
-- confirmed from a primary source here, so they fall back to title.
-- Faction-specific achievements are listed as pairs. The first one that
-- exists and is still open is used.
-- Mount ids: https://warcraft.wiki.gg/wiki/MountID (Headless Horseman 219,
-- Swift Brewfest Ram 202, Great Brewfest Kodo 226, X-45 Heartbreaker 352,
-- Swift Lovebird 431, Swift Springstrider 430).

ns.Data.Holidays = {
  {
    holidayID = 324,
    -- iconTexture values, not Holiday.db2 324. See the file header.
    textures = { 235460, 235461, 235462 },
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
    holidayID = 372,
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
    holidayID = 341,
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
    holidayID = 141,
    fallbackTitle = "Feast of Winter Veil",
    tasks = {
      { id = "veil-metzen", achievementIDs = { 273 }, estMinutes = 15, fallbackTitle = "On Metzen!" },
      { id = "veil-snow", achievementIDs = { 1687 }, estMinutes = 20, fallbackTitle = "Let It Snow" },
      { id = "veil-meta", achievementIDs = { 1691, 1692 }, estMinutes = 45, fallbackTitle = "Merrymaker" },
    },
  },
  {
    holidayID = 423,
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
    holidayID = 327,
    fallbackTitle = "Lunar Festival",
    tasks = {
      { id = "lunar-finery", achievementIDs = { 626 }, estMinutes = 15, fallbackTitle = "Lunar Festival Finery" },
      { id = "lunar-kalimdor", achievementIDs = { 911 }, estMinutes = 30, fallbackTitle = "Elders of Kalimdor" },
      { id = "lunar-meta", achievementIDs = { 913 }, estMinutes = 60, fallbackTitle = "To Honor One's Elders" },
    },
  },
  {
    holidayID = 181,
    fallbackTitle = "Noblegarden",
    tasks = {
      { id = "noble-meta", achievementIDs = { 2797, 2798 }, estMinutes = 30, fallbackTitle = "Noble Gardener" },
      { id = "noble-mount", mountID = 430, estMinutes = 20, fallbackTitle = "Swift Springstrider" },
    },
  },
  {
    holidayID = 404,
    fallbackTitle = "Pilgrim's Bounty",
    tasks = {
      { id = "pilgrim-turkey", achievementIDs = { 3559 }, estMinutes = 15, fallbackTitle = "Turkey Lurkey" },
      { id = "pilgrim-turkinator", achievementIDs = { 3578 }, estMinutes = 20, fallbackTitle = "The Turkinator" },
      { id = "pilgrim-meta", achievementIDs = { 3478, 3656 }, estMinutes = 40, fallbackTitle = "Pilgrim" },
    },
  },
  {
    holidayIDs = { 374, 375, 376 },
    fallbackTitle = "Darkmoon Faire",
    tasks = {
      { id = "dmf-attend", achievementIDs = { 6019 }, estMinutes = 10, fallbackTitle = "Come One, Come All!" },
      { id = "dmf-cannon", achievementIDs = { 6021 }, estMinutes = 10, fallbackTitle = "Blastenheimer Bullseye" },
    },
  },
}
