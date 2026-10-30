local _, ns = ...

ns.Session = {
  state = nil,
  checking = false,
  rebuildQueued = false,
  started = false,
}

local function blankState(mode, budget, source)
  return {
    version = 1,
    source = source or "provider",
    mode = mode,
    budget = budget,
    tasks = {},
    done = {},
    skipped = {},
    savedAt = ns.Now(),
    pendingQuests = false,
    pendingLockouts = false,
    pendingCalendar = false,
  }
end

function ns.Session:Current()
  local state = self.state
  if not state or type(state.tasks) ~= "table" then
    return nil
  end
  return state.tasks[1]
end

function ns.Session:Mode()
  if self.state and self.state.mode then
    return self.state.mode
  end
  if ns.DB and ns.DB.mode then
    return ns.DB.mode
  end
  return "roam"
end

function ns.Session:Untouched()
  local state = self.state
  if not state then
    return true
  end
  return #(state.done or {}) == 0 and #(state.skipped or {}) == 0
end

function ns.Session:Save()
  if self.state then
    self.state.savedAt = self.state.savedAt or ns.Now()
    if UnboredCharDB then
      UnboredCharDB.session = self.state
    end
  end
end

function ns.Session.RefreshUI()
  local session = ns.Session
  if ns.Waypoint and ns.Waypoint.Sync then
    ns.Waypoint:Sync(session:Current())
  end
  if ns.UI and ns.UI.Refresh then
    ns.UI:Refresh()
  end
  if ns.Tracker and ns.Tracker.Refresh then
    ns.Tracker:Refresh()
  end
  if ns.Mascot and ns.Mascot.Refresh then
    ns.Mascot:Refresh()
  end
end

-- A finished plan stays on screen until the player says ok.
function ns.Session:ClearFinished()
  if self.state and type(self.state.tasks) == "table" and #self.state.tasks == 0 then
    self.state = nil
    if type(UnboredCharDB) == "table" then
      UnboredCharDB.session = nil
    end
  end
  self:RefreshUI()
end

-- At most one short line per step, and only when the player turned it on.
function ns.Session.Note(text)
  if ns.DB and ns.DB.chatNotes then
    ns.Print(text)
  end
end

function ns.Session:Finish(bucket)
  local task = self:Current()
  if not task or not self.state then
    return
  end
  local list = bucket == "skipped" and self.state.skipped or self.state.done
  if ns.Profile then
    ns.Profile.NoteStep(task, bucket == "skipped" and "skipped" or "done")
  end
  if ns.Mascot and ns.Mascot.Echo then
    ns.Mascot:Echo(ns.T(bucket == "skipped" and "ECHO_SKIPPED" or "ECHO_DONE", task.title or ""))
    ns.Mascot:Lead(bucket == "skipped" and "OK_NEXT" or "NICE")
  end
  list[#list + 1] = { id = task.id, at = ns.Now() }
  table.remove(self.state.tasks, 1)
  if ns.Waypoint and ns.Waypoint.ClearOwned then
    ns.Waypoint:ClearOwned()
  end
  self:Save()
  local nxt = self:Current()
  if nxt then
    self.Note(ns.T("NEXT_UP", nxt.title))
    ns.ClickSound()
  else
    self.Note(ns.T("PLAN_DONE_CHAT"))
    ns.CheerSound()
  end
  self:RefreshUI()
end

function ns.Session:CheckCurrent()
  if self.checking or not self.state then
    return
  end
  self.checking = true
  local guard = 0
  while self:Current() and ns.IsTaskComplete(self:Current()) do
    self:Finish("done")
    guard = guard + 1
    if guard >= 40 then
      break
    end
  end
  self.checking = false
end

function ns.Session:Done()
  if not self:Current() then
    return
  end
  self:Finish("done")
  self:CheckCurrent()
end

function ns.Session:Skip()
  local task = self:Current()
  if not task or not self.state or type(self.state.tasks) ~= "table" then
    return
  end
  local skips = (tonumber(task.skipCount) or 0) + 1
  if skips >= 2 or #self.state.tasks < 2 then
    self:Finish("skipped")
    self:CheckCurrent()
    return
  end
  task.skipCount = skips
  if ns.Mascot and ns.Mascot.Lead then
    ns.Mascot:Lead("OK_NEXT")
  end
  table.remove(self.state.tasks, 1)
  self.state.tasks[#self.state.tasks + 1] = task
  if ns.Waypoint and ns.Waypoint.ClearOwned then
    ns.Waypoint:ClearOwned()
  end
  self.Note(ns.T("NEXT_UP", self:Current().title))
  self:Save()
  self:CheckCurrent()
  self:RefreshUI()
end

function ns.Session:Waypoint()
  local task = self:Current()
  if task and ns.Waypoint then
    ns.Waypoint:Retrack(task)
  end
end

-- Called by the ticker. Moves along a waypoint route by proximity.
function ns.Session:AdvanceRoute()
  local task = self:Current()
  if task and ns.Waypoint and ns.Waypoint.Advance(task) then
    self:Save()
    self:RefreshUI()
    return true
  end
  return false
end

function ns.Session:Progress()
  local state = self.state
  if type(state) ~= "table" or type(state.tasks) ~= "table" then
    return nil
  end
  local finished = #(state.done or {}) + #(state.skipped or {})
  local left = 0
  for i = 1, #state.tasks do
    left = left + (tonumber(state.tasks[i].estMinutes) or 0)
  end
  return {
    step = finished + (#state.tasks > 0 and 1 or 0),
    steps = finished + #state.tasks,
    remaining = #state.tasks,
    minutesLeft = left,
  }
end

function ns.Session:ApplyPlan(plan, source, reveal)
  local tasks = {}
  for i = 1, #plan.tasks do
    local task = ns.NormalizeTask(plan.tasks[i])
    if task then
      task.source = source or "import"
      tasks[#tasks + 1] = task
    end
  end
  self.state = blankState(plan.mode or "custom", plan.budget, source or "import")
  self.state.tasks = tasks
  self.state.note = plan.note
  self.state.savedAt = ns.Now()
  if ns.DB then
    ns.DB.mode = self.state.mode
  end
  self:Save()
  if ns.Waypoint and ns.Waypoint.ClearOwned then
    ns.Waypoint:ClearOwned()
  end
  self:CheckCurrent()
  self:RefreshUI()
  if reveal then
    self:Started()
  end
end

-- A plan just became active: the mascot takes over, the main window steps aside.
function ns.Session:Started()
  if ns.Mascot and ns.Mascot.Reveal then
    ns.Mascot:Reset()
    ns.Mascot:Reveal()
  end
  if ns.UI and ns.UI.frame and ns.UI.frame.Hide then
    ns.UI.frame:Hide()
  end
  self:RefreshUI()
end

function ns.Session.ReadCompanion()
  if type(UnboredCompanionPlan) == "table" and type(UnboredCompanionPlan.tasks) == "table" then
    return UnboredCompanionPlan
  end
  if ns.DB and type(ns.DB.companionPlan) == "table" and type(ns.DB.companionPlan.tasks) == "table" then
    return ns.DB.companionPlan
  end
  return nil
end

function ns.Session.CompanionIsNewer(companion, saved)
  local generated = tonumber(companion and companion.generatedAt)
  if not generated then
    return false
  end
  if not saved or not tonumber(saved.savedAt) then
    return true
  end
  return generated > tonumber(saved.savedAt)
end

function ns.Session:ApplyCompanion(force)
  local companion = self:ReadCompanion()
  if not companion then
    if force then
      ns.Print(ns.T("COMPANION_NONE"))
    end
    return false
  end
  local plan, err = ns.ValidatePlan(companion, true)
  if not plan then
    if force then
      ns.Print(err or ns.T("BUILD_FAILED"))
    end
    return false
  end
  self:ApplyPlan(plan, "companion", false)
  return true
end

function ns.Session:Rebuild(mode)
  if ns.IsCombat() then
    self.rebuildQueued = true
    self.queuedMode = mode
    ns.Print(ns.T("PAUSED"))
    return
  end
  mode = mode or (ns.DB and ns.DB.mode) or "roam"
  if ns.DB then
    ns.DB.mode = mode
  end
  local ctx = ns.BuildContext()
  local tasks = ns.BuildProviderPlan(mode, ctx)
  if not tasks then
    ns.Print(ns.T("BUILD_FAILED"))
    tasks = {}
  end
  self.state = blankState(mode, nil, "provider")
  self.state.tasks = tasks
  self.state.pendingQuests = mode == "quests"
  self.state.pendingLockouts = mode == "farm"
  self.state.pendingCalendar = mode == "events"
  self.state.pendingMounts = mode == "farm" and ns.farmNeedsJournal == true
  self:Save()
  if ns.Waypoint and ns.Waypoint.ClearOwned then
    ns.Waypoint:ClearOwned()
  end
  self:CheckCurrent()
  self:RefreshUI()
end

function ns.Session:BuildHere(mode)
  self:Rebuild(mode or self:Mode())
  if not self.rebuildQueued then
    self:Started()
  end
end

-- A Quick plan: built here from the Providers at once, so the player has a
-- step right away while the Full plan is made (docs/adr/0005).
function ns.Session:QuickPlan(preset)
  if type(UnboredCharDB) == "table" then
    UnboredCharDB.offer = nil
  end
  self:Rebuild(preset.mode)
  if self.rebuildQueued then
    return
  end
  if self.state then
    self.state.quick = true
    self.state.topic = preset.id
    self:Save()
  end
  self:Started()
end

-- The Full plan that came back while a Quick plan is running. The player
-- chooses; it never replaces the Quick plan on its own.
function ns.Session.Offer()
  local offer = type(UnboredCharDB) == "table" and UnboredCharDB.offer or nil
  if type(offer) ~= "table" or type(offer.plan) ~= "table" or type(offer.plan.tasks) ~= "table" then
    return nil
  end
  return offer
end

-- Steps finished in the Quick plan stay finished: they count in the progress
-- and the same step in the Full plan is not asked again.
function ns.Session:ApplyFull(plan, key, requestId)
  local old = self.state
  local carried = old and old.quick and ns.DeepCopy(old.done or {}, 0) or nil
  self:ApplyPlan(plan, "companion", false)
  if not self.state then
    return
  end
  self.state.externalKey = key
  self.state.requestId = requestId
  if carried and #carried > 0 then
    local finished = {}
    for i = 1, #carried do
      finished[carried[i].id] = true
    end
    local kept = {}
    for i = 1, #self.state.tasks do
      if not finished[self.state.tasks[i].id] then
        kept[#kept + 1] = self.state.tasks[i]
      end
    end
    self.state.tasks = kept
    self.state.done = carried
    self:Save()
    self:CheckCurrent()
    self:RefreshUI()
  end
end

function ns.Session:AcceptOffer()
  local offer = self.Offer()
  if not offer then
    return
  end
  UnboredCharDB.offer = nil
  self:ApplyFull(offer.plan, offer.key, offer.requestId)
  self:Started()
end

function ns.Session:DeclineOffer()
  if type(UnboredCharDB) == "table" then
    UnboredCharDB.offer = nil
  end
  self:RefreshUI()
end

-- Only remembers the choice. Nothing is rebuilt until a Preset or Send.
function ns.Session.SetMode(_, mode)
  if ns.DB and ns.MODE_IDS[mode] and mode ~= "custom" then
    ns.DB.mode = mode
  end
  ns.Session:RefreshUI()
end

function ns.Session.ChosenMode()
  local mode = ns.DB and ns.DB.mode
  if mode == "roam" or mode == "quests" or mode == "events" or mode == "fun" or mode == "farm" then
    return mode
  end
  return "roam"
end

function ns.Session:MaybeRebuild(flag)
  if not self.state or self.state.source ~= "provider" or not self:Untouched() then
    return
  end
  if not self.state[flag] or ns.IsCombat() then
    return
  end
  local mode = self.state.mode
  local quick, topic = self.state.quick, self.state.topic
  self:Rebuild(mode)
  if self.state then
    self.state[flag] = false
    self.state.quick = quick
    self.state.topic = topic
    self:Save()
  end
end

function ns.Session.ExternalKey(plan)
  if type(plan) == "table" and type(plan.requestId) == "string" and plan.requestId ~= "" then
    return "r:" .. plan.requestId
  end
  local stamp = tonumber(plan and plan.generatedAt)
  if stamp and stamp > 0 then
    return "t:" .. tostring(stamp)
  end
  local ids = {}
  local tasks = plan and plan.tasks or {}
  for i = 1, #tasks do
    ids[#ids + 1] = (tasks[i] and tasks[i].id) or ""
  end
  return "ids:" .. table.concat(ids, ",")
end

function ns.Session.PendingRequest()
  local saved = UnboredCharDB
  local req = type(saved) == "table" and saved.request or nil
  if type(req) ~= "table" or type(req.id) ~= "string" or req.id == "" then
    return nil
  end
  return req
end

-- requestNote: nil (no request), "sending" (the companion has not answered
-- for this id yet), "preparing", "failed", or "ready".
function ns.Session:NoteRequest()
  self.requestNote = nil
  self.requestReason = nil
  self.requestReasonCode = nil
  local req = self:PendingRequest()
  if not req then
    return
  end
  local plan = UnboredExternalPlan
  if type(plan) ~= "table" or plan.requestId ~= req.id then
    self.requestNote = "sending"
    return
  end
  if plan.requestStatus == "failed" then
    self.requestNote = "failed"
    self.requestReason = type(plan.requestReason) == "string" and plan.requestReason or ""
    local code = plan.requestReasonCode
    self.requestReasonCode = type(code) == "string" and code:match("^[a-z_]+$") and code or "planner_failed"
    return
  end
  if plan.requestStatus == "pending" or (type(plan.tasks) ~= "table" and type(plan.answer) ~= "table") then
    self.requestNote = "preparing"
    return
  end
  self.requestNote = "ready"
end

function ns.Session:RequestAge()
  local req = self:PendingRequest()
  local created = req and tonumber(req.createdAt)
  if not created then
    return nil
  end
  return math.max(0, ns.Now() - created)
end

ns.SLOW_SECONDS = 10 * 60
-- The Companion rewrites its status at least every 5 minutes while it runs.
ns.COMPANION_STALE_SECONDS = 15 * 60

-- The files only change at a load, so "slow" is judged at the last load: the
-- Request was already on disk then and had waited over SLOW_SECONDS.
function ns.Session:IsSlow()
  local note = self.requestNote
  local req = self:PendingRequest()
  if not req or not req.onDisk or (note ~= "sending" and note ~= "preparing") then
    return false
  end
  local sent = tonumber(req.sentAt) or tonumber(req.createdAt)
  return sent ~= nil and (self.loadedAt or ns.Now()) - sent > ns.SLOW_SECONDS
end

-- What the Companion said about itself when it last wrote Plan.lua.
function ns.Session.CompanionStatus()
  local status = UnboredCompanionStatus
  if type(status) ~= "table" then
    return nil
  end
  return status
end

-- Why a Request may not have reached the Planner yet: "stopped" (the
-- Companion is not running), "pairing", "revoked", "offline", or nil.
function ns.Session.CompanionProblem()
  local status = ns.Session.CompanionStatus()
  if not status then
    return nil
  end
  local seen = tonumber(status.seenAt)
  if seen and (ns.Session.loadedAt or ns.Now()) - seen > ns.COMPANION_STALE_SECONDS then
    return "stopped"
  end
  if status.pairing == "revoked" then
    return "revoked"
  end
  if status.pairing ~= nil and status.pairing ~= "approved" then
    return "pairing"
  end
  if status.online == false then
    return "offline"
  end
  return nil
end

local function versionParts(text)
  local parts = {}
  for number in tostring(text or ""):gmatch("%d+") do
    parts[#parts + 1] = tonumber(number)
  end
  return parts
end

function ns.VersionNewer(candidate, current)
  local a, b = versionParts(candidate), versionParts(current)
  if #a == 0 then
    return false
  end
  for i = 1, math.max(#a, #b) do
    local x, y = a[i] or 0, b[i] or 0
    if x ~= y then
      return x > y
    end
  end
  return false
end

-- The Companion put a newer addon on disk than the one running.
function ns.Session.UpdateWaiting()
  local status = ns.Session.CompanionStatus()
  local version = status and status.addonVersion
  if type(version) == "string" and ns.VersionNewer(version, ns.VERSION) then
    return version
  end
  return nil
end

-- The Request flow (docs/adr/0033, D65): one state machine kept in
-- UnboredCharDB.request.state, so it survives a reload, logout or character
-- switch. idle -> quick -> survey -> confirm -> queued | sent -> waiting ->
-- (offer) -> idle, with failed and expired on the side. Before it is sent the
-- table has no id, so the Companion does not see it.
ns.REQUEST_EXPIRE_SECONDS = 60 * 60
ns.ETA_DEFAULT_SECONDS = 180
ns.ETA_AGAIN_SECONDS = 120
local LOCKED = { queued = true, sent = true, waiting = true }

function ns.Session.Flow()
  local req = type(UnboredCharDB) == "table" and UnboredCharDB.request or nil
  return type(req) == "table" and req or nil
end

local function sentAt(req)
  return tonumber(req.sentAt) or tonumber(req.createdAt)
end

function ns.Session:FlowState()
  local req = self.Flow()
  if not req then
    return "idle"
  end
  local state = req.state
  if state == nil then
    -- A Request saved by 0.6 has an id and no state.
    state = type(req.id) == "string" and req.id ~= "" and "waiting" or "idle"
  end
  if state == "quick" and not self:Current() then
    return "idle"
  end
  if LOCKED[state] and self.requestNote == "failed" then
    return "failed"
  end
  if state == "waiting" then
    local at = sentAt(req)
    if at and ns.Now() - at > ns.REQUEST_EXPIRE_SECONDS then
      return "expired"
    end
  end
  return state
end

-- Waiting locks Wisp to the waiting Bubble; the Steps stay usable (D67).
function ns.Session:Locked()
  return LOCKED[self:FlowState()] == true
end

local function setFlow(fields)
  if type(UnboredCharDB) ~= "table" then
    UnboredCharDB = {}
  end
  UnboredCharDB.request = fields
end

-- A preset: the Quick plan at once and, with the Companion, one button for a
-- proper plan. An empty Quick plan goes straight to the Survey.
function ns.Session:BeginQuick(preset)
  self:QuickPlan(preset)
  if not (ns.UI and ns.UI.HasCompanion()) or self.rebuildQueued then
    return
  end
  local empty = self:Current() == nil
  setFlow({
    state = empty and "survey" or "quick",
    mode = preset.mode,
    topic = preset.id,
    wish = preset.wish,
    quickEmpty = empty or nil,
  })
  self:NoteRequest()
  self:RefreshUI()
end

-- "Something else..." or "Make a plan" under an Answer: the Survey with
-- free text, where minutes may be typed (docs/adr/0037).
function ns.Session:BeginSurvey(fields)
  fields = type(fields) == "table" and fields or {}
  setFlow({ state = "survey", custom = true, wish = fields.wish })
  self:NoteRequest()
  self:RefreshUI()
end

function ns.Session:ToSurvey()
  local req = self.Flow()
  if req and req.state == "quick" then
    req.state = "survey"
  end
  self:RefreshUI()
end

-- wish: the optional line (required for a custom wish); budget: typed minutes.
function ns.Session:SurveyDone(wish, budget)
  local req = self.Flow()
  if not req or req.state ~= "survey" then
    return
  end
  wish = ns.Utf8Truncate(ns.Trim(type(wish) == "string" and wish or ""), 300)
  if wish ~= "" then
    req.extra = req.topic and wish or nil
    if not req.topic then
      req.wish = wish
    end
  end
  req.budget = req.custom and budget or nil
  req.state = "confirm"
  self:RefreshUI()
end

-- Back from the Survey goes to the Quick plan (or nothing); from Confirm to the Survey.
function ns.Session:FlowBack()
  local req = self.Flow()
  if not req then
    return
  end
  if req.state == "confirm" then
    req.state = "survey"
  elseif req.state == "survey" and req.topic and not req.quickEmpty and self:Current() then
    req.state = "quick"
  elseif req.state == "survey" or req.state == "quick" then
    UnboredCharDB.request = nil
  end
  self:RefreshUI()
end

-- Turns the confirmed flow into a plan Request (the only type the addon
-- sends, D64). Nothing reloads here.
function ns.Session:Ask(ask)
  ask = type(ask) == "table" and ask or {}
  local name = ns.SafeString(ns.Call(UnitName, "player"), 80) or "player"
  local realm = ns.SafeString(ns.Call(GetRealmName), 80) or ""
  local function text(value, limit)
    value = ns.Utf8Truncate(ns.Trim(type(value) == "string" and value or ""), limit)
    return value ~= "" and value or nil
  end
  local okContext, context = pcall(ns.PlayerContext)
  local wish = text(ask.wish, 600)
  local extra = text(ask.extra, 300)
  if extra then
    wish = wish and (wish .. ". " .. extra) or extra
  end
  local request = {
    id = string.format("req-%d-%04d", ns.Now(), math.random(0, 9999)),
    type = "plan",
    createdAt = ns.Now(),
    character = name,
    realm = realm,
    wish = wish,
    context = okContext and type(context) == "table" and context or nil,
    mode = ns.MODE_IDS[ask.mode] and ask.mode ~= "custom" and ask.mode or self.ChosenMode(),
    custom = ask.custom or nil,
  }
  local lang = wish and ns.Intents.Lang(wish) or ns.LANG
  request.lang = (lang == "ru" or lang == "en") and lang or "en"
  local budget = tonumber(ask.budget)
  if budget and budget >= 5 and budget <= 240 then
    request.budget = math.floor(budget)
  end
  if type(ask.topic) == "string" and ask.topic:match("^[a-z_-]+$") and #ask.topic <= 40 then
    request.topic = ask.topic
  end
  if type(UnboredCharDB) ~= "table" then
    UnboredCharDB = {}
  end
  UnboredCharDB.offer = nil
  if not request.topic and wish then
    UnboredCharDB.lastWish = wish
  end
  return request
end

-- Send now (D66): the Request is written and the game reloads in this click.
-- Send at logout: it waits in SavedVariables for the next logout or reload.
function ns.Session:Send(now)
  local req = self.Flow()
  if req and req.state == "queued" and now then
    req.state = "sent"
    req.sentAt = ns.Now()
    self.RefreshNow()
    return req.id
  end
  if not req or req.state ~= "confirm" then
    return nil
  end
  local request = self:Ask(req)
  request.state = now and "sent" or "queued"
  request.sentAt = now and ns.Now() or nil
  UnboredCharDB.request = request
  self:NoteRequest()
  if now then
    self.RefreshNow()
  else
    self:RefreshUI()
  end
  return request.id
end

-- Try again after a failure or an expiry: back to Confirm with the same wish.
function ns.Session:Retry()
  local req = self.Flow()
  if not req then
    return nil
  end
  setFlow({
    state = "confirm",
    mode = req.mode,
    topic = req.topic,
    wish = req.wish,
    budget = req.budget,
    custom = req.custom or (not req.topic) or nil,
  })
  self:NoteRequest()
  self:RefreshUI()
  return true
end

function ns.Session:CancelRequest()
  if type(UnboredCharDB) == "table" then
    UnboredCharDB.request = nil
  end
  self:NoteRequest()
  self:RefreshUI()
end

-- Only ever called from a click on Refresh, Send now or Load (ReloadUI needs
-- the hardware event), never per message.
function ns.Session.RefreshNow()
  if type(ReloadUI) == "function" then
    ReloadUI()
  end
end

-- The ETA Refresh: counted, so a Request still pending after it waits two
-- more minutes before the next offer (D68).
function ns.Session:CheckAgain()
  local req = self:PendingRequest()
  if req then
    req.checks = (tonumber(req.checks) or 0) + 1
  end
  self.RefreshNow()
end

-- A queued Request is written at logout, so it counts as sent from then.
function ns.Session:OnLogout()
  local req = self.Flow()
  if req and req.state == "queued" then
    req.state = "sent"
    req.sentAt = ns.Now()
  end
end

function ns.Session.Eta()
  local plan = UnboredExternalPlan
  local eta = type(plan) == "table" and tonumber(plan.eta) or nil
  eta = eta or ns.ETA_DEFAULT_SECONDS
  return math.max(60, math.min(900, eta))
end

-- The one Refresh offer (D68): when the ETA has passed for a Request the
-- Companion file names as being prepared. Without that id in the file a
-- Refresh would find nothing, so Wisp never guesses then (D82).
function ns.Session:RefreshOffer()
  local req = self:PendingRequest()
  if not req or self:FlowState() ~= "waiting" or self.CompanionProblem() then
    return nil
  end
  if self.requestNote ~= "preparing" then
    return nil
  end
  local due
  if (tonumber(req.checks) or 0) > 0 then
    due = (self.loadedAt or ns.Now()) + ns.ETA_AGAIN_SECONDS
  else
    due = (sentAt(req) or ns.Now()) + self.Eta()
  end
  if ns.Now() < due then
    return nil
  end
  return { kind = "eta", request = req }
end

-- Pending after an ETA Refresh: "Almost. Give me a couple more minutes."
function ns.Session:CheckedAgain()
  local req = self:PendingRequest()
  return req ~= nil and (tonumber(req.checks) or 0) > 0 and self.requestNote == "preparing"
end

-- A question: the local answer at once (docs/adr/0014). What the intents
-- cannot answer becomes "Want a plan from it?" through the Survey (D64).
function ns.Session:AskQuestion(question, topic)
  question = ns.Utf8Truncate(ns.Trim(type(question) == "string" and question or ""), 600)
  if question == "" then
    return nil
  end
  local lang = ns.Intents.Lang(question)
  local intent = topic == "nearby" and "here" or ns.Intents.Detect(question)
  local found = intent and ns.Intents.Answer(intent, lang) or nil
  local toPlan = not found and ns.UI and ns.UI.HasCompanion()
  local messages = found and found.messages or { ns.TL(lang, toPlan and "ASK_TO_PLAN" or "ASK_LOCAL_ONLY") }
  if type(UnboredCharDB) ~= "table" then
    UnboredCharDB = {}
  end
  UnboredCharDB.answer = {
    type = "question",
    planWish = toPlan and question or nil,
    question = question,
    message = table.concat(messages, "\n\n"),
    messages = messages,
    lang = lang,
    tasks = found and #found.tasks > 0 and found.tasks or nil,
    intent = intent,
    isLocal = true,
    at = ns.Now(),
  }
  self:RefreshUI()
  return true
end

-- "Make it a plan" under a local answer.
function ns.Session:AnswerPlan()
  local answer = self.UnreadAnswer()
  if not answer or type(answer.tasks) ~= "table" or #answer.tasks == 0 then
    return
  end
  local tasks = answer.tasks
  answer.seen = true
  self:ApplyPlan({ mode = "roam", tasks = tasks }, "provider", true)
end

ns.ITEM_NOTES_MAX = 200

-- Answers about an item are kept per account and shown in its tooltip.
function ns.Session.RememberItem(itemID, message)
  itemID = ns.AsNumber(itemID)
  if not itemID or not ns.DB or type(message) ~= "string" or message == "" then
    return
  end
  if type(ns.DB.itemNotes) ~= "table" then
    ns.DB.itemNotes = {}
  end
  local notes = ns.DB.itemNotes
  notes[itemID] = { message = message, at = ns.Now() }
  local count, oldestID, oldestAt = 0, nil, nil
  for id, note in pairs(notes) do
    count = count + 1
    local at = type(note) == "table" and tonumber(note.at) or 0
    if not oldestAt or at < oldestAt then
      oldestID, oldestAt = id, at
    end
  end
  if count > ns.ITEM_NOTES_MAX and oldestID then
    notes[oldestID] = nil
  end
end

function ns.Session.ItemNote(itemID)
  itemID = ns.AsNumber(itemID)
  local notes = ns.DB and ns.DB.itemNotes
  local note = itemID and type(notes) == "table" and notes[itemID]
  if type(note) == "table" and type(note.message) == "string" then
    return note.message
  end
  return nil
end

function ns.Session.UnreadAnswer()
  local answer = type(UnboredCharDB) == "table" and UnboredCharDB.answer or nil
  if type(answer) == "table" and not answer.seen and type(answer.message) == "string" then
    return answer
  end
  return nil
end

function ns.Session:DismissAnswer()
  local answer = self.UnreadAnswer()
  if answer then
    answer.seen = true
  end
  self:RefreshUI()
end

-- Waypoints that came with an answer become one step, put in front of the
-- current plan so nothing the player was doing is lost.
function ns.Session:AnswerStep(answer, requestId)
  if type(answer.waypoints) ~= "table" or #answer.waypoints == 0 then
    return false
  end
  local first = answer.waypoints[1]
  local title = type(first) == "table" and type(first.label) == "string" and first.label or nil
  if not title or ns.Trim(title) == "" then
    title = ns.T("ANSWER_STEP")
  end
  local plan = ns.ValidatePlan({
    v = 1,
    kind = "plan",
    mode = "custom",
    tasks = {
      {
        id = ("answer:" .. (requestId or tostring(ns.Now()))):gsub("[^%w%-%._:]", ""),
        title = ns.Utf8Truncate(title, 200),
        estMinutes = 10,
        waypoints = answer.waypoints,
        complete = { kind = "manual" },
      },
    },
  }, true)
  if not plan then
    return false
  end
  local task = ns.NormalizeTask(plan.tasks[1])
  if not task then
    return false
  end
  task.source = "answer"
  if self.state and type(self.state.tasks) == "table" and #self.state.tasks > 0 then
    table.insert(self.state.tasks, 1, task)
    if ns.Waypoint and ns.Waypoint.ClearOwned then
      ns.Waypoint:ClearOwned()
    end
    self:Save()
    self:RefreshUI()
  else
    self:ApplyPlan(plan, "companion", false)
  end
  return true
end

local function cleanAnswer(raw)
  if type(raw) ~= "table" or type(raw.message) ~= "string" then
    return nil
  end
  local message = ns.Utf8Truncate(ns.Trim(raw.message), 1000)
  if message == "" then
    return nil
  end
  local waypoints = ns.CleanWaypoints(raw.waypoints, 1)
  return { message = message, messages = ns.Intents.Split(message), waypoints = waypoints }
end

-- Picks up the companion file on every load. A plan with a requestId is taken
-- only when that request is pending on this character; a plan without one
-- (put straight by the planner) is taken once per character. No prompt.
function ns.Session:AutoApplyExternal()
  self:NoteRequest()
  local external = UnboredExternalPlan
  if type(external) ~= "table" then
    return false
  end
  local answer = cleanAnswer(external.answer)
  if type(external.tasks) ~= "table" and not answer then
    return false
  end
  local req = self:PendingRequest()
  local requestId = type(external.requestId) == "string" and external.requestId ~= "" and external.requestId or nil
  if requestId then
    if not req or req.id ~= requestId or self.requestNote ~= "ready" then
      return false
    end
  elseif req then
    return false
  end
  if type(UnboredCharDB) ~= "table" then
    UnboredCharDB = {}
  end
  local plan
  if type(external.tasks) == "table" then
    plan = ns.ValidatePlan(external, true)
    if not plan and not answer then
      if req then
        self.requestNote = "failed"
        self.requestReason = nil
      end
      return false
    end
  end
  local key = "a:" .. tostring(requestId)
  if plan then
    plan.requestId = requestId
    key = ns.Session.ExternalKey(plan)
  end
  if UnboredCharDB.acceptedExternalKey == key then
    if req then
      UnboredCharDB.request = nil
      self:NoteRequest()
    end
    return false
  end
  UnboredCharDB.acceptedExternalKey = key
  UnboredCharDB.request = nil
  if answer then
    local kind = req and req.type or (type(external.requestType) == "string" and external.requestType) or "question"
    local item = req and type(req.item) == "table" and req.item or nil
    UnboredCharDB.answer = {
      requestId = requestId,
      type = kind,
      message = answer.message,
      messages = answer.messages,
      lang = req and req.lang or nil,
      question = req and (req.question or req.wish) or nil,
      itemID = item and item.itemID or nil,
      itemLink = item and item.link or nil,
      at = ns.Now(),
    }
    if item then
      self.RememberItem(item.itemID, answer.message)
    end
  end
  if plan and self.state and self.state.quick and self:Current() then
    UnboredCharDB.offer = { plan = plan, key = key, requestId = requestId, at = ns.Now() }
  elseif plan then
    self:ApplyFull(plan, key, requestId)
  elseif answer then
    self:AnswerStep(answer, requestId)
  end
  self:Save()
  self:NoteRequest()
  self:Started()
  return true
end

-- /unbored companion: take whatever the companion file holds, even if it was
-- already used once.
function ns.Session:UseExternal()
  local external = UnboredExternalPlan
  if type(external) == "table" and type(external.tasks) == "table" then
    local plan = ns.ValidatePlan(external, true)
    if plan then
      plan.requestId = external.requestId
      if type(UnboredCharDB) ~= "table" then
        UnboredCharDB = {}
      end
      UnboredCharDB.acceptedExternalKey = ns.Session.ExternalKey(plan)
      self:ApplyPlan(plan, "companion", true)
      return true
    end
  end
  if self:ApplyCompanion(true) then
    self:Started()
    return true
  end
  return false
end

function ns.Session:ScheduleDataRefresh()
  if self.dataRefreshScheduled or not C_Timer or not C_Timer.After then
    return
  end
  self.dataRefreshScheduled = true
  pcall(C_Timer.After, 2, function()
    self.dataRefreshScheduled = false
    pcall(function()
      if not self.state or not self:Untouched() then
        return
      end
      if self.state.pendingMounts then
        self:MaybeRebuild("pendingMounts")
      elseif self.state.pendingLockouts then
        self:MaybeRebuild("pendingLockouts")
      elseif self.state.pendingCalendar then
        self:MaybeRebuild("pendingCalendar")
      elseif self.state.pendingQuests then
        self:MaybeRebuild("pendingQuests")
      end
    end)
  end)
end

-- Everything in UnboredCharDB now was read from disk, so a pending Request is
-- where the Companion can see it.
function ns.Session:MarkLoaded()
  self.loadedAt = ns.Now()
  local req = self:PendingRequest()
  if req then
    req.onDisk = true
    if req.state == "sent" or req.state == "queued" then
      req.state = "waiting"
      req.sentAt = req.sentAt or self.loadedAt
    end
  end
end

function ns.Session:Start(initialLogin)
  if self.started then
    self:AutoApplyExternal()
    self:CheckCurrent()
    self:RefreshUI()
    self:ScheduleDataRefresh()
    return
  end
  self.started = true
  self:MarkLoaded()
  local saved = UnboredCharDB and UnboredCharDB.session
  if type(saved) == "table" and saved.version == 1 and type(saved.tasks) == "table" then
    self.state = saved
    self.state.done = self.state.done or {}
    self.state.skipped = self.state.skipped or {}
  end
  local companion = self:ReadCompanion()
  if companion and ns.Session.CompanionIsNewer(companion, saved) then
    self:ApplyCompanion(false)
  end
  if self:AutoApplyExternal() then
    self:ScheduleDataRefresh()
    return
  end
  if initialLogin and self:Current() and not (UnboredCharDB and UnboredCharDB.request) then
    self.welcomeBack = true
  end
  self:CheckCurrent()
  self:RefreshUI()
  self:ScheduleDataRefresh()
end

-- "Continue <plan>" on login: what the plan is called.
function ns.Session:PlanName()
  local state = self.state or {}
  local preset = state.topic and ns.Mascot and ns.Mascot.Preset(state.topic)
  if preset then
    return ns.T(preset.label)
  end
  if type(state.note) == "string" and state.note ~= "" and #state.note <= 60 then
    return state.note
  end
  if state.mode and state.mode ~= "custom" then
    return ns.ModeLabel(state.mode)
  end
  return ns.T("PLAN_NAME_DEFAULT")
end

function ns.Session:ContinuePlan()
  self.welcomeBack = false
  self:RefreshUI()
end

function ns.Session:OnCombatEnd()
  if self.rebuildQueued then
    self.rebuildQueued = false
    self:Rebuild(self.queuedMode)
    return
  end
  self:CheckCurrent()
  self:RefreshUI()
end

function ns.Session:ProgressTable()
  local state = self.state or {}
  local tasks = state.tasks or {}
  local remaining = {}
  for i = 1, #tasks do
    remaining[#remaining + 1] = tasks[i].id
  end
  local done = ns.DeepCopy(state.done or {}, 0) or {}
  local skipped = ns.DeepCopy(state.skipped or {}, 0) or {}
  return {
    v = 1,
    kind = "progress",
    mode = state.mode or "custom",
    budget = state.budget,
    exportedAt = ns.Now(),
    currentId = tasks[1] and tasks[1].id or nil,
    done = done,
    skipped = skipped,
    remaining = remaining,
    source = state.source,
  }
end

function ns.Session:OnEvent(event, ...)
  if event == "PLAYER_LOGOUT" then
    self:OnLogout()
    return
  end
  if event == "PLAYER_REGEN_DISABLED" or event == "PLAYER_REGEN_ENABLED" then
    if event == "PLAYER_REGEN_ENABLED" then
      self:OnCombatEnd()
    else
      self:RefreshUI()
    end
    return
  end
  if not self.state then
    return
  end
  if event == "QUEST_LOG_UPDATE" then
    self:MaybeRebuild("pendingQuests")
    return
  end
  if event == "UPDATE_INSTANCE_INFO" then
    self:MaybeRebuild("pendingLockouts")
    return
  end
  if event == "MOUNT_JOURNAL_SEARCH_UPDATED" then
    self:MaybeRebuild("pendingMounts")
    return
  end
  if event == "CALENDAR_UPDATE_EVENT_LIST" then
    self:MaybeRebuild("pendingCalendar")
    return
  end
  if self:Current() and ns.EventCompletes(self:Current(), event, ...) then
    self:CheckCurrent()
  elseif event == "ZONE_CHANGED_NEW_AREA" or event == "ZONE_CHANGED" then
    self:CheckCurrent()
  end
end
