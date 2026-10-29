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
  "Core/Context.lua",
  "Core/Profile.lua",
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
  "Data/Items.lua",
  "Data/Presets.lua",
  "Providers/Roam.lua",
  "Providers/Quests.lua",
  "Providers/Events.lua",
  "Providers/Achievements.lua",
  "Providers/Farm.lua",
  "Companion/Plan.lua",
  "UI/Frame.lua",
  "UI/Tracker.lua",
  "UI/Mascot.lua",
  "UI/Items.lua",
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
check(ns.Session.state.tasks[1].id == "b", "first skip moves the task behind the next one")
check(ns.Session.state.tasks[2].id == "a", "skipped task is now last")
check(ns.Session.state.tasks[2].skipCount == 1, "first skip is remembered")
check(#ns.Session.state.skipped == 0, "first skip does not drop the task")
ns.Session:Skip()
check(ns.Session.state.tasks[1].id == "a", "the new current task also moves to the end")
ns.Session:Skip()
check(ns.Session.state.tasks[1].id == "b", "second skip drops the task")
check(ns.Session.state.skipped[1].id == "a", "second skip records the id")
check(type(ns.Session.state.skipped[1].at) == "number", "second skip records time")
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

C_Calendar.GetDayEvent = function()
  return {
    calendarType = "HOLIDAY",
    eventID = 99999,
    title = "Something Else",
    iconTexture = 235461,
    sequenceType = "ONGOING",
  }
end
local byTexture = ns.Providers.events.Build({})
local sawTexture = false
for i = 1, #byTexture do
  if byTexture[i].complete and byTexture[i].complete.achievementID == 291 then
    sawTexture = true
  end
end
check(sawTexture, "hallows end matches calendar icon texture when the event id differs")

C_Calendar.GetDayEvent = function()
  return {
    calendarType = "HOLIDAY",
    eventID = 42,
    title = "Brewfest",
    sequenceType = "ONGOING",
  }
end
local byTitle = ns.Providers.events.Build({})
local sawBrew = false
for i = 1, #byTitle do
  if byTitle[i].id == "event:brew-ram" then
    sawBrew = true
  end
end
check(sawBrew, "brewfest matches the English calendar title")

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

UnboredExternalPlan = {
  v = 1,
  kind = "plan",
  generatedAt = 5000,
  mode = "custom",
  budget = 30,
  tasks = {
    { id = "ext:1", title = "From companion", estMinutes = 10, complete = { kind = "manual" } },
  },
}
UnboredCharDB = {}
ns.Session.started = false
ns.Session.state = nil
check(ns.Session:AutoApplyExternal() == true, "a direct companion plan starts on load")
check(ns.Session:Current() and ns.Session:Current().id == "ext:1", "the direct plan is current")
ns.Session:Done()
check(ns.Session:AutoApplyExternal() == false, "the same direct plan does not restart")
check(ns.Session:UseExternal() == true, "slash companion applies it again")
check(ns.Session:Current() and ns.Session:Current().id == "ext:1", "the forced plan is current")

UnboredDB.mode = "farm"
UnboredDB.budget = 60
local reloads = 0
ReloadUI = function()
  reloads = reloads + 1
end
ns.Session:RequestPlan("mount, stay in this zone")
local req = UnboredCharDB.request
check(req and req.mode == "farm" and req.budget == 60, "get plan saves mode and budget")
check(req and req.wish == "mount, stay in this zone" and req.character == "player", "get plan saves the wish")
check(req and type(req.context) == "table" and req.context.mapID == 84, "get plan saves the player context")
check(req and near(req.context.x, 0.2) and req.context.zone == "Stormwind City", "context has position and zone")
check(type(req.context.plan) == "table", "context has the active plan progress")
check(ns.Session.requestNote == "sending", "a new request waits for the companion file")
ns.Session.LoadPlan()
check(reloads == 1, "load plan reloads the UI")
check(ns.Session:AutoApplyExternal() == false, "an old direct plan does not replace a pending request")
check(UnboredCharDB.request ~= nil, "the request stays pending")

UnboredExternalPlan = {
  v = 1,
  kind = "plan",
  mode = "farm",
  budget = 60,
  requestId = req.id,
  requestStatus = "pending",
}
check(ns.Session:AutoApplyExternal() == false, "a pending file is not applied")
check(ns.Session.requestNote == "preparing", "pending file says the plan is being prepared")
UnboredExternalPlan.requestStatus = "failed"
UnboredExternalPlan.requestReason = "no mounts left"
ns.Session:AutoApplyExternal()
check(ns.Session.requestNote == "failed" and ns.Session.requestReason == "no mounts left", "failure reason is kept")

UnboredExternalPlan = {
  v = 1,
  kind = "plan",
  mode = "farm",
  budget = 60,
  generatedAt = 11,
  requestId = "req-other",
  requestStatus = "fulfilled",
  tasks = {
    { id = "other:1", title = "Other", estMinutes = 10, complete = { kind = "manual" } },
  },
}
check(ns.Session:AutoApplyExternal() == false, "a plan for another request is ignored")
UnboredExternalPlan.requestId = req.id
UnboredExternalPlan.tasks = {
  {
    id = "req:1",
    title = "Mount",
    estMinutes = 10,
    complete = { kind = "manual" },
    waypoints = {
      { mapID = 84, x = 0.2, y = 0.2, label = "Gate" },
      { mapID = 84, x = 0.6, y = 0.6, label = "Bridge" },
    },
  },
}
check(ns.Session:AutoApplyExternal() == true, "the matching plan starts with no prompt")
check(ns.Session:Current() and ns.Session:Current().id == "req:1", "the requested plan is current")
check(UnboredCharDB.request == nil, "the request is cleared once its plan starts")
check(ns.Session:AutoApplyExternal() == false, "the same requested plan does not restart")

local routed = ns.Session:Current()
check(#routed.waypoints == 2 and routed.waypoints[2].label == "Bridge", "route points survive normalisation")
local point, index, count = ns.Waypoint.Target(routed)
check(point and point.label == "Gate" and index == 1 and count == 2, "route starts at the first point")
check(ns.Session:AdvanceRoute() == true, "standing on the first point moves to the next")
point, index = ns.Waypoint.Target(routed)
check(point.label == "Bridge" and index == 2, "the second point is now the target")
check(ns.Session:AdvanceRoute() == false, "far from the last point the route stays")
local progress2 = ns.Session:Progress()
check(progress2 and progress2.step == 1 and progress2.steps == 1, "progress counts steps")

local function waypointPlan(points)
  return "UNB1:" .. ns.Base64Encode(ns.JSON.Encode({
    v = 1,
    kind = "plan",
    tasks = { { id = "w", title = "W", waypoints = points } },
  }))
end
local okRoute = ns.DecodeImport(waypointPlan({ { mapID = 84, x = 0.1, y = 0.9, label = "A" } }))
check(okRoute and okRoute.tasks[1].waypoints[1].mapID == 84, "import keeps waypoints")
local again2 = ns.DecodeImport(ns.EncodePlan(okRoute))
check(again2 and again2.tasks[1].waypoints[1].label == "A", "export keeps waypoints")
check(ns.DecodeImport(waypointPlan({ { mapID = 84, x = 50, y = 10 } })) == nil, "route in percent is rejected")
check(ns.DecodeImport(waypointPlan({ { x = 0.1, y = 0.2 } })) == nil, "route point without a map is rejected")
local many = {}
for i = 1, 11 do
  many[i] = { mapID = 84, x = 0.1, y = 0.1 }
end
check(ns.DecodeImport(waypointPlan(many)) == nil, "more than ten route points is rejected")

check(ns.Session:Ask({ type = "item", item = {} }) == nil, "an item request needs an itemID")
check(ns.Session:Ask({ type = "question", question = "  " }) == nil, "a question request needs text")
local asked = ns.Session:Ask({ type = "question", question = "Where is the bank?", topic = "Bad Topic" })
check(asked and UnboredCharDB.request.topic == nil, "a bad topic is dropped")
check(UnboredCharDB.request.mode == nil, "questions carry no mode")

ns.Session.state = {
  version = 1,
  source = "companion",
  mode = "custom",
  budget = 30,
  tasks = { { id = "keep:1", title = "Keep me", estMinutes = 5, complete = { kind = "manual" } } },
  done = {},
  skipped = {},
}
UnboredExternalPlan = {
  requestId = asked,
  requestStatus = "fulfilled",
  requestType = "question",
  answer = { message = "Go here.", waypoints = { { mapID = 84, x = 0.3, y = 0.3, label = "Bank" } } },
}
check(ns.Session:AutoApplyExternal() == true, "an answer is applied")
check(ns.Session:Current().title == "Bank" and ns.Session.state.tasks[2].id == "keep:1",
  "an answer step goes in front of the plan the player had")
check(UnboredCharDB.answer.message == "Go here." and ns.Session.UnreadAnswer() ~= nil, "the answer waits to be read")
ns.Session:DismissAnswer()
check(ns.Session.UnreadAnswer() == nil, "a read answer is not shown again")

UnboredExternalPlan = { requestId = "req-none", requestStatus = "fulfilled", answer = { message = 5 } }
check(ns.Session:AutoApplyExternal() == false, "a broken answer is ignored")

UnboredDB.itemNotes = {}
for i = 1, ns.ITEM_NOTES_MAX + 5 do
  ns.Session.RememberItem(i, "note " .. i)
end
local kept = 0
for _ in pairs(UnboredDB.itemNotes) do
  kept = kept + 1
end
check(kept == ns.ITEM_NOTES_MAX, "remembered item answers are capped: " .. kept)

check(ns.Utf8Truncate("привет", 5) == "пр", "truncate never splits a character")
check(ns.Utf8Truncate("abc", 5) == "abc", "short text is untouched")
check(ns.SafeString("  hi  ", 10) == "hi", "safe string trims")
check(ns.Call(nil) == nil, "call tolerates a missing function")

local longPlan = {}
for i = 1, 12 do
  longPlan[i] = { id = "many:" .. i, title = "Step " .. i, estMinutes = 1, complete = { kind = "manual" } }
end
ns.Providers.many = { Build = function() return longPlan end }
local capped = ns.BuildProviderPlan("many", { budget = 240 })
check(#capped == ns.MAX_STEPS and ns.MAX_STEPS == 7, "a built plan has at most 7 steps: " .. #capped)
ns.Providers.many = nil

if fails > 0 then
  io.stderr:write(fails .. " failed, " .. checks .. " checks\n")
  os.exit(1)
end
print(checks .. " checks passed")
