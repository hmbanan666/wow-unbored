-- Companion seam. The addon does not write this file.
--
-- Primary path is an UNB1: import string (see docs/plan-format.md).
-- This file is the optional fallback: a future out-of-game app may replace
-- it, or write the same table into the SavedVariables key
-- UnboredDB.companionPlan, while the game is closed. Both are read on
-- login / reload. A newer generatedAt replaces the saved session.
--
-- UnboredCompanionPlan = {
--   v = 1,
--   kind = "plan",
--   generatedAt = 0,
--   mode = "custom",
--   budget = 60,
--   tasks = {
--     {
--       id = "companion:1",
--       title = "Example",
--       mapID = 84,
--       x = 0.5,
--       y = 0.5,
--       estMinutes = 15,
--       note = "optional",
--       complete = { kind = "manual" },
--     },
--   },
-- }

if UnboredCompanionPlan == nil then
  UnboredCompanionPlan = nil
end
