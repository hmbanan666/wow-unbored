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

local function sameTitle(left, right)
  if type(left) ~= "string" or type(right) ~= "string" then
    return false
  end
  if left == "" or right == "" then
    return false
  end
  return left:lower() == right:lower()
end

local function titleMatches(entry, title)
  if sameTitle(entry.fallbackTitle, title) then
    return true
  end
  if type(entry.titles) ~= "table" then
    return false
  end
  for i = 1, #entry.titles do
    if sameTitle(entry.titles[i], title) then
      return true
    end
  end
  return false
end

local function textureMatches(entry, texture)
  texture = ns.AsNumber(texture)
  if not texture or type(entry.textures) ~= "table" then
    return false
  end
  for i = 1, #entry.textures do
    if entry.textures[i] == texture then
      return true
    end
  end
  return false
end

local function holidayMatches(entry, holiday)
  local ids = holidayIDs(entry)
  for i = 1, #ids do
    if holiday.eventID and ids[i] == holiday.eventID then
      return true
    end
  end
  if textureMatches(entry, holiday.texture) then
    return true
  end
  return titleMatches(entry, holiday.title)
end

-- Calendar data is empty until OpenCalendar and CALENDAR_UPDATE_EVENT_LIST.
-- eventID is NOT a reliable Holiday.db2 id (Hallow's End is 324 there, but
-- live clients identify it by iconTexture 235460-235462; see
-- HandyNotes_HallowsEnd). Match id, then texture, then the English title.
local function activeHolidays()
  local found = {}
  if not C_DateAndTime or not C_DateAndTime.GetCurrentCalendarTime then
    return found, false
  end
  if not C_Calendar or not C_Calendar.GetNumDayEvents or not C_Calendar.GetDayEvent then
    return found, false
  end
  local okNow, now = pcall(C_DateAndTime.GetCurrentCalendarTime)
  if not okNow or type(now) ~= "table" then
    return found, false
  end
  local day = ns.AsNumber(now.monthDay)
  if not day or day < 1 or day > 31 then
    return found, false
  end
  local okCount, count = pcall(C_Calendar.GetNumDayEvents, 0, day)
  count = okCount and ns.AsNumber(count) or nil
  if not count or count < 1 then
    return found, true
  end
  if count > 40 then
    count = 40
  end
  for index = 1, count do
    local okEvent, event = pcall(C_Calendar.GetDayEvent, 0, day, index)
    if okEvent and type(event) == "table" and event.calendarType == "HOLIDAY" then
      local id = ns.AsNumber(event.eventID)
      local texture = ns.AsNumber(event.iconTexture)
      local title = type(event.title) == "string" and event.title or nil
      if (not texture or not title) and C_Calendar.GetHolidayInfo then
        local okInfo, info = pcall(C_Calendar.GetHolidayInfo, 0, day, index)
        if okInfo and type(info) == "table" then
          texture = texture or ns.AsNumber(info.texture)
          if type(info.name) == "string" and info.name ~= "" then
            title = title or info.name
          end
        end
      end
      local key = id or texture or title
      if key and not found[key] then
        found[key] = {
          eventID = id,
          texture = texture,
          title = title,
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
    local holiday
    local matchedKey
    for key, candidate in pairs(active) do
      if type(candidate) == "table" and holidayMatches(entry, candidate) then
        holiday = candidate
        matchedKey = key
        break
      end
    end
    if matchedKey ~= nil then
      matched[matchedKey] = true
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
    return tostring(a.id) < tostring(b.id)
  end)
  return tasks
end

ns.RegisterProvider({
  id = "events",
  Build = Build,
})
