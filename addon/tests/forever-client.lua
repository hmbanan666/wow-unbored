-- ADR 0094 / T0: modern frame, item, map and container APIs use the existing
-- UI harness. Forever 1.60.1 has no ToyBox or the six PetJournal readers used
-- by this addon. Profession shapes follow published APIs pending the T0 probe.
GetBuildInfo = function() return "1.60.1", "70888", "", 16001 end
C_ToyBox = nil
C_PetJournal = nil
GetProfessions = nil
GetProfessionInfo = nil
local skills = {
  { skillID = 11, name = "Professions", isHeader = true },
  { skillID = 171, name = "Alchemy", isHeader = false, skillLineCategoryID = 11,
    rank = 112, maxRank = 150, parentSkillLineID = 0 },
  { skillID = 333, name = "Enchanting", isHeader = false, skillLineCategoryID = 11,
    rank = 145, maxRank = 150, parentSkillLineID = 0 },
  { skillID = 2940, name = "Enchanting", isHeader = false, skillLineCategoryID = 11,
    rank = 145, maxRank = 150, parentSkillLineID = 333 },
  { skillID = 185, name = "Cooking", isHeader = false, skillLineCategoryID = 9, rank = 1, maxRank = 75 },
  { skillID = 43, name = "Swords", isHeader = false, skillLineCategoryID = 6, rank = 50, maxRank = 100 },
}
C_SkillInfo = {
  GetNumSkillLines = function() return #skills end,
  GetSkillLineInfo = function(index) return skills[index] end,
}
local recipes = {
  { recipeID = 100, learned = true, relativeDifficulty = 0 },
  { recipeID = 101, learned = false, relativeDifficulty = 1 },
  { recipeID = 102, learned = true, relativeDifficulty = 1 },
  { recipeID = 103, learned = true, relativeDifficulty = 2 },
  { recipeID = 104, learned = true, relativeDifficulty = 3 },
}
C_TradeSkillUI = {
  GetBaseProfessionInfo = function() return { professionID = 171, professionName = "Alchemy" } end,
  GetAllRecipeIDs = function() return { 100, 101, 102, 103, 104 } end,
  GetFilteredRecipeIDs = function() return { 100, 101, 102, 103, 104 } end,
  GetRecipeInfo = function(id) return recipes[id - 99] end,
  IsTradeSkillLinked = function() return false end,
  IsTradeSkillGuild = function() return false end,
  IsNPCCrafting = function() return false end,
}
InCombatLockdown = function() return false end
issecretvalue = function() return false end
UnitLevel = function() return 23 end
C_QuestLog = { GetNumQuestLogEntries = function() return 0 end }

return function(ns)
  local sandbox = {}
  local fixture = assert(loadfile("../packages/contracts/fixtures/snapshot-forever.lua"))
  setfenv(fixture, sandbox)
  fixture()
  assert(sandbox.UnboredCharDB.data.sections.char.body.game == ns.Game)
  assert(ns.Game == "forever", "interface 16001 selects Forever")
  for _, name in ipairs({ "mplus", "vault", "pets", "toys", "transmog", "talents", "warband" }) do
    assert(not ns.Snapshot.defs[name], name .. " must not register on Forever")
  end
  for _, name in ipairs({ "char", "gear", "questLog", "professions", "reputation" }) do
    assert(ns.Snapshot.defs[name], name .. " remains shared")
  end
  assert(ns.Providers.quests and not ns.Providers.farm and not ns.Providers.fun)
  assert(#ns.Data.Presets == 0 and next(ns.Data.ItemNotes) == nil)
  ns.Snapshot.LoginPass()
  while ns.Snapshot.Step(true) do end
  assert(ns.Snapshot.Body("char").game == "forever")
  assert(ns.Snapshot.Body("char").level == 23)
  assert(#(ns.DB.errors or {}) == 0, "login and staged collection must not report Lua errors")
  local professions = ns.Snapshot.Body("professions")
  assert(professions and #professions.list == 4, "classic line and its expansion tier both stay")
  assert(professions.list[1].skillLine == 171 and professions.list[1].skill == 112)
  assert(professions.list[1].max == 150 and professions.list[1].name == "Alchemy")
  assert(professions.list[1].parentSkillLine == nil, "a root skill line has no parent")
  local enchanting = professions.list[3]
  assert(enchanting.skillLine == 2940 and enchanting.parentSkillLine == 333, "tier points at Enchanting")
  assert(enchanting.name == "Enchanting" and enchanting.skill == 145)
  assert(ns.Snapshot.Body("recipes") == nil, "recipes wait for window")
  local filtered = C_TradeSkillUI.GetFilteredRecipeIDs
  C_TradeSkillUI.GetFilteredRecipeIDs = function() error("prefer all recipes") end
  ns.Snapshot.OnEvent("TRADE_SKILL_SHOW")
  ns.Snapshot.Read("recipes", "window")
  local known = ns.Snapshot.Body("recipes").byProfession["171"]
  assert(table.concat(ns.Pack.Decode(known.learned), ",") == "100,102,103,104", "learned only")
  assert(ns.Pack.Decode(known.difficulty.orange)[1] == 100, "orange")
  assert(ns.Pack.Decode(known.difficulty.yellow)[1] == 102, "yellow")
  assert(ns.Pack.Decode(known.difficulty.green)[1] == 103, "green")
  assert(ns.Pack.Decode(known.difficulty.grey)[1] == 104, "grey")
  assert(table.concat(known.learned, ",") ==
    table.concat(sandbox.UnboredCharDB.data.sections.recipes.body.byProfession["171"].learned, ","))
  C_TradeSkillUI.GetFilteredRecipeIDs = filtered
  C_TradeSkillUI.GetAllRecipeIDs = nil
  UnboredCharDB.data.sections.recipes = nil
  ns.Snapshot.Read("recipes", "window")
  assert(#ns.Pack.Decode(ns.Snapshot.Body("recipes").byProfession["171"].learned) == 4, "filtered fallback")
  local api = C_TradeSkillUI
  local beforeErrors = #ns.DB.errors
  local required = { "GetFilteredRecipeIDs", "GetRecipeInfo", "GetBaseProfessionInfo", "IsTradeSkillLinked" }
  for _, missing in ipairs(required) do
    local saved = api[missing]
    api[missing] = nil
    UnboredCharDB.data.sections.recipes = nil
    ns.Snapshot.Read("recipes", "window")
    assert(ns.Snapshot.Body("recipes") == nil, missing .. " leaves recipes unseen")
    api[missing] = saved
  end
  for _, unavailable in ipairs(required) do
    local saved = api[unavailable]
    api[unavailable] = function() error("not ready") end
    UnboredCharDB.data.sections.recipes = nil
    ns.Snapshot.Read("recipes", "window")
    assert(ns.Snapshot.Body("recipes") == nil, unavailable .. " failure leaves recipes unseen")
    api[unavailable] = saved
  end
  api.GetFilteredRecipeIDs = function() return {} end
  ns.Snapshot.Read("recipes", "window")
  assert(#ns.Pack.Decode(ns.Snapshot.Body("recipes").byProfession["171"].learned) == 0, "seen empty list")
  api.GetFilteredRecipeIDs = filtered

  -- Hidden recipes are checked explicitly through the delivered teaching map.
  local oldRecipeInfo = api.GetRecipeInfo
  api.GetFilteredRecipeIDs = function() return { 101 } end
  api.GetRecipeInfo = function(id)
    if id == 999 then return { recipeID = 999, learned = false } end
    return oldRecipeInfo(id)
  end
  UnboredRecipeTeaching = { game = 'forever', items = { [2555] = { 999, 171, 60 } } }
  ns.Snapshot.Read('recipes', 'window')
  assert(ns.Pack.Set(ns.Snapshot.Body('recipes').byProfession['171'].unlearned)[999],
    'explicit hidden unlearned recipe is observed without changing filters')
  ns.Snapshot.OnEvent('TRADE_SKILL_CLOSE')
  ns.Snapshot.OnEvent('NEW_RECIPE_LEARNED', 999)
  local updated = ns.Snapshot.Body('recipes').byProfession['171']
  assert(ns.Pack.Set(updated.learned)[999] and not ns.Pack.Set(updated.unlearned)[999],
    'learning an item recipe with the profession closed clears new-recipe evidence')
  ns.Snapshot.OnEvent('TRADE_SKILL_SHOW')
  api.GetRecipeInfo = oldRecipeInfo
  api.GetFilteredRecipeIDs = filtered
  UnboredRecipeTeaching = nil
  local savedSkills = C_SkillInfo
  C_SkillInfo = nil
  UnboredCharDB.data.sections.professions = nil
  ns.Snapshot.Read("professions", "event")
  assert(ns.Snapshot.Body("professions") == nil, "missing skills stay unseen")
  C_SkillInfo = savedSkills
  local savedInfo = C_SkillInfo.GetSkillLineInfo
  C_SkillInfo.GetSkillLineInfo = function() error("unavailable") end
  ns.Snapshot.Read("professions", "event")
  assert(ns.Snapshot.Body("professions") == nil, "throwing skills stay unseen")
  C_SkillInfo.GetSkillLineInfo = savedInfo
  skills[2].rank, skills[2].maxRank = nil, nil
  ns.Snapshot.Read("professions", "event")
  local incomplete = ns.Snapshot.Body("professions").list[1]
  assert(incomplete.skill == nil and incomplete.max == nil, "missing ranks are omitted")
  local secret = {}
  issecretvalue = function(value) return value == secret end
  skills[2].rank = secret
  recipes[1].learned = secret
  recipes[3].relativeDifficulty = secret
  ns.Snapshot.Read("recipes", "window")
  local safe = ns.Snapshot.Body("recipes").byProfession["171"]
  assert(#ns.Pack.Decode(safe.learned) == 3, "secret learned flag omitted")
  assert(#ns.Pack.Decode(safe.difficulty.yellow) == 0, "secret colour omitted")
  ns.Snapshot.Read("professions", "event")
  assert(ns.Snapshot.Body("professions").list[1].skill == nil, "secret rank omitted")
  issecretvalue = function() return false end
  for _, guard in ipairs({ "IsTradeSkillLinked", "IsTradeSkillGuild", "IsNPCCrafting" }) do
    api[guard] = function() return true end
    UnboredCharDB.data.sections.recipes = nil
    ns.Snapshot.Read("recipes", "window")
    assert(ns.Snapshot.Body("recipes") == nil, "never read another player's recipes")
    api[guard] = function() return false end
  end
  InCombatLockdown = function() return true end
  ns.Snapshot.Read("recipes", "window")
  assert(ns.Snapshot.Body("recipes") == nil, "no recipes in combat")
  InCombatLockdown = function() return false end
  assert(#ns.DB.errors == beforeErrors, "missing, secret and foreign APIs produce no errors")
  local report = ns.SelfCheck.Run()
  assert(report.game == "forever")
  local row = ns.DB.errors[#ns.DB.errors]
  assert(row.text:find("game=forever", 1, true))
  assert(not row.stack:find("C_ToyBox.GetToyLink error", 1, true))
  assert(not row.stack:find("C_PetJournal.GetOwnedPetIDs error", 1, true))
  print("Forever: full TOC, init, login, char collection and SelfCheck passed")
end
