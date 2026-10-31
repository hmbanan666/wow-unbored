-- Calendar holidays, play sessions, helper addons, and ids Bory could not
-- resolve in a Plan.

local _, ns = ...

local S = ns.Snapshot
local num, str, call = ns.AsNumber, ns.SafeString, ns.Call

local CALENDAR_DAYS = 14
-- Game events only: player, guild and community events carry other people.
local CALENDAR_TYPES = { HOLIDAY = true, SYSTEM = true, RAID_RESET = true, RAID_LOCKOUT = true }

local function stamp(t)
  if type(t) ~= "table" then
    return nil
  end
  local year, month, day = num(t.year), num(t.month), num(t.monthDay)
  if not year or not month or not day then
    return nil
  end
  return string.format("%04d-%02d-%02d %02d:%02d", year, month, day, num(t.hour) or 0, num(t.minute) or 0)
end

-- The month the player is looking at is never changed: days are read by
-- offset from whatever month the calendar shows.
function S.ReadCalendar()
  local api = C_Calendar
  if not api or not api.GetMonthInfo or not api.GetNumDayEvents or not api.GetDayEvent then
    return nil
  end
  local today = C_DateAndTime and C_DateAndTime.GetCurrentCalendarTime and call(C_DateAndTime.GetCurrentCalendarTime)
  local view = call(api.GetMonthInfo, 0)
  if type(today) ~= "table" or type(view) ~= "table" or not num(view.month) or not num(today.month) then
    return nil
  end
  local offset = (today.year - view.year) * 12 + (today.month - view.month)
  local monthInfo = call(api.GetMonthInfo, offset)
  local daysInMonth = type(monthInfo) == "table" and num(monthInfo.numDays) or 31
  local events, seen = {}, {}
  local day, monthOffset = today.monthDay, offset
  for _ = 0, CALENDAR_DAYS do
    if day > daysInMonth then
      day, monthOffset = 1, monthOffset + 1
      local nextInfo = call(api.GetMonthInfo, monthOffset)
      daysInMonth = type(nextInfo) == "table" and num(nextInfo.numDays) or 31
    end
    for index = 1, math.min(num(call(api.GetNumDayEvents, monthOffset, day)) or 0, 20) do
      local e = call(api.GetDayEvent, monthOffset, day, index)
      if type(e) == "table" and CALENDAR_TYPES[e.calendarType] then
        local key = tostring(e.eventID or e.title) .. "@" .. tostring(stamp(e.startTime))
        if not seen[key] then
          seen[key] = true
          events[#events + 1] = {
            eventID = num(e.eventID),
            title = str(e.title, 80),
            kind = str(e.calendarType, 20),
            starts = stamp(e.startTime),
            ends = stamp(e.endTime),
          }
        end
      end
    end
    day = day + 1
  end
  return { events = events, from = stamp(today) }
end

-- OpenCalendar does not answer during loading: it is asked for at load
-- (Core/Init.lua), and read 15 s after entering the world, once per login.
S.Register({
  name = "calendar",
  scope = "account",
  v = 1,
  prio = 30,
  delay = 5,
  read = S.ReadCalendar,
})

local MAX_SESSIONS = 20

local function sessionsBody()
  local sessions = type(UnboredCharDB) == "table" and UnboredCharDB.sessions or nil
  if type(sessions) ~= "table" or #sessions == 0 then
    return nil
  end
  local out = {}
  for i = math.max(1, #sessions - MAX_SESSIONS + 1), #sessions do
    out[#out + 1] = ns.DeepCopy(sessions[i])
  end
  return { list = out }
end

S.Register({
  name = "sessions",
  v = 1,
  prio = 90,
  events = { "ZONE_CHANGED_NEW_AREA", "PLAYER_DEAD", "PLAYER_LEVEL_UP" },
  read = sessionsBody,
  logout = function()
    S.Write("sessions", sessionsBody(), "event")
  end,
})

local HELPERS = { "TomTom", "Auctionator", "TradeSkillMaster", "Bagnon" }

S.Register({
  name = "addons",
  scope = "account",
  v = 1,
  prio = 20,
  read = function()
    local body = {}
    for i = 1, #HELPERS do
      body[HELPERS[i]] = ns.AddonLoaded(HELPERS[i]) and true or false
    end
    return body
  end,
})

local MAX_UNRESOLVED = 200

-- A Plan id the game could not resolve (docs/adr/0034): kept so the Server
-- can see which ids the Planner got wrong.
S.Register({
  name = "unresolvedIds",
  v = 1,
  prio = 10,
  login = false,
  read = function()
    return nil
  end,
})

function S.NoteUnresolved(kind, id)
  kind, id = str(kind, 20), num(id)
  if not kind or not id then
    return
  end
  local body = ns.DeepCopy(S.Body("unresolvedIds") or {}) or {}
  body.list = type(body.list) == "table" and body.list or {}
  for i = 1, #body.list do
    local entry = body.list[i]
    if entry.kind == kind and entry.id == id then
      return
    end
  end
  body.list[#body.list + 1] = { kind = kind, id = id, at = ns.Now() }
  while #body.list > MAX_UNRESOLVED do
    table.remove(body.list, 1)
  end
  S.Write("unresolvedIds", body, "event")
end
