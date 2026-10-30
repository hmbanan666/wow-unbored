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
    return nil, ns.T("ERR_KIND_PROGRESS")
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
    local title = plain(task.title)
    if type(title) ~= "string" or ns.Trim(title) == "" or #title > 240 then
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
    cleanTasks[#cleanTasks + 1] = {
      id = id,
      title = ns.Trim(title),
      mapID = mapID,
      x = x,
      y = y,
      estMinutes = est,
      note = taskNote,
      waypoints = waypoints,
      npcs = ns.Markup.NpcsFor(npcs or ns.Markup.CleanEntities({ npc = plain(task.npcs) }), title, taskNote),
      source = "import",
      complete = complete,
    }
  end

  return {
    v = 1,
    kind = "plan",
    mode = mode,
    budget = budget,
    note = note,
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
    return nil, ns.T("ERR_KIND_PROGRESS")
  end
  return ns.ValidatePlan(value, false)
end

function ns.EncodePlan(plan)
  local clean = ns.ValidatePlan(plan, true)
  if not clean then
    clean = plan
  end
  local npc, tasks = {}, {}
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
