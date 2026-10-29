local _, ns = ...

-- Curated rares and treasures. Live vignettes are the main source; this
-- table is for things you want suggested even when they are not currently
-- on the minimap.
--
-- An entry is shown only when questID is set. That quest is the "already
-- looted" flag from C_QuestLog.IsQuestFlaggedCompleted. If you are unsure
-- of the id, leave the entry commented out. A wrong id that never completes
-- would keep nagging.
--
-- Check a guessed id in game:
--   /dump C_QuestLog.IsQuestFlaggedCompleted(12345)
--
-- {
--   id = "rare-huolon",
--   fallbackTitle = "Huolon",
--   mapID = 554, -- Timeless Isle. https://warcraft.wiki.gg/wiki/UiMapID
--   x = 0.66,
--   y = 0.50,
--   estMinutes = 10,
--   questID = 32901,
--   note = "Timeless Isle rare. Skip if the sky is empty.",
-- },

-- Huolon, Timeless Isle. Daily tracking quest 33311 is the wowhead page
-- "Tracking Quest - Daily - Huolon", which tells you to check
-- C_QuestLog.IsQuestFlaggedCompleted(33311). uiMap 554 is Timeless Isle
-- (warcraft.wiki.gg UiMapID). No pin: the spawn moves, and the only
-- coordinates in the writeup are player comments.
ns.Data.Rares = {
  {
    id = "rare-huolon",
    fallbackTitle = "Huolon",
    mapID = 554,
    estMinutes = 15,
    questID = 33311,
    note = "Timeless Isle, by the bridge to the Blazing Way. Hidden after today's kill.",
  },
}
