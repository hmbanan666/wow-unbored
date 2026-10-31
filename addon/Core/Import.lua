-- Strict check for pasted plans. Companion tables may omit v and kind.

local _, ns = ...

local MAX_TASKS = 40
local COMPLETE_KINDS = {
  manual = true,
  achievement = true,
  quest = true,
  mount = true,
  toy = true,
  pet = true,
  currency = true,
  zone = true,
  proximity = true,
  vignette = true,
  criteria = true,
  any = true,
}

local function plain(value)
  if value == ns.JSON.Null then
    return nil
  end
  return value
end

local function whole(value, lo, hi)
  value = plain(value)
  if type(value) ~= "number" or value ~= math.floor(value) then
    return nil
  end
  if value < lo or value > hi then
    return nil
  end
  return value
end

local function fraction(value)
  value = plain(value)
  if type(value) ~= "number" or value ~= value then
    return nil, "bad"
  end
  if value < 0 or value > 1 then
    return nil, "range"
  end
  return value
end

local function cleanComplete(raw, index, depth)
  raw = plain(raw)
  if raw == nil then
    return { kind = "manual" }
  end
  if type(raw) ~= "table" then
    return nil, ns.T("ERR_COMPLETE", index, "?")
  end
  local kind = plain(raw.kind) or "manual"
  if type(kind) ~= "string" or not COMPLETE_KINDS[kind] then
    return nil, ns.T("ERR_COMPLETE", index, tostring(kind))
  end
  if kind == "manual" then
    return { kind = "manual" }
  end
  if kind == "any" then
    if depth > 1 then
      return nil, ns.T("ERR_COMPLETE", index, "any")
    end
    local list = plain(raw.any)
    if type(list) ~= "table" or #list < 1 or #list > 4 then
      return nil, ns.T("ERR_COMPLETE_FIELD", index, "any")
    end
    local out = { kind = "any", any = {} }
    for i = 1, #list do
      local sub, err = cleanComplete(list[i], index, depth + 1)
      if not sub then
        return nil, err
      end
      if sub.kind == "any" then
        return nil, ns.T("ERR_COMPLETE", index, "any")
      end
      out.any[#out.any + 1] = sub
    end
    return out
  end

  local function need(field, lo, hi)
    local number = whole(raw[field], lo or 1, hi or 100000000)
    if not number then
      return nil
    end
    return number
  end

  if kind == "achievement" then
    local id = need("achievementID")
    if not id then
      return nil, ns.T("ERR_COMPLETE_FIELD", index, "achievement")
    end
    return { kind = kind, achievementID = id }
  end
  if kind == "criteria" then
    local achievementID = need("achievementID")
    local criteriaID = whole(raw.criteriaID, 1, 100000000)
    local criteriaIndex = whole(raw.criteriaIndex, 1, 10000)
    if not achievementID or (not criteriaID and not criteriaIndex) then
      return nil, ns.T("ERR_COMPLETE_FIELD", index, "criteria")
    end
    return {
      kind = kind,
      achievementID = achievementID,
      criteriaID = criteriaID,
      criteriaIndex = criteriaIndex,
    }
  end
  if kind == "quest" then
    local id = need("questID")
    if not id then
      return nil, ns.T("ERR_COMPLETE_FIELD", index, "quest")
    end
    return { kind = kind, questID = id }
  end
  if kind == "mount" then
    local mountID = whole(raw.mountID, 1, 100000000)
    local mountIDs
    if type(plain(raw.mountIDs)) == "table" then
      mountIDs = {}
      for i = 1, #raw.mountIDs do
        local id = whole(raw.mountIDs[i], 1, 100000000)
        if not id or #mountIDs >= 8 then
          return nil, ns.T("ERR_COMPLETE_FIELD", index, "mount")
        end
        mountIDs[#mountIDs + 1] = id
      end
    end
    if not mountID and (not mountIDs or #mountIDs == 0) then
      return nil, ns.T("ERR_COMPLETE_FIELD", index, "mount")
    end
    return { kind = kind, mountID = mountID, mountIDs = mountIDs }
  end
  if kind == "toy" then
    local id = need("itemID")
    if not id then
      return nil, ns.T("ERR_COMPLETE_FIELD", index, "toy")
    end
    return { kind = kind, itemID = id }
  end
  if kind == "pet" then
    local id = need("speciesID")
    if not id then
      return nil, ns.T("ERR_COMPLETE_FIELD", index, "pet")
    end
    return { kind = kind, speciesID = id }
  end
  if kind == "currency" then
    local id = need("currencyID")
    if not id then
      return nil, ns.T("ERR_COMPLETE_FIELD", index, "currency")
    end
    local minQuantity = whole(raw.minQuantity, 1, 100000000) or 1
    return { kind = kind, currencyID = id, minQuantity = minQuantity }
  end
  if kind == "zone" then
    local id = need("mapID")
    if not id then
      return nil, ns.T("ERR_COMPLETE_FIELD", index, "zone")
    end
    return { kind = kind, mapID = id }
  end
  if kind == "proximity" then
    local mapID = need("mapID")
    local x, xErr = fraction(raw.x)
    local y, yErr = fraction(raw.y)
    if not mapID or not x or not y then
      if xErr == "range" or yErr == "range" then
        return nil, ns.T("ERR_XY", index)
      end
      return nil, ns.T("ERR_COMPLETE_FIELD", index, "proximity")
    end
    local radius = whole(raw.radiusYards, 5, 500) or 40
    return { kind = kind, mapID = mapID, x = x, y = y, radiusYards = radius }
  end
  if kind == "vignette" then
    local vignetteID = whole(raw.vignetteID, 1, 100000000)
    local questID = whole(raw.questID, 1, 100000000)
    local mapID = whole(raw.mapID, 1, 10000000)
    local x, y
    if raw.x ~= nil or raw.y ~= nil then
      local xErr, yErr
      x, xErr = fraction(raw.x)
      y, yErr = fraction(raw.y)
      if not x or not y then
        if xErr == "range" or yErr == "range" then
          return nil, ns.T("ERR_XY", index)
        end
        return nil, ns.T("ERR_COMPLETE_FIELD", index, "vignette")
      end
    end
    if not vignetteID and not questID then
      return nil, ns.T("ERR_COMPLETE_FIELD", index, "vignette")
    end
    return {
      kind = kind,
      vignetteID = vignetteID,
      questID = questID,
      mapID = mapID,
      x = x,
      y = y,
    }
  end
  return nil, ns.T("ERR_COMPLETE", index, kind)
end

ns.MAX_WAYPOINTS = 10

-- The card fields (docs/adr/0038). All optional; a 0.7 plan has none of them.
ns.PLAN_LIMITS = {
  title = 120,
  goal = 160,
  details = 600,
  rewards = 6,
  why = 120,
  stepRewards = 3,
  condition = 160,
}
local CHECK_KINDS = { currency = true, item = true, level = true, quest = true, ach = true }
local REWARD = "^{%l+:[^{}]+}$"

local function cleanText(value, maxBytes)
  value = plain(value)
  if type(value) ~= "string" then
    return nil
  end
  value = ns.Trim(value)
  if value == "" then
    return nil
  end
  return ns.Utf8Truncate(value, maxBytes)
end

-- Up to max reward tokens, each one whole token like "{mount:219}".
function ns.CleanRewards(raw, max)
  raw = plain(raw)
  if type(raw) ~= "table" then
    return nil
  end
  local out, seen = {}, {}
  for i = 1, #raw do
    local token = cleanText(raw[i], ns.Markup.MAX_LABEL_BYTES + 24)
    if token and token:match(REWARD) and not seen[token] and #out < max then
      seen[token] = true
      out[#out + 1] = token
    end
  end
  return #out > 0 and out or nil
end

-- { text, check = { kind, id, atLeast } }, checked live by ns.ConditionState.
function ns.CleanCondition(raw)
  raw = plain(raw)
  if type(raw) ~= "table" then
    return nil
  end
  local line = cleanText(raw.text, ns.PLAN_LIMITS.condition)
  local check = plain(raw.check)
  local clean
  if type(check) == "table" and CHECK_KINDS[plain(check.kind)] then
    local id = whole(check.id, 1, 2147483647)
    if id then
      clean = { kind = plain(check.kind), id = id, atLeast = whole(check.atLeast, 1, 2147483647) }
    end
  end
  if not line and not clean then
    return nil
  end
  return { text = line, check = clean }
end

-- Returns nil, nil when the task has no route.
function ns.CleanWaypoints(raw, index)
  raw = plain(raw)
  if raw == nil then
    return nil
  end
  if type(raw) ~= "table" or #raw > ns.MAX_WAYPOINTS then
    return nil, ns.T("ERR_WAYPOINTS", index)
  end
  local out = {}
  for i = 1, #raw do
    local point = plain(raw[i])
    if type(point) ~= "table" then
      return nil, ns.T("ERR_WAYPOINTS", index)
    end
    local mapID = whole(point.mapID, 1, 10000000)
    local x = fraction(point.x)
    local y = fraction(point.y)
    if not mapID or not x or not y then
      return nil, ns.T("ERR_WAYPOINTS", index)
    end
    local label = plain(point.label)
    if type(label) ~= "string" or ns.Trim(label) == "" then
      label = nil
    else
      label = ns.Utf8Truncate(ns.Trim(label), 80)
    end
    out[#out + 1] = { mapID = mapID, x = x, y = y, label = label }
  end
  if #out == 0 then
    return nil
  end
  return out
end

function ns.ValidatePlan(raw, loose)
  if type(raw) ~= "table" then
    return nil, ns.T("ERR_JSON")
  end
  local kind = plain(raw.kind)
  if kind == "progress" then
    return nil, ns.T("ERR_KIND")
  end
  if kind ~= nil and kind ~= "plan" then
    return nil, ns.T("ERR_KIND")
  end
  if not loose and kind ~= "plan" then
    return nil, ns.T("ERR_KIND")
  end
  local version = plain(raw.v)
  if version == nil and loose then
    version = 1
  end
  if version ~= 1 then
    return nil, ns.T("ERR_VERSION", tostring(version))
  end
  local tasks = plain(raw.tasks)
  if type(tasks) ~= "table" or #tasks < 1 then
    return nil, ns.T("ERR_TASKS")
  end
  if #tasks > MAX_TASKS then
    return nil, ns.T("ERR_TOO_MANY", MAX_TASKS)
  end
  local mode = plain(raw.mode) or "custom"
  if type(mode) ~= "string" or not ns.MODE_IDS[mode] then
    return nil, ns.T("ERR_MODE")
  end
  local budget = plain(raw.budget)
  if budget ~= nil then
    budget = whole(budget, 5, 240)
  end
  local note = plain(raw.note)
  if note ~= nil and type(note) ~= "string" then
    note = nil
  end
  if type(note) == "string" and #note > 400 then
    note = note:sub(1, 400)
  end

  local title = cleanText(raw.title, ns.PLAN_LIMITS.title)
  title = title and ns.Trim(ns.Markup.Plain(title) or "") or nil
  local goal = cleanText(raw.goal, ns.PLAN_LIMITS.goal)
  local details = cleanText(raw.details, ns.PLAN_LIMITS.details)
  local rewards = ns.CleanRewards(raw.rewards, ns.PLAN_LIMITS.rewards)

  local npcs = ns.Markup.CleanEntities(plain(raw.entities))
  local cleanTasks = {}
  for i = 1, #tasks do
    local task = plain(tasks[i])
    if type(task) ~= "table" then
      return nil, ns.T("ERR_TASK", i)
    end
    local id = plain(task.id)
    if type(id) ~= "string" or #id < 1 or #id > 80 or not id:match("^[%w%-%._:]+$") then
      return nil, ns.T("ERR_ID", i)
    end
    local stepTitle = plain(task.title)
    if type(stepTitle) ~= "string" or ns.Trim(stepTitle) == "" or #stepTitle > 240 then
      return nil, ns.T("ERR_TITLE", i)
    end
    local est = plain(task.estMinutes)
    if est == nil then
      est = 15
    end
    est = whole(est, 1, 240)
    if not est then
      return nil, ns.T("ERR_EST", i)
    end
    local mapID = plain(task.mapID)
    if mapID ~= nil then
      mapID = whole(mapID, 1, 10000000)
      if not mapID then
        return nil, ns.T("ERR_MAP", i)
      end
    end
    local x, y
    if task.x ~= nil or task.y ~= nil then
      if plain(task.x) == nil or plain(task.y) == nil then
        return nil, ns.T("ERR_XY", i)
      end
      local xErr, yErr
      x, xErr = fraction(task.x)
      y, yErr = fraction(task.y)
      if not x or not y then
        return nil, ns.T("ERR_XY", i)
      end
      if xErr or yErr then
        return nil, ns.T("ERR_XY", i)
      end
    end
    local taskNote = plain(task.note)
    if type(taskNote) ~= "string" then
      taskNote = nil
    elseif #taskNote > 400 then
      taskNote = taskNote:sub(1, 400)
    end
    local waypoints, wpErr = ns.CleanWaypoints(task.waypoints, i)
    if wpErr then
      return nil, wpErr
    end
    local complete, err = cleanComplete(task.complete, i, 1)
    if not complete then
      return nil, err
    end
    local why = cleanText(task.why, ns.PLAN_LIMITS.why)
    local condition = ns.CleanCondition(task.condition)
    cleanTasks[#cleanTasks + 1] = {
      id = id,
      title = ns.Trim(stepTitle),
      mapID = mapID,
      x = x,
      y = y,
      estMinutes = est,
      note = taskNote,
      waypoints = waypoints,
      npcs = ns.Markup.NpcsFor(npcs or ns.Markup.CleanEntities({ npc = plain(task.npcs) }), stepTitle, taskNote, why,
        condition and condition.text),
      source = "import",
      complete = complete,
      why = why,
      rewards = ns.CleanRewards(task.rewards, ns.PLAN_LIMITS.stepRewards),
      condition = condition,
    }
  end

  return {
    v = 1,
    kind = "plan",
    mode = mode,
    budget = budget,
    note = note,
    title = title ~= "" and title or nil,
    goal = goal,
    details = details,
    rewards = rewards,
    npcs = npcs and ns.Markup.NpcsFor(npcs, goal, details) or nil,
    tasks = cleanTasks,
    generatedAt = whole(raw.generatedAt, 0, 4000000000),
  }
end

function ns.DecodeImport(text)
  local value, err, prefix = ns.DecodeMessage(text)
  if not value then
    return nil, ns.CodecError(err)
  end
  if prefix == "UNB1P" or plain(value.kind) == "progress" then
    return nil, ns.T("ERR_KIND")
  end
  return ns.ValidatePlan(value, false)
end

function ns.EncodePlan(plan)
  local clean = ns.ValidatePlan(plan, true)
  if not clean then
    clean = plan
  end
  local npc, tasks = {}, {}
  for id, entry in pairs(clean.npcs or {}) do
    npc[id] = entry
  end
  for i = 1, #(clean.tasks or {}) do
    local task = ns.DeepCopy(clean.tasks[i]) or {}
    for id, entry in pairs(task.npcs or {}) do
      npc[id] = entry
    end
    task.npcs = nil
    tasks[i] = task
  end
  local payload = {
    v = 1,
    kind = "plan",
    mode = clean.mode or "custom",
    budget = clean.budget,
    note = clean.note,
    title = clean.title,
    goal = clean.goal,
    details = clean.details,
    rewards = clean.rewards,
    tasks = tasks,
    entities = next(npc) and { npc = npc } or nil,
  }
  return ns.EncodeMessage("UNB1", payload)
end

function ns.EncodeProgress(progress)
  local payload = {
    v = 1,
    kind = "progress",
    mode = progress.mode or "custom",
    budget = progress.budget,
    exportedAt = progress.exportedAt or ns.Now(),
    currentId = progress.currentId,
    done = progress.done or {},
    skipped = progress.skipped or {},
    remaining = progress.remaining or {},
    source = progress.source,
  }
  return ns.EncodeMessage("UNB1P", payload)
end
