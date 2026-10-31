-- Reputation: every faction with standing, renown levels and friendships.
-- v2 (D181) adds the next renown rewards, max renown and paragon progress.
-- Collapsed headers hide their factions, so they are opened for the read and
-- closed again in the same frame; skipped while the reputation tab is shown.
-- TODO(verify-in-game): ExpandAllFactionHeaders + CollapseFactionHeader keep
-- the player's headers exactly as they were.

local _, ns = ...

local S = ns.Snapshot
local num, str, call = ns.AsNumber, ns.SafeString, ns.Call

local MAX_FACTIONS = 600

local function tabShown()
  local frame = rawget(_G, "ReputationFrame")
  return type(frame) == "table" and type(frame.IsShown) == "function" and frame:IsShown() and true or false
end

local function friendship(factionID)
  if not C_GossipInfo or not C_GossipInfo.GetFriendshipReputation then
    return nil
  end
  local info = call(C_GossipInfo.GetFriendshipReputation, factionID)
  if type(info) ~= "table" or not num(info.friendshipFactionID) or info.friendshipFactionID == 0 then
    return nil
  end
  return {
    standing = num(info.standing),
    max = num(info.maxRep),
    reaction = str(info.reaction, 40),
    threshold = num(info.reactionThreshold),
    next = num(info.nextThreshold),
  }
end

local MAX_REWARDS = 4

-- The next renown level's rewards: the only reward ids the client gives for a
-- reputation (docs/adr/0052). Classic factions have none.
local function nextRewards(api, factionID, level)
  if not api.GetRenownRewardsForLevel or not factionID or not level then
    return nil
  end
  local list = call(api.GetRenownRewardsForLevel, factionID, level + 1)
  if type(list) ~= "table" then
    return nil
  end
  local out = {}
  for i = 1, #list do
    local reward = list[i]
    if type(reward) == "table" then
      local row = {
        itemID = num(reward.itemID),
        mountID = num(reward.mountID),
        spellID = num(reward.spellID),
        transmogSetID = num(reward.transmogSetID),
        titleMaskID = num(reward.titleMaskID),
        name = str(reward.name, 60),
        collected = reward.isCollected == true or nil,
      }
      if next(row) then
        out[#out + 1] = row
        if #out >= MAX_REWARDS then
          break
        end
      end
    end
  end
  return #out > 0 and out or nil
end

-- TODO(verify-in-game): HasMaximumRenown exists on 12.x; left out when absent.
local function atMax(api, factionID)
  if not api.HasMaximumRenown or not factionID then
    return nil
  end
  return call(api.HasMaximumRenown, factionID) == true or nil
end

-- currentValue carries the earned cycles too: value % threshold is the bar.
-- TODO(verify-in-game): IsFactionParagon exists on 12.x; left out when absent.
local function paragon(factionID)
  local api = C_Reputation
  if not api or not api.IsFactionParagon or not api.GetFactionParagonInfo then
    return nil
  end
  if call(api.IsFactionParagon, factionID) ~= true then
    return nil
  end
  local value, threshold, questID, pending = call(api.GetFactionParagonInfo, factionID)
  value, threshold = num(value), num(threshold)
  if not value or not threshold or threshold <= 0 then
    return nil
  end
  return {
    value = value % threshold,
    threshold = threshold,
    questID = num(questID),
    pending = pending == true or nil,
  }
end

local function renown()
  local api = C_MajorFactions
  if not api or not api.GetMajorFactionIDs or not api.GetMajorFactionData then
    return nil
  end
  local ids = call(api.GetMajorFactionIDs)
  if type(ids) ~= "table" then
    return nil
  end
  local out = {}
  for i = 1, #ids do
    local data = call(api.GetMajorFactionData, ids[i])
    if type(data) == "table" then
      local factionID, level = num(ids[i]), num(data.renownLevel)
      local isMax = atMax(api, factionID)
      out[#out + 1] = {
        factionID = factionID,
        level = level,
        earned = num(data.renownReputationEarned),
        threshold = num(data.renownLevelThreshold),
        unlocked = data.isUnlocked == true or nil,
        max = isMax,
        next = not isMax and nextRewards(api, factionID, level) or nil,
      }
    end
  end
  return #out > 0 and out or nil
end

function S.ReadReputation()
  local api = C_Reputation
  if not api or not api.GetNumFactions or not api.GetFactionDataByIndex then
    return nil
  end
  local collapsed = {}
  local canExpand = api.ExpandAllFactionHeaders and api.CollapseFactionHeader and not tabShown()
  if canExpand then
    for i = 1, num(call(api.GetNumFactions)) or 0 do
      local data = call(api.GetFactionDataByIndex, i)
      if type(data) == "table" and data.isHeader and data.isCollapsed and num(data.factionID) then
        collapsed[data.factionID] = true
      end
    end
    if next(collapsed) and not pcall(api.ExpandAllFactionHeaders) then
      collapsed = {}
    end
  end
  local list = {}
  for i = 1, math.min(num(call(api.GetNumFactions)) or 0, MAX_FACTIONS) do
    local data = call(api.GetFactionDataByIndex, i)
    local factionID = type(data) == "table" and num(data.factionID) or nil
    if factionID and factionID > 0 and (not data.isHeader or data.isHeaderWithRep) then
      list[#list + 1] = {
        factionID = factionID,
        reaction = num(data.reaction),
        standing = num(data.currentStanding),
        min = num(data.currentReactionThreshold),
        max = num(data.nextReactionThreshold),
        accountWide = data.isAccountWide == true or nil,
        watched = data.isWatched == true or nil,
        friendship = friendship(factionID),
        paragon = paragon(factionID),
      }
    end
  end
  if next(collapsed) then
    for i = num(call(api.GetNumFactions)) or 0, 1, -1 do
      local data = call(api.GetFactionDataByIndex, i)
      if type(data) == "table" and data.isHeader and not data.isCollapsed and collapsed[num(data.factionID) or -1] then
        pcall(api.CollapseFactionHeader, i)
      end
    end
  end
  if #list == 0 then
    return nil
  end
  return { factions = list, renown = renown() }
end

S.Register({
  name = "reputation",
  v = 2,
  prio = 50,
  events = { "UPDATE_FACTION", "MAJOR_FACTION_RENOWN_LEVEL_CHANGED" },
  read = S.ReadReputation,
})
