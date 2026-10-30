-- What the plan card says about a Step, without any frames: the footer line,
-- the time in words, the live Condition check, and the card fields of a
-- Quick plan (docs/adr/0038).

local _, ns = ...

ns.Steps = {}
local Steps = ns.Steps

-- "25 min", "1 h 40 min", "2 h"; nil for nothing.
function Steps.Duration(minutes)
  minutes = math.floor((tonumber(minutes) or 0) + 0.5)
  if minutes <= 0 then
    return nil
  end
  if minutes < 60 then
    return ns.T("MINUTES", minutes)
  end
  local hours, rest = math.floor(minutes / 60), minutes % 60
  if rest == 0 then
    return ns.T("HOURS", hours)
  end
  return ns.T("HOURS_MINUTES", hours, rest)
end

function Steps.About(minutes)
  local text = Steps.Duration(minutes)
  return text and ns.T("ABOUT", text) or nil
end

-- The muted footer: route point, distance, and the Step's own time if it has one.
function Steps.Footer(task)
  local point, index, count = ns.Waypoint.Target(task)
  local parts = {}
  if point and count > 1 then
    local label = ns.T("POINT", index, count)
    if type(point.label) == "string" and point.label ~= "" then
      label = label .. ": " .. point.label
    end
    parts[#parts + 1] = label
  end
  local yards = point and ns.Waypoint.DistanceTo(point)
  if yards then
    parts[#parts + 1] = ns.T("YARDS", math.floor(yards + 0.5))
  end
  local about = Steps.About(task.estMinutes)
  if about then
    parts[#parts + 1] = about
  end
  if #parts == 0 then
    return nil
  end
  return table.concat(parts, "  ·  ")
end

local function count(value)
  value = ns.AsNumber(value)
  if not value then
    return nil
  end
  if type(BreakUpLargeNumbers) == "function" then
    local ok, text = pcall(BreakUpLargeNumbers, value)
    if ok and type(text) == "string" then
      return text
    end
  end
  local text = tostring(math.floor(value))
  local out = text:reverse():gsub("(%d%d%d)", "%1,"):reverse()
  return (out:gsub("^,", ""))
end
Steps.Count = count

local CHECKS = {
  currency = function(id)
    local api = C_CurrencyInfo
    local info = api and api.GetCurrencyInfo and ns.Call(api.GetCurrencyInfo, id)
    return type(info) == "table" and ns.AsNumber(info.quantity) or nil
  end,
  item = function(id)
    local api = C_Item
    return api and api.GetItemCount and ns.AsNumber(ns.Call(api.GetItemCount, id, true)) or nil
  end,
  level = function()
    return ns.AsNumber(ns.Call(UnitLevel, "player"))
  end,
  quest = function(id)
    local api = C_QuestLog
    if not api or not api.IsQuestFlaggedCompleted then
      return nil
    end
    return ns.Flag(ns.Call(api.IsQuestFlaggedCompleted, id)) and 1 or 0
  end,
  ach = function(id)
    if type(GetAchievementInfo) ~= "function" then
      return nil
    end
    local ok, _, _, _, completed = pcall(GetAchievementInfo, id)
    if not ok then
      return nil
    end
    return ns.Flag(completed) and 1 or 0
  end,
}

-- nil when the Step has no check; else { met, have, need, counted }.
-- counted: the check has numbers worth showing ("3,200 / 5,000").
function Steps.Condition(task)
  local condition = type(task) == "table" and task.condition or nil
  local check = type(condition) == "table" and condition.check or nil
  if type(check) ~= "table" or not CHECKS[check.kind] or ns.IsCombat() then
    return nil
  end
  local have = CHECKS[check.kind](check.id)
  if have == nil then
    return nil
  end
  local need
  if check.kind == "level" then
    need = tonumber(check.atLeast) or tonumber(check.id) or 1
  elseif check.kind == "quest" or check.kind == "ach" then
    need = 1
  else
    need = tonumber(check.atLeast) or 1
  end
  local counted = check.kind == "currency" or check.kind == "item" or check.kind == "level"
  return { met = have >= need, have = have, need = need, counted = counted }
end

function Steps.Progress(state)
  if not state or not state.counted then
    return nil
  end
  return count(state.have) .. " / " .. count(state.need)
end

-- A Step whose Condition is checked and not met yet (D95).
function Steps.NotYet(task)
  local state = Steps.Condition(task)
  return state ~= nil and not state.met
end

local REWARD_KINDS = {
  achievement = function(c)
    return c.achievementID and ("{ach:" .. c.achievementID .. "}")
  end,
  mount = function(c)
    return c.mountID and ("{mount:" .. c.mountID .. "}")
  end,
  toy = function(c)
    return c.itemID and ("{toy:" .. c.itemID .. "}")
  end,
  pet = function(c)
    return c.speciesID and ("{pet:" .. c.speciesID .. "}")
  end,
}

-- A Quick plan gets the same card (D97): the holiday as title, and the
-- achievements, mounts, toys and pets its Steps complete as Rewards.
function Steps.QuickCard(tasks, preset)
  local rewards, seen = {}, {}
  local holiday, same = nil, true
  for i = 1, #(tasks or {}) do
    local task = tasks[i]
    local complete = type(task.complete) == "table" and task.complete or {}
    local make = REWARD_KINDS[complete.kind]
    local token = make and make(complete)
    if token and not seen[token] and #rewards < ns.PLAN_LIMITS.rewards then
      seen[token] = true
      rewards[#rewards + 1] = token
    end
    if task.holiday then
      if holiday and holiday ~= task.holiday then
        same = false
      end
      holiday = holiday or task.holiday
    else
      same = false
    end
  end
  local card = { rewards = #rewards > 0 and rewards or nil }
  if holiday and same then
    card.title = holiday
    card.goal = ns.T("QUICK_GOAL_HOLIDAY", holiday)
  elseif preset then
    card.title = ns.T(preset.label)
  end
  return card
end
