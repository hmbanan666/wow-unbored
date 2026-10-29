-- The player profile the Companion uploads (docs/adr/0011): written into
-- UnboredCharDB.profile on every logout and reload, when the game saves
-- SavedVariables. Everything is read through guards; a missing API or a
-- secret value leaves that part out.
-- TODO(adr-0009): for a public product, trim this to what each Request needs.

local _, ns = ...

ns.Profile = {}

local MAX_ITEMS = 600
local MAX_CURRENCIES = 80
local MAX_SESSIONS = 10
local MAX_ZONES = 15
local MAX_RECENT = 30

local function charDB()
  if type(UnboredCharDB) ~= "table" then
    UnboredCharDB = {}
  end
  return UnboredCharDB
end

-- Bag ids by kind. Enum.BagIndex names change between expansions, so they
-- are sorted by name: bags, the bank, and the account (warband) bank.
function ns.Profile.BagIds()
  local bags, bank, warband = {}, {}, {}
  local index = Enum and Enum.BagIndex
  if type(index) == "table" then
    for name, id in pairs(index) do
      if type(name) == "string" and type(id) == "number" then
        if name:find("Account", 1, true) then
          warband[#warband + 1] = id
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
  return bags, bank, warband
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

function ns.Profile.Snapshot()
  local db = charDB()
  local bags = ns.Profile.BagIds()
  local okContext, context = pcall(ns.PlayerContext)
  return {
    v = 1,
    savedAt = ns.Now(),
    character = ns.SafeString(ns.Call(UnitName, "player"), 80),
    realm = ns.SafeString(ns.Call(GetRealmName), 80),
    context = okContext and type(context) == "table" and context or nil,
    bags = ns.Profile.CountItems(bags),
    bank = db.bank,
    warband = ns.DB and ns.DB.warbandBank or nil,
    currencies = currencies(),
    collections = collections(),
    renown = renown(),
    sessions = db.sessions,
    recentSteps = db.recentSteps,
  }
end

-- The bank can only be read while it is open, so the last look is kept.
function ns.Profile.SeeBank()
  local _, bank, warband = ns.Profile.BagIds()
  local items = ns.Profile.CountItems(bank)
  if items and #items > 0 then
    charDB().bank = { seenAt = ns.Now(), items = items }
  end
  local shared = ns.Profile.CountItems(warband)
  if ns.DB and shared and #shared > 0 then
    ns.DB.warbandBank = { seenAt = ns.Now(), items = shared }
  end
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
end

function ns.Profile.NoteZone()
  local sessions = charDB().sessions
  local current = type(sessions) == "table" and sessions[#sessions] or nil
  if type(current) ~= "table" then
    return
  end
  current.zones = type(current.zones) == "table" and current.zones or {}
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
    title = ns.SafeString(task.title, 120),
    bucket = bucket,
    at = ns.Now(),
  }
  while #db.recentSteps > MAX_RECENT do
    table.remove(db.recentSteps, 1)
  end
end

function ns.Profile.Save()
  local db = charDB()
  local sessions = db.sessions
  if type(sessions) == "table" and type(sessions[#sessions]) == "table" then
    sessions[#sessions].stop = ns.Now()
  end
  local ok, profile = pcall(ns.Profile.Snapshot)
  if ok and type(profile) == "table" then
    db.profile = profile
  end
end

function ns.Profile.OnEvent(event)
  if event == "PLAYER_LOGOUT" then
    ns.Profile.Save()
  elseif event == "BANKFRAME_OPENED" or event == "PLAYERBANKSLOTS_CHANGED" then
    ns.Profile.SeeBank()
  elseif event == "ZONE_CHANGED_NEW_AREA" then
    ns.Profile.NoteZone()
  end
end
