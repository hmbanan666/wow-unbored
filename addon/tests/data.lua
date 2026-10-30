-- The Game data snapshot: the packer, every collector against mocked game
-- APIs (secret values, combat), opt-out, staging, and the worst-case size
-- budget from docs/adr/0028.

local fails = 0
local checks = 0

local function check(cond, message)
  checks = checks + 1
  if not cond then
    fails = fails + 1
    io.stderr:write("FAIL: " .. message .. "\n")
  end
end

local SECRET = setmetatable({}, { __tostring = function() return "secret" end })
function issecretvalue(value)
  return value == SECRET
end

local combat = false
function InCombatLockdown()
  return combat
end

local clock = 0
function debugprofilestop()
  return clock
end

local ns = {}
local files = {
  "Core/Namespace.lua",
  "Core/Locale.lua",
  "Core/Util.lua",
  "Core/Context.lua",
  "Core/Codec.lua",
  "Core/Profile.lua",
  "Core/Pack.lua",
  "Core/Data/Store.lua",
  "Core/Data/Character.lua",
  "Core/Data/Inventory.lua",
  "Core/Data/Professions.lua",
  "Core/Data/Quests.lua",
  "Core/Data/Reputation.lua",
  "Core/Data/Collections.lua",
  "Core/Data/Progress.lua",
  "Core/Data/World.lua",
}
for i = 1, #files do
  local chunk = assert(loadfile(files[i]))
  chunk("Unbored", ns)
end

local S = ns.Snapshot
UnboredDB = { version = 1, shareData = true }
UnboredCharDB = {}
ns.DB = UnboredDB

local function readFile(path)
  local file = assert(io.open(path, "r"))
  local text = file:read("*a")
  file:close()
  return text
end

local function sameList(a, b)
  if #a ~= #b then
    return false
  end
  for i = 1, #a do
    if a[i] ~= b[i] then
      return false
    end
  end
  return true
end

-- Packer: the shared fixture, then 40k ids.
-- The fixture is larger than the in-game JSON reader's safety cap, and holds
-- only arrays, numbers and plain strings, so it is read as a Lua table.
local function jsonFixture(path)
  local text = readFile(path):gsub("%[", "{"):gsub("%]", "}"):gsub('"([%w_ ]+)"%s*:', '["%1"]=')
  return assert(loadstring("return " .. text))()
end
local fixture = jsonFixture("../packages/contracts/fixtures/packed-ids.json")
check(type(fixture) == "table" and #fixture.cases >= 4, "packed id fixture loads")
for _, case in ipairs(fixture.cases) do
  local packed = ns.Pack.Encode(case.input or case.ids)
  check(sameList(packed, case.packed), "pack matches fixture: " .. case.name)
  check(sameList(ns.Pack.Decode(case.packed), case.ids), "unpack matches fixture: " .. case.name)
end

local many = {}
for i = 1, 40000 do
  many[i] = 40000 + i * 3 + (i % 2)
end
local started = os.clock()
local packed = ns.Pack.Encode(many)
local elapsed = os.clock() - started
check(packed[1] == "ids1", "packed set is tagged")
local longest = 0
for i = 2, #packed do
  longest = math.max(longest, #packed[i])
end
check(longest <= 4000, "chunks hold at most 4000 characters")
check(#packed > 2, "40k ids take several chunks")
check(ns.Pack.Count(packed) == 40000, "40k ids round trip in count")
check(sameList(ns.Pack.Decode(packed), many), "40k ids round trip exactly")
check(elapsed < 1, "packing 40k ids is fast")
check(ns.Pack.Set(packed)[many[123]] == true, "set lookup")
for _, case in ipairs(fixture.valueCases) do
  local rows = {}
  for i = 1, #case.ids do
    rows[case.ids[i]] = case.values[i]
  end
  check(sameList(ns.Pack.EncodeValues(rows), case.packed), "value pack matches fixture: " .. case.name)
  local decoded = ns.Pack.DecodeValues(case.packed)
  for i = 1, #case.ids do
    check(sameList(decoded[case.ids[i]] or {}, case.values[i]), "value unpack matches fixture: " .. case.name)
  end
  check(ns.Pack.Count(case.packed) == #case.ids, "value sets count their rows: " .. case.name)
end
local added = ns.Pack.Add(ns.Pack.Encode({ 5, 9 }), 7)
check(sameList(ns.Pack.Decode(added), { 5, 7, 9 }), "add keeps order")
check(not ns.Pack.IsPacked({ "nope" }), "an untagged table is not a set")

-- The shared snapshot fixture reads back through the packer.
local sandbox = {}
local fixtureChunk = assert(loadfile("../packages/contracts/fixtures/snapshot.lua"))
setfenv(fixtureChunk, sandbox)
fixtureChunk()
local fixtureQuests = sandbox.UnboredCharDB.data.sections.questsDone.body
check(sandbox.UnboredCharDB.data.schema == 2, "fixture is schema 2")
check(ns.Pack.Count(fixtureQuests.ids) == fixtureQuests.count, "fixture quest set unpacks to its count")
check(ns.Pack.Count(sandbox.UnboredDB.data.sections.mounts.body.ids) == 6, "fixture mount set unpacks")

-- Mocked game ------------------------------------------------------------

local items = {}
local function setBags(count, idBase)
  items = {}
  for i = 1, count do
    items[i] = { itemID = idBase + i, stackCount = (i % 20) + 1, hyperlink = "|cffa335ee|Hitem:" .. (idBase + i)
      .. "::::::::80:63::13:3:10354:1540:6652|h[Thing]|h|r" }
  end
end
setBags(30, 200000)

Enum = { BagIndex = { Backpack = 0, Bag_1 = 1, Bag_2 = 2, Bag_3 = 3, Bag_4 = 4, ReagentBag = 5,
  Characterbanktab = -1, CharacterBankTab_1 = 6, AccountBankTab_1 = 12 },
  TransmogCollectionType = { None = 0, Head = 1, Shoulder = 2, Count = 30 } }
C_Container = {
  GetContainerNumSlots = function(bag)
    if bag == 0 then
      return #items
    end
    return 0
  end,
  GetContainerItemInfo = function(bag, slot)
    if bag == 0 then
      return items[slot]
    end
    return nil
  end,
}
C_Item = {
  GetItemInfoInstant = function(itemID)
    return itemID, "Armor", "Cloth", "INVTYPE_HEAD", 0, itemID % 2 == 0 and 4 or 0
  end,
  GetDetailedItemLevelInfo = function()
    return 650
  end,
}

local money = 183420000
function UnitName() return "Mira" end
function GetRealmName() return "Silvermoon" end
function UnitClass() return "Mage", "MAGE", 8 end
function UnitRace() return "Blood Elf", "BloodElf", 10 end
function UnitFactionGroup() return "Horde" end
function UnitLevel() return 80 end
function UnitXP() return 0 end
function UnitXPMax() return 0 end
function GetXPExhaustion() return nil end
function GetSpecialization() return 2 end
function GetSpecializationInfo() return 63, "Fire" end
function GetAverageItemLevel() return 655, 652.44 end
function GetMoney() return money end
function GetBindLocation() return "Dornogal" end
function IsInGuild() return true end
function GetInventoryItemLink(_, slot)
  if slot == 1 then
    return "|cffa335ee|Hitem:212065::::::::80:63::3:5:10356:10372:1540:6652|h[Helm]|h|r"
  end
  return nil
end
function GetProfessions() return 1, 2, nil, nil, 3 end
function GetProfessionInfo(index)
  local rows = { { "Alchemy", 171 }, { "Herbalism", 182 }, { "Cooking", 185 } }
  local row = rows[index]
  return row[1], nil, 100, 100, 0, 0, row[2]
end

local completed = {}
for i = 1, 500 do
  completed[i] = 50000 + i * 2
end
C_QuestLog = {
  GetAllCompletedQuestIDs = function() return completed end,
  GetNumQuestLogEntries = function() return 2 end,
  GetInfo = function(i)
    if i == 1 then
      return { isHeader = true, title = "Khaz Algar" }
    end
    return { questID = 78713, title = "The Weight of Duty", level = 80 }
  end,
  IsComplete = function() return false end,
  GetQuestWatchType = function() return 0 end,
  GetQuestObjectives = function()
    return { { text = "Speak to Moira", finished = false, numFulfilled = 0, numRequired = 1 } }
  end,
}

local currencyHeaders = { expanded = false }
C_CurrencyInfo = {
  GetCurrencyListSize = function()
    return currencyHeaders.expanded and 3 or 1
  end,
  GetCurrencyListInfo = function(i)
    if i == 1 then
      return { name = "The War Within", isHeader = true, isHeaderExpanded = currencyHeaders.expanded }
    elseif i == 2 then
      return { currencyID = 3008, quantity = 1200, maxQuantity = 0, isAccountWide = false }
    elseif i == 3 then
      return { currencyID = 2815, quantity = SECRET }
    end
  end,
  ExpandCurrencyList = function(_, expand)
    currencyHeaders.expanded = expand
    currencyHeaders.touched = (currencyHeaders.touched or 0) + 1
  end,
}

local factionsOpen = false
C_Reputation = {
  GetNumFactions = function() return factionsOpen and 3 or 1 end,
  GetFactionDataByIndex = function(i)
    if i == 1 then
      return { factionID = 2590, isHeader = true, isCollapsed = not factionsOpen }
    elseif i == 2 then
      return { factionID = 2594, reaction = 6, currentStanding = 4200, currentReactionThreshold = 3000,
        nextReactionThreshold = 9000, isAccountWide = true }
    elseif i == 3 then
      return { factionID = 2600, reaction = 5, currentStanding = 100 }
    end
  end,
  ExpandAllFactionHeaders = function() factionsOpen = true end,
  CollapseFactionHeader = function() factionsOpen = false end,
}
C_MajorFactions = {
  GetMajorFactionIDs = function() return { 2590 } end,
  GetMajorFactionData = function() return { renownLevel = 12 } end,
}

C_MountJournal = {
  GetMountIDs = function() return { 6, 7, 11 } end,
  GetMountInfoByID = function(id)
    return "Mount", 1, 1, false, true, 0, false, false, 0, false, id ~= 11
  end,
}
C_PetJournal = {
  GetOwnedPetIDs = function() return { "BattlePet-1", "BattlePet-2" } end,
  GetPetInfoByPetID = function(petID)
    return petID == "BattlePet-1" and 39 or 40, nil, 25
  end,
  GetPetStats = function() return 1, 1, 1, 1, 4 end,
}
local toyFilters = { collected = false }
C_ToyBox = {
  GetNumFilteredToys = function() return 2 end,
  GetToyFromIndex = function(i) return i == 1 and 1973 or 54452 end,
  GetCollectedShown = function() return toyFilters.collected end,
  SetCollectedShown = function(v) toyFilters.collected = v end,
  GetNumLearnedDisplayedToys = function() return 2 end,
}
function PlayerHasToy() return true end
C_TransmogCollection = {
  GetCategoryCollectedCount = function(id) return id * 10 end,
  GetCategoryTotal = function(id) return id * 20 end,
}

function GetCategoryList() return { 92, 96 } end
function GetCategoryNumAchievements() return 2 end
function GetAchievementInfo(category, index)
  local id = category * 10 + index
  return id, "A", 10, true, 1, 1, 24, "", 0, 0, "", false, index == 1
end
function GetTotalAchievementPoints() return 12450 end

function GetNumSavedInstances() return 1 end
function GetSavedInstanceInfo()
  return "Nerub-ar Palace", 1, 3600, 16, true, false, 0, true, 20, "Mythic", 8, 3, false, 2657
end
function GetSavedInstanceEncounterInfo(_, j) return "Boss " .. j, nil, j <= 3 end
function GetNumSavedWorldBosses() return 0 end
function GetSavedWorldBossInfo() return nil end

C_PlayerInfo = {
  GetPlayerMythicPlusRatingSummary = function()
    return { currentSeasonScore = 2450, runs = { { challengeModeID = 501, mapScore = 300, bestRunLevel = 10,
      bestRunDurationMS = 1700000, finishedSuccess = true } } }
  end,
}
C_MythicPlus = {
  GetOwnedKeystoneLevel = function() return 11 end,
  GetOwnedKeystoneChallengeMapID = function() return 503 end,
}
C_WeeklyRewards = {
  GetActivities = function() return { { type = 1, index = 1, threshold = 1, progress = 2, level = 10, id = 99 } } end,
  HasAvailableRewards = function() return false end,
}
C_Calendar = {
  GetMonthInfo = function(offset)
    return { month = 10 + (offset or 0), year = 2026, numDays = 31 }
  end,
  GetNumDayEvents = function(_, day) return day == 31 and 2 or 0 end,
  GetDayEvent = function(_, _, index)
    if index == 1 then
      return { eventID = 1, title = "Hallow's End", calendarType = "HOLIDAY",
        startTime = { year = 2026, month = 10, monthDay = 18, hour = 10, minute = 0 } }
    end
    return { eventID = 2, title = "Bob's raid night", calendarType = "PLAYER" }
  end,
}
C_DateAndTime = {
  GetCurrentCalendarTime = function()
    return { year = 2026, month = 10, monthDay = 30, hour = 13, minute = 0 }
  end,
}
C_ClassTalents = {
  GetActiveConfigID = function() return 100 end,
  GetConfigIDsBySpecID = function() return { 200, 201 } end,
  GetLastSelectedSavedConfigID = function() return 200 end,
  GetActiveHeroTalentSpec = function() return 39 end,
}
C_Traits = {
  GetConfigInfo = function(id) return { name = "Loadout " .. id } end,
  GenerateImportString = function() return "CAQAAAAAAAAAAAAAAAAAAAAAAA" end,
}
C_AddOns = { IsAddOnLoaded = function(name) return name == "TomTom" end }
C_Map = { GetBestMapForUnit = function() return 2339 end, GetMapInfo = function() return { name = "Dornogal" } end }
function GetRealZoneText() return "Dornogal" end

-- Collectors --------------------------------------------------------------

UnboredCharDB.sessions = { { start = 1, zones = {} } }
for _, name in ipairs(S.order) do
  S.Read(name, "login")
end

local function body(name)
  return S.Body(name)
end

check(body("char") and body("char").level == 80 and body("char").classFile == "MAGE", "char reads class and level")
check(body("char").money == 183420000 and body("char").inGuild == true, "char reads money and guild flag only")
check(body("char").ilvl == 652.4, "char rounds item level")
check(body("char").lang == ns.LANG, "char says the language Bory speaks, for the Server's ideas")
check(body("gear") and body("gear").slots[1].item:find("^item:212065:") ~= nil, "gear keeps the item string")
check(body("bags") and body("bags").count == 30, "bags count every item")
check(ns.Pack.DecodeValues(body("bags").items)[200001][1] == 2, "bag counts are packed per item")
check(body("bags").gear and #body("bags").gear == 15, "bags keep item strings for gear only")
check(body("bank") == nil, "bank is not read while closed")
check(body("currencies") and #body("currencies").list == 1, "a secret currency amount is dropped")
check(currencyHeaders.expanded == false and currencyHeaders.touched == 2, "currency headers are restored")
check(body("professions") and #body("professions").list == 3, "professions list")
check(body("recipes") == nil, "recipes wait for the profession window")
check(body("questsDone") and body("questsDone").count == 500, "quests done count")
check(ns.Pack.Count(body("questsDone").ids) == 500, "quests done are packed")
check(S.QuestDone(50002) == true and S.QuestDone(50003) == false, "quest done lookup from the snapshot")
check(body("questLog") and #body("questLog").quests == 1, "quest log skips headers")
check(body("questLog").quests[1].objectives[1].need == 1, "quest log objectives")
check(body("reputation") and #body("reputation").factions == 2, "collapsed factions are read")
check(factionsOpen == false, "faction headers are collapsed again")
check(body("reputation").factions[1].accountWide == true, "account-wide reputation is flagged")
check(body("reputation").renown[1].level == 12, "renown levels")
check(body("achievements") and body("achievements").count == 4, "achievements done")
check(body("achievementsMine") and body("achievementsMine").count == 2, "achievements earned by this character")
check(body("mounts") and body("mounts").count == 2 and body("mounts").total == 3, "mounts collected")
check(body("pets") and body("pets").count == 2, "pets owned")
check(ns.Pack.DecodeValues(body("pets").species)[39][3] == 4, "pet species keep count, level and quality")
check(body("toys") and body("toys").count == 2, "toys owned")
check(toyFilters.collected == false, "toy filters are restored")
check(body("transmog") and body("transmog").collected == 30, "transmog totals")
check(body("lockouts") and body("lockouts").instances[1].killed == 3, "lockouts")
check(#body("lockouts").instances[1].encounters == 8, "lockout encounters")
check(body("mplus") and body("mplus").keyLevel == 11 and body("mplus").runs[1].timed, "mythic plus")
check(body("vault") and body("vault").activities[1].progress == 2, "great vault")
check(body("talents") and body("talents").specs["63"].import ~= nil, "talents import string")
check(#body("talents").specs["63"].loadouts == 2, "talent loadouts")
check(body("calendar") and #body("calendar").events == 1, "calendar keeps game events only")
check(body("calendar").events[1].title == "Hallow's End", "calendar holiday title")
check(body("sessions") and body("sessions").list[1].start == 1, "sessions")
check(body("addons") and body("addons").TomTom == true and body("addons").Bagnon == false, "helper addons")
check(UnboredDB.data.sections.mounts ~= nil and UnboredCharDB.data.sections.mounts == nil, "mounts are per Account")
check(UnboredCharDB.data.schema == 2 and UnboredDB.data.schema == 2, "both files are schema 2")
local section = S.Get("char")
check(section.v == 1 and section.src == "login" and type(section.at) == "number", "sections carry v, at and src")

-- Secret values anywhere in a body are dropped, never stored.
money = SECRET
S.Read("char", "event")
check(body("char").money == nil, "a secret money value is dropped")
check(S.Clean({ a = { b = SECRET, c = 1 } }).a.b == nil, "clean drops nested secrets")
money = 1000

-- An empty read never replaces data.
local oldGear = body("gear")
local realLink = GetInventoryItemLink
GetInventoryItemLink = function() return nil end
S.Read("gear", "event")
check(body("gear") == oldGear, "an empty gear read keeps the last good one")
GetInventoryItemLink = realLink

-- Combat: nothing is read, the Section waits for the end of combat.
combat = true
local before = body("bags")
setBags(5, 300000)
check(S.Read("bags", "event") == false, "no reads in combat")
check(body("bags") == before, "combat leaves the Section alone")
check(S.dirty.bags ~= nil, "the read waits for the end of combat")
combat = false
S.dirtyAt = 0
check(S.Pulse() == true, "the pulse queues after combat")
S.Drain()
check(body("bags").count == 5, "the delayed read lands after combat")

-- Events: a delta for achievements, a settled mark for bags.
S.loginDone = true
S.OnEvent("ACHIEVEMENT_EARNED", 4242, false)
check(ns.Pack.Set(body("achievements").ids)[4242], "achievement earned is added to the Account set")
check(ns.Pack.Set(body("achievementsMine").ids)[4242], "and to this character's set")
setBags(7, 400000)
S.OnEvent("BAG_UPDATE_DELAYED")
check(S.dirty.bags == "event", "a bag event marks the Section")
check(S.Pulse() == false, "nothing is read before the burst settles")
S.dirtyAt = ns.Now() - 5
S.Pulse()
S.Drain()
check(body("bags").count == 7, "settled bag read")

-- Window reads: the bank only while it is open.
items[1].itemID = 1
S.OnEvent("BANKFRAME_OPENED")
check(S.IsOpen("bank") and S.dirty.bank == "window", "opening the bank marks its Section")
C_Container.GetContainerNumSlots = function(bag)
  if bag == 0 or bag == 6 or bag == 12 then
    return #items
  end
  return 0
end
C_Container.GetContainerItemInfo = function(_, slot)
  return items[slot]
end
S.dirtyAt = 0
S.Pulse()
S.Drain()
check(body("bank") and body("bank").count == 7 and S.Get("bank").src == "window", "bank read while open")
check(body("warband") and UnboredDB.data.sections.warband ~= nil, "warband bank goes to the Account")
S.OnEvent("BANKFRAME_CLOSED")
check(not S.IsOpen("bank"), "closing the bank stops bank reads")

-- Staging: with no budget left every read hands the frame back.
S.BUDGET_MS = 0
for _, name in ipairs({ "mounts", "transmog", "addons" }) do
  S.Queue(name, "login")
end
clock = 100
local steps = 0
while S.Step() do
  steps = steps + 1
  clock = clock + 10
  if steps > 50 then
    break
  end
end
check(steps >= 2, "staged reads spread over frames")
check(#S.queue == 0, "the staged queue drains")
S.BUDGET_MS = 4

-- Daily achievement scan: skipped within 24 h.
local achievementsDef = S.defs.achievements
check(achievementsDef.every == 86400, "achievements scan once a day")
S.queue = {}
S.LoginPass()
local queuedAchievements = false
for _, job in ipairs(S.queue) do
  if job.name == "achievements" then
    queuedAchievements = true
  end
end
check(not queuedAchievements, "the login pass skips a fresh achievement scan")
S.Drain()

-- Played: our request is silenced and the answer stored.
local shown = 0
function ChatFrame_DisplayTimePlayed() shown = shown + 1 end
local original = ChatFrame_DisplayTimePlayed
function RequestTimePlayed() end
S.Read("played", "login")
check(ChatFrame_DisplayTimePlayed ~= original, "time played chat is silenced for our request")
S.OnEvent("TIME_PLAYED_MSG", 360000, 3600)
check(ChatFrame_DisplayTimePlayed == original, "the chat display is restored")
check(body("played") and body("played").total == 360000, "time played stored")

-- Unresolved Plan ids are kept for the Server.
S.NoteUnresolved("item", 999999)
S.NoteUnresolved("item", 999999)
check(#body("unresolvedIds").list == 1, "unresolved ids are noted once")

-- Logout stamps sessions without reading the game.
S.OnEvent("PLAYER_LOGOUT")
check(body("sessions") ~= nil, "logout keeps sessions")
check(UnboredCharDB.data.savedAt == ns.Now() and UnboredDB.data.savedAt == ns.Now(),
  "logout stamps when the files were saved, for the Companion upload")

-- Opt-out: only what a Plan Request needs.
UnboredDB.shareData = false
S.ApplySharing()
local left = {}
for name in pairs(UnboredCharDB.data.sections) do
  left[#left + 1] = name
end
table.sort(left)
check(table.concat(left, ",") == "char,gear,questLog,sessions", "opt-out keeps only the four Sections: "
  .. table.concat(left, ","))
check(next(UnboredDB.data.sections) == nil, "opt-out clears the Account Sections")
check(S.Read("mounts", "login") == false and UnboredDB.data.sections.mounts == nil, "opt-out stops new reads")
check(S.Read("char", "login") == true, "opt-out still reads char")
UnboredDB.shareData = true

-- Worst case size (D54) -----------------------------------------------------

local function serialize(value, indent, out)
  local kind = type(value)
  if kind == "string" then
    out[#out + 1] = string.format("%q", value)
  elseif kind == "number" or kind == "boolean" then
    out[#out + 1] = tostring(value)
  elseif kind == "table" then
    out[#out + 1] = "{\n"
    local pad = string.rep("\t", indent + 1)
    local n = #value
    for i = 1, n do
      out[#out + 1] = pad
      serialize(value[i], indent + 1, out)
      out[#out + 1] = ", -- [" .. i .. "]\n"
    end
    for key, item in pairs(value) do
      if not (type(key) == "number" and key >= 1 and key <= n and key == math.floor(key)) then
        out[#out + 1] = pad .. "[" .. (type(key) == "string" and string.format("%q", key) or tostring(key)) .. "] = "
        serialize(item, indent + 1, out)
        out[#out + 1] = ",\n"
      end
    end
    out[#out + 1] = string.rep("\t", indent) .. "}"
  else
    out[#out + 1] = "nil"
  end
end

local function fileSize(global, value)
  local out = { global .. " = " }
  serialize(value, 0, out)
  out[#out + 1] = "\n"
  return #table.concat(out)
end

local function literals(value)
  local seen, count = {}, 0
  local function walk(v)
    if type(v) == "table" then
      for key, item in pairs(v) do
        walk(key)
        walk(item)
      end
    elseif type(v) == "string" or type(v) == "number" then
      local key = type(v) .. ":" .. tostring(v)
      if not seen[key] then
        seen[key] = true
        count = count + 1
      end
    end
  end
  walk(value)
  return count
end

local function range(from, count, step)
  local out = {}
  for i = 1, count do
    out[i] = from + (i - 1) * (step or 1)
  end
  return out
end

-- The heaviest player we expect: 40k quests, full bags and banks, every
-- recipe of two professions, 6k achievements, 1.5k mounts, pets and toys.
completed = {}
for i = 1, 40000 do
  completed[i] = 1000 + i * 2 + (i % 3)
end
-- Every slot a distinct item: bags ~250 slots, 6 bank tabs and 5 warband tabs
-- of 98 slots each.
setBags(600, 100000)
local SLOTS = { [0] = 250, [6] = 588, [12] = 490 }
C_Container.GetContainerNumSlots = function(bag)
  return SLOTS[bag] or 0
end
C_Container.GetContainerItemInfo = function(bag, slot)
  local item = items[slot]
  return item and { itemID = item.itemID + bag * 1000, stackCount = item.stackCount, hyperlink = item.hyperlink }
end
for _, name in ipairs({ "questsDone", "bags" }) do
  S.Read(name, "login")
end
S.open.bank, S.open.warband = true, true
S.Read("bank", "window")
S.Read("warband", "window")
local function writeSet(name, ids, extra)
  local b = extra or {}
  b.ids = ns.Pack.Encode(ids)
  b.count = #ids
  S.Write(name, b, "login")
end
writeSet("achievements", range(1, 6000, 3), { points = 30000, scannedAt = ns.Now() })
writeSet("achievementsMine", range(1, 3000, 5))
writeSet("mounts", range(6, 1500, 2), { total = 1600 })
writeSet("toys", range(1000, 1200, 37))
local species = {}
for i = 1, 1500 do
  species[30 + i] = { (i % 3) + 1, (i % 25) + 1, (i % 4) + 1 }
end
S.Write("pets", { species = ns.Pack.EncodeValues(species), count = 3000 }, "login")
local byProfession = {}
for p = 1, 2 do
  byProfession[tostring(170 + p)] = { name = "Prof " .. p, learned = ns.Pack.Encode(range(400000 + p * 5000, 1200)),
    seenAt = ns.Now() }
end
S.Write("recipes", { byProfession = byProfession }, "window")
local factions = {}
for i = 1, 400 do
  factions[i] = { factionID = 1000 + i, reaction = 5, standing = i * 37, min = 3000, max = 9000 }
end
S.Write("reputation", { factions = factions }, "login")
local currencies = {}
for i = 1, 300 do
  currencies[i] = { id = 2000 + i, quantity = i * 13, max = 2000, week = i, weekMax = 500 }
end
S.Write("currencies", { list = currencies }, "login")
local sessions = {}
for i = 1, 20 do
  local maps = {}
  for m = 1, 15 do
    maps[m] = { mapID = 2200 + m, minutes = m * 1.5 }
  end
  sessions[i] = { start = 1761000000 + i * 3600, stop = 1761000000 + i * 3600 + 1800, zones = { "Dornogal" },
    maps = maps, deaths = i }
end
S.Write("sessions", { list = sessions }, "event")

local quests = {}
for i = 1, 35 do
  quests[i] = { questID = 80000 + i, title = "A quest title of usual length " .. i, level = 80, complete = false,
    tracked = i < 5, objectives = { { text = "Defeat 8 creatures of this zone", done = false, have = 2, need = 8 },
      { text = "Collect 5 things", done = true, have = 5, need = 5 } } }
end
S.Write("questLog", { quests = quests }, "event")

S.Enforce()
local charBytes = fileSize("UnboredCharDB", UnboredCharDB)
local accountBytes = fileSize("UnboredDB", UnboredDB)
local charLiterals = literals(UnboredCharDB)
local accountLiterals = literals(UnboredDB)
check(charBytes <= S.TARGET_BYTES.char, "worst-case Character file within 400 KB: " .. charBytes)
check(accountBytes <= S.TARGET_BYTES.account, "worst-case Account file within 300 KB: " .. accountBytes)
check(charLiterals < S.MAX_LITERALS, "worst-case Character literals under 30k: " .. charLiterals)
check(accountLiterals < S.MAX_LITERALS, "worst-case Account literals under 30k: " .. accountLiterals)
check(UnboredCharDB.data.dropped == nil, "nothing is dropped within the budget")
local estimate = S.Measure(UnboredCharDB)
check(estimate >= charBytes * 0.8 and estimate <= charBytes * 1.5, "the size estimate is close: " .. estimate)

if os.getenv("UNBORED_SIZES") then
  print(string.format("Character file %d bytes, %d literals", charBytes, charLiterals))
  print(string.format("Account file %d bytes, %d literals", accountBytes, accountLiterals))
  for _, name in ipairs(S.order) do
    local s = S.Get(name)
    if s then
      print(string.format("  %-18s %-7s %8d bytes", name, S.defs[name].scope, fileSize("x", s) - 5))
    end
  end
end

-- Over the cap the lowest priority Sections go first and are recorded.
local lowest
for name in pairs(UnboredCharDB.data.sections) do
  if not S.ESSENTIAL[name] and (not lowest or S.defs[name].prio < S.defs[lowest].prio) then
    lowest = name
  end
end
S.CAP_BYTES = estimate - 1000
S.Enforce()
check(type(UnboredCharDB.data.dropped) == "table", "over cap records dropped Sections")
check(UnboredCharDB.data.dropped[lowest] ~= nil, "the lowest priority Section goes first: " .. tostring(lowest))
check(UnboredCharDB.data.sections.char ~= nil and UnboredCharDB.data.sections.questLog ~= nil,
  "essential Sections are never dropped")
check(UnboredCharDB.data.sections.questsDone ~= nil, "higher priority Sections stay when enough was freed")
S.CAP_BYTES = 1024 * 1024
for name in pairs(UnboredCharDB.data.dropped) do
  S.Write(name, { again = true }, "event")
end
check(UnboredCharDB.data.dropped == nil, "a fresh write clears its dropped note")

if fails > 0 then
  io.stderr:write(fails .. " of " .. checks .. " data checks failed\n")
  os.exit(1)
end
print(checks .. " data checks passed")
