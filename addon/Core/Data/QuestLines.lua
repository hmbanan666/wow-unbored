-- Unfinished quest chains (D132-D134): campaigns in progress, chains of the
-- quests in the log, and chains started on the maps the player plays most.
-- There is no global list of quest lines, so these are the only ways in.

local _, ns = ...

local S = ns.Snapshot
local num, str, call = ns.AsNumber, ns.SafeString, ns.Call

ns.QuestLines = {}
local Q = ns.QuestLines

Q.MAX_ROWS = 40
Q.MAX_QUESTS = 60
Q.MAP_COUNT = 3
-- The map answers come back with QUESTLINE_UPDATE; the read waits this long.
Q.MAP_WAIT = 10

local function round(value)
  value = num(value)
  if not value or value <= 0 or value >= 1 then
    return nil
  end
  return math.floor(value * 1000 + 0.5) / 1000
end

local function flags(info, campaignID)
  local out = {}
  if campaignID or ns.Flag(info.isCampaign) then
    out[#out + 1] = "c"
  end
  if ns.Flag(info.isImportant) then
    out[#out + 1] = "i"
  end
  if ns.Flag(info.isLocalStory) then
    out[#out + 1] = "l"
  end
  if ns.Flag(info.isAccountCompleted) then
    out[#out + 1] = "a"
  end
  return #out > 0 and table.concat(out, "|") or nil
end

local function currentMap()
  return C_Map and C_Map.GetBestMapForUnit and num(call(C_Map.GetBestMapForUnit, "player")) or nil
end

local function questDone(questID)
  if ns.QuestDone then
    return ns.QuestDone(questID)
  end
  return C_QuestLog and C_QuestLog.IsQuestFlaggedCompleted and call(C_QuestLog.IsQuestFlaggedCompleted, questID) == true
end

-- Not a story the player can follow.
local function skipped(info)
  return ns.Flag(info.isDaily) or ns.Flag(info.isHidden) or ns.Flag(info.isCombatAllyQuest) or ns.Flag(info.isMeta)
end

-- done, total and the first open quest, in the order the client lists them.
-- TODO(verify-in-game): GetQuestLineQuests order is the chain order, and
-- whether it holds optional side quests.
function Q.Progress(questLineID)
  local api = C_QuestLine
  if not api or not api.GetQuestLineQuests then
    return nil
  end
  if api.IsComplete and ns.Flag(call(api.IsComplete, questLineID)) then
    return nil
  end
  local quests = call(api.GetQuestLineQuests, questLineID)
  if type(quests) ~= "table" or #quests == 0 then
    return nil
  end
  local done, nextQuestID, open = 0, nil, {}
  for i = 1, math.min(#quests, Q.MAX_QUESTS) do
    local questID = num(quests[i])
    if questID then
      if questDone(questID) then
        done = done + 1
      else
        nextQuestID = nextQuestID or questID
        open[#open + 1] = questID
      end
    end
  end
  if not nextQuestID then
    return nil
  end
  return { done = done, total = done + #open, nextQuestID = nextQuestID, open = open }
end

-- One Section row from a QuestLineInfo, or nil when it is finished or not a story.
function Q.Row(info, mapID, campaignID, chapter)
  if type(info) ~= "table" or skipped(info) then
    return nil
  end
  local questLineID = num(info.questLineID)
  local name = str(info.questLineName, 60)
  if not questLineID or not name then
    return nil
  end
  local progress = Q.Progress(questLineID)
  if not progress then
    return nil
  end
  return {
    questLineID = questLineID,
    name = name,
    campaignID = campaignID,
    chapter = chapter,
    mapID = num(mapID) or num(info.startMapID),
    x = round(info.x),
    y = round(info.y),
    done = progress.done,
    total = progress.total,
    nextQuestID = progress.nextQuestID,
    flags = flags(info, campaignID),
  }
end

local function logQuests()
  local out = {}
  local api = C_QuestLog
  if not api or not api.GetNumQuestLogEntries or not api.GetInfo then
    return out
  end
  for i = 1, num(call(api.GetNumQuestLogEntries)) or 0 do
    local info = call(api.GetInfo, i)
    local questID = type(info) == "table" and not info.isHeader and num(info.questID) or nil
    if questID and not info.isHidden then
      out[#out + 1] = questID
    end
  end
  return out
end

-- Chains of the quests in the log (D132 source 2).
function Q.FromLog(limit)
  local rows, seen = {}, {}
  if not C_QuestLine or not C_QuestLine.GetQuestLineInfo then
    return rows
  end
  local quests = logQuests()
  for i = 1, #quests do
    local info = call(C_QuestLine.GetQuestLineInfo, quests[i])
    local id = type(info) == "table" and num(info.questLineID) or nil
    if id and not seen[id] then
      seen[id] = true
      local row = Q.Row(info, currentMap())
      if row then
        rows[#rows + 1] = row
        if limit and #rows >= limit then
          break
        end
      end
    end
    S.Yield()
  end
  return rows
end

local function campaignRows(add)
  local api = C_CampaignInfo
  if not api or not api.GetAvailableCampaigns or not api.GetState then
    return
  end
  local states = Enum and Enum.CampaignState or {}
  local inProgress, stalled = states.InProgress or 2, states.Stalled or 3
  local list = call(api.GetAvailableCampaigns)
  for _, campaignID in ipairs(type(list) == "table" and list or {}) do
    local state = call(api.GetState, campaignID)
    local chapterID = api.GetCurrentChapterID and num(call(api.GetCurrentChapterID, campaignID))
    if (state == inProgress or state == stalled) and chapterID then
      local chapter = api.GetCampaignChapterInfo and call(api.GetCampaignChapterInfo, chapterID)
      local campaign = api.GetCampaignInfo and call(api.GetCampaignInfo, campaignID)
      -- TODO(verify-in-game): a campaign chapter id is its quest line id.
      add({
        questLineID = chapterID,
        questLineName = type(campaign) == "table" and campaign.name or nil,
        isCampaign = true,
      }, nil, num(campaignID), type(chapter) == "table" and str(chapter.name, 60) or nil)
    end
    S.Yield()
  end
end

-- The current map and the most played maps of recent sessions.
function Q.Maps()
  local out, seen = {}, {}
  local here = currentMap()
  if here then
    out[1], seen[here] = here, true
  end
  local sessions = type(UnboredCharDB) == "table" and UnboredCharDB.sessions or nil
  local minutes = {}
  for i = math.max(1, #(sessions or {}) - 9), #(sessions or {}) do
    local maps = type(sessions[i]) == "table" and sessions[i].maps or nil
    for _, entry in ipairs(type(maps) == "table" and maps or {}) do
      local mapID = num(entry.mapID)
      if mapID then
        minutes[mapID] = (minutes[mapID] or 0) + (num(entry.minutes) or 0)
      end
    end
  end
  local ranked = {}
  for mapID, spent in pairs(minutes) do
    ranked[#ranked + 1] = { mapID = mapID, spent = spent }
  end
  table.sort(ranked, function(a, b)
    return a.spent > b.spent or (a.spent == b.spent and a.mapID < b.mapID)
  end)
  for i = 1, #ranked do
    if #out >= Q.MAP_COUNT + 1 then
      break
    end
    if not seen[ranked[i].mapID] then
      seen[ranked[i].mapID] = true
      out[#out + 1] = ranked[i].mapID
    end
  end
  return out
end

function Q.RequestMaps()
  if not C_QuestLine or not C_QuestLine.RequestQuestLinesForMap or ns.IsCombat() then
    return
  end
  local maps = Q.Maps()
  for i = 1, #maps do
    pcall(C_QuestLine.RequestQuestLinesForMap, maps[i])
  end
end

function S.ReadQuestLines()
  if not C_QuestLine or not C_QuestLine.GetQuestLineInfo then
    return nil
  end
  local rows, seen = {}, {}
  local function add(info, mapID, campaignID, chapter)
    local id = type(info) == "table" and num(info.questLineID) or nil
    if not id or seen[id] or #rows >= Q.MAX_ROWS then
      return
    end
    local row = Q.Row(info, mapID, campaignID, chapter)
    if row then
      seen[id] = true
      rows[#rows + 1] = row
    end
  end
  campaignRows(add)
  local fromLog = Q.FromLog()
  for i = 1, #fromLog do
    if not seen[fromLog[i].questLineID] and #rows < Q.MAX_ROWS then
      seen[fromLog[i].questLineID] = true
      rows[#rows + 1] = fromLog[i]
    end
  end
  if C_QuestLine.GetAvailableQuestLines then
    local maps = Q.Maps()
    for i = 1, #maps do
      local list = call(C_QuestLine.GetAvailableQuestLines, maps[i])
      for _, info in ipairs(type(list) == "table" and list or {}) do
        local started = ns.Flag(info.inProgress)
          or ((ns.Flag(info.isCampaign) or ns.Flag(info.isImportant)) and ns.Flag(info.isQuestStart))
        if started then
          add(info, maps[i])
        end
      end
      S.Yield()
    end
  end
  if #rows == 0 then
    return nil
  end
  return { lines = rows }
end

-- Read 20 s after the login pass; the map questions go out 10 s before that.
S.Register({
  name = "questLines",
  v = 1,
  prio = 92,
  delay = 20,
  events = { "QUEST_TURNED_IN" },
  read = S.ReadQuestLines,
  prepare = function()
    if C_Timer and C_Timer.After then
      C_Timer.After(S.LOGIN_DELAY + 20 - Q.MAP_WAIT, Q.RequestMaps)
    end
  end,
})
