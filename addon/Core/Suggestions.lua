local _, ns = ...

-- Ideas (docs/adr/0040, 0047): the Server's Suggestions for this character,
-- written by the Companion to Unbored_Plan/Suggestions.lua and read at login
-- or reload, plus up to three live ones the addon sees itself (an event on
-- the calendar, a chain of a quest in the log, a curated rare in this zone).
-- Server ones come first; an idea that shares an id, a reward or an event
-- with an earlier one is dropped, and one the player just finished goes.

ns.Suggestions = {}

local S = ns.Suggestions
-- Four chips first, up to six more under More ideas (D139); the Server sends
-- up to ten per Character and the addon adds up to three of its own (D140).
S.MAX = 4
S.MORE = 6
S.SERVER_MAX = 10
S.LOCAL_MAX = 3
S.LOCAL_SECONDS = 30
S.KINDS = { event = true, achievement = true, rare = true, collection = true, chain = true }
-- What kind of plan an idea asks for, with no time (D110).
S.MODE = { event = "events", achievement = "fun", rare = "roam", collection = "farm", chain = "quests" }

local TOKEN = "^{[a-z]+:%d+[^{}]*}$"
local REASONS = {
  ends = true,
  alts = true,
  near = true,
  here = true,
  now = true,
  starts = true,
  stopped = true,
  altDone = true,
}

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
  return {
    kind = raw.kind,
    at = int(raw.at),
    count = int(raw.count),
    mapID = int(raw.mapID),
    name = text(raw.name, 60),
  }
end

local function chain(raw)
  if type(raw) ~= "table" or not int(raw.questLineID) then
    return nil
  end
  return {
    questLineID = int(raw.questLineID),
    nextQuestID = int(raw.nextQuestID),
    done = ns.AsNumber(raw.done),
    total = int(raw.total),
  }
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
    chain = chain(raw.chain),
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
  for i = 1, math.min(#list, S.SERVER_MAX) do
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
  if complete.kind == "toy" and int(complete.itemID) then
    return "{toy:" .. int(complete.itemID) .. "}"
  end
  return nil
end

-- The first catalog event on the calendar with something still open for this
-- player (D129): on now first, else one that starts within three days. Its
-- steps are the open tasks; one that has not started says when it does.
local function eventIdea()
  local provider = ns.Providers.events
  if not provider or not provider.Collect then
    return nil
  end
  local ok, tasks = pcall(provider.Collect, true)
  if not ok or type(tasks) ~= "table" or not tasks[1] then
    return nil
  end
  local first = tasks[1]
  local steps, list = {}, {}
  for i = 1, #tasks do
    local task = tasks[i]
    if task.holidayKey == first.holidayKey then
      if first.weekday then
        task.why = ns.T("STARTS_ON", ns.T("WEEKDAY_" .. first.weekday))
      end
      steps[#steps + 1] = task
      local token = rewardFor(task)
      if token and #list < 3 then
        list[#list + 1] = token
      end
    end
  end
  local title = first.holiday or first.holidayKey
  local idea = S.Clean({
    id = "event:local:" .. tostring(first.holidayKey),
    kind = "event",
    title = title,
    goal = ns.T("QUICK_GOAL_HOLIDAY", title),
    rewards = list,
    reason = first.startsIn and { kind = "starts", count = first.startsIn } or { kind = "now" },
    expiresAt = first.endsAt,
    quick = true,
  })
  if idea then
    idea.steps = steps
  end
  return idea
end

local function chars(value)
  return #(value:gsub("[\128-\191]", ""))
end

-- At most limit characters, cut at a word when there is one.
local function cut(name, limit)
  if chars(name) <= limit then
    return name
  end
  local out = ""
  for word in name:gmatch("%S+") do
    local nextText = out == "" and word or (out .. " " .. word)
    if chars(nextText) > limit then
      break
    end
    out = nextText
  end
  if out ~= "" then
    return out
  end
  local count, last = 0, 0
  for pos in name:gmatch("()[^\128-\191]") do
    count = count + 1
    if count > limit then
      break
    end
    last = pos
  end
  local stop = name:find("[^\128-\191]", last + 1)
  return name:sub(1, (stop or (#name + 1)) - 1)
end

local function zoneStory(mapID)
  if not mapID or not C_QuestLog or not C_QuestLog.GetZoneStoryInfo then
    return nil
  end
  local achievementID = int(ns.Call(C_QuestLog.GetZoneStoryInfo, mapID))
  local state = achievementID and ns.AchievementState(achievementID)
  if state and not state.done then
    return "{ach:" .. achievementID .. "}"
  end
  return nil
end

-- A chain idea from a questLines row (D135): the chain's own name, "3 of 8",
-- the next quest and the zone story when it is still open.
function S.ChainIdea(row)
  if type(row) ~= "table" or not int(row.questLineID) or type(row.name) ~= "string" then
    return nil
  end
  local story = zoneStory(int(row.mapID))
  local idea = S.Clean({
    id = "chain:" .. row.questLineID,
    kind = "chain",
    title = cut(row.name, 40),
    goal = ns.T("CHAIN_GOAL", row.done or 0, row.total or 0),
    rewards = story and { story } or {},
    mapID = int(row.mapID),
    chain = {
      questLineID = row.questLineID,
      nextQuestID = row.nextQuestID,
      done = row.done,
      total = row.total,
    },
    quick = true,
  })
  if idea then
    idea.pin = row.x and row.y and int(row.mapID) and { mapID = int(row.mapID), x = row.x, y = row.y } or nil
  end
  return idea
end

-- The chain of a quest in the log, fewest quests left first.
local function chainIdea()
  if not ns.QuestLines then
    return nil
  end
  local rows = ns.QuestLines.FromLog(5)
  table.sort(rows, function(a, b)
    local left, right = a.total - a.done, b.total - b.done
    return left < right or (left == right and a.questLineID < b.questLineID)
  end)
  return rows[1] and S.ChainIdea(rows[1]) or nil
end

-- The Quick plan of a chain (D136): the next quest, then the rest by title.
function S.ChainSteps(idea)
  local info = idea and idea.chain
  local progress = info and ns.QuestLines and ns.QuestLines.Progress(info.questLineID)
  if not progress then
    return nil
  end
  local steps = {}
  for i = 1, #progress.open do
    local questID = progress.open[i]
    local title
    if i == 1 then
      local inLog = C_QuestLog and C_QuestLog.GetLogIndexForQuestID
        and ns.Call(C_QuestLog.GetLogIndexForQuestID, questID) ~= nil
      title = ns.T(inLog and "CHAIN_IN_LOG" or "CHAIN_TAKE", "{quest:" .. questID .. "}")
    else
      local name = C_QuestLog and C_QuestLog.GetTitleForQuestID and ns.Call(C_QuestLog.GetTitleForQuestID, questID)
      title = type(name) == "string" and name ~= "" and name or ("{quest:" .. questID .. "}")
    end
    local pin = i == 1 and idea.pin or nil
    steps[#steps + 1] = {
      id = "quest:" .. questID,
      title = title,
      mapID = pin and pin.mapID,
      x = pin and pin.x,
      y = pin and pin.y,
      estMinutes = 10,
      source = "chain",
      complete = { kind = "quest", questID = questID },
    }
  end
  return steps
end

-- A curated rare in this very zone that was not looted today, by its live
-- minimap name when it is up (client language), else the catalog name.
local function rareIdea()
  local mapID = ns.RawPlayerPosition()
  if not mapID then
    return nil
  end
  for i = 1, #(ns.Data.Rares or {}) do
    local entry = ns.Data.Rares[i]
    if entry.mapID == mapID and entry.questID and not ns.QuestDone(entry.questID) then
      local live = entry.npcID and ns.VignetteName and ns.VignetteName(entry.npcID)
      local title = live or entry.fallbackTitle or entry.id
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

-- Something done in the game since the idea was made: a reward got, the
-- chain's next quest turned in (D141).
function S.StillOpen(idea, now)
  if idea.expiresAt and idea.expiresAt <= (now or ns.Now()) then
    return false
  end
  if idea.chain and idea.chain.nextQuestID and ns.QuestDone(idea.chain.nextQuestID) then
    return false
  end
  local open = #idea.rewards == 0
  for i = 1, #idea.rewards do
    local kind, id = idea.rewards[i]:match("^{([a-z]+):(%d+)")
    id = tonumber(id)
    if kind == "ach" then
      local state = ns.AchievementState(id)
      open = open or not (state and state.done)
    elseif kind == "mount" then
      local state = ns.MountState(id)
      open = open or not (state and state.collected)
    elseif kind == "toy" then
      open = open or not ns.ToyOwned(id)
    else
      open = true
    end
  end
  return open
end

-- Achievement, mount, toy, quest or calendar news: build the live ones again.
function S.Invalidate()
  S.cache = nil
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
  for _, build in ipairs({ eventIdea, chainIdea, rareIdea }) do
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
  if idea.chain then
    out[#out + 1] = "chain:" .. idea.chain.questLineID
  end
  return out
end

-- Server ideas first, then local ones; one per id, reward, event or chain.
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
  local open = {}
  local ok, list = pcall(function()
    return S.Merge(S.Read(now), S.Local(now), S.MAX + S.MORE)
  end)
  for _, idea in ipairs(ok and list or {}) do
    if ns.IsCombat() or S.StillOpen(idea, now) then
      open[#open + 1] = idea
    end
  end
  return open
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
  elseif r and r.kind == "starts" then
    local days = r.count or (r.at and math.ceil((r.at - now) / 86400)) or 1
    return days <= 1 and ns.T("IDEA_STARTS_TOMORROW") or ns.T("IDEA_STARTS_DAYS", days)
  elseif r and r.kind == "altDone" and r.name then
    return ns.T("IDEA_ALT_DONE", r.name)
  elseif r and r.kind == "stopped" and r.at then
    local days = math.max(1, math.floor((now - r.at) / 86400))
    return days >= 14 and ns.T("IDEA_STOPPED_WEEKS", math.floor(days / 7)) or ns.T("IDEA_STOPPED_DAYS", days)
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
    chain = ns.DeepCopy(idea.chain, 1),
  }
end
