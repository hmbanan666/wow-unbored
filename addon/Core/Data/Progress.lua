-- Weekly progress: lockouts, Mythic+ and the Great Vault.

local _, ns = ...

local S = ns.Snapshot
local num, str, call = ns.AsNumber, ns.SafeString, ns.Call

local MAX_INSTANCES = 60

S.Register({
  name = "lockouts",
  v = 1,
  prio = 40,
  events = { "UPDATE_INSTANCE_INFO", "BOSS_KILL" },
  onEvent = function(event)
    if event == "BOSS_KILL" then
      -- The lockout list is refreshed by the server; UPDATE_INSTANCE_INFO follows.
      if type(RequestRaidInfo) == "function" then
        pcall(RequestRaidInfo)
      end
    elseif S.loginDone then
      S.Mark("lockouts", "event")
    end
  end,
  read = function()
    if type(GetNumSavedInstances) ~= "function" or type(GetSavedInstanceInfo) ~= "function" then
      return nil
    end
    local now = ns.Now()
    local instances = {}
    for i = 1, math.min(num(call(GetNumSavedInstances)) or 0, MAX_INSTANCES) do
      local name, lockoutID, reset, difficultyID, locked, extended, _, isRaid, maxPlayers, difficultyName,
        numEncounters, encounterProgress, _, instanceID = call(GetSavedInstanceInfo, i)
      local entry = {
        name = str(name, 80),
        instanceID = num(instanceID),
        lockoutID = num(lockoutID),
        resetAt = num(reset) and now + reset or nil,
        difficultyID = num(difficultyID),
        difficulty = str(difficultyName, 40),
        locked = locked == true,
        extended = extended == true or nil,
        raid = isRaid == true or nil,
        size = num(maxPlayers),
        bosses = num(numEncounters),
        killed = num(encounterProgress),
      }
      if type(GetSavedInstanceEncounterInfo) == "function" and (entry.bosses or 0) > 0 then
        entry.encounters = {}
        for j = 1, math.min(entry.bosses, 20) do
          local bossName, _, isKilled = call(GetSavedInstanceEncounterInfo, i, j)
          entry.encounters[j] = { name = str(bossName, 80), killed = isKilled == true }
        end
      end
      if entry.name or entry.instanceID then
        instances[#instances + 1] = entry
      end
    end
    local bosses = {}
    if type(GetNumSavedWorldBosses) == "function" and type(GetSavedWorldBossInfo) == "function" then
      for i = 1, math.min(num(call(GetNumSavedWorldBosses)) or 0, 30) do
        local name, bossID, reset = call(GetSavedWorldBossInfo, i)
        bosses[#bosses + 1] = { name = str(name, 80), id = num(bossID), resetAt = num(reset) and now + reset or nil }
      end
    end
    return { instances = instances, worldBosses = bosses }
  end,
})

-- M+ data may be empty early in the login; one retry 5 s later.
-- TODO(verify-in-game): RequestMapInfo is needed before the rating summary.
local mplusRetried = false

S.Register({
  name = "mplus",
  v = 1,
  prio = 40,
  events = { "CHALLENGE_MODE_COMPLETED", "CHALLENGE_MODE_MAPS_UPDATE" },
  prepare = function()
    if C_MythicPlus and C_MythicPlus.RequestMapInfo then
      pcall(C_MythicPlus.RequestMapInfo)
    end
  end,
  read = function()
    local summary = C_PlayerInfo and C_PlayerInfo.GetPlayerMythicPlusRatingSummary
      and call(C_PlayerInfo.GetPlayerMythicPlusRatingSummary, "player")
    if type(summary) ~= "table" then
      if not mplusRetried and C_Timer and C_Timer.After then
        mplusRetried = true
        pcall(C_Timer.After, 5, function()
          S.Queue("mplus", "login")
        end)
      end
      return nil
    end
    local runs = {}
    for i = 1, #(type(summary.runs) == "table" and summary.runs or {}) do
      local run = summary.runs[i]
      if type(run) == "table" then
        runs[#runs + 1] = {
          mapID = num(run.challengeModeID),
          score = num(run.mapScore),
          level = num(run.bestRunLevel),
          ms = num(run.bestRunDurationMS),
          timed = run.finishedSuccess == true,
        }
      end
    end
    local body = { score = num(summary.currentSeasonScore), runs = runs }
    if C_MythicPlus then
      body.keyLevel = C_MythicPlus.GetOwnedKeystoneLevel and num(call(C_MythicPlus.GetOwnedKeystoneLevel)) or nil
      body.keyMapID = C_MythicPlus.GetOwnedKeystoneChallengeMapID
        and num(call(C_MythicPlus.GetOwnedKeystoneChallengeMapID)) or nil
    end
    return body
  end,
})

-- TODO(verify-in-game): GetActivities returns data without opening the vault UI.
S.Register({
  name = "vault",
  v = 1,
  prio = 45,
  events = { "WEEKLY_REWARDS_UPDATE" },
  read = function()
    local api = C_WeeklyRewards
    if not api or not api.GetActivities then
      return nil
    end
    local list = call(api.GetActivities)
    if type(list) ~= "table" or #list == 0 then
      return nil
    end
    local out = {}
    for i = 1, math.min(#list, 20) do
      local a = list[i]
      if type(a) == "table" then
        out[#out + 1] = {
          type = num(a.type),
          index = num(a.index),
          threshold = num(a.threshold),
          progress = num(a.progress),
          level = num(a.level),
          id = num(a.id),
        }
      end
    end
    local body = { activities = out }
    if api.HasAvailableRewards then
      body.rewardWaiting = ns.Flag(call(api.HasAvailableRewards))
    end
    return body
  end,
})
