-- Professions with skill, and the recipes this character has learned. Tiers,
-- concentration and recipes are only known while the profession window is
-- open, so those parts keep the last look.

local _, ns = ...

local S = ns.Snapshot
local num, str, call = ns.AsNumber, ns.SafeString, ns.Call

local function tradeSkillOpenForMe()
  local api = C_TradeSkillUI
  if not api or not api.GetBaseProfessionInfo then
    return false
  end
  if ns.Game == "forever" and (not S.IsOpen("recipes")
    or type(api.IsTradeSkillLinked) ~= "function" or type(api.IsTradeSkillGuild) ~= "function"
    or type(api.IsNPCCrafting) ~= "function") then
    return false
  end
  -- Another player's linked or guild list is not our data (D48).
  if api.IsTradeSkillLinked and ns.AsBoolean(call(api.IsTradeSkillLinked)) ~= false then
    return false
  end
  if api.IsTradeSkillGuild and ns.AsBoolean(call(api.IsTradeSkillGuild)) ~= false then
    return false
  end
  if api.IsNPCCrafting and ns.AsBoolean(call(api.IsNPCCrafting)) ~= false then
    return false
  end
  return true
end

local function openTiers()
  local api = C_TradeSkillUI
  if not tradeSkillOpenForMe() or not api.GetChildProfessionInfos then
    return nil
  end
  local base = S.Clean(call(api.GetBaseProfessionInfo))
  local parent = type(base) == "table" and num(base.professionID) or nil
  local children = S.Clean(call(api.GetChildProfessionInfos))
  if not parent or type(children) ~= "table" then
    return nil
  end
  local tiers = {}
  for i = 1, math.min(#children, 20) do
    local child = children[i]
    if type(child) == "table" and num(child.professionID) then
      local tier = {
        skillLine = num(child.professionID),
        name = str(child.professionName or child.expansionName, 60),
        skill = num(child.skillLevel),
        max = num(child.maxSkillLevel),
      }
      if api.GetConcentrationCurrencyID and C_CurrencyInfo and C_CurrencyInfo.GetCurrencyInfo then
        local currencyID = num(call(api.GetConcentrationCurrencyID, tier.skillLine))
        local info = currencyID and currencyID > 0 and call(C_CurrencyInfo.GetCurrencyInfo, currencyID)
        if type(info) == "table" then
          tier.concentration = num(info.quantity)
          tier.concentrationMax = num(info.maxQuantity)
        end
      end
      tiers[#tiers + 1] = tier
    end
  end
  return parent, tiers
end

S.Register({
  games = { retail = true, forever = true },
  name = "professions",
  v = 1,
  prio = 80,
  events = { "SKILL_LINES_CHANGED", "TRADE_SKILL_LIST_UPDATE", "TRADE_SKILL_SHOW" },
  read = function(previous)
    local list = ns.Profile.Professions()
    if not list then
      return nil
    end
    local oldTiers = {}
    if type(previous) == "table" and type(previous.list) == "table" then
      for i = 1, #previous.list do
        local old = previous.list[i]
        if type(old) == "table" and old.skillLine then
          oldTiers[old.skillLine] = old.tiers
        end
      end
    end
    local parent, tiers = openTiers()
    for i = 1, #list do
      local entry = list[i]
      if parent and entry.skillLine == parent then
        entry.tiers = tiers
      else
        entry.tiers = oldTiers[entry.skillLine]
      end
    end
    return { list = list }
  end,
})

-- Learned recipes per profession, as Packed id sets. GetRecipeInfo is called
-- thousands of times, so the read is staged across frames.
S.Register({
  games = { retail = true, forever = true },
  name = "recipes",
  v = 1,
  prio = 35,
  window = true,
  opens = { "TRADE_SKILL_SHOW" },
  closes = { "TRADE_SKILL_CLOSE" },
  events = { "TRADE_SKILL_LIST_UPDATE", "NEW_RECIPE_LEARNED" },
  read = function(previous)
    local api = C_TradeSkillUI
    if not S.IsOpen("recipes") or not tradeSkillOpenForMe() or not api.GetRecipeInfo then
      return nil
    end
    local base = S.Clean(call(api.GetBaseProfessionInfo))
    local professionID = type(base) == "table" and num(base.professionID) or nil
    local enumerate = api.GetAllRecipeIDs or api.GetFilteredRecipeIDs
    local ids = S.Clean(call(enumerate))
    if not professionID or type(ids) ~= "table" then
      return nil
    end
    local learned = {}
    local difficulty = { orange = {}, yellow = {}, green = {}, grey = {} }
    local colours = { [0] = "orange", [1] = "yellow", [2] = "green", [3] = "grey" }
    for i = 1, #ids do
      local id = num(ids[i])
      local info = id and S.Clean(call(api.GetRecipeInfo, id))
      -- An unavailable recipe read cannot establish a known count of zero.
      if id and type(info) ~= "table" then return nil end
      if type(info) == "table" and ns.AsBoolean(info.learned) == true then
        local recipeID = num(info.recipeID) or id
        learned[#learned + 1] = recipeID
        local colour = colours[num(info.relativeDifficulty)]
        if colour then difficulty[colour][#difficulty[colour] + 1] = recipeID end
      end
      if i % 50 == 0 then
        S.Yield()
      end
    end
    local body = { byProfession = {} }
    if type(previous) == "table" and type(previous.byProfession) == "table" then
      for key, value in pairs(previous.byProfession) do
        body.byProfession[key] = value
      end
    end
    for colour, recipes in pairs(difficulty) do
      difficulty[colour] = ns.Pack.Encode(recipes)
    end
    body.byProfession[tostring(professionID)] = {
      name = str(base.professionName, 60),
      learned = ns.Pack.Encode(learned),
      difficulty = difficulty,
      seenAt = ns.Now(),
    }
    return body
  end,
})
