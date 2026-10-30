local _, ns = ...

-- Ideas (docs/adr/0040, D106-D111): the Server's Suggestions for this
-- character, written by the Companion to Unbored_Plan/Suggestions.lua and read
-- at login or reload, plus up to two live ones the addon sees itself (an
-- active holiday, a curated rare in this zone). Server ones come first; an
-- idea that shares an id or a reward with an earlier one is dropped.

ns.Suggestions = {}

local S = ns.Suggestions
S.MAX = 4
S.LOCAL_MAX = 2
S.LOCAL_SECONDS = 30
S.KINDS = { event = true, achievement = true, rare = true, collection = true }
-- What kind of plan an idea asks for, with no time (D110).
S.MODE = { event = "events", achievement = "fun", rare = "roam", collection = "farm" }

local TOKEN = "^{[a-z]+:%d+[^{}]*}$"
local REASONS = { ends = true, alts = true, near = true, here = true, now = true }

local function text(value, limit)
  value = ns.SafeString(value, 2000)
  value = value and ns.Utf8Truncate(ns.Trim(value), limit) or nil
  return value ~= "" and value or nil
end

local function int(value)
  value = ns.AsNumber(value)
  return value and value == math.floor(value) and value > 0 and value or nil
end

local function rewards(list)
  local out = {}
  if type(list) ~= "table" then
    return out
  end
  for i = 1, #list do
    local token = list[i]
    if type(token) == "string" and #token <= 120 and token:match(TOKEN) and #out < 3 then
      out[#out + 1] = token
    end
  end
  return out
end

local function reason(raw)
  if type(raw) ~= "table" or not REASONS[raw.kind] then
    return nil
  end
  return { kind = raw.kind, at = int(raw.at), count = int(raw.count), mapID = int(raw.mapID) }
end

-- One idea as the Bubble may show it, or nil when a field is broken.
function S.Clean(raw)
  if type(raw) ~= "table" or not S.KINDS[raw.kind] then
    return nil
  end
  local id = text(raw.id, 80)
  local title = text(raw.title, 60)
  local goal = text(raw.goal, 140)
  if not id or not title or not goal then
    return nil
  end
  local request = type(raw.request) == "table" and raw.request or {}
  return {
    id = id,
    kind = raw.kind,
    title = title,
    titleToken = type(raw.titleToken) == "string" and #raw.titleToken <= 60
      and raw.titleToken:match(TOKEN) and raw.titleToken or nil,
    goal = goal,
    why = text(raw.why, 100),
    rewards = rewards(raw.rewards),
    mapID = int(raw.mapID),
    expiresAt = int(raw.expiresAt),
    reason = reason(raw.reason),
    wish = text(request.wish, 300),
    quick = raw.quick == true or nil,
  }
end

local function mine()
  local data = type(UnboredSuggestions) == "table" and UnboredSuggestions or nil
  if not data or data.v ~= 1 or type(data.characters) ~= "table" then
    return nil
  end
  local key = ns.Profile.AltKey(ns.Call(UnitName, "player"), ns.Call(GetRealmName))
  local list = data.characters[key]
  return type(list) == "table" and list or nil
end

-- The Companion's ideas for this character that have not run out.
function S.Read(now)
  now = now or ns.Now()
  local out = {}
  local list = mine()
  if not list then
    return out
  end
  for i = 1, math.min(#list, 6) do
    local idea = S.Clean(list[i])
    if idea and not (idea.expiresAt and idea.expiresAt <= now) then
      idea.quick = nil
      out[#out + 1] = idea
    end
  end
  return out
end

local function rewardFor(task)
  local complete = type(task.complete) == "table" and task.complete or {}
  if int(complete.mountID) then
    return "{mount:" .. int(complete.mountID) .. "}"
  end
  if int(complete.achievementID) then
    return "{ach:" .. int(complete.achievementID) .. "}"
  end
  return nil
end

-- The holiday the Events provider found on today's calendar.
local function holidayIdea()
  local provider = ns.Providers.events
  if not provider then
    return nil
  end
  local ok, tasks = pcall(provider.Build, {})
  if not ok or type(tasks) ~= "table" then
    return nil
  end
  local holiday, list = nil, {}
  for i = 1, #tasks do
    local task = tasks[i]
    if type(task.holiday) == "string" and task.holiday ~= "" then
      holiday = holiday or task.holiday
      local token = task.holiday == holiday and rewardFor(task)
      if token and #list < 3 then
        list[#list + 1] = token
      end
    end
  end
  if not holiday then
    return nil
  end
  return S.Clean({
    id = "event:local:" .. holiday:lower(),
    kind = "event",
    title = holiday,
    goal = ns.T("QUICK_GOAL_HOLIDAY", holiday),
    rewards = list,
    reason = { kind = "now" },
    quick = true,
  })
end

-- A curated rare in this very zone that was not looted today.
local function rareIdea()
  local mapID = ns.RawPlayerPosition()
  if not mapID then
    return nil
  end
  for i = 1, #(ns.Data.Rares or {}) do
    local entry = ns.Data.Rares[i]
    if entry.mapID == mapID and entry.questID and not ns.QuestDone(entry.questID) then
      local title = entry.fallbackTitle or entry.id
      return S.Clean({
        id = "rare:" .. entry.id,
        kind = "rare",
        title = title,
        goal = ns.T("IDEA_RARE_GOAL", title),
        mapID = mapID,
        reason = { kind = "here", mapID = mapID },
        quick = true,
      })
    end
  end
  return nil
end

-- Live ideas from what the addon already reads (D111), kept a short while so
-- a redraw does not read the calendar again. Nothing is read in combat.
function S.Local(now)
  now = now or ns.Now()
  if S.cache and now - S.cache.at < S.LOCAL_SECONDS then
    return S.cache.list
  end
  if ns.IsCombat() then
    return S.cache and S.cache.list or {}
  end
  local out = {}
  for _, build in ipairs({ holidayIdea, rareIdea }) do
    local ok, idea = pcall(build)
    if ok and idea and #out < S.LOCAL_MAX then
      out[#out + 1] = idea
    end
  end
  S.cache = { at = now, list = out }
  return out
end

local function keys(idea)
  local out = { "id:" .. idea.id }
  for i = 1, #idea.rewards do
    out[#out + 1] = "reward:" .. (idea.rewards[i]:match("^{([a-z]+:%d+)") or idea.rewards[i])
  end
  if idea.kind == "event" then
    out[#out + 1] = "event:" .. idea.title:lower()
  end
  return out
end

-- Server ideas first, then local ones; one per id, reward or holiday.
function S.Merge(first, second, max)
  local out, seen = {}, {}
  for _, list in ipairs({ first or {}, second or {} }) do
    for i = 1, #list do
      local idea = list[i]
      local found = false
      local own = keys(idea)
      for k = 1, #own do
        found = found or seen[own[k]] == true
      end
      if not found and #out < (max or S.MAX) then
        out[#out + 1] = idea
        for k = 1, #own do
          seen[own[k]] = true
        end
      end
    end
  end
  return out
end

function S.List(now)
  now = now or ns.Now()
  return S.Merge(S.Read(now), S.Local(now), S.MAX)
end

-- The muted line under an idea's title, in the player's language.
function S.Line(idea, now)
  now = now or ns.Now()
  local r = idea.reason
  if r and r.kind == "ends" and r.at then
    local left = r.at - now
    if left > 0 and left < 2 * 86400 then
      return ns.T("IDEA_ENDS_SOON")
    elseif left > 0 then
      return ns.T("IDEA_ENDS_DAYS", math.floor(left / 86400))
    end
  elseif r and r.kind == "alts" then
    return (r.count or 1) > 1 and ns.T("IDEA_ALTS", r.count) or ns.T("IDEA_ALTS_ONE")
  elseif r and r.kind == "near" then
    return ns.T("IDEA_NEAR")
  elseif r and r.kind == "here" then
    return ns.T("IDEA_HERE")
  elseif r and r.kind == "now" then
    return ns.T("IDEA_NOW")
  end
  return idea.why
end

-- The title in the player's language: the game's own name for an achievement or
-- a dungeon when it has one, else the title the idea came with.
function S.Title(idea)
  local named = idea.titleToken and ns.Markup.Plain(idea.titleToken)
  if type(named) == "string" and named ~= "" then
    return named
  end
  return idea.title
end

-- What travels with the Request (D109): the ids the Planner may trust.
function S.Copy(idea)
  return {
    id = idea.id,
    kind = idea.kind,
    title = idea.title,
    titleToken = idea.titleToken,
    goal = idea.goal,
    why = idea.why,
    rewards = ns.DeepCopy(idea.rewards, 1),
    mapID = idea.mapID,
    expiresAt = idea.expiresAt,
  }
end
