local _, ns = ...

local function titleFor(questID, fallback)
  if C_QuestLog and C_QuestLog.GetTitleForQuestID then
    local ok, title = pcall(C_QuestLog.GetTitleForQuestID, questID)
    if ok and type(title) == "string" and title ~= "" then
      return title
    end
  end
  if C_TaskQuest and C_TaskQuest.GetQuestInfoByQuestID then
    local ok, title = pcall(C_TaskQuest.GetQuestInfoByQuestID, questID)
    if ok and type(title) == "string" and title ~= "" then
      return title
    end
  end
  return fallback or ns.T("NOTE_WORLD")
end

local function estForTag(tag, fallback)
  local kinds = Enum and Enum.QuestTagType
  if not kinds or tag == nil then
    return fallback
  end
  if tag == kinds.PetBattle then return 8 end
  if tag == kinds.DragonRiderRacing then return 6 end
  if tag == kinds.Dungeon then return 25 end
  if tag == kinds.Raid then return 35 end
  if tag == kinds.WorldBoss then return 20 end
  if tag == kinds.Profession then return 10 end
  if tag == kinds.PvP then return 15 end
  return fallback
end

local function waypoint(questID)
  if not C_QuestLog or not C_QuestLog.GetNextWaypoint then
    return nil
  end
  local ok, mapID, x, y = pcall(C_QuestLog.GetNextWaypoint, questID)
  if not ok then
    return nil
  end
  mapID, x, y = ns.AsNumber(mapID), ns.AsNumber(x), ns.AsNumber(y)
  if not mapID or not x or not y then
    return nil
  end
  return mapID, x, y
end

local function upsert(byID, task)
  local existing = byID[task.questID]
  if not existing then
    byID[task.questID] = task
    return
  end
  if task.x and not existing.x then
    byID[task.questID] = task
  end
end

local function fromLog(byID)
  if not C_QuestLog or not C_QuestLog.GetNumQuestLogEntries or not C_QuestLog.GetInfo then
    return
  end
  local ok, count = pcall(C_QuestLog.GetNumQuestLogEntries)
  count = ok and ns.AsNumber(count) or 0
  if not count or count < 1 then
    return
  end
  if count > 200 then
    count = 200
  end
  for index = 1, count do
    local okInfo, info = pcall(C_QuestLog.GetInfo, index)
    local visible = false
    if okInfo and type(info) == "table" then
      local okFlags, shown = pcall(function()
        return info.isHeader ~= true and info.isHidden ~= true
      end)
      visible = okFlags and shown or false
    end
    if visible then
      local questID = ns.AsNumber(info.questID)
      if questID and questID > 0 and not ns.QuestDone(questID) then
        local mapID, x, y = waypoint(questID)
        local classification = info.questClassification
        local bonus = Enum and Enum.QuestClassification and Enum.QuestClassification.BonusObjective
        local world = Enum and Enum.QuestClassification and Enum.QuestClassification.WorldQuest
        local note = ns.T("NOTE_LOG")
        local est = 15
        if bonus and classification == bonus then
          note = ns.T("NOTE_EVENT")
          est = 8
        elseif world and classification == world then
          note = ns.T("NOTE_WORLD")
          est = 10
        end
        upsert(byID, {
          questID = questID,
          id = "quest:" .. questID,
          title = (type(info.title) == "string" and info.title ~= "" and info.title) or titleFor(questID),
          mapID = mapID,
          x = x,
          y = y,
          estMinutes = est,
          priority = 10,
          note = note,
          source = "quests",
          complete = { kind = "quest", questID = questID },
        })
      end
    end
  end
end

local function fromMap(byID, mapID)
  if not mapID or not C_TaskQuest or not C_TaskQuest.GetQuestsOnMap then
    return
  end
  local ok, pois = pcall(C_TaskQuest.GetQuestsOnMap, mapID)
  if not ok or type(pois) ~= "table" then
    return
  end
  for i = 1, #pois do
    local poi = pois[i]
    if type(poi) == "table" then
      local questID = ns.AsNumber(poi.questID)
      local x, y = ns.AsNumber(poi.x), ns.AsNumber(poi.y)
      if questID and questID > 0 and x and y and not ns.QuestDone(questID) then
        local tag = poi.questTagType
        local kinds = Enum and Enum.QuestTagType
        local note = ns.T("NOTE_WORLD")
        if poi.isMapIndicatorQuest then
          note = ns.T("NOTE_EVENT")
        elseif kinds and tag == kinds.WorldBoss then
          note = ns.T("NOTE_BOSS")
        end
        local minutesLeft
        if C_TaskQuest.GetQuestTimeLeftMinutes then
          local okLeft, left = pcall(C_TaskQuest.GetQuestTimeLeftMinutes, questID)
          if okLeft then
            minutesLeft = ns.AsNumber(left)
          end
        end
        if minutesLeft ~= 0 then
          local est = estForTag(tag, poi.isDaily and 12 or 10)
          if minutesLeft and minutesLeft > 0 and minutesLeft < est then
            est = math.max(5, minutesLeft)
          end
          upsert(byID, {
            questID = questID,
            id = "quest:" .. questID,
            title = titleFor(questID),
            mapID = ns.AsNumber(poi.mapID) or mapID,
            x = x,
            y = y,
            estMinutes = est,
            priority = 10,
            note = note,
            source = "quests",
            complete = { kind = "quest", questID = questID },
          })
        end
      end
    end
  end
end

local function Build(ctx)
  local byID = {}
  fromLog(byID)
  local maps = ns.NearbyMaps(ctx.mapID)
  for i = 1, #maps do
    fromMap(byID, maps[i])
  end
  local tasks = {}
  for _, task in pairs(byID) do
    tasks[#tasks + 1] = task
  end
  ns.SortTasks(tasks, ctx)
  if #tasks > 25 then
    local trimmed = {}
    for i = 1, 25 do
      trimmed[i] = tasks[i]
    end
    return trimmed
  end
  return tasks
end

ns.RegisterProvider({
  id = "quests",
  Build = Build,
})
