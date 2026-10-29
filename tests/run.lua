local fails = 0
local checks = 0

local function check(cond, message)
  checks = checks + 1
  if not cond then
    fails = fails + 1
    io.stderr:write("FAIL: " .. message .. "\n")
  end
end

local ns = {}
local function load(path)
  local chunk, err = loadfile(path)
  if not chunk then
    error(err)
  end
  chunk("Unbored", ns)
end

local files = {
  "Core/Namespace.lua",
  "Core/Locale.lua",
  "Core/Util.lua",
  "Core/Codec.lua",
  "Core/Import.lua",
  "Core/Plan.lua",
  "Core/Complete.lua",
  "Core/Waypoint.lua",
  "Core/Session.lua",
  "Core/Events.lua",
  "Data/Exploration.lua",
  "Data/Rares.lua",
  "Data/FunAchievements.lua",
  "Data/Holidays.lua",
  "Data/Farm.lua",
  "Providers/Roam.lua",
  "Providers/Quests.lua",
  "Providers/Events.lua",
  "Providers/Achievements.lua",
  "Providers/Farm.lua",
  "Companion/Plan.lua",
  "UI/Frame.lua",
  "UI/Import.lua",
  "UI/Minimap.lua",
  "Core/Init.lua",
}
for i = 1, #files do
  load(files[i])
end

local function near(a, b)
  return math.abs(a - b) < 1e-6
end

check(ns.Base64Encode("hello") == "aGVsbG8=", "base64 hello")
check(ns.Base64Decode("aGVsbG8=") == "hello", "base64 decode hello")
check(ns.Base64Decode("aGVs bG8=") == "hello", "base64 ignores space")

local round = ns.JSON.Decode(ns.JSON.Encode({
  v = 1,
  kind = "plan",
  ok = true,
  n = 2,
  tasks = { { id = "a" } },
}))
check(round.v == 1 and round.ok == true and round.tasks[1].id == "a", "json roundtrip")

local doc = io.open("docs/plan-format.md", "r")
check(doc ~= nil, "plan format doc exists")
local docText = doc:read("*a")
doc:close()
local planString = docText:match("UNB1:[A-Za-z0-9+/=]+")
local progressString = docText:match("UNB1P:[A-Za-z0-9+/=]+")
check(planString ~= nil, "doc has UNB1 example")
check(progressString ~= nil, "doc has UNB1P example")

local plan, err = ns.DecodeImport(planString)
check(plan ~= nil, "example plan decodes: " .. tostring(err))
if plan then
  check(#plan.tasks == 2, "example has 2 tasks")
  check(plan.tasks[1].id == "mentor:fall", "first id")
  check(plan.tasks[1].note == "просто упади", "unicode note")
  check(plan.tasks[1].complete.kind == "achievement", "achievement kind")
  check(plan.tasks[1].complete.achievementID == 964, "achievement id")
  check(plan.tasks[2].mapID == 109, "map id")
  check(near(plan.tasks[2].x, 0.739) and near(plan.tasks[2].y, 0.637), "coords are 0-1")
  check(plan.budget == 60 and plan.mode == "custom", "budget and mode")
end

local wrapped = planString:sub(1, 20) .. "\n" .. planString:sub(21)
local wrappedPlan = ns.DecodeImport(wrapped)
check(wrappedPlan ~= nil, "wrapped paste decodes")

local badKind = ns.DecodeImport(progressString)
check(badKind == nil, "progress string is not a plan")

local badPrefix = ns.DecodeImport("hello")
check(badPrefix == nil, "bad prefix rejected")

local bad64 = ns.DecodeImport("UNB1:!!!!")
check(bad64 == nil, "bad base64 rejected")

local badJson = ns.DecodeImport("UNB1:" .. ns.Base64Encode("{"))
check(badJson == nil, "bad json rejected")

local function reject(body, label)
  local text = "UNB1:" .. ns.Base64Encode(body)
  local decoded = ns.DecodeImport(text)
  check(decoded == nil, label)
end
reject('{"v":1,"kind":"plan","tasks":[]}', "empty tasks")
reject('{"v":2,"kind":"plan","tasks":[{"id":"a","title":"A"}]}', "version 2")
reject('{"v":1,"kind":"plan","tasks":[{"id":"a","title":"A","x":50,"y":10}]}', "wowhead coords")
reject('{"v":1,"kind":"plan","tasks":[{"id":"bad id","title":"A"}]}', "bad id")
reject('{"v":1,"kind":"plan","tasks":[{"id":"a","title":"A","complete":{"kind":"dance"}}]}', "bad kind")

local encoded = ns.EncodePlan(plan)
local again = ns.DecodeImport(encoded)
check(again and again.tasks[2].complete.mountID == 183, "encoder roundtrip")

local filled, sum = ns.FillBudget({
  { estMinutes = 15 },
  { estMinutes = 50 },
  { estMinutes = 10 },
  { estMinutes = 10 },
}, 30)
check(#filled == 3 and sum == 35, "budget skips a long middle task and keeps a short one")
local one = ns.FillBudget({ { estMinutes = 90 } }, 30)
check(#one == 1, "budget always keeps one task")

UnboredDB = { version = 1, mode = "roam", budget = 60, useTomTom = false, minimap = {}, window = {} }
UnboredCharDB = {}
ns.DB = UnboredDB
ns.Session.state = {
  version = 1,
  source = "import",
  mode = "custom",
  budget = 60,
  tasks = {
    { id = "a", title = "A", estMinutes = 5, complete = { kind = "manual" } },
    { id = "b", title = "B", estMinutes = 5, complete = { kind = "manual" } },
  },
  done = {},
  skipped = {},
}
ns.Session:Skip()
check(ns.Session.state.tasks[1].id == "b", "skip advances")
check(ns.Session.state.skipped[1].id == "a", "skip records id")
check(type(ns.Session.state.skipped[1].at) == "number", "skip records time")
ns.Session:Done()
check(ns.Session:Current() == nil, "done clears the last task")
check(ns.Session.state.done[1].id == "b", "done records id")

local progress = ns.EncodeProgress(ns.Session:ProgressTable())
check(type(progress) == "string" and progress:sub(1, 6) == "UNB1P:", "export prefix")
local decodedProgress = ns.DecodeMessage(progress)
check(decodedProgress and decodedProgress.kind == "progress", "export decodes")
check(decodedProgress.done[1].id == "b", "export contains done id")
check(decodedProgress.skipped[1].id == "a", "export contains skipped id")

ns.Session:ApplyPlan(plan, "import", false)
check(ns.Session.state.source == "import", "import source")
check(ns.Session.state.tasks[1].id == "mentor:fall", "import becomes the queue")
check(#ns.Session.state.done == 0, "import starts a fresh progress list")

C_Map = {
  GetBestMapForUnit = function()
    return 84
  end,
  GetPlayerMapPosition = function()
    return { x = 0.2, y = 0.2 }
  end,
  GetMapInfo = function(id)
    if id == 84 then
      return { mapID = 84, name = "Stormwind City", parentMapID = 0 }
    end
    return { mapID = id, name = "Zone " .. tostring(id), parentMapID = 0 }
  end,
  GetWorldPosFromMapPos = function(_, pos)
    return 1, { x = pos.x * 1000, y = pos.y * 1000 }
  end,
  GetMapChildrenInfo = function()
    return {}
  end,
}

local yards = ns.YardsBetween(84, 0.2, 0.2, 84, 0.5, 0.6)
check(yards and yards > 400 and yards < 600, "yards from world position")

C_QuestLog = {
  GetNumQuestLogEntries = function()
    return 1
  end,
  GetInfo = function()
    return {
      title = "Far quest",
      questID = 10,
      isHeader = false,
      isHidden = false,
    }
  end,
  GetNextWaypoint = function(questID)
    if questID == 10 then
      return 84, 0.9, 0.9
    end
  end,
  GetTitleForQuestID = function(questID)
    return "Quest " .. questID
  end,
  IsQuestFlaggedCompleted = function()
    return false
  end,
}
C_TaskQuest = {
  GetQuestsOnMap = function(mapID)
    if mapID == 84 then
      return {
        { questID = 20, x = 0.1, y = 0.1, mapID = 84, questTagType = nil },
      }
    end
    return {}
  end,
}
local quests = ns.Providers.quests.Build(ns.BuildContext(60))
check(#quests >= 2, "quests provider returns log and world quests")
check(quests[1].id == "quest:20", "closer world quest sorts first")

GetAchievementInfo = function(id)
  local open = {
    [42] = "Explore Eastern Kingdoms",
    [291] = "Check Your Head",
    [964] = "Going Down?",
    [1206] = "To All The Squirrels I've Loved Before",
    [2557] = "Squirrels shared",
    [5548] = "Squirrels cared",
    [1244] = "Well Read",
  }
  if id == 1956 then
    return 1956, "Higher Learning", 10, true, 1, 1, 1, "", 0, 1, "", false, true, "", false
  end
  if open[id] then
    return id, open[id], 10, false, nil, nil, nil, "", 0, 1, "", false, false, "", false
  end
  return nil
end
GetAchievementNumCriteria = function(id)
  if id == 42 then
    return 2
  end
  return 0
end
GetAchievementCriteriaInfo = function(_, index)
  if index == 1 then
    return "Elwynn Forest", 0, false, 0, 1, "", 0, 0, "", 111
  end
  return "Stormwind City", 0, true, 1, 1, "", 0, 0, "", 112
end

local roam = ns.Providers.roam.Build({ mapID = 84, x = 0.2, y = 0.2, level = 80, faction = "Alliance" })
local sawElwynn = false
for i = 1, #roam do
  if roam[i].title == "Elwynn Forest" then
    sawElwynn = true
  end
  check(roam[i].title ~= "Stormwind City", "completed explore criteria is hidden")
end
check(sawElwynn, "roam lists an unexplored zone")

C_VignetteInfo = {
  GetVignettes = function()
    return { "guid-1" }
  end,
  GetVignetteInfo = function()
    return {
      name = "Rare Beast",
      vignetteID = 99,
      isDead = false,
      atlasName = "VignetteKill",
      rewardQuestID = 0,
      type = 0,
    }
  end,
  GetVignettePosition = function()
    return { x = 0.4, y = 0.4 }
  end,
}
local roamWithRare = ns.Providers.roam.Build({ mapID = 84, x = 0.2, y = 0.2, level = 80 })
local sawRare = false
for i = 1, #roamWithRare do
  if roamWithRare[i].title == "Rare Beast" then
    sawRare = true
  end
end
check(sawRare, "roam includes a live rare vignette")

local originalRares = ns.Data.Rares
ns.Data.Rares = {
  {
    id = "rare-test",
    fallbackTitle = "Test Rare",
    mapID = 84,
    x = 0.3,
    y = 0.3,
    estMinutes = 8,
    questID = 555,
    note = "fixture",
  },
}
local roamRare = ns.Providers.roam.Build({ mapID = 84, x = 0.2, y = 0.2, level = 80 })
local sawFixture = false
for i = 1, #roamRare do
  if roamRare[i].id == "rare-test" then
    sawFixture = true
  end
end
check(sawFixture, "curated rare with a quest id is included")
ns.Data.Rares = originalRares

C_MountJournal = {
  GetMountInfoByID = function(id)
    return "Mount " .. id, 1, 1, false, true, 1, false, false, nil, false, false, id, false
  end,
}
local fun = ns.Providers.fun.Build({ level = 80 })
local sawDown, sawLearning = false, false
for i = 1, #fun do
  if fun[i].id == "fun-going-down" then
    sawDown = true
  end
  if fun[i].id == "fun-higher-learning" then
    sawLearning = true
  end
end
check(sawDown, "fun mode includes an open achievement")
check(not sawLearning, "fun mode hides a completed achievement")
check(#fun >= 3, "fun mode has several open achievements")

C_DateAndTime = {
  GetCurrentCalendarTime = function()
    return { year = 2026, month = 10, monthDay = 29, hour = 12, minute = 0 }
  end,
}
C_Calendar = {
  GetNumDayEvents = function()
    return 1
  end,
  GetDayEvent = function()
    return { calendarType = "HOLIDAY", eventID = 324, title = "Hallow's End", sequenceType = "ONGOING" }
  end,
}
local events = ns.Providers.events.Build({})
check(#events >= 2, "events mode returns holiday tasks")
local sawHead = false
for i = 1, #events do
  if events[i].complete and events[i].complete.achievementID == 291 then
    sawHead = true
  end
end
check(sawHead, "hallows end includes Check Your Head")

GetNumSavedInstances = function()
  return 1
end
GetSavedInstanceInfo = function()
  return "Icecrown Citadel", 9, 1000, 14, true, false, 0, true, 25, "25 Player", 12, 12, false, 631
end
local farm = ns.Providers.farm.Build({ faction = "Horde", level = 80 })
local sawICC, sawOny, sawBod = false, false, false
for i = 1, #farm do
  if farm[i].id == "farm-icc" then
    sawICC = true
  end
  if farm[i].id == "farm-onyxia" then
    sawOny = true
    check(farm[i].title:find("Mount 349", 1, true) ~= nil, "onyxia title uses the missing mount")
  end
  if farm[i].id == "farm-bod" then
    sawBod = true
    check(farm[i].mapID == 1165, "horde battle of dazar'alor pin")
  end
end
check(not sawICC, "locked icecrown is hidden")
check(sawOny, "unowned onyxia mount is offered")
check(sawBod, "faction pin is present")
check(#farm >= 3, "farm mode still has several runs")

C_MountJournal.GetMountInfoByID = function(id)
  return "Mount " .. id, 1, 1, false, true, 1, false, false, nil, false, true, id, false
end
local owned = ns.Providers.farm.Build({ faction = "Alliance", level = 80 })
check(#owned == 0, "farm hides runs whose mounts are all collected")

C_MountJournal.GetMountInfoByID = function(id)
  local collected = id == 183
  return "Mount " .. id, 1, 1, false, true, 1, false, false, nil, false, collected, id, false
end
GetNumSavedInstances = function()
  return 0
end
local packed = ns.BuildProviderPlan("farm", { budget = 30, faction = "Alliance", level = 80 })
check(packed and #packed >= 1, "30 minute farm budget produces a run")
local packSum = 0
for i = 1, #packed do
  packSum = packSum + packed[i].estMinutes
  check(packed[i].id ~= "farm-eye", "collected ashes is not in the 30 minute list")
end
check(packSum <= 40, "30 minute list stays near the budget")

local questTask = {
  id = "quest:20",
  title = "Quest 20",
  complete = { kind = "quest", questID = 20 },
}
check(ns.MatchEvent(questTask.complete, "QUEST_TURNED_IN", 20), "quest turn-in matches")
check(not ns.MatchEvent(questTask.complete, "QUEST_TURNED_IN", 21), "other quest does not match")
C_QuestLog.IsQuestFlaggedCompleted = function(questID)
  return questID == 20
end
check(ns.IsTaskComplete(questTask), "flagged quest is complete")

local pinTask = {
  id = "go",
  title = "Go",
  complete = { kind = "proximity", mapID = 84, x = 0.2, y = 0.2, radiusYards = 40 },
}
check(ns.IsTaskComplete(pinTask), "standing on the pin completes a go-to task")

ns.Session.state = {
  version = 1,
  source = "provider",
  mode = "quests",
  budget = 30,
  tasks = { questTask },
  done = {},
  skipped = {},
  pendingQuests = true,
}
ns.Session:CheckCurrent()
check(ns.Session:Current() == nil, "auto-complete removes the finished quest")
check(ns.Session.state.done[1].id == "quest:20", "auto-complete records the id")

if fails > 0 then
  io.stderr:write(fails .. " failed, " .. checks .. " checks\n")
  os.exit(1)
end
print(checks .. " checks passed")
