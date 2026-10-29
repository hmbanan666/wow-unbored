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
  if ns.UI and ns.UI.Refresh then
    ns.UI:Refresh()
  end
end

function ns.Session:Finish(bucket, how)
  local task = self:Current()
  if not task or not self.state then
    return
  end
  local list = bucket == "skipped" and self.state.skipped or self.state.done
  list[#list + 1] = { id = task.id, at = ns.Now() }
  table.remove(self.state.tasks, 1)
  if ns.Waypoint and ns.Waypoint.ClearIfTask then
    ns.Waypoint:ClearIfTask(task.id)
  end
  self:Save()
  if how == "auto" then
    local nxt = self:Current()
    if nxt then
      ns.Print(ns.T("ADVANCE", nxt.title))
    else
      ns.Print(ns.T("SESSION_DONE"))
    end
  elseif how == "skip" then
    ns.Print(ns.T("SKIPPED", task.title))
  else
    ns.Print(ns.T("FINISHED", task.title))
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
    self:Finish("done", "auto")
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
  self:Finish("done", "manual")
  self:CheckCurrent()
end

function ns.Session:Skip()
  local task = self:Current()
  if not task or not self.state or type(self.state.tasks) ~= "table" then
    return
  end
  local skips = (tonumber(task.skipCount) or 0) + 1
  if skips >= 2 then
    self:Finish("skipped", "skip")
    self:CheckCurrent()
    return
  end
  task.skipCount = skips
  if #self.state.tasks > 1 then
    table.remove(self.state.tasks, 1)
    self.state.tasks[#self.state.tasks + 1] = task
    if ns.Waypoint and ns.Waypoint.ClearIfTask then
      ns.Waypoint:ClearIfTask(task.id)
    end
  end
  ns.Print(ns.T("SKIP_LATER", task.title or ""))
  self:Save()
  self:CheckCurrent()
  self:RefreshUI()
end

function ns.Session:Waypoint()
  local task = self:Current()
  if not task then
    return
  end
  if not ns.Waypoint then
    return
  end
  ns.Waypoint:Set(task)
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
  if ns.Waypoint and ns.Waypoint.ClearIfOwned then
    ns.Waypoint:ClearIfOwned()
  end
  self:CheckCurrent()
  self:RefreshUI()
  if reveal and ns.UI and ns.UI.Show then
    ns.UI:Show()
  end
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
  ns.Print(ns.T("COMPANION_OK", #self.state.tasks))
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
  self:CheckCurrent()
  self:RefreshUI()
end

function ns.Session:SetMode(mode)
  if self.state and self.state.source ~= "provider" then
    ns.Print(ns.T("CLEARED_IMPORT"))
  end
  self:Rebuild(mode, self:Budget())
end

function ns.Session:SetBudget(minutes)
  if self.state and self.state.source ~= "provider" then
    ns.Print(ns.T("CLEARED_IMPORT"))
  end
  self:Rebuild(self:Mode(), minutes)
end

function ns.Session:CycleMode()
  local current = self:Mode()
  local nextIndex = 1
  for i = 1, #ns.MODES do
    if ns.MODES[i].id == current then
      nextIndex = i + 1
    end
  end
  if nextIndex > #ns.MODES then
    nextIndex = 1
  end
  self:SetMode(ns.MODES[nextIndex].id)
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
  self:Rebuild(mode, budget)
  if self.state then
    self.state[flag] = false
  end
end

function ns.Session.ExternalKey(plan)
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

function ns.Session:ConsiderExternal()
  self.offered = nil
  if type(UnboredExternalPlan) ~= "table" or type(UnboredExternalPlan.tasks) ~= "table" then
    return
  end
  local plan = ns.ValidatePlan(UnboredExternalPlan, true)
  if not plan then
    return
  end
  local key = ns.Session.ExternalKey(plan)
  local saved = UnboredCharDB or {}
  if saved.acceptedExternalKey == key or saved.dismissedExternalKey == key then
    return
  end
  self.offered = plan
  self.offerKey = key
  if self.announcedOffer ~= key then
    self.announcedOffer = key
    ns.Print(ns.T("OFFER_CHAT"))
  end
end

function ns.Session:ActivateOffered()
  local plan = self.offered
  if not plan then
    return false
  end
  local key = self.offerKey or ns.Session.ExternalKey(plan)
  if type(UnboredCharDB) ~= "table" then
    UnboredCharDB = {}
  end
  UnboredCharDB.acceptedExternalKey = key
  self.offered = nil
  self:ApplyPlan(plan, "companion", false)
  if self.state then
    self.state.externalKey = key
  end
  self:Save()
  return true
end

function ns.Session:UseExternal()
  self:ConsiderExternal()
  if self:ActivateOffered() then
    return true
  end
  if type(UnboredExternalPlan) ~= "table" then
    return self:ApplyCompanion(true)
  end
  local plan = ns.ValidatePlan(UnboredExternalPlan, true)
  if not plan then
    return self:ApplyCompanion(true)
  end
  local key = self.offerKey or ns.Session.ExternalKey(plan)
  if UnboredCharDB and UnboredCharDB.acceptedExternalKey == key then
    return true
  end
  if type(UnboredCharDB) ~= "table" then
    UnboredCharDB = {}
  end
  UnboredCharDB.acceptedExternalKey = key
  UnboredCharDB.dismissedExternalKey = nil
  self.offered = nil
  self.offerKey = key
  self:ApplyPlan(plan, "companion", false)
  if self.state then
    self.state.externalKey = key
  end
  self:Save()
  return true
end

function ns.Session:DismissOffered()
  if not self.offered then
    return
  end
  if type(UnboredCharDB) ~= "table" then
    UnboredCharDB = {}
  end
  UnboredCharDB.dismissedExternalKey = self.offerKey or ns.Session.ExternalKey(self.offered)
  self.offered = nil
  self:RefreshUI()
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
    self:ConsiderExternal()
    self:CheckCurrent()
    self:RefreshUI()
    self:ScheduleDataRefresh()
    return
  end
  self.started = true
  local saved = UnboredCharDB and UnboredCharDB.session
  local companion = self:ReadCompanion()
  if companion and ns.Session.CompanionIsNewer(companion, saved) then
    if self:ApplyCompanion(false) then
      self:ConsiderExternal()
      self:RefreshUI()
      self:ScheduleDataRefresh()
      return
    end
  end
  if type(saved) == "table" and saved.version == 1 and type(saved.tasks) == "table" then
    self.state = saved
    self.state.done = self.state.done or {}
    self.state.skipped = self.state.skipped or {}
    self:ConsiderExternal()
    self:CheckCurrent()
    self:RefreshUI()
    self:ScheduleDataRefresh()
    return
  end
  self:Rebuild(ns.DB and ns.DB.mode or "roam", ns.DB and ns.DB.budget or 60)
  self:ConsiderExternal()
  self:RefreshUI()
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
