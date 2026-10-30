-- Reputation: every faction with standing, renown levels and friendships.
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
      out[#out + 1] = {
        factionID = num(ids[i]),
        level = num(data.renownLevel),
        earned = num(data.renownReputationEarned),
        threshold = num(data.renownLevelThreshold),
        unlocked = data.isUnlocked == true or nil,
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
  v = 1,
  prio = 50,
  events = { "UPDATE_FACTION", "MAJOR_FACTION_RENOWN_LEVEL_CHANGED" },
  read = S.ReadReputation,
})
