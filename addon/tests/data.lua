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
  "Core/Data/QuestLines.lua",
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
  IsQuestFlaggedCompleted = function(id) return id > 50000 and id <= 51000 and id % 2 == 0 end,
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
  GetMajorFactionIDs = function() return { 2590, 2594 } end,
  GetMajorFactionData = function(id)
    if id == 2594 then
      return { renownLevel = 25, renownReputationEarned = 0, renownLevelThreshold = 2500 }
    end
    return { renownLevel = 12, renownReputationEarned = 2000, renownLevelThreshold = 2500 }
  end,
  HasMaximumRenown = function(id) return id == 2594 end,
  GetRenownRewardsForLevel = function(id, level)
    if id ~= 2590 or level ~= 13 then
      return {}
    end
    return {
      { renownRewardID = 1, mountID = 2192, itemID = 223571, name = "Shale Ramolith", isCollected = false },
      { renownRewardID = 2, titleMaskID = 573, name = string.rep("Long title ", 10) },
      { renownRewardID = 3, transmogSetID = 4123 },
      { renownRewardID = 4, spellID = 99, isCollected = true },
      { renownRewardID = 5, itemID = 5 },
    }
  end,
}
C_Reputation.IsFactionParagon = function(id) return id == 2594 end
C_Reputation.GetFactionParagonInfo = function() return 32500, 10000, 85000, true end

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
function GetAchievementNumCriteria() return 0 end
function GetAchievementCriteriaInfo() return nil end

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
      return { eventID = 1, title = "Hallow's End", calendarType = "HOLIDAY", iconTexture = 235460,
        sequenceType = "ONGOING", numSequenceDays = 14, inviteStatus = 2, invitedBy = "Bob",
        startTime = { year = 2026, month = 10, monthDay = 18, hour = 10, minute = 0 } }
    end
    return { eventID = 2, title = "Bob's raid night", calendarType = "PLAYER" }
  end,
  GetHolidayInfo = function(offset)
    return offset <= 1 and { name = "Hallow's End", description = string.rep("Candy. ", 80) } or nil
  end,
}
-- Quest chains (D132-D134): a campaign, a chain of a log quest, a map chain.
local mapRequests = {}
C_CampaignInfo = {
  GetAvailableCampaigns = function() return { 7, 8 } end,
  GetState = function(id) return id == 7 and 2 or 1 end,
  GetCurrentChapterID = function(id) return id == 7 and 300 or 301 end,
  GetCampaignChapterInfo = function() return { name = "Chapter Three" } end,
  GetCampaignInfo = function() return { name = "The War Within" } end,
}
C_QuestLine = {
  GetQuestLineInfo = function(questID)
    if questID == 78713 then
      return { questLineID = 400, questLineName = "Duty Calls", x = 0.412, y = 0.6, isLocalStory = true }
    end
    return nil
  end,
  GetQuestLineQuests = function(id)
    if id == 300 then return { 50002, 50004, 79000, 79001 } end
    if id == 400 then return { 50002, 78713 } end
    if id == 500 then return { 79100, 79101, 79102 } end
    if id == 501 then return { 79200 } end
    if id == 502 then return { 50002 } end
    if id == 505 then return { 79300, 79301 } end
    return {}
  end,
  IsComplete = function(id) return id == 503 end,
  RequestQuestLinesForMap = function(mapID) mapRequests[#mapRequests + 1] = mapID end,
  GetAvailableQuestLines = function(mapID)
    if mapID ~= 2339 then return {} end
    return {
      { questLineID = 500, questLineName = "Started Here", inProgress = true, x = 0.5, y = 0.5 },
      { questLineID = 501, questLineName = "A Daily", inProgress = true, isDaily = true },
      { questLineID = 502, questLineName = "Done Already", inProgress = true },
      { questLineID = 503, questLineName = "Complete", inProgress = true },
      { questLineID = 504, questLineName = "Not Started", isQuestStart = true },
      { questLineID = 505, questLineName = "Important Start", isImportant = true, isQuestStart = true },
    }
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
local renownNext = body("reputation").renown[1].next or {}
check(#renownNext == 4 and renownNext[1].mountID == 2192 and renownNext[1].itemID == 223571
  and renownNext[1].name == "Shale Ramolith", "renown keeps up to four next-level rewards with their ids")
check(renownNext[2].titleMaskID == 573 and #renownNext[2].name <= 60, "a reward name is capped at 60 bytes")
check(renownNext[4].collected == true and renownNext[1].collected == nil, "collected rewards are flagged")
check(body("reputation").renown[2].max == true and body("reputation").renown[2].next == nil,
  "max renown has no next rewards")
check(S.Get("reputation").v == 2, "reputation is v2")
local paragonRow
for _, faction in ipairs(body("reputation").factions) do
  if faction.factionID == 2594 then
    paragonRow = faction.paragon
  end
end
check(paragonRow and paragonRow.value == 2500 and paragonRow.threshold == 10000 and paragonRow.questID == 85000
  and paragonRow.pending == true, "paragon keeps this cycle's progress, the quest and a waiting reward")
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
local hallows = body("calendar").events[1]
check(hallows.texture == 235460 and hallows.sequenceType == "ONGOING" and hallows.numSequenceDays == 14,
  "calendar v2 keeps the icon texture and the sequence")
check(hallows.description and #hallows.description <= 300, "tomorrow's holiday has its description, capped")
check(hallows.invitedBy == nil and hallows.inviteStatus == nil, "no invite fields are read")
check(S.Get("calendar").v == 2, "calendar is v2")
do
  local realCalendar, realTime, realSecret = C_Calendar, C_DateAndTime, issecretvalue
  local function forbidden()
    error("calendar used a secret before dropping it")
  end
  local secret = setmetatable({}, { __index = forbidden, __tostring = forbidden, __sub = forbidden,
    __add = forbidden, __lt = forbidden })
  issecretvalue = function(value) return rawequal(value, secret) or realSecret(value) end
  local today, view, month, event
  C_DateAndTime = { GetCurrentCalendarTime = function() return today end }
  C_Calendar = {
    GetMonthInfo = function(offset) return offset == 0 and view or month end,
    GetNumDayEvents = function() return 1 end,
    GetDayEvent = function() return event end,
  }
  local function resetCalendar()
    today = { year = 2026, month = 10, monthDay = 30 }
    view = { year = 2026, month = 9, numDays = 30 }
    month = { year = 2026, month = 10, numDays = 31 }
    event = { eventID = 1, calendarType = "HOLIDAY", title = "Holiday" }
  end
  for _, field in ipairs({ "year", "month", "monthDay" }) do
    for _, value in ipairs({ false, secret }) do
      resetCalendar()
      if value == false then today[field] = nil else today[field] = value end
      local ok, result = pcall(S.ReadCalendar)
      check(ok and result == nil, "calendar defers when today's " .. field .. " is missing or secret")
    end
  end
  for _, source in ipairs({ "today", "view", "month" }) do
    resetCalendar()
    if source == "today" then today = secret
    elseif source == "view" then view = secret
    else month = secret end
    local ok, result = pcall(S.ReadCalendar)
    check(ok and result == nil, "calendar drops a secret " .. source .. " table before indexing")
  end
  resetCalendar()
  view.year = secret
  local ok, result = pcall(S.ReadCalendar)
  check(ok and result == nil, "calendar sanitizes the viewed year before offset arithmetic")
  resetCalendar()
  month.numDays = secret
  ok, result = pcall(S.ReadCalendar)
  check(ok and result == nil, "calendar needs a readable month length")
  resetCalendar()
  event.eventID, event.startTime, event.endTime = secret, secret, secret
  ok, result = pcall(S.ReadCalendar)
  check(ok and result and #result.events == 1 and result.events[1].title == "Holiday"
    and result.events[1].eventID == nil and result.events[1].starts == nil,
    "calendar deduplicates with sanitized values and drops secret dates")
  event.title = secret
  ok, result = pcall(S.ReadCalendar)
  check(ok and result and #result.events == 0, "calendar drops an event with neither readable id nor title")
  event = secret
  ok, result = pcall(S.ReadCalendar)
  check(ok and result and #result.events == 0, "calendar drops secret event tables before indexing")
  resetCalendar()
  event.calendarType = secret
  ok, result = pcall(S.ReadCalendar)
  check(ok and result and #result.events == 0, "calendar only reads events with an allowed plain kind")
  event = setmetatable({ calendarType = "PLAYER" }, { __index = function()
    error("read another player's event details")
  end })
  ok, result = pcall(S.ReadCalendar)
  check(ok and result and #result.events == 0, "calendar never inspects player-event details")
  resetCalendar()
  C_Calendar.GetHolidayInfo = function() return secret end
  ok, result = pcall(S.ReadCalendar)
  check(ok and result and result.events[1].description == nil,
    "calendar drops a secret holiday description table before indexing")
  resetCalendar()
  local lastGood = body("calendar")
  C_Calendar.GetMonthInfo = function(offset) return offset == 0 and view or offset == 1 and month or nil end
  ok, result = pcall(S.ReadCalendar)
  check(ok and result == nil, "an unavailable next month does not produce a partial calendar")
  S.Read("calendar", "event")
  check(body("calendar") == lastGood, "an incomplete calendar read preserves the last full Section")

  today = { year = 2026, month = 1, monthDay = 31 }
  view = { year = 2025, month = 12, numDays = 31 }
  local days = {}
  C_Calendar.GetMonthInfo = function(offset)
    if offset == 0 then return view end
    return { year = 2026, month = offset, numDays = offset == 1 and 31 or 28 }
  end
  C_Calendar.GetNumDayEvents = function(offset, day)
    days[#days + 1] = { offset, day }
    return 0
  end
  result = S.ReadCalendar()
  check(result and #days == 15 and days[1][1] == 1 and days[1][2] == 31
    and days[2][1] == 2 and days[2][2] == 1 and days[15][2] == 14,
    "calendar uses the viewed month offset across a year and month boundary")
  C_Calendar, C_DateAndTime, issecretvalue = realCalendar, realTime, realSecret
end
local lines = body("questLines") and body("questLines").lines or {}
local byLine = {}
for i = 1, #lines do
  byLine[lines[i].questLineID] = lines[i]
end
check(byLine[300] and byLine[300].campaignID == 7 and byLine[300].chapter == "Chapter Three"
  and byLine[300].done == 2 and byLine[300].total == 4 and byLine[300].nextQuestID == 79000
  and byLine[300].flags == "c", "a campaign in progress is a chain with its chapter and progress")
check(byLine[301] == nil, "a finished campaign is not")
check(byLine[400] and byLine[400].name == "Duty Calls" and byLine[400].x == 0.412 and byLine[400].flags == "l"
  and byLine[400].nextQuestID == 78713, "the chain of a quest in the log, with its pin")
check(byLine[500] and byLine[500].mapID == 2339 and byLine[500].done == 0, "a chain started on this map")
check(not byLine[501] and not byLine[502] and not byLine[503] and not byLine[504],
  "dailies, finished and not started chains are left out")
check(byLine[505] ~= nil, "an important chain that starts here counts")
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
check(S.Read("questLines", "event") == false, "quest chains are not read in combat")
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
local achievementPointsReads = 0
local oldAchievementPoints = GetTotalAchievementPoints
GetTotalAchievementPoints = function()
  achievementPointsReads = achievementPointsReads + 1
  return 12500
end
combat = true
S.OnEvent("ACHIEVEMENT_EARNED", 4242, false)
check(achievementPointsReads == 0, "an achievement event never reads points in combat")
check(ns.Pack.Set(body("achievements").ids)[4242], "achievement earned is added to the Account set")
check(ns.Pack.Set(body("achievementsMine").ids)[4242], "and to this character's set")
combat = false
setBags(7, 400000)
S.OnEvent("BAG_UPDATE_DELAYED")
check(S.dirty.bags == "event", "a bag event marks the Section")
check(S.Pulse() == false, "nothing is read before the burst settles")
S.dirtyAt = ns.Now() - 5
S.Pulse()
S.Drain()
check(body("bags").count == 7, "settled bag read")
check(achievementPointsReads == 1 and body("achievements").points == 12500,
  "achievement points refresh once after the event settles outside combat")
check(ns.Pack.Set(body("achievements").ids)[4242], "the points refresh preserves the event's earned id")
GetTotalAchievementPoints = oldAchievementPoints

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

-- Lua 5.1 cannot yield across pcall. Stepping the worker (not Drain, which
-- never yields) must finish a reader that calls S.Yield() once the frame
-- budget is spent, and an error after that yield must not stop the queue.
local function dropProbe(name)
  S.defs[name] = nil
  for i = #S.order, 1, -1 do
    if S.order[i] == name then
      table.remove(S.order, i)
    end
  end
  if UnboredCharDB.data and UnboredCharDB.data.sections then
    UnboredCharDB.data.sections[name] = nil
  end
end

S.BUDGET_MS = 0
clock = 1000
UnboredDB.errors = {}
local yieldPhase = "before"
local yieldOver = false
S.Register({
  name = "yieldProbe",
  login = false,
  read = function()
    yieldPhase = "paused"
    clock = clock + 1000
    yieldOver = S.Elapsed() >= S.BUDGET_MS
    S.Yield()
    yieldPhase = "done"
    return { ok = true }
  end,
})
S.Queue("yieldProbe", "login")
local yieldSteps = 0
local yieldPaused = false
while S.Step() do
  yieldSteps = yieldSteps + 1
  if yieldSteps == 1 then
    yieldPaused = yieldPhase == "paused" and S.Body("yieldProbe") == nil
  end
  if yieldSteps > 20 then
    break
  end
end
check(yieldOver and yieldPaused and yieldSteps < 20, "a yielding read pauses once the frame budget is spent")
check(yieldPhase == "done" and S.Body("yieldProbe") and S.Body("yieldProbe").ok == true,
  "a yielding read writes its Section")
check(type(UnboredDB.errors) ~= "table" or #UnboredDB.errors == 0, "a yielding read leaves no errors")
dropProbe("yieldProbe")

UnboredDB.errors = {}
local combatPhase = "before"
S.Register({
  name = "yieldCombat",
  login = false,
  read = function()
    combatPhase = "paused"
    combat = true
    S.Yield()
    combatPhase = "done"
    return { done = true }
  end,
})
S.Queue("yieldCombat", "login")
local combatSteps = 0
local combatPaused = false
while S.Step() do
  combatSteps = combatSteps + 1
  if combatSteps == 1 then
    combatPaused = combat == true and combatPhase == "paused" and S.Body("yieldCombat") == nil
    combat = false
  end
  if combatSteps > 20 then
    break
  end
end
check(combatPaused, "combat pauses a yielding read")
check(combatPhase == "done" and S.Body("yieldCombat") and S.Body("yieldCombat").done == true,
  "a yielding read finishes after combat")
check(#(UnboredDB.errors or {}) == 0, "pausing for combat leaves no errors")
dropProbe("yieldCombat")
combat = false

-- A bank/profession read may span frames. Closing and reopening invalidates
-- the old read even if the window is open again before the worker resumes.
local windowReads = 0
S.Register({
  name = "yieldWindow",
  window = true,
  opens = { "TEST_WINDOW_OPEN" },
  closes = { "TEST_WINDOW_CLOSE" },
  read = function()
    windowReads = windowReads + 1
    S.Yield()
    windowReads = windowReads + 1
    return { reads = windowReads }
  end,
})
S.Write("yieldWindow", { reads = 0 }, "window")
S.OnEvent("TEST_WINDOW_OPEN")
S.Queue("yieldWindow", "window")
check(S.Step() and windowReads == 1, "the window read yields between frames")
S.OnEvent("TEST_WINDOW_CLOSE")
S.OnEvent("TEST_WINDOW_OPEN")
S.Drain()
check(windowReads == 1, "closing the window cancels the old read before another API call")
check(S.Body("yieldWindow").reads == 0, "an interrupted window read preserves the last complete Section")
S.Queue("yieldWindow", "window")
S.Drain()
check(windowReads == 3 and S.Body("yieldWindow").reads == 3, "reopening permits a fresh complete read")
S.OnEvent("TEST_WINDOW_CLOSE")
S.dirty.yieldWindow = nil
S.byEvent.TEST_WINDOW_OPEN, S.byEvent.TEST_WINDOW_CLOSE = nil, nil
dropProbe("yieldWindow")

UnboredDB.errors = {}
local errorWasShown = ns.errorShown
ns.errorShown = true
S.Register({
  name = "yieldBoom",
  login = false,
  read = function()
    clock = clock + 1000
    S.Yield()
    error("after yield")
  end,
})
S.Register({
  name = "yieldNext",
  login = false,
  read = function()
    return { kept = true }
  end,
})
S.Queue("yieldBoom", "login")
S.Queue("yieldNext", "login")
local boomSteps = 0
local boomPausedClean = false
while S.Step() do
  boomSteps = boomSteps + 1
  if boomSteps == 1 then
    boomPausedClean = #UnboredDB.errors == 0 and S.Body("yieldNext") == nil
  end
  if boomSteps > 20 then
    break
  end
end
local boomText = UnboredDB.errors and UnboredDB.errors[1] and UnboredDB.errors[1].text or ""
check(boomPausedClean, "a yield itself is not an error")
check(#(UnboredDB.errors or {}) == 1 and boomText:find("after yield", 1, true) ~= nil,
  "an error after a yield is reported once")
check(S.Body("yieldNext") and S.Body("yieldNext").kept == true,
  "the next queued read still runs after a yield error")
ns.errorShown = errorWasShown
dropProbe("yieldBoom")
dropProbe("yieldNext")
UnboredDB.errors = {}
S.co = nil
S.readCo = nil
S.queue = {}
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

-- A pending event refresh must not replace the full scan due at login.
do
  local originalCategories = GetCategoryList
  local categoryReads = 0
  GetCategoryList = function()
    categoryReads = categoryReads + 1
    return originalCategories()
  end
  body("achievements").scannedAt = ns.Now() - 86401
  S.Queue("achievements", "event")
  S.LoginPass()
  S.Drain()
  check(categoryReads > 0 and body("achievements").scannedAt > ns.Now() - 60,
    "an event queued before login cannot suppress the due daily achievement scan")
  GetCategoryList = originalCategories
end

-- Reputation v2 without the 12.x APIs: renown and paragon fields are left out.
do
  local saved = {
    max = C_MajorFactions.HasMaximumRenown,
    rewards = C_MajorFactions.GetRenownRewardsForLevel,
    isParagon = C_Reputation.IsFactionParagon,
  }
  C_MajorFactions.HasMaximumRenown = nil
  C_MajorFactions.GetRenownRewardsForLevel = nil
  C_Reputation.IsFactionParagon = nil
  check(S.Read("reputation", "event") == true, "reputation reads without the new APIs")
  local rep = body("reputation")
  local anyParagon = false
  for _, faction in ipairs(rep.factions) do
    anyParagon = anyParagon or faction.paragon ~= nil
  end
  check(rep.renown[1].next == nil and rep.renown[2].max == nil and not anyParagon,
    "missing APIs leave next, max and paragon out")
  C_MajorFactions.HasMaximumRenown = saved.max
  C_MajorFactions.GetRenownRewardsForLevel = saved.rewards
  C_Reputation.IsFactionParagon = saved.isParagon
end

-- Achievement progress (D182) ----------------------------------------------
do
  local savedInfo, savedCount, savedCriteria = GetAchievementInfo, GetAchievementNumCriteria, GetAchievementCriteriaInfo
  local savedCategories, savedPerCategory = GetCategoryList, GetCategoryNumAchievements
  -- id -> criteria: a list of booleans, or { bar = have, need = n }.
  local plan = {
    [1] = { true, true, true, true, true, true, true, false, false, false }, -- 7/10
    [2] = { bar = 450, need = 500 }, -- 0.9 progress bar
    [3] = { true, false, false, false }, -- 1/4: under the floor
    [4] = { guild = true, true, true, false },
    [5] = { done = true, true, true },
    [6] = { many = 61 },
    [7] = { true, true, true, false, false, false, false, false, false, false, false, true }, -- 4/12
    [8] = { true, false }, -- 1/2
  }
  local calls = 0
  GetCategoryList = function() return { 1 } end
  GetCategoryNumAchievements = function() return 8 end
  GetAchievementInfo = function(_, index)
    calls = calls + 1
    local row = plan[index]
    return index, "A", 10, row.done == true, 1, 1, 24, "", 0, 0, "", row.guild == true, false
  end
  GetAchievementNumCriteria = function(id)
    calls = calls + 1
    local row = plan[id]
    if row.many then
      return row.many
    end
    if row.bar then
      return 1
    end
    return #row
  end
  GetAchievementCriteriaInfo = function(id, k)
    calls = calls + 1
    local row = plan[id]
    if row.bar then
      return "Bar", 0, false, row.bar, row.need, nil, 0, 0, "", 9000 + id
    end
    return "C" .. k, 0, row[k] == true, 0, 0, nil, 0, 0, "", id * 100 + k
  end
  S.queue = {}
  S.BUDGET_MS = 0
  S.Queue("achProgress", "daily")
  local guard = 0
  while S.Step() and guard < 500 do
    guard = guard + 1
    clock = clock + 10
  end
  S.BUDGET_MS = 4
  local progress = body("achProgress")
  local ids = {}
  for i, row in ipairs(progress and progress.rows or {}) do
    ids[i] = row.id
  end
  check(progress and table.concat(ids, ",") == "2,1,8", "achievement progress keeps >= half done, best first: "
    .. table.concat(ids, ","))
  check(progress.rows[1].d == 450 and progress.rows[1].t == 500 and progress.rows[1].open[1] == 9002,
    "a progress-bar achievement counts its quantity")
  check(progress.rows[2].d == 7 and progress.rows[2].t == 10 and #progress.rows[2].open == 3
    and progress.rows[2].open[1] == 108, "criteria achievements list their open criteria")
  check(S.defs.achProgress.scope == "char" and S.defs.achProgress.prio == 20 and S.defs.achProgress.every == 86400
    and S.defs.achProgress.delay == 60, "achievement progress is per Character, daily, low priority, delayed")
  check(type(progress.scannedAt) == "number", "achievement progress is stamped for the daily skip")
  local perAchievement = 0
  for id = 1, 8 do
    perAchievement = perAchievement + (plan[id].many and 1 or 0)
  end
  check(perAchievement == 1 and calls < 60, "an achievement with more than 60 criteria is skipped unread")

  -- 300 achievements at 0.9: only the best 200 stay.
  GetCategoryNumAchievements = function() return 300 end
  GetAchievementInfo = function(_, index)
    return index, "A", 10, false, 1, 1, 24, "", 0, 0, "", false, false
  end
  GetAchievementNumCriteria = function() return 1 end
  GetAchievementCriteriaInfo = function(id)
    return "Bar", 0, false, 50 + id % 40, 100, nil, 0, 0, "", id
  end
  S.Read("achProgress", "daily")
  check(#body("achProgress").rows == 200 and body("achProgress").rows[1].d == 89, "at most 200 rows, best first")

  -- The call cap stops a pass on a huge Account.
  local cap = S.ACH_MAX_CALLS
  S.ACH_MAX_CALLS = 30
  S.Read("achProgress", "daily")
  check(body("achProgress").capped == true and #body("achProgress").rows <= 10,
    "the pass stops at the call cap")
  S.ACH_MAX_CALLS = cap

  GetAchievementInfo, GetAchievementNumCriteria, GetAchievementCriteriaInfo = savedInfo, savedCount, savedCriteria
  GetCategoryList, GetCategoryNumAchievements = savedCategories, savedPerCategory
end

-- Error reports (docs/adr/0051) -------------------------------------------
do
  local shownBefore = ns.errorShown
  ns.errorShown = true
  UnboredDB.errors = {}
  UnboredDB.data.sections.errors = nil
  local quoted = 'C:\\Games\\World of Warcraft\\_retail_\\Interface\\AddOns\\Unbored\\Core\\Session.lua:12:'
    .. ' bad argument "Mira wrote this" to \'format\''
  ns.ReportError(quoted, "event:QUEST_TURNED_IN",
    "[string \"@Interface/AddOns/Unbored/Core/Session.lua\"]:12:"
      .. " in function <Interface/AddOns/Unbored/Core/Session.lua:10>\n"
      .. "[string \"@Interface/AddOns/OtherAddon/Main.lua\"]:4: in function 'OtherThing'\n"
      .. "[C]: in function 'xpcall'\n"
      .. "D:\\Games\\Interface\\AddOns\\Unbored\\Core\\Init.lua:259:"
      .. " in function <Interface/AddOns/Unbored/Core/Init.lua:250>")
  local row = UnboredDB.errors[1]
  check(row and row.where == "event:QUEST_TURNED_IN" and row.count == 1 and row.version == ns.VERSION,
    "an error report keeps where, count and version")
  check(row.text:sub(1, 17) == "Interface/AddOns/" and not row.text:find("Games", 1, true),
    "the path starts at Interface/AddOns/: " .. row.text)
  check(not row.text:find("Mira", 1, true) and not row.text:find("format", 1, true) and row.text:find('"…"', 1, true),
    "quoted strings are replaced")
  check(not row.stack:find("OtherAddon", 1, true) and row.stack:find("[C]", 1, true)
    and not row.stack:find("Games", 1, true) and select(2, row.stack:gsub("\n", "")) == 2,
    "the stack keeps only our frames and C calls: " .. row.stack)
  check(S.Body("errors") and #S.Body("errors").rows == 1 and S.Get("errors").v == 1,
    "the errors Section is written with sharing on")
  clock = clock + 1
  local realClock = ns.Now
  local later = realClock() + 100
  ns.Now = function() return later end
  ns.ReportError(quoted, "event:QUEST_TURNED_IN")
  ns.Now = realClock
  check(#UnboredDB.errors == 1 and UnboredDB.errors[1].count == 2 and UnboredDB.errors[1].lastAt == later,
    "the same error again counts up instead of a new row")
  ns.ReportError(string.rep("x", 900), "init")
  check(#UnboredDB.errors[2].text == 300, "the text is capped at 300 bytes")
  for i = 1, 12 do
    ns.Now = function() return later + i end
    ns.ReportError("boom " .. i, "ui:pulse")
  end
  ns.Now = realClock
  local kept = {}
  for _, r in ipairs(UnboredDB.errors) do
    kept[r.text] = true
  end
  check(#UnboredDB.errors == 10 and kept["boom 12"] and not kept["boom 1"] and not kept["boom 2"],
    "ten rows at most, the oldest lastAt goes")

  -- The xpcall handler adds a stack.
  UnboredDB.errors = {}
  _G.debugstack = function()
    return "Interface/AddOns/Unbored/Core/Events.lua:118: in function <Interface/AddOns/Unbored/Core/Events.lua:116>"
  end
  local ok = ns.Guard("ui:pulse", function()
    error("ticker broke")
  end)
  check(ok == false and UnboredDB.errors[1] and UnboredDB.errors[1].stack
    and UnboredDB.errors[1].stack:find("Events.lua:118", 1, true) ~= nil, "the xpcall handler adds a stack")
  _G.debugstack = nil

  -- Rows from before the game loaded the SavedVariables wait in memory.
  local db = ns.DB
  ns.DB = nil
  ns.ReportError("early", "init")
  check(#ns.pendingErrors == 1 and #UnboredDB.errors == 1, "an error before load waits in memory")
  ns.DB = db
  UnboredDB.errors[#UnboredDB.errors + 1] = { at = 1, version = "0.9.0", text = "old uncleaned row" }
  ns.FlushErrors()
  check(#ns.pendingErrors == 0 and #UnboredDB.errors == 2 and UnboredDB.errors[2].text == "early",
    "PLAYER_LOGIN writes the early rows and drops 0.9 rows")
  check(#S.Body("errors").rows == 2, "and the Section follows")

  -- Sharing off: errors stay on this PC.
  UnboredDB.shareData = false
  S.ApplySharing()
  ns.ReportError("private", "init")
  check(S.Body("errors") == nil and #UnboredDB.errors == 3, "with sharing off errors stay local")
  check(not S.ESSENTIAL.errors and S.defs.errors.prio == 10 and S.defs.errors.scope == "account",
    "errors is an Account Section, not essential, dropped first")
  UnboredDB.shareData = true
  UnboredDB.errors = {}
  UnboredDB.data.sections.errors = nil
  ns.errorShown = shownBefore
end

-- Every Section survives a staged read where every S.Yield() yields (D170).
-- A new Section without a mock here fails: add a mock for it above.
do
  local MOCKED = {
    char = true, gear = true, talents = true, played = true, bags = true, bank = true, reagentBank = true,
    warband = true, currencies = true, professions = true, recipes = true, questsDone = true, questLog = true,
    questLines = true, reputation = true, achievements = true, achievementsMine = true, achProgress = true,
    mounts = true, pets = true, toys = true, transmog = true, lockouts = true, mplus = true, vault = true,
    calendar = true, sessions = true, addons = true, unresolvedIds = true,
  }
  local shownBefore = ns.errorShown
  ns.errorShown = true
  S.BUDGET_MS = 0
  for _, name in ipairs(S.order) do
    local def = S.defs[name]
    if def.read then
      check(MOCKED[name], "add a mock for the Section " .. name .. " in tests/data.lua")
      UnboredDB.errors = {}
      if def.window then
        S.open[name] = true
      end
      S.queue = {}
      S.Queue(name, "login")
      local guard = 0
      while S.Step() and guard < 2000 do
        guard = guard + 1
        clock = clock + 10
      end
      S.open[name] = nil
      check(guard < 2000 and #S.queue == 0 and S.co == nil, "the staged read of " .. name .. " finishes")
      check(S.Body(name) == nil or type(S.Body(name)) == "table",
        "the staged read of " .. name .. " gives a body or nil")
      check(#UnboredDB.errors == 0, "the staged read of " .. name .. " reports no error: "
        .. tostring(UnboredDB.errors[1] and UnboredDB.errors[1].text))
    end
  end
  S.BUDGET_MS = 4
  ns.errorShown = shownBefore
end

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
local progressRows = {}
for i = 1, S.ACH_MAX_ROWS do
  progressRows[i] = { id = 40000 + i * 7, d = 7, t = 10, open = { 100000 + i * 5, 100001 + i * 5, 100002 + i * 5 } }
end
S.Write("achProgress", { rows = progressRows, count = #progressRows, scannedAt = ns.Now() }, "daily")
local errorRows = {}
for i = 1, ns.ERRORS_MAX do
  errorRows[i] = { at = ns.Now(), lastAt = ns.Now(), count = i, version = ns.VERSION, where = "section:bags",
    text = string.rep("e", ns.ERROR_TEXT_MAX), stack = string.rep("s", ns.ERROR_STACK_MAX) }
end
S.Write("errors", { rows = errorRows }, "event")

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
