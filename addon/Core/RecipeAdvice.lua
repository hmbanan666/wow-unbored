-- Build lookup tables once after a Section changes, never scan recipes per tooltip.
local _, ns = ...
ns.RecipeAdvice = {}
local R = ns.RecipeAdvice
local dirty, own, others = true, {}, {}
local lastRecipes, lastProfessions, lastTeaching

function R.Invalidate() dirty = true end

-- Only this PC's observed Characters, in the same Account SavedVariables.
function R.Remember()
  local S = ns.Snapshot
  if not ns.DB or not S.Sharing() then return end
  local key = ns.Profile.currentAltKey
  local entry = key and ns.DB.alts and ns.DB.alts[key]
  local recipes, professions = S.Body('recipes'), S.Body('professions')
  if not entry or not recipes or not professions then return end
  local knowledge = {}
  for skill, row in pairs(recipes.byProfession or {}) do
    if type(row) == 'table' and ns.Pack.IsPacked(row.unlearned) then
      knowledge[skill] = { learned = row.learned, unlearned = row.unlearned }
    end
  end
  -- Packed sets stay small; omit an oversized Alt instead of risking SavedVariables.
  if S.Measure(knowledge) > 12000 then knowledge = nil end
  entry.game, entry.recipeKnowledge, entry.professions = ns.Game, knowledge, professions.list
  ns.DB.alts[key] = entry
  entry.recipeSeenAt = ns.Now()
  local recent, bytes = {}, 0
  for _, alt in pairs(ns.DB.alts) do
    if alt.recipeKnowledge then recent[#recent + 1] = alt end
  end
  table.sort(recent, function(a, b) return (a.recipeSeenAt or 0) > (b.recipeSeenAt or 0) end)
  for _, alt in ipairs(recent) do
    bytes = bytes + S.Measure(alt.recipeKnowledge)
    if bytes > 60000 then alt.recipeKnowledge = nil end
  end
  R.Invalidate()
end

local function knowledgeBySkill(knowledge)
  local out = {}
  for skill, row in pairs(knowledge or {}) do
    if type(row) == 'table' and ns.Pack.IsPacked(row.learned) and ns.Pack.IsPacked(row.unlearned) then
      out[tonumber(skill)] = { learned = ns.Pack.Set(row.learned), unlearned = ns.Pack.Set(row.unlearned) }
    end
  end
  return out
end

local function candidates(list, knowledge, teaching, target, alt)
  local skills = {}
  for _, p in ipairs(list or {}) do skills[p.skillLine] = p end
  local learned = knowledgeBySkill(knowledge)
  for item, row in pairs(teaching) do
    if type(row) == 'table' then
      local spell, skill, minimum = ns.AsNumber(row[1]), ns.AsNumber(row[2]), ns.AsNumber(row[3])
      local p, known = skills[skill], learned[skill]
      if spell and minimum and p and known and known.unlearned[spell] and not known.learned[spell]
        and type(p.name) == 'string'
        and (not alt or (ns.AsNumber(p.skill) and p.skill >= minimum)) and not target[item] then
        target[item] = { profession = p.name, minimum = minimum, alt = alt }
      end
    end
  end
end

local function rebuild()
  local S = ns.Snapshot
  own, others = {}, {}
  lastRecipes, lastProfessions, lastTeaching = S.Get('recipes'), S.Get('professions'), UnboredRecipeTeaching
  dirty = false
  local map = lastTeaching
  if type(map) ~= 'table' or map.game ~= ns.Game or type(map.items) ~= 'table' then return end
  local recipes, professions = S.Body('recipes'), S.Body('professions')
  local knowledge = {}
  for skill, row in pairs(recipes and recipes.byProfession or {}) do knowledge[skill] = row end
  candidates(professions and professions.list, knowledge, map.items, own)
  local me = ns.Profile.currentAltKey
  local keys = {}
  for key in pairs(ns.DB and ns.DB.alts or {}) do keys[#keys + 1] = key end
  table.sort(keys)
  for _, key in ipairs(keys) do
    local alt = ns.DB.alts[key]
    if key ~= me and alt.game == ns.Game and type(alt.name) == 'string' then
      candidates(alt.professions, alt.recipeKnowledge, map.items, others, alt.name)
    end
  end
end

function R.For(itemID, lang, bound)
  local S = ns.Snapshot
  if dirty or lastRecipes ~= S.Get('recipes') or lastProfessions ~= S.Get('professions')
    or lastTeaching ~= UnboredRecipeTeaching then rebuild() end
  local row = own[itemID] or (not bound and others[itemID])
  if not row then return nil end
  if row.alt then return ns.TL(lang, 'ADV_RECIPE_ALT', row.alt) end
  return ns.TL(lang, 'ADV_RECIPE_NEW', row.profession, row.minimum)
end
