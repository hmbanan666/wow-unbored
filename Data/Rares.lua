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

ns.Data.Rares = {}
