local _, ns = ...

function ns.NormalizeTask(task)
  if type(task) ~= "table" then
    return nil
  end
  if type(task.id) ~= "string" or task.id == "" then
    return nil
  end
  if type(task.title) ~= "string" or task.title == "" then
    return nil
  end
  local complete = ns.DeepCopy(task.complete or { kind = "manual" }, 0)
  if type(complete) ~= "table" then
    complete = { kind = "manual" }
  end
  if type(complete.kind) ~= "string" then
    complete.kind = "manual"
  end
  local est = tonumber(task.estMinutes) or 15
  if est < 1 then
    est = 1
  end
  return {
    id = task.id,
    title = task.title,
    mapID = tonumber(task.mapID),
    x = tonumber(task.x),
    y = tonumber(task.y),
    estMinutes = est,
    note = type(task.note) == "string" and task.note or nil,
    source = task.source,
    priority = tonumber(task.priority),
    complete = complete,
  }
end

function ns.FillBudget(tasks, budget)
  budget = budget or 60
  local plan = {}
  local sum = 0
  local slack = 10
  for i = 1, #tasks do
    local task = tasks[i]
    local est = task.estMinutes or 15
    if #plan == 0 then
      plan[#plan + 1] = task
      sum = sum + est
    elseif sum >= budget then
      break
    elseif sum + est <= budget + slack then
      plan[#plan + 1] = task
      sum = sum + est
    end
  end
  return plan, sum
end

function ns.DistanceScore(task, origin)
  if not origin or not origin.mapID or not origin.x or not origin.y then
    return nil
  end
  if not task.mapID or not task.x or not task.y then
    return nil
  end
  return ns.YardsBetween(origin.mapID, origin.x, origin.y, task.mapID, task.x, task.y)
end

function ns.SortTasks(tasks, origin)
  for i = 1, #tasks do
    tasks[i]._dist = ns.DistanceScore(tasks[i], origin)
  end
  table.sort(tasks, function(a, b)
    local pa = a.priority or 50
    local pb = b.priority or 50
    if pa ~= pb then
      return pa < pb
    end
    if a._dist and b._dist and a._dist ~= b._dist then
      return a._dist < b._dist
    end
    if a._dist and not b._dist then
      return true
    end
    if b._dist and not a._dist then
      return false
    end
    local ea = a.estMinutes or 15
    local eb = b.estMinutes or 15
    if ea ~= eb then
      return ea < eb
    end
    return tostring(a.id) < tostring(b.id)
  end)
  for i = 1, #tasks do
    tasks[i]._dist = nil
  end
  return tasks
end

function ns.BuildProviderPlan(mode, ctx)
  local provider = ns.Providers[mode]
  if not provider then
    return nil, "mode"
  end
  local ok, result = pcall(provider.Build, ctx)
  if not ok then
    return nil, result
  end
  if type(result) ~= "table" then
    return {}
  end
  local tasks = {}
  local dismissed = ctx.dismissed or {}
  for i = 1, #result do
    local task = ns.NormalizeTask(result[i])
    if task and not dismissed[task.id] then
      tasks[#tasks + 1] = task
    end
  end
  return ns.FillBudget(tasks, ctx.budget)
end
