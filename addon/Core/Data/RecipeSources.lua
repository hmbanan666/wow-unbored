-- NPC sightings only, read while the corresponding window is open (ADR 0097).
local _, ns = ...
local S = ns.Snapshot
local num, str, call = ns.AsNumber, ns.SafeString, ns.Call
local CAP = 200 -- Combined recipe and Trade Goods NPC/item pairs.
local PROFESSIONS = { [129] = true, [164] = true, [165] = true, [171] = true, [182] = true,
  [185] = true, [186] = true, [197] = true, [202] = true, [333] = true, [356] = true,
  [393] = true, [755] = true, [773] = true }

local function place()
  local guid = str(call(UnitGUID, 'npc'), 100)
  local id = guid and tonumber(guid:match('^Creature%-%d+%-%d+%-%d+%-%d+%-(%d+)%-'))
  if not id or id <= 0 then return nil end
  -- Read the name only after the Creature GUID check.
  local name = str(call(UnitName, 'npc'), 100)
  if not name then return nil end
  local map, x, y = ns.RawPlayerPosition()
  local function rounded(v)
    return v and v >= 0 and v <= 1 and math.floor(v * 1000 + 0.5) / 10 or nil
  end
  return { npcId = id, npcName = name, uiMapID = map, x = rounded(x), y = rounded(y) }
end

local function key(row)
  return row.npcId .. ':' .. (row.itemId and ('i' .. row.itemId)
    or row.spellId and ('s' .. row.spellId)
    or ('n' .. (row.locale or '') .. ':' .. row.skillLine .. ':' .. row.name))
end

local function merge(previous, fresh, location)
  if #fresh == 0 then return nil end
  local entries, keys = {}, {}
  for _, row in ipairs(fresh) do
    for k, v in pairs(location) do row[k] = v end
    row.seenAt = ns.Now()
    keys[key(row)] = true
  end
  for _, row in ipairs(type(previous) == 'table' and previous.entries or {}) do
    if not keys[key(row)] then entries[#entries + 1] = row end
  end
  local added = {}
  for _, row in ipairs(fresh) do
    local id = key(row)
    if not added[id] then entries[#entries + 1] = row; added[id] = true end
  end
  while #entries > CAP do table.remove(entries, 1) end
  return { entries = entries }
end

-- Forever profession trainers are not always TrainerType.Tradeskills. Either
-- signal is enough; a class trainer is neither.
local function professionTrainer()
  local flagged
  if type(IsTradeskillTrainer) == 'function' then
    flagged = ns.AsBoolean(call(IsTradeskillTrainer))
  end
  if flagged == true then return true end
  local trainerType = num(call(C_Trainer and C_Trainer.GetTrainerType))
  local tradeskills = Enum and Enum.TrainerType and num(Enum.TrainerType.Tradeskills)
  if tradeskills and trainerType == tradeskills then return true end
  return false
end

-- Prefer the catalog parent (333) over an expansion tier (2940).
local function spellSkillLine(spell)
  if not spell then return nil end
  local info = S.Clean(call(C_TradeSkillUI and C_TradeSkillUI.GetProfessionInfoByRecipeID, spell))
  if type(info) == 'table' then
    local parent = num(info.parentProfessionID)
    local id = num(info.professionID)
    if parent and parent > 0 and PROFESSIONS[parent] then return parent end
    if id and PROFESSIONS[id] then return id end
  end
  local api = C_TradeSkillUI
  if not api or type(api.IsRecipeInSkillLine) ~= 'function' then return nil end
  for id in pairs(PROFESSIONS) do
    if ns.AsBoolean(call(api.IsRecipeInSkillLine, spell, id)) == true then return id end
  end
  return nil
end

local function trainer(previous)
  local location = place()
  if not location or not professionTrainer() then return nil end
  local names = {}
  for _, p in ipairs(ns.Profile.Professions() or {}) do
    local id = num(p.skillLine)
    local parent = num(p.parentSkillLine)
    if p.name and id and (PROFESSIONS[id] or (parent and PROFESSIONS[parent])) then
      names[p.name] = (parent and PROFESSIONS[parent] and parent) or id
    end
  end
  -- A missing, throwing or secret rank index is not a reason to drop the visit.
  local step
  if type(GetTrainerServiceStepIndex) == 'function' then
    local ok, rawStep = pcall(GetTrainerServiceStepIndex)
    if ok then step = num(rawStep) end
  end
  local entries = {}
  for i = 1, math.min(num(call(GetNumTrainerServices)) or 0, 1000) do
    local name, serviceType = call(GetTrainerServiceInfo, i)
    name, serviceType = str(name, 160), str(serviceType, 30)
    local skill, rank = call(GetTrainerServiceSkillReq, i)
    skill, rank = str(skill, 60), num(rank)
    local money, rankService = call(GetTrainerServiceCost, i)
    local data = S.Clean(call(C_TooltipInfo and C_TooltipInfo.GetTrainerService, i))
    local spellType = Enum and Enum.TooltipDataType and num(Enum.TooltipDataType.Spell)
    local spell = type(data) == 'table' and spellType and num(data.type) == spellType and num(data.id)
    local skillLine = (skill and names[skill]) or spellSkillLine(spell)
    -- The second cost return is the profession-rank purchase in the trainer UI.
    if i ~= step and ns.AsBoolean(rankService) ~= true and name and skillLine
      and serviceType ~= 'header' then
      entries[#entries + 1] = { spellId = spell or nil, name = name, skillLine = skillLine,
        locale = str(call(GetLocale), 8), requiredSkill = rank, cost = num(money) }
    end
  end
  return merge(previous, entries, location)
end

local function merchant(previous)
  local location = place()
  if not location then return nil end
  local entries = {}
  for i = 1, math.min(num(call(GetMerchantNumItems)) or 0, 1000) do
    local id = num(call(GetMerchantItemID, i))
    local _, _, _, _, _, class = call(C_Item and C_Item.GetItemInfoInstant, id)
    local info = S.Clean(call(C_MerchantFrame and C_MerchantFrame.GetItemInfo, i))
    if id and (num(class) == 9 or num(class) == 7) and type(info) == 'table' then
      local cost, available = num(info.price), num(info.numAvailable)
      local stack = num(info.stackCount)
      if not stack or stack <= 0 or stack ~= math.floor(stack) then cost = nil
      elseif cost then cost = cost / stack end
      local extended = ns.AsBoolean(info.hasExtendedCost)
      if extended ~= false then cost = nil end
      if cost and (cost < 0 or cost > 1e12 or cost ~= math.floor(cost)) then cost = nil end
      if (cost or ns.AsBoolean(info.hasExtendedCost) == true) and available
        and available >= -1 and available == math.floor(available) then
        entries[#entries + 1] = { itemId = id, cost = cost, numAvailable = available }
      end
    end
  end
  return merge(previous, entries, location)
end

if type(GetNumTrainerServices) == 'function' and ((C_Trainer and C_Trainer.GetTrainerType)
  or type(IsTradeskillTrainer) == 'function') then
  S.Register({ name = 'trainerSeen', games = { retail = true, forever = true }, prio = 30,
    login = false, window = true, opens = { 'TRAINER_SHOW' }, closes = { 'TRAINER_CLOSED' },
    events = { 'TRAINER_UPDATE', 'TRAINER_SERVICE_INFO_NAME_UPDATE' }, read = trainer })
end
if type(GetMerchantNumItems) == 'function' and C_MerchantFrame and C_MerchantFrame.GetItemInfo then
  S.Register({ name = 'merchantSeen', games = { retail = true, forever = true }, prio = 30,
    login = false, window = true, opens = { 'MERCHANT_SHOW' }, closes = { 'MERCHANT_CLOSED' },
    events = { 'MERCHANT_UPDATE' }, read = merchant })
end
