-- The player profile the Companion uploads (docs/adr/0011, 0020): a rolling
-- snapshot in UnboredCharDB.profile. Each part is refreshed by the game event
-- that changes it, while the game is fully loaded; logout only stamps the time,
-- because bags, money and item level read empty during logout. A part that
-- reads empty never replaces a part that had data.
-- The account-wide Alt registry (docs/adr/0021) lives in UnboredDB.alts.
-- From 0.7 the Game data snapshot (Core/Data/, docs/adr/0027) is the source;
-- this 0.6 table is still written for one release and goes in 0.8.

local _, ns = ...

ns.Profile = {}

local MAX_ITEMS = 600
local MAX_CURRENCIES = 80
local MAX_SESSIONS = 20
local MAX_ZONES = 15
local MAX_MAPS = 15
local MAX_LEVELS = 20
local MAX_RECENT = 30
local MAX_UNMATCHED = 200
local MAX_ALT_QUESTS = 60
-- Bag and money events come in bursts; parts are read at most this often.
local SETTLE_SECONDS = 2

local function charDB()
  if type(UnboredCharDB) ~= "table" then
    UnboredCharDB = {}
  end
  return UnboredCharDB
end

local function profile()
  local db = charDB()
  if type(db.profile) ~= "table" then
    db.profile = { v = 1 }
  end
  return db.profile
end

-- Bag ids by kind. Enum.BagIndex names change between expansions, so they
-- are sorted by name: bags, the bank, the reagent bank, and the warband bank.
function ns.Profile.BagIds()
  local bags, bank, warband, reagent = {}, {}, {}, {}
  local index = Enum and Enum.BagIndex
  if type(index) == "table" then
    for name, id in pairs(index) do
      if type(name) == "string" and type(id) == "number" then
        if name:find("Account", 1, true) then
          warband[#warband + 1] = id
        elseif name:find("Reagent", 1, true) and name:find("Bank", 1, true) then
          reagent[#reagent + 1] = id
        elseif name:find("Bank", 1, true) then
          bank[#bank + 1] = id
        elseif name == "Backpack" or name:find("^Bag_%d") or name:find("ReagentBag", 1, true) then
          bags[#bags + 1] = id
        end
      end
    end
  end
  if #bags == 0 then
    bags = { 0, 1, 2, 3, 4, 5 }
  end
  if #bank == 0 and not (type(index) == "table" and next(index)) then
    bank = { -1, 6, 7, 8, 9, 10, 11, 12 }
  end
  table.sort(bags)
  table.sort(bank)
  table.sort(warband)
  table.sort(reagent)
  return bags, bank, warband, reagent
end

-- { [itemID] = count } over some containers, as a list for JSON.
function ns.Profile.CountItems(bagIds)
  if not C_Container or not C_Container.GetContainerNumSlots or not C_Container.GetContainerItemInfo then
    return nil
  end
  local counts, order = {}, {}
  for i = 1, #bagIds do
    local slots = ns.AsNumber(ns.Call(C_Container.GetContainerNumSlots, bagIds[i])) or 0
    for slot = 1, slots do
      local info = ns.Call(C_Container.GetContainerItemInfo, bagIds[i], slot)
      local itemID = type(info) == "table" and ns.AsNumber(info.itemID) or nil
      if itemID then
        if not counts[itemID] then
          order[#order + 1] = itemID
          counts[itemID] = 0
        end
        counts[itemID] = counts[itemID] + (ns.AsNumber(info.stackCount) or 1)
      end
    end
  end
  local out = {}
  for i = 1, math.min(#order, MAX_ITEMS) do
    out[i] = { itemID = order[i], count = counts[order[i]] }
  end
  return out
end

local function currencies()
  local api = C_CurrencyInfo
  if not api or not api.GetCurrencyListSize or not api.GetCurrencyListInfo then
    return nil
  end
  local out = {}
  local size = ns.AsNumber(ns.Call(api.GetCurrencyListSize)) or 0
  for i = 1, size do
    local info = ns.Call(api.GetCurrencyListInfo, i)
    if type(info) == "table" and not info.isHeader then
      local quantity = ns.AsNumber(info.quantity)
      if quantity and quantity > 0 then
        local id
        if api.GetCurrencyListLink and api.GetCurrencyIDFromLink then
          id = ns.AsNumber(ns.Call(api.GetCurrencyIDFromLink, ns.Call(api.GetCurrencyListLink, i)))
        end
        out[#out + 1] = { id = id, name = ns.SafeString(info.name, 80), quantity = quantity }
        if #out >= MAX_CURRENCIES then
          break
        end
      end
    end
  end
  return out
end

local function collections()
  local out = {}
  if C_MountJournal and C_MountJournal.GetMountIDs and C_MountJournal.GetMountInfoByID then
    local ids = ns.Call(C_MountJournal.GetMountIDs)
    if type(ids) == "table" then
      local owned = 0
      for i = 1, #ids do
        local collected = select(11, ns.Call(C_MountJournal.GetMountInfoByID, ids[i]))
        if ns.Flag(collected) then
          owned = owned + 1
        end
      end
      out.mounts = owned
    end
  end
  if C_PetJournal and C_PetJournal.GetNumPets then
    local _, owned = ns.Call(C_PetJournal.GetNumPets)
    out.pets = ns.AsNumber(owned)
  end
  if C_ToyBox and C_ToyBox.GetNumLearnedDisplayedToys then
    out.toys = ns.AsNumber(ns.Call(C_ToyBox.GetNumLearnedDisplayedToys))
  end
  if type(GetTotalAchievementPoints) == "function" then
    out.achievementPoints = ns.AsNumber(ns.Call(GetTotalAchievementPoints))
  end
  return next(out) and out or nil
end

local function renown()
  local api = C_MajorFactions
  if not api or not api.GetMajorFactionIDs or not api.GetMajorFactionData then
    return nil
  end
  local ids = ns.Call(api.GetMajorFactionIDs, LE_EXPANSION_LEVEL_CURRENT)
  if type(ids) ~= "table" then
    return nil
  end
  local out = {}
  for i = 1, #ids do
    local data = ns.Call(api.GetMajorFactionData, ids[i])
    if type(data) == "table" then
      out[#out + 1] = {
        id = ns.AsNumber(ids[i]),
        name = ns.SafeString(data.name, 80),
        level = ns.AsNumber(data.renownLevel),
      }
    end
  end
  return #out > 0 and out or nil
end

-- Primary professions, archaeology, fishing and cooking, with skill.
function ns.Profile.Professions()
  if type(GetProfessions) ~= "function" or type(GetProfessionInfo) ~= "function" then
    return nil
  end
  local indexes = { ns.Call(GetProfessions) }
  local out = {}
  for i = 1, 5 do
    local index = ns.AsNumber(indexes[i])
    if index then
      local name, _, skill, maxSkill, _, _, skillLine = ns.Call(GetProfessionInfo, index)
      skillLine = ns.AsNumber(skillLine)
      if skillLine then
        out[#out + 1] = {
          skillLine = skillLine,
          name = ns.SafeString(name, 60),
          skill = ns.AsNumber(skill) or 0,
          max = ns.AsNumber(maxSkill) or 0,
        }
      end
    end
  end
  return #out > 0 and out or nil
end

local EQUIP_SLOTS = 19

local function itemLevel(link)
  if not link then
    return nil
  end
  if C_Item and C_Item.GetDetailedItemLevelInfo then
    return ns.AsNumber(ns.Call(C_Item.GetDetailedItemLevelInfo, link))
  end
  return nil
end

function ns.Profile.Equipped()
  if type(GetInventoryItemLink) ~= "function" then
    return nil
  end
  local out = {}
  for slot = 1, EQUIP_SLOTS do
    local link = ns.Call(GetInventoryItemLink, "player", slot)
    local itemID = type(link) == "string" and ns.AsNumber(tonumber(link:match("item:(%d+)") or ""))
    if itemID then
      out[#out + 1] = { slot = slot, itemID = itemID, ilvl = itemLevel(link) }
    end
  end
  return #out > 0 and out or nil
end

local function activeQuests()
  local api = C_QuestLog
  if not api or not api.GetNumQuestLogEntries or not api.GetInfo then
    return nil
  end
  local out = {}
  local count = ns.AsNumber(ns.Call(api.GetNumQuestLogEntries)) or 0
  for i = 1, count do
    local info = ns.Call(api.GetInfo, i)
    if type(info) == "table" and not info.isHeader and ns.AsNumber(info.questID) then
      out[#out + 1] = ns.AsNumber(info.questID)
      if #out >= MAX_ALT_QUESTS then
        break
      end
    end
  end
  return #out > 0 and out or nil
end

local function nonEmpty(value)
  if value == nil then
    return false
  end
  if type(value) == "table" then
    return next(value) ~= nil
  end
  return true
end

-- Sets one part, unless it read empty and the old value had data.
local function keep(target, key, value)
  if nonEmpty(value) or not nonEmpty(target[key]) then
    target[key] = value
  end
end

local READERS = {
  context = function(p)
    local ok, context = pcall(ns.PlayerContext)
    if not ok or type(context) ~= "table" then
      return
    end
    p.context = type(p.context) == "table" and p.context or {}
    for key, value in pairs(context) do
      if value ~= 0 and value ~= "" then
        p.context[key] = value
      elseif p.context[key] == nil then
        p.context[key] = value
      end
    end
  end,
  bags = function(p)
    local bags = ns.Profile.BagIds()
    keep(p, "bags", ns.Profile.CountItems(bags))
  end,
  equipped = function(p)
    keep(p, "equipped", ns.Profile.Equipped())
  end,
  professions = function(p)
    keep(p, "professions", ns.Profile.Professions())
  end,
  currencies = function(p)
    keep(p, "currencies", currencies())
  end,
  collections = function(p)
    keep(p, "collections", collections())
  end,
  renown = function(p)
    keep(p, "renown", renown())
  end,
  quests = function(p)
    keep(p, "quests", activeQuests())
  end,
}

local EVENT_PARTS = {
  BAG_UPDATE_DELAYED = { "bags" },
  PLAYER_MONEY = { "context" },
  PLAYER_EQUIPMENT_CHANGED = { "equipped", "context" },
  PLAYER_SPECIALIZATION_CHANGED = { "context" },
  ACTIVE_TALENT_GROUP_CHANGED = { "context" },
  PLAYER_LEVEL_UP = { "context" },
  SKILL_LINES_CHANGED = { "professions" },
  TRADE_SKILL_LIST_UPDATE = { "professions" },
  CURRENCY_DISPLAY_UPDATE = { "currencies" },
  NEW_MOUNT_ADDED = { "collections" },
  NEW_PET_ADDED = { "collections" },
  NEW_TOY_ADDED = { "collections" },
  TOYS_UPDATED = { "collections" },
  QUEST_ACCEPTED = { "quests" },
  QUEST_TURNED_IN = { "quests" },
  ZONE_CHANGED_NEW_AREA = { "context" },
}

-- Every part, once the world is loaded.
function ns.Profile.ReadAll()
  ns.Profile.dirty = {}
  for name in pairs(READERS) do
    ns.Profile.dirty[name] = true
  end
  ns.Profile.Flush(true)
end

function ns.Profile.Mark(parts)
  ns.Profile.dirty = ns.Profile.dirty or {}
  for i = 1, #parts do
    ns.Profile.dirty[parts[i]] = true
  end
  ns.Profile.dirtyAt = ns.Profile.dirtyAt or ns.Now()
end

-- Called by the ticker; reads what changed once the burst settles.
function ns.Profile.Flush(now)
  local dirty = ns.Profile.dirty
  if type(dirty) ~= "table" or next(dirty) == nil then
    return false
  end
  if not now and ns.Now() - (ns.Profile.dirtyAt or 0) < SETTLE_SECONDS then
    return false
  end
  ns.Profile.dirty, ns.Profile.dirtyAt = {}, nil
  local p = profile()
  p.v = 1
  p.character = ns.SafeString(ns.Call(UnitName, "player"), 80) or p.character
  p.realm = ns.SafeString(ns.Call(GetRealmName), 80) or p.realm
  for name in pairs(dirty) do
    local reader = READERS[name]
    if reader then
      pcall(reader, p)
    end
  end
  p.updatedAt = ns.Now()
  if dirty.professions or dirty.context then
    pcall(ns.Profile.NoteAlt)
  end
  return true
end

-- Kept for callers and tests: the rolling profile as it stands.
function ns.Profile.Snapshot()
  return profile()
end

-- The bank can only be read while it is open, so the last look is kept.
function ns.Profile.SeeBank()
  local _, bank, _, reagent = ns.Profile.BagIds()
  -- The banks live in the snapshot Sections now; the 0.6 copies in
  -- UnboredCharDB.bank and UnboredDB.warbandBank only doubled the file size.
  charDB().bank = nil
  if ns.DB then
    ns.DB.warbandBank = nil
  end
  local p = profile()
  p.warband = nil
  local items = ns.Profile.CountItems(bank)
  if items and #items > 0 then
    p.bank = { seenAt = ns.Now(), items = items }
  end
  local reagents = #reagent > 0 and ns.Profile.CountItems(reagent)
  if reagents and #reagents > 0 then
    p.reagentBank = { seenAt = ns.Now(), items = reagents }
  end
end

-- An item Wisp had no Advice for (docs/adr/0019): only the id, to grow the rules.
function ns.Profile.NoteUnmatched(itemID)
  itemID = ns.AsNumber(itemID)
  if not itemID then
    return
  end
  local p = profile()
  p.unmatchedItems = type(p.unmatchedItems) == "table" and p.unmatchedItems or {}
  local list = p.unmatchedItems
  for i = 1, #list do
    if list[i] == itemID then
      return
    end
  end
  list[#list + 1] = itemID
  while #list > MAX_UNMATCHED do
    table.remove(list, 1)
  end
end

function ns.Profile.AltKey(name, realm)
  return tostring(realm or "") .. "-" .. tostring(name or "")
end

-- This character in the account-wide Alt registry (docs/adr/0021).
function ns.Profile.NoteAlt()
  if not ns.DB then
    return
  end
  local name = ns.SafeString(ns.Call(UnitName, "player"), 80)
  if not name then
    return
  end
  local realm = ns.SafeString(ns.Call(GetRealmName), 80) or ""
  ns.DB.alts = type(ns.DB.alts) == "table" and ns.DB.alts or {}
  local key = ns.Profile.AltKey(name, realm)
  local entry = type(ns.DB.alts[key]) == "table" and ns.DB.alts[key] or {}
  local _, classFile = ns.Call(UnitClass, "player")
  entry.name = name
  entry.realm = realm
  entry.classFile = ns.SafeString(classFile, 20) or entry.classFile
  entry.level = ns.AsNumber(ns.Call(UnitLevel, "player")) or entry.level
  entry.faction = ns.SafeString(ns.Call(UnitFactionGroup, "player"), 20) or entry.faction
  keep(entry, "professions", ns.Profile.Professions())
  keep(entry, "quests", activeQuests())
  entry.seenAt = ns.Now()
  ns.DB.alts[key] = entry
end

-- An Alt from the Account digest in Advice.lua (D76), checked like any file.
local function digestAlt(raw)
  if type(raw) ~= "table" then
    return nil
  end
  local name = ns.SafeString(raw.name, 80)
  local realm = ns.SafeString(raw.realm, 80)
  if not name or not realm then
    return nil
  end
  local professions = {}
  local list = type(raw.professions) == "table" and raw.professions or {}
  for i = 1, math.min(#list, 6) do
    local row = list[i]
    local skillLine = type(row) == "table" and ns.AsNumber(row.skillLine) or nil
    if skillLine then
      professions[#professions + 1] = {
        skillLine = skillLine,
        name = ns.SafeString(row.name, 60),
        skill = ns.AsNumber(row.skill) or 0,
      }
    end
  end
  return {
    name = name,
    realm = realm,
    faction = ns.SafeString(raw.faction, 20),
    seenAt = ns.AsNumber(raw.seenAt) or 0,
    professions = professions,
    fromDigest = true,
  }
end

-- Other characters of this account, newest first: the ones seen on this PC,
-- then the Account digest for Alts only seen on other PCs.
function ns.Profile.Alts()
  local out = {}
  local name = ns.SafeString(ns.Call(UnitName, "player"), 80)
  local me = ns.Profile.AltKey(name, ns.SafeString(ns.Call(GetRealmName), 80) or "")
  local alts = ns.DB and type(ns.DB.alts) == "table" and ns.DB.alts or {}
  local seen = { [me] = true }
  for key, entry in pairs(alts) do
    if key ~= me and type(entry) == "table" and type(entry.name) == "string" then
      out[#out + 1] = entry
      seen[key] = true
    end
  end
  local data = type(UnboredAdvice) == "table" and UnboredAdvice or nil
  local chars = data and type(data.characters) == "table" and data.characters or nil
  local mine = chars and chars[me]
  local digest = type(mine) == "table" and type(mine.alts) == "table" and mine.alts or {}
  for i = 1, math.min(#digest, 50) do
    local alt = digestAlt(digest[i])
    local key = alt and ns.Profile.AltKey(alt.name, alt.realm)
    if alt and not seen[key] then
      out[#out + 1] = alt
      seen[key] = true
    end
  end
  table.sort(out, function(a, b)
    return (tonumber(a.seenAt) or 0) > (tonumber(b.seenAt) or 0)
  end)
  return out
end

function ns.Profile.StartSession(initial)
  local db = charDB()
  if type(db.sessions) ~= "table" then
    db.sessions = {}
  end
  if initial or #db.sessions == 0 then
    db.sessions[#db.sessions + 1] = { start = ns.Now(), zones = {} }
    while #db.sessions > MAX_SESSIONS do
      table.remove(db.sessions, 1)
    end
  end
  ns.Profile.NoteZone()
  local p = profile()
  p.sessions = db.sessions
  p.recentSteps = db.recentSteps
  p.bank = p.bank or db.bank
  db.bank = nil
  p.warband = nil
  if ns.DB then
    ns.DB.warbandBank = nil
  end
  pcall(ns.Profile.ReadAll)
end

function ns.Profile.NoteZone()
  local sessions = charDB().sessions
  local current = type(sessions) == "table" and sessions[#sessions] or nil
  if type(current) ~= "table" then
    return
  end
  current.zones = type(current.zones) == "table" and current.zones or {}
  if C_Map and C_Map.GetBestMapForUnit then
    local mapID = ns.AsNumber(ns.Call(C_Map.GetBestMapForUnit, "player"))
    if mapID and mapID ~= current.mapID then
      ns.Profile.NoteMap(mapID)
    end
  end
  local zone = ns.SafeString(ns.Call(GetRealZoneText), 80)
  if not zone or zone == "" or current.zones[#current.zones] == zone then
    return
  end
  for i = 1, #current.zones do
    if current.zones[i] == zone then
      return
    end
  end
  if #current.zones < MAX_ZONES then
    current.zones[#current.zones + 1] = zone
  end
end

-- Minutes per map in the current session: the time since the last map change
-- is added to the map the player was on.
function ns.Profile.NoteMap(mapID, now)
  local sessions = charDB().sessions
  local current = type(sessions) == "table" and sessions[#sessions] or nil
  if type(current) ~= "table" then
    return
  end
  now = now or ns.Now()
  current.maps = type(current.maps) == "table" and current.maps or {}
  local function entry(id)
    for i = 1, #current.maps do
      if current.maps[i].mapID == id then
        return current.maps[i]
      end
    end
    if #current.maps >= MAX_MAPS then
      return nil
    end
    local new = { mapID = id, minutes = 0 }
    current.maps[#current.maps + 1] = new
    return new
  end
  local previous = ns.AsNumber(current.mapID)
  local since = ns.AsNumber(current.mapSince)
  if previous and since and now > since then
    local spent = entry(previous)
    if spent then
      spent.minutes = math.floor(((spent.minutes or 0) + (now - since) / 60) * 10 + 0.5) / 10
    end
  end
  mapID = ns.AsNumber(mapID)
  if mapID then
    entry(mapID)
  end
  current.mapID, current.mapSince = mapID, now
end

function ns.Profile.NoteDeath()
  local sessions = charDB().sessions
  local current = type(sessions) == "table" and sessions[#sessions] or nil
  if type(current) == "table" then
    current.deaths = (tonumber(current.deaths) or 0) + 1
  end
end

function ns.Profile.NoteLevel(level)
  local sessions = charDB().sessions
  local current = type(sessions) == "table" and sessions[#sessions] or nil
  level = ns.AsNumber(level)
  if type(current) ~= "table" or not level then
    return
  end
  current.levels = type(current.levels) == "table" and current.levels or {}
  if #current.levels < MAX_LEVELS then
    current.levels[#current.levels + 1] = { level = level, at = ns.Now() }
  end
end

function ns.Profile.NoteStep(task, bucket)
  if type(task) ~= "table" then
    return
  end
  local db = charDB()
  if type(db.recentSteps) ~= "table" then
    db.recentSteps = {}
  end
  db.recentSteps[#db.recentSteps + 1] = {
    id = task.id,
    title = ns.SafeString(ns.Markup.Plain(task.title, task.npcs), 120),
    bucket = bucket,
    at = ns.Now(),
  }
  while #db.recentSteps > MAX_RECENT do
    table.remove(db.recentSteps, 1)
  end
  profile().recentSteps = db.recentSteps
end

-- Logout: only the time. The parts were kept fresh while playing.
function ns.Profile.Save()
  local db = charDB()
  local sessions = db.sessions
  if type(sessions) == "table" and type(sessions[#sessions]) == "table" then
    local current = sessions[#sessions]
    if current.mapID then
      ns.Profile.NoteMap(current.mapID)
    end
    current.stop = ns.Now()
  end
  local p = profile()
  p.sessions = db.sessions
  p.savedAt = ns.Now()
end

function ns.Profile.OnEvent(event, arg1)
  if event == "PLAYER_LOGOUT" then
    ns.Profile.Save()
  elseif event == "PLAYER_DEAD" then
    ns.Profile.NoteDeath()
  elseif event == "PLAYER_LEVEL_UP" then
    ns.Profile.NoteLevel(arg1)
    ns.Profile.Mark({ "context" })
  elseif event == "BANKFRAME_OPENED" or event == "PLAYERBANKSLOTS_CHANGED"
    or event == "PLAYERREAGENTBANKSLOTS_CHANGED" then
    ns.Profile.SeeBank()
  else
    if event == "ZONE_CHANGED_NEW_AREA" then
      ns.Profile.NoteZone()
    end
    local parts = EVENT_PARTS[event]
    if parts then
      ns.Profile.Mark(parts)
    end
  end
end

function ns.Profile.Events()
  local out = { "PLAYERREAGENTBANKSLOTS_CHANGED", "PLAYER_DEAD" }
  for event in pairs(EVENT_PARTS) do
    out[#out + 1] = event
  end
  return out
end
