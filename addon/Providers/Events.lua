local _, ns = ...

-- Events from the calendar (D128-D131): what is on today, or starts within
-- three days, matched against Data/Holidays.lua, with only the tasks still
-- open for this player.

local DAYS_AHEAD = 3

local function firstOpenAchievement(ids)
  for i = 1, #ids do
    local state = ns.AchievementState(ids[i])
    if state and not state.done then
      return state
    end
  end
  return nil
end

local function contains(list, value)
  if type(list) ~= "table" or value == nil then
    return false
  end
  for i = 1, #list do
    if list[i] == value then
      return true
    end
  end
  return false
end

local function titleMatches(titles, title)
  if type(titles) ~= "table" or type(title) ~= "string" or title == "" then
    return false
  end
  for i = 1, #titles do
    if type(titles[i]) == "string" and titles[i] ~= "" and titles[i]:lower() == title:lower() then
      return true
    end
  end
  return false
end

-- eventID is NOT a reliable Holiday.db2 id (Hallow's End is 324 there, but
-- live clients identify it by iconTexture 235460-235462; see
-- HandyNotes_HallowsEnd). Match id, then texture, then the English title.
local function rowMatches(entry, holiday)
  local match = type(entry.match) == "table" and entry.match or {}
  return contains(match.holidayIDs, holiday.eventID)
    or contains(match.textures, holiday.texture)
    or titleMatches(match.titles, holiday.title)
end

local function epoch(t)
  local clock = type(time) == "function" and time or os.time
  if type(t) ~= "table" then
    return nil
  end
  local year, month, day = ns.AsNumber(t.year), ns.AsNumber(t.month), ns.AsNumber(t.monthDay)
  if not year or not month or not day then
    return nil
  end
  local ok, value = pcall(clock, {
    year = year,
    month = month,
    day = day,
    hour = ns.AsNumber(t.hour) or 0,
    min = ns.AsNumber(t.minute) or 0,
  })
  return ok and value or nil
end

-- Holidays on the calendar from today to DAYS_AHEAD, by key. Calendar data is
-- empty until OpenCalendar answers (Core/Init.lua asks 5 s after loading).
-- The month the player looks at is never changed: today is found by offset
-- from the shown month. Only HOLIDAY rows: nothing about other players.
local function calendarHolidays()
  local found = {}
  local api = C_Calendar
  if not C_DateAndTime or not C_DateAndTime.GetCurrentCalendarTime then
    return found, false
  end
  if not api or not api.GetNumDayEvents or not api.GetDayEvent then
    return found, false
  end
  local okNow, today = pcall(C_DateAndTime.GetCurrentCalendarTime)
  if not okNow or type(today) ~= "table" then
    return found, false
  end
  local day = ns.AsNumber(today.monthDay)
  if not day or day < 1 or day > 31 then
    return found, false
  end
  local offset = 0
  if api.GetMonthInfo then
    local okView, view = pcall(api.GetMonthInfo, 0)
    if okView and type(view) == "table" and ns.AsNumber(view.month) and ns.AsNumber(view.year) then
      offset = (today.year - view.year) * 12 + (today.month - view.month)
    end
  end
  local daysInMonth = 31
  if api.GetMonthInfo then
    local okInfo, info = pcall(api.GetMonthInfo, offset)
    daysInMonth = okInfo and type(info) == "table" and ns.AsNumber(info.numDays) or 31
  end
  for ahead = 0, DAYS_AHEAD do
    if day > daysInMonth then
      day, offset = 1, offset + 1
    end
    local okCount, count = pcall(api.GetNumDayEvents, offset, day)
    count = okCount and ns.AsNumber(count) or 0
    for index = 1, math.min(count, 40) do
      local okEvent, event = pcall(api.GetDayEvent, offset, day, index)
      if okEvent and type(event) == "table" and event.calendarType == "HOLIDAY" then
        local id = ns.AsNumber(event.eventID)
        local texture = ns.AsNumber(event.iconTexture)
        local title = type(event.title) == "string" and event.title ~= "" and event.title or nil
        local key = id or texture or title
        if key and not found[key] then
          local starts = type(event.startTime) == "table" and event.startTime or nil
          found[key] = {
            eventID = id,
            texture = texture,
            title = title,
            ahead = ahead,
            startsAt = epoch(starts),
            endsAt = epoch(event.endTime),
            weekday = starts and ns.AsNumber(starts.weekday) or nil,
          }
        end
      end
    end
    day = day + 1
  end
  return found, true
end

local function costCondition(row)
  local cost = type(row.cost) == "table" and row.cost or nil
  local currencyID, amount = cost and ns.AsNumber(cost.currencyID), cost and ns.AsNumber(cost.amount)
  if not currencyID or not amount then
    return nil
  end
  return {
    text = ns.T("IF_YOU_HAVE", ns.Steps.Count(amount) or tostring(amount), "{currency:" .. currencyID .. "}"),
    check = { kind = "currency", id = currencyID, atLeast = amount },
  }
end

local function base(row, holiday, title, complete)
  return {
    id = "event:" .. row.id,
    title = title,
    estMinutes = row.estMinutes or 20,
    priority = row.estMinutes or 20,
    note = row.note or holiday.title,
    holiday = holiday.title,
    holidayKey = holiday.key,
    startsIn = holiday.ahead > 0 and holiday.ahead or nil,
    weekday = holiday.ahead > 0 and holiday.weekday or nil,
    endsAt = holiday.endsAt,
    source = "events",
    complete = complete,
  }
end

-- One catalog task, or nil when this player has it already (D129).
local function taskFromRow(row, holiday)
  if row.faction and ns.PlayerFaction() and row.faction ~= ns.PlayerFaction() then
    return nil
  end
  if row.achievementIDs then
    local state = firstOpenAchievement(row.achievementIDs)
    if not state then
      return nil
    end
    return base(row, holiday, state.name or row.fallbackTitle, { kind = "achievement", achievementID = state.id })
  end
  if row.mountID then
    local state = ns.MountState(row.mountID)
    if state and state.collected then
      return nil
    end
    local task = base(row, holiday, (state and state.name) or row.fallbackTitle, {
      kind = "mount",
      mountID = row.mountID,
    })
    task.condition = costCondition(row)
    return task
  end
  if row.toyID then
    if ns.ToyOwned(row.toyID) then
      return nil
    end
    local task = base(row, holiday, row.fallbackTitle, { kind = "toy", itemID = row.toyID })
    task.condition = costCondition(row)
    return task
  end
  if row.questID then
    if ns.QuestDone(row.questID) then
      return nil
    end
    local title = C_QuestLog and C_QuestLog.GetTitleForQuestID and ns.Call(C_QuestLog.GetTitleForQuestID, row.questID)
    title = type(title) == "string" and title ~= "" and title or row.fallbackTitle
    return base(row, holiday, title, { kind = "quest", questID = row.questID })
  end
  return nil
end

-- Open tasks of every catalog event on now and, with ahead, of those that
-- start within DAYS_AHEAD days. Also returns the holidays nothing matched.
local function Collect(ahead)
  local tasks, unmatched = {}, {}
  local holidays, ready = calendarHolidays()
  if not ready then
    return tasks, unmatched
  end
  for i = 1, #ns.Data.Holidays do
    local entry = ns.Data.Holidays[i]
    local holiday
    for _, candidate in pairs(holidays) do
      if (ahead or candidate.ahead == 0) and rowMatches(entry, candidate) then
        if not holiday or candidate.ahead < holiday.ahead then
          holiday = candidate
        end
      end
    end
    if holiday then
      holiday.matched = true
      holiday.key = entry.id
      holiday.title = holiday.title or entry.fallbackTitle
      for t = 1, #(entry.tasks or {}) do
        local task = taskFromRow(entry.tasks[t], holiday)
        if task then
          tasks[#tasks + 1] = task
        end
      end
    end
  end
  for _, holiday in pairs(holidays) do
    if not holiday.matched and holiday.ahead == 0 then
      unmatched[#unmatched + 1] = holiday
    end
  end
  table.sort(tasks, function(a, b)
    if (a.startsIn or 0) ~= (b.startsIn or 0) then
      return (a.startsIn or 0) < (b.startsIn or 0)
    end
    if a.estMinutes ~= b.estMinutes then
      return a.estMinutes < b.estMinutes
    end
    return tostring(a.id) < tostring(b.id)
  end)
  return tasks, unmatched
end

-- The Events preset: today's open tasks, plus a plain step for a holiday the
-- catalog does not know.
local function Build()
  local tasks, unmatched = Collect(false)
  table.sort(unmatched, function(a, b)
    return tostring(a.title or a.eventID) < tostring(b.title or b.eventID)
  end)
  for i = 1, #unmatched do
    local holiday = unmatched[i]
    local title = holiday.title or ns.T("NOTE_HOLIDAY")
    tasks[#tasks + 1] = {
      id = "event:holiday:" .. tostring(holiday.eventID or title),
      title = title,
      estMinutes = 20,
      priority = 20,
      note = ns.T("NOTE_HOLIDAY"),
      source = "events",
      complete = { kind = "manual" },
    }
  end
  return tasks
end

ns.RegisterProvider({
  id = "events",
  Build = Build,
  Collect = Collect,
})
