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

function ns.Session:Budget()
  if self.state and self.state.budget then
    return self.state.budget
  end
  if ns.DB and ns.DB.budget then
    return ns.DB.budget
  end
  return 60
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
  else
    self.Note(ns.T("PLAN_DONE_CHAT"))
  end
  ns.ClickSound()
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
  self.state = blankState(plan.mode or "custom", plan.budget or 60, source or "import")
  self.state.tasks = tasks
  self.state.note = plan.note
  self.state.savedAt = ns.Now()
  if ns.DB then
    ns.DB.mode = self.state.mode
    ns.DB.budget = self.state.budget
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

function ns.Session:Rebuild(mode, budget)
  if ns.IsCombat() then
    self.rebuildQueued = true
    self.queuedMode = mode
    self.queuedBudget = budget
    ns.Print(ns.T("PAUSED"))
    return
  end
  mode = mode or (ns.DB and ns.DB.mode) or "roam"
  budget = budget or (ns.DB and ns.DB.budget) or 60
  if ns.DB then
    ns.DB.mode = mode
    ns.DB.budget = budget
  end
  local ctx = ns.BuildContext(budget)
  local tasks = ns.BuildProviderPlan(mode, ctx)
  if not tasks then
    ns.Print(ns.T("BUILD_FAILED"))
    tasks = {}
  end
  self.state = blankState(mode, budget, "provider")
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

function ns.Session:BuildHere(mode, budget)
  self:Rebuild(mode or self:Mode(), budget or self:Budget())
  if not self.rebuildQueued then
    self:Started()
  end
end

-- A Quick plan: built here from the Providers at once, so the player has a
-- step right away while the Full plan is made (docs/adr/0005).
function ns.Session:QuickPlan(preset, budget)
  if type(UnboredCharDB) == "table" then
    UnboredCharDB.offer = nil
  end
  self:Rebuild(preset.mode, budget)
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

-- The wizard only remembers the choice. Nothing is rebuilt until Get plan.
function ns.Session.SetMode(_, mode)
  if ns.DB and ns.MODE_IDS[mode] and mode ~= "custom" then
    ns.DB.mode = mode
  end
  ns.Session:RefreshUI()
end

function ns.Session.SetBudget(_, minutes)
  minutes = tonumber(minutes)
  if ns.DB and minutes and minutes >= 5 and minutes <= 240 then
    ns.DB.budget = minutes
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

function ns.Session.ChosenBudget()
  local budget = tonumber(ns.DB and ns.DB.budget) or 60
  if budget < 5 or budget > 240 then
    return 60
  end
  return budget
end

function ns.Session:MaybeRebuild(flag)
  if not self.state or self.state.source ~= "provider" or not self:Untouched() then
    return
  end
  if not self.state[flag] or ns.IsCombat() then
    return
  end
  local mode = self.state.mode
  local budget = self.state.budget
  local quick, topic = self.state.quick, self.state.topic
  self:Rebuild(mode, budget)
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

-- Saves the request into SavedVariables. The caller reloads the UI right
-- after, inside the same click, so the game writes the file for the companion.
-- ask: { type = "plan" | "question" | "item", wish, question, topic, item }
function ns.Session:Ask(ask)
  ask = type(ask) == "table" and ask or {}
  local kind = ask.type
  if kind ~= "question" and kind ~= "item" then
    kind = "plan"
  end
  local name = ns.SafeString(ns.Call(UnitName, "player"), 80) or "player"
  local realm = ns.SafeString(ns.Call(GetRealmName), 80) or ""
  local function text(value, limit)
    value = ns.Utf8Truncate(ns.Trim(type(value) == "string" and value or ""), limit)
    return value ~= "" and value or nil
  end
  if type(UnboredCharDB) ~= "table" then
    UnboredCharDB = {}
  end
  local okContext, context = pcall(ns.PlayerContext)
  local id = string.format("req-%d-%04d", ns.Now(), math.random(0, 9999))
  local request = {
    id = id,
    type = kind,
    createdAt = ns.Now(),
    character = name,
    realm = realm,
    wish = text(ask.wish, 600),
    question = text(ask.question, 600),
    context = okContext and type(context) == "table" and context or nil,
  }
  if kind == "plan" then
    UnboredCharDB.offer = nil
    request.mode = ns.MODE_IDS[ask.mode] and ask.mode ~= "custom" and ask.mode or self.ChosenMode()
    local budget = tonumber(ask.budget)
    request.budget = budget and budget >= 5 and budget <= 240 and math.floor(budget) or self.ChosenBudget()
    if not ask.topic then
      UnboredCharDB.lastWish = request.wish
    end
  end
  if type(ask.topic) == "string" and ask.topic:match("^[a-z_-]+$") and #ask.topic <= 40 then
    request.topic = ask.topic
  end
  if kind == "item" then
    local item = type(ask.item) == "table" and ask.item or {}
    local itemID = ns.AsNumber(item.itemID)
    if not itemID then
      return nil
    end
    request.item = {
      itemID = math.floor(itemID),
      link = ns.SafeString(item.link, 400),
      name = ns.SafeString(item.name, 120),
      bag = ns.AsNumber(item.bag),
      slot = ns.AsNumber(item.slot),
      count = ns.AsNumber(item.count),
    }
  elseif kind == "question" and not request.question then
    return nil
  end
  UnboredCharDB.request = request
  self:NoteRequest()
  self:RefreshUI()
  return id
end

function ns.Session:RequestPlan(wish)
  return self:Ask({ type = "plan", wish = wish })
end

function ns.Session:CancelRequest()
  if type(UnboredCharDB) == "table" then
    UnboredCharDB.request = nil
  end
  self:NoteRequest()
  self:RefreshUI()
end

function ns.Session.LoadPlan()
  if type(ReloadUI) == "function" then
    ReloadUI()
  end
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
  return { message = message, waypoints = waypoints }
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
  local plan, err
  if type(external.tasks) == "table" then
    plan, err = ns.ValidatePlan(external, true)
    if not plan and not answer then
      if req then
        self.requestNote = "failed"
        self.requestReason = err
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

function ns.Session:Start()
  if self.started then
    self:AutoApplyExternal()
    self:CheckCurrent()
    self:RefreshUI()
    self:ScheduleDataRefresh()
    return
  end
  self.started = true
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
  if not self:AutoApplyExternal() then
    self:CheckCurrent()
    self:RefreshUI()
  end
  self:ScheduleDataRefresh()
end

function ns.Session:OnCombatEnd()
  if self.rebuildQueued then
    self.rebuildQueued = false
    self:Rebuild(self.queuedMode, self.queuedBudget)
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
    budget = state.budget or 60,
    exportedAt = ns.Now(),
    currentId = tasks[1] and tasks[1].id or nil,
    done = done,
    skipped = skipped,
    remaining = remaining,
    source = state.source,
  }
end

function ns.Session:OnEvent(event, ...)
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
