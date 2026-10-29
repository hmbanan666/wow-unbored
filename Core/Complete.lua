-- Completion checks. Payload matches are in MatchEvent; IsTaskComplete
-- re-reads the game so a reload still drops finished tasks.
-- Achievement and quest APIs: warcraft.wiki.gg GetAchievementInfo,
-- C_QuestLog.IsQuestFlaggedCompleted, C_MountJournal.GetMountInfoByID.

local _, ns = ...

function ns.AchievementState(achievementID)
  achievementID = ns.AsNumber(achievementID)
  if not achievementID or type(GetAchievementInfo) ~= "function" then
    return nil
  end
  local results = { pcall(GetAchievementInfo, achievementID) }
  if not results[1] then
    return nil
  end
  local got = results[2]
  local name = results[3]
  local completed = results[5]
  local byMe = results[14]
  if type(name) ~= "string" or got ~= achievementID then
    return nil
  end
  return {
    id = achievementID,
    name = name,
    done = completed and true or false,
    byMe = byMe and true or false,
  }
end

function ns.CriteriaDone(achievementID, index, criteriaID)
  local state = ns.AchievementState(achievementID)
  if state and state.done then
    return true
  end
  if criteriaID and type(GetAchievementCriteriaInfoByID) == "function" then
    local results = { pcall(GetAchievementCriteriaInfoByID, achievementID, criteriaID) }
    if results[1] and results[2] ~= nil then
      return results[4] and true or false
    end
  end
  if index and type(GetAchievementCriteriaInfo) == "function" then
    local results = { pcall(GetAchievementCriteriaInfo, achievementID, index) }
    if results[1] and results[2] ~= nil then
      return results[4] and true or false
    end
  end
  return false
end

function ns.CriteriaInfo(achievementID, index)
  if type(GetAchievementCriteriaInfo) ~= "function" then
    return nil
  end
  local results = { pcall(GetAchievementCriteriaInfo, achievementID, index) }
  if not results[1] or type(results[2]) ~= "string" then
    return nil
  end
  return {
    text = results[2],
    done = results[4] and true or false,
    criteriaID = ns.AsNumber(results[11]),
  }
end

function ns.CriteriaCount(achievementID)
  if type(GetAchievementNumCriteria) ~= "function" then
    return 0
  end
  local ok, count = pcall(GetAchievementNumCriteria, achievementID)
  if not ok then
    return 0
  end
  return ns.AsNumber(count) or 0
end

function ns.QuestDone(questID)
  questID = ns.AsNumber(questID)
  if not questID or not C_QuestLog or not C_QuestLog.IsQuestFlaggedCompleted then
    return false
  end
  local ok, done = pcall(C_QuestLog.IsQuestFlaggedCompleted, questID)
  return ok and done and true or false
end

function ns.MountState(mountID)
  mountID = ns.AsNumber(mountID)
  if not mountID or not C_MountJournal or not C_MountJournal.GetMountInfoByID then
    return nil
  end
  local results = { pcall(C_MountJournal.GetMountInfoByID, mountID) }
  if not results[1] or type(results[2]) ~= "string" then
    return nil
  end
  -- Return 11 is isCollected, so results[12] after the pcall ok flag.
  return {
    name = results[2],
    collected = results[12] and true or false,
  }
end

function ns.MountsSatisfied(spec)
  if type(spec) ~= "table" then
    return false
  end
  local ids = {}
  if spec.mountID then
    ids[#ids + 1] = spec.mountID
  end
  if type(spec.mountIDs) == "table" then
    for i = 1, #spec.mountIDs do
      ids[#ids + 1] = spec.mountIDs[i]
    end
  end
  if #ids == 0 then
    return false
  end
  for i = 1, #ids do
    local state = ns.MountState(ids[i])
    if not state or not state.collected then
      return false
    end
  end
  return true
end

function ns.ToyOwned(itemID)
  itemID = ns.AsNumber(itemID)
  if not itemID then
    return false
  end
  if type(PlayerHasToy) == "function" then
    local ok, owned = pcall(PlayerHasToy, itemID)
    if ok then
      return owned and true or false
    end
  end
  return false
end

function ns.PetOwned(speciesID)
  speciesID = ns.AsNumber(speciesID)
  if not speciesID or not C_PetJournal or not C_PetJournal.GetNumCollectedInfo then
    return false
  end
  local ok, owned = pcall(C_PetJournal.GetNumCollectedInfo, speciesID)
  owned = ok and ns.AsNumber(owned) or nil
  return owned ~= nil and owned > 0
end

function ns.SpeciesFromPetGUID(guid)
  if type(guid) ~= "string" or not C_PetJournal or not C_PetJournal.GetPetInfoByPetID then
    return nil
  end
  local ok, speciesID = pcall(C_PetJournal.GetPetInfoByPetID, guid)
  if not ok then
    return nil
  end
  return ns.AsNumber(speciesID)
end

function ns.CurrencyAtLeast(currencyID, minQuantity)
  currencyID = ns.AsNumber(currencyID)
  if not currencyID or not C_CurrencyInfo or not C_CurrencyInfo.GetCurrencyInfo then
    return false
  end
  local ok, info = pcall(C_CurrencyInfo.GetCurrencyInfo, currencyID)
  if not ok or type(info) ~= "table" then
    return false
  end
  local qty = ns.AsNumber(info.quantity)
  if not qty then
    return false
  end
  return qty >= (minQuantity or 1)
end

function ns.PlayerHasAppearance(itemID)
  itemID = ns.AsNumber(itemID)
  if not itemID or not C_TransmogCollection or not C_TransmogCollection.PlayerHasTransmog then
    return nil
  end
  local ok, owned = pcall(C_TransmogCollection.PlayerHasTransmog, itemID)
  if not ok then
    return nil
  end
  return owned and true or false
end

local function mountIDList(spec)
  local ids = {}
  if spec.mountID then
    ids[#ids + 1] = spec.mountID
  end
  if type(spec.mountIDs) == "table" then
    for i = 1, #spec.mountIDs do
      ids[#ids + 1] = spec.mountIDs[i]
    end
  end
  return ids
end

function ns.VignetteComplete(spec)
  if spec.questID and ns.QuestDone(spec.questID) then
    return true
  end
  if not spec.vignetteID or not C_VignetteInfo or not C_VignetteInfo.GetVignettes then
    return false
  end
  local ok, list = pcall(C_VignetteInfo.GetVignettes)
  if not ok or type(list) ~= "table" then
    return false
  end
  local found = false
  for i = 1, #list do
    if C_VignetteInfo.GetVignetteInfo then
      local okInfo, info = pcall(C_VignetteInfo.GetVignetteInfo, list[i])
      if okInfo and type(info) == "table" and info.vignetteID == spec.vignetteID then
        found = true
        if info.isDead then
          return true
        end
      end
    end
  end
  if found or not spec.mapID or not spec.x or not spec.y then
    return false
  end
  -- It left the client list while we are standing on the pin.
  return ns.Near(spec.mapID, spec.x, spec.y, 80)
end

function ns.SpecComplete(spec)
  if type(spec) ~= "table" then
    return false
  end
  local kind = spec.kind
  if kind == nil or kind == "manual" then
    return false
  end
  if kind == "any" then
    local list = spec.any or {}
    for i = 1, #list do
      if ns.SpecComplete(list[i]) then
        return true
      end
    end
    return false
  end
  if kind == "achievement" then
    local state = ns.AchievementState(spec.achievementID)
    return state and state.done or false
  end
  if kind == "criteria" then
    return ns.CriteriaDone(spec.achievementID, spec.criteriaIndex, spec.criteriaID)
  end
  if kind == "quest" then
    return ns.QuestDone(spec.questID)
  end
  if kind == "mount" then
    return ns.MountsSatisfied(spec)
  end
  if kind == "toy" then
    return ns.ToyOwned(spec.itemID)
  end
  if kind == "pet" then
    return ns.PetOwned(spec.speciesID)
  end
  if kind == "currency" then
    return ns.CurrencyAtLeast(spec.currencyID, spec.minQuantity)
  end
  if kind == "zone" then
    local mapID = ns.PlayerPosition()
    return mapID ~= nil and mapID == spec.mapID
  end
  if kind == "proximity" then
    return ns.Near(spec.mapID, spec.x, spec.y, spec.radiusYards or 40)
  end
  if kind == "vignette" then
    return ns.VignetteComplete(spec)
  end
  return false
end

function ns.IsTaskComplete(task)
  return ns.SpecComplete(task and task.complete)
end

function ns.MatchEvent(spec, event, a)
  if type(spec) ~= "table" then
    return false
  end
  if spec.kind == "any" then
    local list = spec.any or {}
    for i = 1, #list do
      if ns.MatchEvent(list[i], event, a) then
        return true
      end
    end
    return false
  end
  local id = ns.AsNumber(a)
  if spec.kind == "achievement" and event == "ACHIEVEMENT_EARNED" then
    return id == spec.achievementID
  end
  if spec.kind == "criteria" and event == "CRITERIA_COMPLETE" then
    return spec.criteriaID ~= nil and id == spec.criteriaID
  end
  if spec.kind == "quest" and event == "QUEST_TURNED_IN" then
    return id == spec.questID
  end
  if spec.kind == "mount" and event == "NEW_MOUNT_ADDED" then
    local ids = mountIDList(spec)
    local relevant = false
    for i = 1, #ids do
      if ids[i] == id then
        relevant = true
      end
    end
    return relevant and ns.MountsSatisfied(spec)
  end
  if spec.kind == "toy" and event == "NEW_TOY_ADDED" then
    return id == spec.itemID
  end
  if spec.kind == "pet" and event == "NEW_PET_ADDED" then
    return ns.SpeciesFromPetGUID(a) == spec.speciesID
  end
  if spec.kind == "currency" and event == "CURRENCY_DISPLAY_UPDATE" then
    return id == spec.currencyID and ns.CurrencyAtLeast(spec.currencyID, spec.minQuantity)
  end
  return false
end

function ns.EventCompletes(task, event, ...)
  if not task then
    return false
  end
  if ns.MatchEvent(task.complete, event, ...) then
    return true
  end
  if event == "CRITERIA_UPDATE"
    or event == "CRITERIA_COMPLETE"
    or event == "ZONE_CHANGED"
    or event == "ZONE_CHANGED_NEW_AREA"
    or event == "VIGNETTE_MINIMAP_UPDATED"
    or event == "ACHIEVEMENT_EARNED"
    or event == "QUEST_TURNED_IN"
    or event == "NEW_MOUNT_ADDED"
    or event == "NEW_TOY_ADDED"
    or event == "NEW_PET_ADDED" then
    return ns.IsTaskComplete(task)
  end
  return false
end
