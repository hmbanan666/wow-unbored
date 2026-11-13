-- Forever interaction facts are transient: capture while the quest UI is available,
-- then merge on the settled pass. Never read a unit name without a Creature GUID.
local _, ns = ...
local S = ns.Snapshot
local num, str, call = ns.AsNumber, ns.SafeString, ns.Call
local pending, detail = {}, nil

local function position(english)
  local map, x, y = ns.RawPlayerPosition()
  local function rounded(v)
    return v and v >= 0 and v <= 1 and math.floor(v * 1000 + 0.5) / 10 or nil
  end
  local out = { uiMapID = map, x = rounded(x), y = rounded(y) }
  for _, unit in ipairs({ 'questnpc', 'npc', 'target' }) do
    local guid = str(call(UnitGUID, unit), 100)
    local id = guid and tonumber(guid:match('^Creature%-%d+%-%d+%-%d+%-%d+%-(%d+)%-'))
    if id and id > 0 then
      out.npcId = id
      if english then out.npcName = str(call(UnitName, unit), 100) end
      break
    end
  end
  return out
end

local function event(kind, questID)
  if not S.Sharing() or ns.IsCombat() then pending, detail = {}, nil; return end
  if kind == 'QUEST_FINISHED' then detail = nil; return end
  if kind == 'QUEST_REMOVED' then return end
  local english = str(call(GetLocale), 8) == 'enUS'
  if kind == 'QUEST_DETAIL' or kind == 'QUEST_COMPLETE' or kind == 'QUEST_PROGRESS' then
    local id = num(call(GetQuestID))
    detail = id and { questID = id, title = english and str(call(GetTitleText), 120) or nil,
      place = position(english) } or nil
    return
  end
  questID = num(questID)
  if not questID or questID <= 0 or questID ~= math.floor(questID) then return end
  local api = C_QuestLog
  local index = num(call(api and api.GetLogIndexForQuestID, questID))
  local info = index and S.Clean(call(api and api.GetInfo, index)) or nil
  if type(info) ~= 'table' or info.questID ~= questID then info = {} end
  local row = { questID = questID, locale = english and 'enUS' or nil,
    title = english and (str(info.title, 120) or str(call(api and api.GetTitleForQuestID, questID), 120) or
      (detail and detail.questID == questID and detail.title)) or nil,
    level = num(info.level) or num(call(api and api.GetQuestDifficultyLevel, questID)), seenAt = ns.Now() }
  if kind == 'QUEST_ACCEPTED' then
    row.acceptedAt, row.accept = row.seenAt, position(english)
  elseif kind == 'QUEST_TURNED_IN' then
    row.turnedInAt, row.turnIn = row.seenAt, position(english)
  else return end
  local place = row.accept or row.turnIn
  if not place.npcId and detail and detail.questID == questID then
    place.npcId, place.npcName = detail.place.npcId, detail.place.npcName
  end
  pending[#pending + 1] = row
  while #pending > 500 do table.remove(pending, 1) end
  S.Mark('questSeen')
end

S.Register({ name = 'questSeen', games = { forever = true }, prio = 30, login = false,
  events = { 'QUEST_ACCEPTED', 'QUEST_TURNED_IN', 'QUEST_REMOVED', 'QUEST_DETAIL',
    'QUEST_COMPLETE', 'QUEST_PROGRESS', 'QUEST_FINISHED' },
  onEvent = event,
  clear = function() pending, detail = {}, nil end,
  read = function(previous)
    if #pending == 0 then return nil end
    local byId = {}
    for _, row in ipairs(type(previous) == 'table' and previous.entries or {}) do byId[row.questID] = row end
    for _, fresh in ipairs(pending) do
      local row = byId[fresh.questID] or { questID = fresh.questID }
      for _, key in ipairs({ 'title', 'locale', 'level', 'seenAt' }) do
        if fresh[key] ~= nil then row[key] = fresh[key] end
      end
      if fresh.acceptedAt and not row.acceptedAt then
        row.acceptedAt, row.accept = fresh.acceptedAt, fresh.accept
      end
      if fresh.turnedInAt then row.turnedInAt, row.turnIn = fresh.turnedInAt, fresh.turnIn end
      byId[row.questID] = row
    end
    pending = {}
    local entries = {}
    for _, row in pairs(byId) do entries[#entries + 1] = row end
    table.sort(entries, function(a, b)
      if a.seenAt == b.seenAt then return a.questID < b.questID end
      return a.seenAt < b.seenAt
    end)
    while #entries > 500 do table.remove(entries, 1) end
    return { entries = entries }
  end })
