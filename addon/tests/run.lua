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
  "Core/Markup.lua",
  "Core/Intents.lua",
  "Core/Advice.lua",
  "Core/Codec.lua",
  "Core/Import.lua",
  "Core/Plan.lua",
  "Core/Complete.lua",
  "Core/Waypoint.lua",
  "Core/Steps.lua",
  "Core/Suggestions.lua",
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
  "UI/Widgets.lua",
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

local doc = io.open("../docs/plan-format.md", "r")
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
local reloads = 0
ReloadUI = function()
  reloads = reloads + 1
end
local hasCompanion = ns.UI.HasCompanion
ns.UI.HasCompanion = function()
  return true
end

-- D124: a 0.8 "Something else" draft is dropped at login, quietly; a queued one still goes once.
local keptFlow = UnboredCharDB.request
UnboredCharDB.request = { state = "survey", custom = true, wish = "old wish" }
UnboredCharDB.lastWish = "old wish"
check(ns.Session.DropCustomDraft() == true and UnboredCharDB.request == nil and UnboredCharDB.lastWish == nil,
  "an unsent custom draft is dropped")
UnboredCharDB.request = { id = "req-c", type = "plan", custom = true, wish = "old", state = "queued", createdAt = 1 }
check(ns.Session.DropCustomDraft() == false and UnboredCharDB.request.id == "req-c"
  and ns.Session:FlowState() == "queued", "a queued 0.8 custom Request is kept and still sends")
UnboredCharDB.request = { state = "survey", topic = "mount", mode = "farm" }
check(ns.Session:FlowState() == "confirm", "a 0.8 draft left in the Survey is a Confirm now")
UnboredCharDB.request = keptFlow

-- The Request flow (docs/adr/0033, 0046): quick -> confirm -> sent -> waiting. Nothing is typed.
local mountPreset = ns.Data.Presets[2]
local stateBefore = ns.Session.state
ns.Session:BeginQuick(mountPreset)
check(ns.Session:FlowState() == "quick" or ns.Session:FlowState() == "confirm", "a preset starts the flow")
check(ns.Session:PendingRequest() == nil and reloads == 0, "nothing is sent by a preset")
check(ns.Session.BeginSurvey == nil and ns.Session.SurveyDone == nil and ns.Session.AskQuestion == nil,
  "no Survey with free text and no Ask (D122)")
UnboredCharDB.request.state = "quick"
ns.Session:ToConfirm()
check(ns.Session:FlowState() == "confirm" and not ns.Session:Locked(), "Want a proper plan? is Confirm at once")
UnboredCharDB.request.wish = "mount, stay in this zone"
check(ns.Session:Send() ~= nil and reloads == 1, "Send now writes the Request and reloads in the click")
local req = UnboredCharDB.request
check(req.state == "sent" and ns.Session:Locked(), "sent locks Bory")
-- A 0.7 SavedVariables file may still hold a Request queued for logout (D85).
req.state, req.sentAt = "queued", nil
reloads = 0
check(ns.Session:Locked(), "a queued Request from 0.7 still locks Bory")
check(req and req.type == "plan" and req.mode == "farm" and req.budget == nil and req.custom == nil,
  "a plan Request with no time budget")
check(req and req.wish == "mount, stay in this zone" and req.character == "player", "the Request keeps the wish")
check(req and type(req.context) == "table" and req.context.mapID == 84, "the Request keeps the player context")
check(req and near(req.context.x, 0.2) and req.context.zone == "Stormwind City", "context has position and zone")
check(type(req.context.plan) == "table", "context has the active plan progress")
check(ns.Session.requestNote == "sending", "a new request waits for the companion file")
check(reloads == 0, "a queued Request waits for logout without a reload")
check(req.lang == "en" and req.onDisk == nil, "a new request has a language and is not on disk yet")
check(ns.Session:RefreshOffer() == nil, "a queued Request offers no Refresh")
ns.Session:OnEvent("PLAYER_LOGOUT")
check(req.state == "sent" and req.sentAt == ns.Now(), "logout sends a queued Request")
ns.Session:MarkLoaded()
check(req.onDisk == true and req.state == "waiting", "after a load it is on disk and waiting")
check(ns.Session:RefreshOffer() == nil, "right after a load there is nothing to offer yet")
local loadedAt = ns.Session.loadedAt
req.sentAt = ns.Now() - ns.ETA_DEFAULT_SECONDS - 1
check(ns.Session.requestNote == "sending" and ns.Session:RefreshOffer() == nil,
  "no ETA offer while the Companion file does not name the request (D82)")
local fileBefore = UnboredExternalPlan
UnboredExternalPlan = { v = 1, kind = "plan", requestId = "req-old", requestStatus = "failed" }
ns.Session:NoteRequest()
check(ns.Session.requestNote == "sending" and ns.Session:RefreshOffer() == nil,
  "a stale failed request in the file never offers a Refresh")
UnboredExternalPlan = { v = 1, kind = "plan", requestId = req.id, requestStatus = "pending", eta = 600 }
ns.Session:NoteRequest()
check(ns.Session.Eta() == 600 and ns.Session:RefreshOffer() == nil, "the ETA comes from the Companion file")
req.sentAt = ns.Now() - 601
local offer = ns.Session:RefreshOffer()
check(offer and offer.kind == "eta", "after the ETA: Should be ready")
ns.Session:CheckAgain()
check(reloads == 1 and req.checks == 1, "Refresh reloads from the click and counts the check")
ns.Session:MarkLoaded()
check(ns.Session:CheckedAgain() and ns.Session:RefreshOffer() == nil, "still pending: almost, wait a bit")
ns.Session.loadedAt = ns.Now() - ns.ETA_AGAIN_SECONDS - 1
check(ns.Session:RefreshOffer() ~= nil, "two minutes later one more offer")
UnboredExternalPlan.eta = 5
check(ns.Session.Eta() == 60, "the ETA is clamped")
req.sentAt = ns.Now() - ns.REQUEST_EXPIRE_SECONDS - 1
check(ns.Session:FlowState() == "expired" and not ns.Session:Locked(), "an hour without a plan: expired")
check(ns.Session:Retry() and ns.Session:FlowState() == "confirm", "Try again goes back to Confirm")
check(ns.Session.Flow().wish == "mount, stay in this zone" and ns.Session.Flow().id == nil, "with the same wish")
check(ns.Session:Send(true) ~= nil and reloads == 2, "Send now reloads in the click")
req = UnboredCharDB.request
check(req.state == "sent" and req.sentAt == ns.Now(), "and the Request is sent")
ns.Session:MarkLoaded()
check(req.state == "waiting", "after the reload it waits")
UnboredExternalPlan = fileBefore
ns.Session:NoteRequest()
ns.Session.loadedAt = loadedAt
UnboredCharDB.request = { state = "quick", mode = "farm", topic = "mount" }
check(ns.Session:FlowState() == (ns.Session:Current() and "quick" or "idle"), "quick only while a step is there")
UnboredCharDB.request = req
ns.Session.state = stateBefore
check(ns.Session:AutoApplyExternal() == false, "an old direct plan does not replace a pending request")
check(UnboredCharDB.request ~= nil, "the request stays pending")
UnboredCompanionStatus = { seenAt = ns.Now() - 30 * 60 }
ns.Session.loadedAt = ns.Now() - 29 * 60
check(ns.Session.CompanionProblem() == nil, "the Companion status is judged at the load, not by play time")
ns.Session.loadedAt = ns.Now()
check(ns.Session.CompanionProblem() == "stopped", "a status already old at the load means it is not running")
UnboredCompanionStatus = nil
ns.Session.loadedAt = loadedAt

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

local asked = ns.Session:BuildRequest({ type = "question", question = "Where is the bank?", topic = "Bad Topic" })
check(asked.type == "plan" and asked.topic == nil, "the addon only makes plan Requests; a bad topic is dropped")
-- A 0.6 question Request still in SavedVariables is answered as before.
UnboredCharDB.request =
  { id = "req-q", type = "question", question = "Where is the bank?", createdAt = 1, onDisk = true }
asked = "req-q"

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

-- Ideas (D106-D111): the Companion's file, a live local idea, one per reward.
assert(loadfile("../packages/contracts/fixtures/suggestions.lua"))()
local savedName, savedRealm, savedNow = UnitName, GetRealmName, ns.Now
UnitName = function() return "Mira" end
GetRealmName = function() return "Silvermoon" end
ns.Now = function() return UnboredSuggestions.computedAt end
local ideas = ns.Suggestions.Read()
check(#ideas == 4 and ideas[1].kind == "event" and ideas[3].id == "mount:183", "the Companion's ideas are read")
check(ideas[3].rewards[1] == "{mount:183}" and ideas[3].mapID == 109, "an idea keeps its reward and map")
check(ideas[1].wish ~= nil and ideas[1].quick == nil, "a Server idea has its wish and no Quick plan")
check(ns.Suggestions.Line(ideas[1]) == "Ends soon" and ns.Suggestions.Line(ideas[3]) ==
  "None of your 2 characters has it yet", "the line under a title comes from the reason")
check(ns.Suggestions.Line(ideas[2]) == "Near where you play", "a rare near where you play")
ns.Now = function() return UnboredSuggestions.computedAt + 3 * 86400 end
check(#ns.Suggestions.Read() == 3, "an idea that ran out is not shown")
ns.Now = function() return UnboredSuggestions.computedAt end
GetRealmName = function() return "Elsewhere" end
check(#ns.Suggestions.Read() == 0, "another character's ideas are not shown")
GetRealmName = function() return "Silvermoon" end
check(ns.Suggestions.Clean({ id = "x", kind = "weird", title = "T", goal = "G" }) == nil, "an unknown kind is dropped")
check(ns.Suggestions.Clean({ id = "x", kind = "rare", title = "", goal = "G" }) == nil, "an idea needs a title")
local cleaned = ns.Suggestions.Clean({ id = "x", kind = "rare", title = "T", goal = "G",
  rewards = { "{mount:1}", "mount:2", "{ach:3}", "{item:4}", "{toy:5}" } })
check(#cleaned.rewards == 3 and cleaned.rewards[2] == "{ach:3}", "only tokens, at most three rewards")
check(ns.Suggestions.Clean({ id = "x", kind = "rare", title = "T", goal = "G", titleToken = "ach 964" }).titleToken
  == nil, "a broken title token is dropped")
local named = ns.Suggestions.Clean({ id = "ach:964", kind = "achievement", title = "Going Down? (en)", goal = "G",
  titleToken = "{ach:964}" })
local savedLink = GetAchievementLink
GetAchievementLink = function(id)
  return id == 964 and "|cffffff00|Hachievement:964:0|h[Going Down?]|h|r" or nil
end
check(ns.Suggestions.Title(named) == "Going Down?", "the title is the game's own name for the achievement")
check(ns.Suggestions.Copy(named).titleToken == "{ach:964}", "the Request copy keeps the title token")
named.titleToken = "{ach:999999}"
check(ns.Suggestions.Title(named) == "Going Down? (en)", "an unknown id keeps the title it came with")
GetAchievementLink = savedLink
local localIdeas = {
  { id = "event:local:hallow's end", kind = "event", title = "Hallow's End", goal = "g", rewards = {}, quick = true },
  { id = "rare:other", kind = "rare", title = "Other", goal = "g", rewards = { "{mount:183}" }, quick = true },
  { id = "rare:new", kind = "rare", title = "New", goal = "g", rewards = {}, quick = true },
}
local merged = ns.Suggestions.Merge(ideas, localIdeas, 4)
check(#merged == 4 and merged[1].id == ideas[1].id and merged[4].id == ideas[4].id,
  "Server ideas come first and only four are shown")
merged = ns.Suggestions.Merge({ ideas[1], ideas[3] }, localIdeas, 4)
check(#merged == 3 and merged[3].id == "rare:new", "the same holiday or reward is shown once")

ns.Suggestions.cache = nil
local savedMapFor = C_Map.GetBestMapForUnit
C_Map.GetBestMapForUnit = function() return 554 end
local savedRares = ns.Data.Rares
ns.Data.Rares = { { id = "rare-huolon", fallbackTitle = "Huolon", mapID = 554, questID = 33311 } }
local live = ns.Suggestions.Local()
local sawHuolon = false
for i = 1, #live do
  sawHuolon = sawHuolon or (live[i].id == "rare:rare-huolon" and live[i].quick == true)
end
check(sawHuolon and #live <= 2, "a curated rare in this zone is a live idea")
check(#ns.Suggestions.Merge(ideas, live, 4) == 4, "and the Server's Huolon is not shown twice")
ns.Data.Rares = savedRares
C_Map.GetBestMapForUnit = savedMapFor
ns.Suggestions.cache = nil

-- Events as ideas (D128-D131): only what is still open for this player.
local savedCalendar, savedDate = C_Calendar, C_DateAndTime
local savedAch, savedMount, savedQuestDone = ns.AchievementState, ns.MountState, ns.QuestDone
local calendarDays = {}
C_DateAndTime = {
  GetCurrentCalendarTime = function()
    return { year = 2026, month = 10, monthDay = 28, weekday = 4, hour = 12, minute = 0 }
  end,
}
C_Calendar = {
  GetMonthInfo = function()
    return { year = 2026, month = 10, numDays = 31 }
  end,
  GetNumDayEvents = function(_, day)
    return calendarDays[day] and 1 or 0
  end,
  GetDayEvent = function(_, day)
    return calendarDays[day]
  end,
}
local ownedMounts, earned = {}, {}
ns.AchievementState = function(id)
  return { id = id, name = "Ach " .. id, done = earned[id] == true }
end
ns.MountState = function(id)
  return { name = "Mount " .. id, collected = ownedMounts[id] == true }
end
local function eventIdeaOf(list)
  for i = 1, #list do
    if list[i].kind == "event" then
      return list[i]
    end
  end
  return nil
end
calendarDays = {
  [28] = { calendarType = "HOLIDAY", eventID = 559, title = "Timewalking Dungeon Event",
    startTime = { year = 2026, month = 10, monthDay = 28, weekday = 4, hour = 9, minute = 0 },
    endTime = { year = 2026, month = 11, monthDay = 4, weekday = 4, hour = 8, minute = 0 } },
}
local tw = eventIdeaOf(ns.Suggestions.Local())
check(tw and tw.title == "Timewalking Dungeon Event" and tw.reason.kind == "now",
  "a Timewalking week on now is an idea, named by the calendar")
check(tw and tw.rewards[1] == "{mount:778}" and #tw.steps == 2, "with the mounts you do not have as its steps")
check(tw and tw.expiresAt ~= nil and tw.expiresAt > ns.Now(), "and it runs out when the week ends")
ownedMounts[778], ownedMounts[781] = true, true
ns.Suggestions.Invalidate()
check(eventIdeaOf(ns.Suggestions.Local()) == nil, "an event with nothing left for you is no idea")
ownedMounts = {}
calendarDays = {
  [30] = { calendarType = "HOLIDAY", eventID = 42, title = "Brewfest",
    startTime = { year = 2026, month = 10, monthDay = 30, weekday = 6, hour = 10, minute = 0 },
    endTime = { year = 2026, month = 11, monthDay = 13, weekday = 6, hour = 10, minute = 0 } },
}
ns.Suggestions.Invalidate()
local brew = eventIdeaOf(ns.Suggestions.Local())
check(brew and brew.reason.kind == "starts" and ns.Suggestions.Line(brew) == "Starts in 2 days",
  "an event that starts in two days says so")
check(brew and brew.steps[1].why == "Starts Friday", "and its plan says the day it starts")
check(#ns.Providers.events.Build({}) == 0, "the Events preset only takes what is on today")
earned[1185] = true
ns.Suggestions.Invalidate()
brew = eventIdeaOf(ns.Suggestions.Local())
local sawDiet = false
for i = 1, #(brew and brew.steps or {}) do
  sawDiet = sawDiet or brew.steps[i].id == "event:brew-diet"
end
check(brew and not sawDiet, "an achievement already earned is not a step")
local keepState2, keepRequest2 = ns.Session.state, UnboredCharDB.request
UnboredCharDB.request = nil
ns.Session:BeginSuggestion(brew)
check(ns.Session.state and ns.Session.state.topic == "suggestion" and ns.Session:Current().why == "Starts Friday",
  "picking it gives the plan for when it starts")
check(ns.Suggestions.StillOpen({ id = "x", kind = "collection", rewards = { "{mount:202}" } }),
  "an idea for a mount you lack stays")
ownedMounts[202] = true
check(not ns.Suggestions.StillOpen({ id = "x", kind = "collection", rewards = { "{mount:202}" } }),
  "and goes the moment you learn it")
check(not ns.Suggestions.StillOpen({ id = "x", kind = "event", rewards = {}, expiresAt = ns.Now() - 1 }),
  "an event idea goes when the event ends")
calendarDays = {}

-- Chains of quests in the log (D135, D136).
local savedQuestLine, savedLog = C_QuestLine, C_QuestLog
local doneQuests = { [1] = true, [2] = true }
ns.QuestDone = function(id)
  return doneQuests[id] == true
end
C_QuestLine = {
  GetQuestLineInfo = function(questID)
    if questID == 3 then
      return { questLineID = 100, questLineName = "The Long Road Home to the Far Away Valley of Stars",
        x = 0.5, y = 0.25, isImportant = true }
    end
    return nil
  end,
  GetQuestLineQuests = function(id)
    return id == 100 and { 1, 2, 3, 4 } or {}
  end,
  IsComplete = function()
    return false
  end,
}
C_QuestLog = setmetatable({
  GetNumQuestLogEntries = function()
    return 1
  end,
  GetInfo = function()
    return { questID = 3, title = "Third" }
  end,
  GetLogIndexForQuestID = function(id)
    return id == 3 and 1 or nil
  end,
  GetTitleForQuestID = function(id)
    return id == 4 and "Home at Last" or nil
  end,
}, { __index = savedLog })
ns.Suggestions.Invalidate()
local chainIdea
for _, idea in ipairs(ns.Suggestions.Local()) do
  chainIdea = idea.kind == "chain" and idea or chainIdea
end
check(chainIdea and chainIdea.goal == "Continue: 2 of 4 done" and chainIdea.chain.nextQuestID == 3,
  "a chain in the log is an idea with its progress")
check(chainIdea and #chainIdea.title <= 40 and chainIdea.title == "The Long Road Home to the Far Away",
  "its name is cut at a word")
UnboredCharDB.request = nil
ns.Session:BeginSuggestion(chainIdea)
local first = ns.Session:Current()
check(first and first.id == "quest:3" and first.title == "{quest:3} (in your log)" and first.complete.questID == 3,
  "picking it gives the chain at once: the next quest first")
check(ns.Session.state.tasks[2].title == "Home at Last" and #ns.Session.state.tasks == 2,
  "then the rest by title")
doneQuests[3] = true
ns.Session:CheckCurrent()
check(ns.Session:Current() and ns.Session:Current().id == "quest:4", "turning the quest in moves the plan on")
check(not ns.Suggestions.StillOpen(chainIdea), "and the chain idea with the old next quest goes")
C_QuestLine, C_QuestLog = savedQuestLine, savedLog
ns.Session.state, UnboredCharDB.request = keepState2, keepRequest2
C_Calendar, C_DateAndTime = savedCalendar, savedDate
ns.AchievementState, ns.MountState, ns.QuestDone = savedAch, savedMount, savedQuestDone
ns.Suggestions.Invalidate()

-- Picking a Server idea: straight to Confirm, then a Request with its copy and no time.
local keepRequest, keepState = UnboredCharDB.request, ns.Session.state
UnboredCharDB.request = nil
ns.Session:BeginSuggestion(ideas[3])
local flow = ns.Session.Flow()
check(ns.Session:FlowState() == "confirm" and flow.topic == "suggestion" and flow.mode == "farm",
  "a Server idea goes straight to Confirm with its mode")
check(flow.budget == nil and flow.suggestionId == "mount:183", "with its id and no time")
local sent = ns.Session:BuildRequest(flow)
check(sent.topic == "suggestion" and sent.suggestionId == "mount:183" and sent.suggestion.title == "Tempest Keep",
  "the Request carries the idea")
check(sent.suggestion.rewards[1] == "{mount:183}" and sent.suggestion.request == nil and sent.budget == nil,
  "only the idea's own fields travel, never a time")
ns.Session:Send()
check(UnboredCharDB.request.suggestionId == "mount:183" and UnboredCharDB.request.state == "sent",
  "Send now writes it")
UnboredCharDB.request.state = "waiting"
UnboredCharDB.request.sentAt = ns.Now() - ns.REQUEST_EXPIRE_SECONDS - 1
check(ns.Session:Retry() and ns.Session.Flow().suggestion.id == "mount:183", "Try again keeps the idea")
UnboredCharDB.request = nil
ns.Session:BeginSuggestion({ id = "rare:here", kind = "rare", title = "Rare Beast", goal = "Hunt Rare Beast.",
  rewards = {}, quick = true })
check(ns.Session.state.title == "Rare Beast" and ns.Session.state.mode == "roam",
  "a live idea starts its Quick plan at once, named after it")
check(ns.Session:FlowState() == "quick" and ns.Session.Flow().suggestionId == "rare:here",
  "and offers a proper plan for the same idea")
UnboredCharDB.request = keepRequest
ns.Session.state = keepState
UnitName, GetRealmName, ns.Now = savedName, savedRealm, savedNow
UnboredSuggestions = nil

UnboredExternalPlan = { requestId = "req-none", requestStatus = "fulfilled", answer = { message = 5 } }
ns.UI.HasCompanion = hasCompanion
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

UnboredCharDB = {}
UnboredDB.alts = nil
UnitName = function() return "Ann" end
GetRealmName = function() return "Home" end
local savedProfessions, savedContainer = GetProfessions, C_Container
GetProfessions = function() return 1 end
GetProfessionInfo = function() return "Alchemy", nil, 50, 100, nil, nil, 171 end
C_Container = {
  GetContainerNumSlots = function(bag) return bag == 0 and 1 or 0 end,
  GetContainerItemInfo = function() return { itemID = 2589, stackCount = 4 } end,
}
UnboredCharDB.profile = { v = 1, bags = { { itemID = 1, count = 1 } } }
UnboredCharDB.bank = { items = {} }
ns.Profile.StartSession(true)
check(UnboredCharDB.profile == nil and UnboredCharDB.bank == nil, "the 0.6 profile is removed at login (D113)")
ns.Profile.OnEvent("BAG_UPDATE_DELAYED")
ns.Profile.OnEvent("SKILL_LINES_CHANGED")
ns.Profile.Flush(true)
ns.Profile.OnEvent("PLAYER_LOGOUT")
check(UnboredCharDB.profile == nil, "and never written again")
check(type(UnboredCharDB.sessions) == "table" and UnboredCharDB.sessions[#UnboredCharDB.sessions].stop == ns.Now(),
  "logout only stamps the session's time")
local altKey = ns.Profile.AltKey(UnitName("player"), GetRealmName())
check(UnboredDB.alts and UnboredDB.alts[altKey] and UnboredDB.alts[altKey].professions[1].skillLine == 171,
  "this character is in the alt registry")
check(#ns.Profile.Alts() == 0, "the alt list leaves out the current character")
UnboredDB.alts["Other-Bob"] = { name = "Bob", realm = "Other", seenAt = 1 }
check(#ns.Profile.Alts() == 1 and ns.Profile.Alts()[1].name == "Bob", "the alt list has the other characters")
ns.Profile.NoteUnmatched(42)
ns.Profile.NoteUnmatched(42)
local unmatched = 0
for _, entry in ipairs((ns.Snapshot.Body("unresolvedIds") or {}).list or {}) do
  unmatched = unmatched + ((entry.kind == "advice" and entry.id == 42) and 1 or 0)
end
check(unmatched == 1, "an unmatched item is logged once, with the unresolved ids")
GetProfessions, GetProfessionInfo, C_Container = savedProfessions, nil, savedContainer
UnitName, GetRealmName = nil, nil

local tocFile = assert(io.open("Unbored.toc", "r"))
local tocText = tocFile:read("*a")
tocFile:close()
local tocVersion = tocText:match("## Version:%s*(%S+)")
check(tocVersion == ns.VERSION, "ns.VERSION matches the TOC: " .. tostring(tocVersion) .. " vs " .. ns.VERSION)
local tocFiles = {}
for line in tocText:gmatch("[^\r\n]+") do
  local path = line:match("^([%w_\\]+%.lua)%s*$")
  if path then
    tocFiles[#tocFiles + 1] = (path:gsub("\\", "/"))
  end
end
check(table.concat(tocFiles, ",") == table.concat(files, ","), "the test loads the same files as the TOC")

if fails > 0 then
  io.stderr:write(fails .. " failed, " .. checks .. " checks\n")
  os.exit(1)
end
print(checks .. " checks passed")
