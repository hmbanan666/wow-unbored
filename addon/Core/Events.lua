local _, ns = ...

ns.Events = {}

local WATCH = {
  "PLAYER_REGEN_DISABLED",
  "PLAYER_REGEN_ENABLED",
  "ACHIEVEMENT_EARNED",
  "CRITERIA_UPDATE",
  "CRITERIA_COMPLETE",
  "NEW_MOUNT_ADDED",
  "NEW_PET_ADDED",
  "NEW_TOY_ADDED",
  "QUEST_TURNED_IN",
  "QUEST_LOG_UPDATE",
  "CURRENCY_DISPLAY_UPDATE",
  "ZONE_CHANGED_NEW_AREA",
  "ZONE_CHANGED",
  "UPDATE_INSTANCE_INFO",
  "CALENDAR_UPDATE_EVENT_LIST",
  "VIGNETTE_MINIMAP_UPDATED",
  "PLAYER_LOGOUT",
  "BANKFRAME_OPENED",
  "PLAYERBANKSLOTS_CHANGED",
  "CURSOR_CHANGED",
}

function ns.Events.Pulse()
  if ns.Profile and ns.Profile.Flush then
    pcall(ns.Profile.Flush)
  end
  if ns.Snapshot and ns.Snapshot.Pulse then
    pcall(ns.Snapshot.Pulse)
  end
  if ns.Mascot and ns.Mascot.ExpireEchoes then
    ns.Mascot:ExpireEchoes()
    ns.Mascot:CheckSlow()
  end
  if ns.IsPaused() or not ns.Session or not ns.Session.Current then
    return
  end
  local task = ns.Session:Current()
  if not task then
    return
  end
  if ns.IsTaskComplete(task) then
    ns.Session:CheckCurrent()
    return
  end
  if ns.Session:AdvanceRoute() then
    return
  end
  if ns.Waypoint and ns.Waypoint.Sync then
    ns.Waypoint:Sync(task)
  end
  if ns.Mascot and ns.Mascot.UpdateDistance then
    ns.Mascot:UpdateDistance()
  end
end

function ns.Events.Register(frame)
  for i = 1, #WATCH do
    -- A removed event name must not abort addon load.
    pcall(frame.RegisterEvent, frame, WATCH[i])
  end
  pcall(frame.RegisterEvent, frame, "MOUNT_JOURNAL_SEARCH_UPDATED")
  for _, source in ipairs({ ns.Profile, ns.Snapshot }) do
    if source and source.Events then
      local extra = source.Events()
      for i = 1, #extra do
        pcall(frame.RegisterEvent, frame, extra[i])
      end
    end
  end
end

function ns.Events.OnEvent(event, ...)
  if event == "CURSOR_CHANGED" then
    if ns.Mascot and ns.Mascot.OnCursorChanged then
      pcall(ns.Mascot.OnCursorChanged, ns.Mascot)
    end
    return
  end
  if ns.Profile then
    pcall(ns.Profile.OnEvent, event, ...)
  end
  if ns.Snapshot then
    pcall(ns.Snapshot.OnEvent, event, ...)
  end
  if ns.Session and ns.Session.OnEvent then
    ns.Session:OnEvent(event, ...)
  end
end

function ns.Events.StartTicker()
  if ns.Events.ticker or not C_Timer or not C_Timer.NewTicker then
    return
  end
  ns.Events.ticker = C_Timer.NewTicker(0.75, function()
    local ok, err = pcall(ns.Events.Pulse)
    if not ok and not ns.Events.reported then
      ns.Events.reported = true
      ns.ReportError(err)
    end
  end)
end
