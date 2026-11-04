-- Live progress for the one promised Plan outcome. Reads only this player;
-- cached between relevant events, never from the distance ticker.
local _, ns = ...
ns.Outcome = {}
local O = ns.Outcome
local num, str, call, bool = ns.AsNumber, ns.SafeString, ns.Call, ns.AsBoolean

local function info(api, method, id)
  local value = api and call(api[method], id)
  if type(issecretvalue) == "function" and call(issecretvalue, value) ~= false then return {} end
  return type(value) == "table" and value or {}
end

local function bar(view, have, need)
  have, need = num(have), num(need)
  if have and need and need > 0 then
    view.have, view.need = math.max(0, have), need
    view.progress = ns.Steps.Count(view.have) .. " / " .. ns.Steps.Count(need)
  end
end

local function factionLabel(view, target, name)
  view.label = name and (target .. " · " .. name) or target
end

local function renown(view, target, data)
  local level = num(data.renownLevel)
  factionLabel(view, ns.T("OUTCOME_renown", target.level), str(data.name))
  if level then
    view.done = level >= target.level
    view.status = ns.T("OUTCOME_renown", level)
    bar(view, num(data.renownReputationEarned), num(data.renownLevelThreshold))
  end
end

local THRESHOLDS = { -42000, -6000, -3000, 0, 3000, 9000, 21000, 42000 }
local function reputation(view, target)
  local data = info(C_Reputation, "GetFactionDataByID", target.factionID)
  local standing = num(data.reaction)
  local label = ns.T("OUTCOME_STANDING_" .. target.standing)
  factionLabel(view, label, str(data.name))
  if standing then
    view.done = standing >= target.standing
    view.status = ns.T("OUTCOME_STANDING_" .. standing)
  end
  local friend = info(C_GossipInfo, "GetFriendshipReputation", target.factionID)
  if (num(friend.friendshipFactionID) or 0) > 0 then
    view.status = str(friend.reaction)
    local have, floor, ceiling = num(friend.standing), num(friend.reactionThreshold), num(friend.nextThreshold)
    if have and floor and ceiling then bar(view, have - floor, ceiling - floor) end
    local maximum = num(friend.maxRep)
    if have and maximum and maximum > 0 and have >= maximum then view.done = true end
    -- The contract's standing is the faction reaction, not a friendship rank.
    -- TODO: expose friendship targets separately if the contract gains them.
    return
  end
  local major = info(C_MajorFactions, "GetMajorFactionData", target.factionID)
  if num(major.renownLevel) then
    if bool(call(C_MajorFactions.HasMaximumRenown, target.factionID)) then view.done = true end
    view.status = ns.T("OUTCOME_renown", major.renownLevel)
    bar(view, num(major.renownReputationEarned), num(major.renownLevelThreshold))
    return
  end
  local have, floor = num(data.currentStanding), num(data.currentReactionThreshold)
  if have and floor then bar(view, have - floor, THRESHOLDS[target.standing] - floor) end
end

local function achievement(view, target)
  local _, name, _, done = call(GetAchievementInfo, target.achievementID)
  view.label = str(name) or view.label
  view.done = bool(done)
  local total = num(call(GetAchievementNumCriteria, target.achievementID))
  if not total or total <= 0 or total > 1000 then return end
  local have = 0
  for i = 1, total do
    local _, _, completed, quantity, required = call(GetAchievementCriteriaInfo, target.achievementID, i)
    quantity, required = num(quantity), num(required)
    if total == 1 and quantity and required and required > 0 then
      bar(view, quantity, required)
      return
    end
    completed = bool(completed)
    if completed == nil then return end
    if completed then have = have + 1 end
  end
  bar(view, have, total)
end

local function collection(view, target)
  local name, owned
  if target.kind == "mount" then
    local values = { call(C_MountJournal and C_MountJournal.GetMountInfoByID, target.id) }
    name, owned = str(values[1]), bool(values[11])
  elseif target.kind == "pet" then
    name = str(call(C_PetJournal and C_PetJournal.GetPetInfoBySpeciesID, target.id))
    local count = num(call(C_PetJournal and C_PetJournal.GetNumCollectedInfo, target.id))
    if count then owned = count > 0 end
  else
    name = str(call(C_Item and C_Item.GetItemNameByID, target.id))
    if target.kind == "toy" then
      owned = bool(call(PlayerHasToy, target.id))
    else
      local count = num(call(C_Item and C_Item.GetItemCount, target.id, true, false, true, true))
      if count then owned = count > 0 end
    end
  end
  view.label, view.done = name or view.label, owned
  if owned ~= nil then
    local item = target.kind == "item"
    view.status = ns.T(owned and (item and "OUTCOME_OWNED" or "OUTCOME_COLLECTED")
      or (item and "OUTCOME_UNOWNED" or "OUTCOME_UNCOLLECTED"))
  end
end

local function read(target)
  local view = { label = ns.T("OUTCOME_" .. target.kind, target.level) }
  if ns.IsCombat() then return view end
  if target.kind == "rep" then
    reputation(view, target)
  elseif target.kind == "renown" then
    renown(view, target, info(C_MajorFactions, "GetMajorFactionData", target.factionID))
  elseif target.kind == "level" then
    local level = num(call(UnitLevel, "player"))
    if level then
      view.done = level >= target.level
      view.status = ns.T("OUTCOME_level", level)
      bar(view, num(call(UnitXP, "player")), num(call(UnitXPMax, "player")))
    end
  elseif target.kind == "achievement" then
    achievement(view, target)
  elseif target.kind == "currency" then
    local data = info(C_CurrencyInfo, "GetCurrencyInfo", target.currencyID)
    view.label = str(data.name) or view.label
    local have = num(data.quantity)
    if have then view.done = have >= target.amount end
    bar(view, have, target.amount)
  else
    collection(view, target)
  end
  if view.done then
    view.have, view.need, view.progress = nil, nil, nil
    view.status = ns.T("OUTCOME_DONE")
  end
  return view
end

local function currentCard(target)
  local mascot = ns.Mascot
  local task = ns.Session and ns.Session:Current()
  return mascot and mascot.view and mascot.view.card and task and mascot.view.key == task.id
    and ns.Session.state.outcome == target and mascot.frame and mascot.frame:IsShown()
end

local function visibleCard(target)
  return currentCard(target) and ns.Mascot.bubble and ns.Mascot.bubble:IsShown()
end

function O.View(target)
  if type(target) ~= "table" then return nil end
  if O.target ~= target or O.dirty or not visibleCard(target) then
    O.target, O.view = target, read(target)
    O.dirty = ns.IsCombat()
  end
  return O.view
end

O.events = {
  UPDATE_FACTION = { rep = true, renown = true },
  MAJOR_FACTION_RENOWN_LEVEL_CHANGED = { rep = true, renown = true },
  MAJOR_FACTION_UNLOCKED = { rep = true, renown = true },
  PLAYER_XP_UPDATE = { level = true }, PLAYER_LEVEL_UP = { level = true },
  ACHIEVEMENT_EARNED = { achievement = true }, CRITERIA_UPDATE = { achievement = true },
  CRITERIA_COMPLETE = { achievement = true },
  CURRENCY_DISPLAY_UPDATE = { currency = true }, BAG_UPDATE_DELAYED = { item = true },
  BANKFRAME_OPENED = { item = true }, PLAYERBANKSLOTS_CHANGED = { item = true },
  PLAYER_ACCOUNT_BANK_TAB_SLOTS_CHANGED = { item = true }, BANK_TABS_CHANGED = { item = true },
  NEW_MOUNT_ADDED = { mount = true }, MOUNT_JOURNAL_SEARCH_UPDATED = { mount = true },
  NEW_PET_ADDED = { pet = true }, PET_JOURNAL_LIST_UPDATE = { pet = true },
  NEW_TOY_ADDED = { toy = true }, TOYS_UPDATED = { toy = true },
  GET_ITEM_INFO_RECEIVED = { item = true, toy = true },
}

function O.OnEvent(event)
  local target = ns.Session and ns.Session.state and ns.Session.state.outcome
  if not target then return end
  if event ~= "PLAYER_REGEN_ENABLED" and event ~= "PLAYER_ENTERING_WORLD"
    and not (O.events[event] and O.events[event][target.kind]) then return end
  if not currentCard(target) then return end
  if ns.IsCombat() then O.dirty = true; return end
  if not visibleCard(target) then return end
  O.dirty = true
  if O.scheduled then return end
  local function refresh()
    O.scheduled = nil
    local current = ns.Session and ns.Session.state and ns.Session.state.outcome
    if not ns.IsCombat() and current and visibleCard(current) then ns.Session.RefreshUI() end
  end
  O.scheduled = true
  if C_Timer and C_Timer.After then C_Timer.After(0.2, refresh) else refresh() end
end
