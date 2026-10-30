-- Sections about the character itself: core facts, gear, talents, played time.

local _, ns = ...

local S = ns.Snapshot
local num, str, call = ns.AsNumber, ns.SafeString, ns.Call

local function round1(value)
  value = num(value)
  return value and math.floor(value * 10 + 0.5) / 10 or nil
end

S.Register({
  name = "char",
  v = 1,
  prio = 100,
  events = {
    "PLAYER_LEVEL_UP",
    "PLAYER_XP_UPDATE",
    "UPDATE_EXHAUSTION",
    "PLAYER_MONEY",
    "PLAYER_SPECIALIZATION_CHANGED",
    "ACTIVE_TALENT_GROUP_CHANGED",
    "PLAYER_EQUIPMENT_CHANGED",
    "HEARTHSTONE_BOUND",
    "PLAYER_GUILD_UPDATE",
  },
  read = function()
    local body = {}
    body.name = str(call(UnitName, "player"), 80)
    body.realm = str(call(GetRealmName), 80)
    local className, classFile, classID = call(UnitClass, "player")
    body.class = str(className, 40)
    body.classFile = str(classFile, 20)
    body.classID = num(classID)
    local raceName, raceFile, raceID = call(UnitRace, "player")
    body.race = str(raceName, 40)
    body.raceFile = str(raceFile, 40)
    body.raceID = num(raceID)
    body.faction = str(call(UnitFactionGroup, "player"), 20)
    body.level = num(call(UnitLevel, "player"))
    body.xp = num(call(UnitXP, "player"))
    body.xpMax = num(call(UnitXPMax, "player"))
    body.rested = num(call(GetXPExhaustion))
    local specIndex = num(call(GetSpecialization))
    if specIndex then
      local specID, specName = call(GetSpecializationInfo, specIndex)
      body.specID = num(specID)
      body.spec = str(specName, 40)
    end
    if C_ClassTalents and C_ClassTalents.GetActiveHeroTalentSpec then
      body.heroSpecID = num(call(C_ClassTalents.GetActiveHeroTalentSpec))
    end
    local _, equipped = call(GetAverageItemLevel)
    body.ilvl = round1(equipped)
    body.money = num(call(GetMoney))
    body.hearth = str(call(GetBindLocation), 80)
    -- Only whether the character is in a guild: never its name or roster.
    if type(IsInGuild) == "function" then
      body.inGuild = ns.Flag(call(IsInGuild))
    end
    if not body.level and not body.classFile then
      return nil
    end
    return body
  end,
})

local EQUIP_SLOTS = 19

-- "item:..." from a link: the item string with its bonus ids, no colour or name.
function S.ItemString(link)
  if type(link) ~= "string" then
    return nil
  end
  return link:match("|H(item:[^|]+)|h") or link:match("^(item:[%-%d:]+)$")
end

S.Register({
  name = "gear",
  v = 1,
  prio = 95,
  events = { "PLAYER_EQUIPMENT_CHANGED" },
  read = function()
    if type(GetInventoryItemLink) ~= "function" then
      return nil
    end
    local slots = {}
    for slot = 1, EQUIP_SLOTS do
      local link = str(call(GetInventoryItemLink, "player", slot), 600)
      local itemString = S.ItemString(link)
      local itemID = itemString and num(tonumber(itemString:match("^item:(%d+)") or ""))
      if itemID then
        local ilvl
        if C_Item and C_Item.GetDetailedItemLevelInfo then
          ilvl = num(call(C_Item.GetDetailedItemLevelInfo, link))
        end
        slots[#slots + 1] = { slot = slot, itemID = itemID, item = itemString, ilvl = ilvl }
      end
    end
    if #slots == 0 then
      return nil
    end
    local _, equipped = call(GetAverageItemLevel)
    return { slots = slots, ilvl = round1(equipped) }
  end,
})

-- Loadouts per spec; the active one with its import string. Kept per spec so
-- a respec does not forget the other specs' loadouts.
S.Register({
  name = "talents",
  v = 1,
  prio = 45,
  events = { "TRAIT_CONFIG_LIST_UPDATED", "TRAIT_CONFIG_UPDATED", "ACTIVE_PLAYER_SPECIALIZATION_CHANGED" },
  read = function(previous)
    local ct, traits = C_ClassTalents, C_Traits
    if not ct or not ct.GetActiveConfigID or not traits or not traits.GetConfigInfo then
      return nil
    end
    local specIndex = num(call(GetSpecialization))
    local specID = specIndex and num((call(GetSpecializationInfo, specIndex)))
    local activeID = num(call(ct.GetActiveConfigID))
    if not specID or not activeID then
      return nil
    end
    local body = { specs = {} }
    if type(previous) == "table" and type(previous.specs) == "table" then
      for key, value in pairs(previous.specs) do
        body.specs[key] = value
      end
    end
    local entry = { loadouts = {} }
    local ids = ct.GetConfigIDsBySpecID and call(ct.GetConfigIDsBySpecID, specID)
    if type(ids) == "table" then
      for i = 1, math.min(#ids, 20) do
        local configID = num(ids[i])
        local info = configID and call(traits.GetConfigInfo, configID)
        if type(info) == "table" then
          entry.loadouts[#entry.loadouts + 1] = { configID = configID, name = str(info.name, 60) }
        end
      end
    end
    if ct.GetLastSelectedSavedConfigID then
      entry.selectedID = num(call(ct.GetLastSelectedSavedConfigID, specID))
    end
    if traits.GenerateImportString then
      entry.import = str(call(traits.GenerateImportString, activeID), 2000)
    end
    if ct.GetActiveHeroTalentSpec then
      entry.heroSpecID = num(call(ct.GetActiveHeroTalentSpec))
    end
    body.specs[tostring(specID)] = entry
    body.activeSpecID = specID
    return body
  end,
})

-- /played prints to chat. Our own request is silenced by wrapping the chat
-- display for that one answer; when no known display function exists we skip
-- the read rather than spam the player's chat.
-- TODO(verify-in-game): the wrap must not taint chat; ChatFrame_DisplayTimePlayed
-- may move in 12.x.
local played = { waiting = false }

local function displayHolder()
  if type(ChatFrame_DisplayTimePlayed) == "function" then
    return _G, "ChatFrame_DisplayTimePlayed"
  end
  if type(ChatFrameUtil) == "table" and type(ChatFrameUtil.DisplayTimePlayed) == "function" then
    return ChatFrameUtil, "DisplayTimePlayed"
  end
  return nil
end

local function restoreDisplay()
  if played.holder and played.original then
    played.holder[played.key] = played.original
  end
  played.holder, played.key, played.original = nil, nil, nil
end

S.Register({
  name = "played",
  v = 1,
  prio = 30,
  events = { "TIME_PLAYED_MSG" },
  read = function()
    if played.waiting or type(RequestTimePlayed) ~= "function" then
      return nil
    end
    local holder, key = displayHolder()
    if not holder then
      return nil
    end
    played.holder, played.key, played.original = holder, key, holder[key]
    holder[key] = function() end
    played.waiting = true
    if not pcall(RequestTimePlayed) then
      played.waiting = false
      restoreDisplay()
      return nil
    end
    if C_Timer and C_Timer.After then
      pcall(C_Timer.After, 10, function()
        if played.waiting then
          played.waiting = false
          restoreDisplay()
        end
      end)
    end
    return nil
  end,
  onEvent = function(event, total, level)
    if event ~= "TIME_PLAYED_MSG" then
      return
    end
    local ours = played.waiting
    played.waiting = false
    if ours and C_Timer and C_Timer.After then
      -- The chat frame handles the same event after us; restore after it.
      pcall(C_Timer.After, 0, restoreDisplay)
    elseif ours then
      restoreDisplay()
    end
    total, level = num(total), num(level)
    if total then
      S.Write("played", { total = total, level = level }, "login")
    end
  end,
})
