local _, ns = ...

local function explorationTasks(ctx)
  local tasks = {}
  local here = ns.MapName(ctx.mapID)
  for i = 1, #ns.Data.Exploration do
    local entry = ns.Data.Exploration[i]
    local state = ns.AchievementState(entry.achievementID)
    if state and not state.done then
      local count = ns.CriteriaCount(entry.achievementID)
      if count > 40 then
        count = 40
      end
      local added = 0
      for index = 1, count do
        local info = ns.CriteriaInfo(entry.achievementID, index)
        if info and not info.done and info.text ~= "" then
          local priority = 40
          if here and info.text == here then
            priority = 1
          end
          local criteriaID = info.criteriaID
          tasks[#tasks + 1] = {
            id = "roam:" .. entry.achievementID .. ":" .. tostring(criteriaID or index),
            title = info.text,
            estMinutes = entry.estMinutes or 12,
            priority = priority,
            note = ns.T("NOTE_EXPLORE"),
            source = "roam",
            complete = {
              kind = "criteria",
              achievementID = entry.achievementID,
              criteriaIndex = index,
              criteriaID = criteriaID,
            },
          }
          added = added + 1
          if added >= 6 then
            break
          end
        end
      end
      if added == 0 then
        tasks[#tasks + 1] = {
          id = "roam:achieve:" .. entry.achievementID,
          title = state.name or entry.fallbackTitle,
          estMinutes = 25,
          priority = 45,
          note = ns.T("NOTE_EXPLORE"),
          source = "roam",
          complete = { kind = "achievement", achievementID = entry.achievementID },
        }
      end
    end
  end
  return tasks
end

local function rareTasks(ctx)
  local tasks = {}
  local nearby = {}
  if ctx.mapID then
    local maps = ns.NearbyMaps(ctx.mapID)
    for i = 1, #maps do
      nearby[maps[i]] = true
    end
  end
  for i = 1, #ns.Data.Rares do
    local entry = ns.Data.Rares[i]
    if entry.questID and entry.mapID and (not ctx.mapID or nearby[entry.mapID]) then
      if not ns.QuestDone(entry.questID) then
        local priority = entry.mapID == ctx.mapID and 5 or 30
        tasks[#tasks + 1] = {
          id = entry.id,
          title = entry.fallbackTitle,
          mapID = entry.mapID,
          x = entry.x,
          y = entry.y,
          estMinutes = entry.estMinutes or 10,
          priority = priority,
          note = entry.note or ns.T("NOTE_VIGNETTE_RARE"),
          source = "roam",
          complete = { kind = "quest", questID = entry.questID },
        }
      end
    end
  end
  return tasks
end

local function isDiscovery(info)
  if type(info) ~= "table" or info.isDead then
    return false
  end
  local treasure = Enum and Enum.VignetteType and Enum.VignetteType.Treasure
  if treasure and info.type == treasure then
    return true, true
  end
  local atlas = info.atlasName or ""
  if type(atlas) ~= "string" then
    return false
  end
  if atlas:find("Treasure") or atlas:find("Loot") then
    return true, true
  end
  if atlas:find("Kill") or atlas:find("Rare") then
    return true, false
  end
  return false
end

local function vignetteTasks(ctx)
  local tasks = {}
  if not ctx.mapID or not C_VignetteInfo or not C_VignetteInfo.GetVignettes then
    return tasks
  end
  local ok, list = pcall(C_VignetteInfo.GetVignettes)
  if not ok or type(list) ~= "table" then
    return tasks
  end
  local limit = #list
  if limit > 80 then
    limit = 80
  end
  for i = 1, limit do
    if #tasks >= 6 then
      break
    end
    local guid = list[i]
    local okInfo, info = pcall(C_VignetteInfo.GetVignetteInfo, guid)
    local discovery, treasure = isDiscovery(info)
    if okInfo and discovery then
      local questID = ns.AsNumber(info.rewardQuestID)
      if not (questID and questID > 0 and ns.QuestDone(questID)) then
        local okPos, pos = pcall(C_VignetteInfo.GetVignettePosition, guid, ctx.mapID)
        local x, y
        if okPos then
          x, y = ns.ReadXY(pos)
        end
        if x and y and type(info.name) == "string" and info.name ~= "" then
          local complete
          if treasure then
            complete = {
              kind = "any",
              any = {
                { kind = "proximity", mapID = ctx.mapID, x = x, y = y, radiusYards = 20 },
              },
            }
            if questID and questID > 0 then
              complete.any[#complete.any + 1] = { kind = "quest", questID = questID }
            end
            if info.vignetteID then
              complete.any[#complete.any + 1] = {
                kind = "vignette",
                vignetteID = info.vignetteID,
                mapID = ctx.mapID,
                x = x,
                y = y,
                questID = questID,
              }
            end
          else
            complete = { kind = "any", any = {} }
            if questID and questID > 0 then
              complete.any[#complete.any + 1] = { kind = "quest", questID = questID }
            end
            if info.vignetteID then
              complete.any[#complete.any + 1] = {
                kind = "vignette",
                vignetteID = info.vignetteID,
                mapID = ctx.mapID,
                x = x,
                y = y,
                questID = questID,
              }
            end
            if #complete.any == 0 then
              complete = { kind = "manual" }
            end
          end
          tasks[#tasks + 1] = {
            id = "roam:vignette:" .. tostring(info.vignetteID or i),
            title = info.name,
            mapID = ctx.mapID,
            x = x,
            y = y,
            estMinutes = treasure and 5 or 10,
            priority = 3,
            note = treasure and ns.T("NOTE_VIGNETTE_TREASURE") or ns.T("NOTE_VIGNETTE_RARE"),
            source = "roam",
            complete = complete,
          }
        end
      end
    end
  end
  return tasks
end

local function Build(ctx)
  local tasks = {}
  local groups = { explorationTasks(ctx), rareTasks(ctx), vignetteTasks(ctx) }
  for g = 1, #groups do
    for i = 1, #groups[g] do
      tasks[#tasks + 1] = groups[g][i]
    end
  end
  return ns.SortTasks(tasks, ctx)
end

ns.RegisterProvider({
  id = "roam",
  Build = Build,
})
