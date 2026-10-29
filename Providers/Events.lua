local _, ns = ...

local function holidayIDs(entry)
  if type(entry.holidayIDs) == "table" then
    return entry.holidayIDs
  end
  if entry.holidayID then
    return { entry.holidayID }
  end
  return {}
end

local function firstOpenAchievement(ids)
  for i = 1, #ids do
    local state = ns.AchievementState(ids[i])
    if state and not state.done then
      return state
    end
  end
  return nil
end

local function activeHolidays()
  local found = {}
  if not C_DateAndTime or not C_DateAndTime.GetCurrentCalendarTime then
    return found, false
  end
  if not C_Calendar or not C_Calendar.GetNumDayEvents or not C_Calendar.GetDayEvent then
    return found, false
  end
  local okNow, now = pcall(C_DateAndTime.GetCurrentCalendarTime)
  if not okNow or type(now) ~= "table" or not now.monthDay then
    return found, false
  end
  local okCount, count = pcall(C_Calendar.GetNumDayEvents, 0, now.monthDay)
  count = okCount and ns.AsNumber(count) or 0
  if not count then
    return found, true
  end
  for index = 1, count do
    local okEvent, event = pcall(C_Calendar.GetDayEvent, 0, now.monthDay, index)
    if okEvent and type(event) == "table" and event.calendarType == "HOLIDAY" then
      local id = ns.AsNumber(event.eventID)
      local key = id or ("title:" .. tostring(event.title))
      if not found[key] then
        found[key] = {
          eventID = id,
          title = type(event.title) == "string" and event.title or nil,
        }
      end
    end
  end
  return found, true
end

local function taskFromRow(row, holidayTitle)
  if row.faction and ns.PlayerFaction() and row.faction ~= ns.PlayerFaction() then
    return nil
  end
  if row.achievementIDs then
    local state = firstOpenAchievement(row.achievementIDs)
    if not state then
      return nil
    end
    return {
      id = "event:" .. row.id,
      title = state.name or row.fallbackTitle,
      estMinutes = row.estMinutes or 20,
      priority = row.estMinutes or 20,
      note = holidayTitle,
      source = "events",
      complete = { kind = "achievement", achievementID = state.id },
    }
  end
  if row.mountID then
    local state = ns.MountState(row.mountID)
    if state and state.collected then
      return nil
    end
    local title = (state and state.name) or row.fallbackTitle
    return {
      id = "event:" .. row.id,
      title = title,
      estMinutes = row.estMinutes or 20,
      priority = row.estMinutes or 20,
      note = row.note or holidayTitle,
      source = "events",
      complete = { kind = "mount", mountID = row.mountID },
    }
  end
  return nil
end

local function Build()
  local tasks = {}
  local active, ready = activeHolidays()
  if not ready then
    return tasks
  end
  local matched = {}
  for i = 1, #ns.Data.Holidays do
    local entry = ns.Data.Holidays[i]
    local ids = holidayIDs(entry)
    local holiday
    for d = 1, #ids do
      if active[ids[d]] then
        holiday = active[ids[d]]
        matched[ids[d]] = true
      end
    end
    if holiday then
      local holidayTitle = holiday.title or entry.fallbackTitle
      for t = 1, #(entry.tasks or {}) do
        local task = taskFromRow(entry.tasks[t], holidayTitle)
        if task then
          tasks[#tasks + 1] = task
        end
      end
    end
  end
  for key, holiday in pairs(active) do
    if not matched[key] then
      local title = holiday.title or ns.T("NOTE_HOLIDAY")
      local id = holiday.eventID and ("event:holiday:" .. holiday.eventID) or ("event:holiday:" .. title)
      tasks[#tasks + 1] = {
        id = id,
        title = title,
        estMinutes = 20,
        priority = 20,
        note = ns.T("NOTE_HOLIDAY"),
        source = "events",
        complete = { kind = "manual" },
      }
    end
  end
  table.sort(tasks, function(a, b)
    if a.estMinutes ~= b.estMinutes then
      return a.estMinutes < b.estMinutes
    end
    return a.id < b.id
  end)
  return tasks
end

ns.RegisterProvider({
  id = "events",
  Build = Build,
})
