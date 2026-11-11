-- NPC sightings only, read while the corresponding window is open (ADR 0097).
local _, ns = ...
local S = ns.Snapshot
local num, str, call = ns.AsNumber, ns.SafeString, ns.Call
local CAP = 200
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

local function trainer(previous)
  local location = place()
  if not location then return nil end
  local trainerType = num(call(C_Trainer and C_Trainer.GetTrainerType))
  local tradeskills = Enum and Enum.TrainerType and num(Enum.TrainerType.Tradeskills)
  if not tradeskills or trainerType ~= tradeskills then return nil end
  local skills = {}
  for _, p in ipairs(ns.Profile.Professions() or {}) do
    if p.name and PROFESSIONS[p.skillLine] then skills[p.name] = p.skillLine end
  end
  local step = num(call(GetTrainerServiceStepIndex))
  -- If the rank-training service cannot be identified, do not call it a recipe.
  if step == nil then return nil end
  local entries = {}
  for i = 1, math.min(num(call(GetNumTrainerServices)) or 0, 1000) do
    local name, serviceType = call(GetTrainerServiceInfo, i)
    name, serviceType = str(name, 160), str(serviceType, 30)
    local skill, rank = call(GetTrainerServiceSkillReq, i)
    skill, rank = str(skill, 60), num(rank)
    local skillLine = skill and skills[skill]
    if i ~= step and name and skillLine and serviceType ~= 'header' then
      local data = S.Clean(call(C_TooltipInfo and C_TooltipInfo.GetTrainerService, i))
      local spellType = Enum and Enum.TooltipDataType and num(Enum.TooltipDataType.Spell)
      local spell = type(data) == 'table' and spellType and num(data.type) == spellType and num(data.id)
      entries[#entries + 1] = { spellId = spell or nil, name = name, skillLine = skillLine,
        locale = str(call(GetLocale), 8), requiredSkill = rank, cost = num(call(GetTrainerServiceCost, i)) }
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
    if id and num(class) == 9 and type(info) == 'table' then
      local cost, available = num(info.price), num(info.numAvailable)
      if cost and available then
        entries[#entries + 1] = { itemId = id, cost = cost, numAvailable = available }
      end
    end
  end
  return merge(previous, entries, location)
end

if type(GetNumTrainerServices) == 'function' and C_Trainer and C_Trainer.GetTrainerType then
  S.Register({ name = 'trainerSeen', games = { retail = true, forever = true }, prio = 30,
    login = false, window = true, opens = { 'TRAINER_SHOW' }, closes = { 'TRAINER_CLOSED' },
    events = { 'TRAINER_UPDATE', 'TRAINER_SERVICE_INFO_NAME_UPDATE' }, read = trainer })
end
if type(GetMerchantNumItems) == 'function' and C_MerchantFrame and C_MerchantFrame.GetItemInfo then
  S.Register({ name = 'merchantSeen', games = { retail = true, forever = true }, prio = 30,
    login = false, window = true, opens = { 'MERCHANT_SHOW' }, closes = { 'MERCHANT_CLOSED' },
    events = { 'MERCHANT_UPDATE' }, read = merchant })
end
