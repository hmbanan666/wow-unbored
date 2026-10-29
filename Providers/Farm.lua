local _, ns = ...

function ns.LockoutMap()
  local locked = {}
  if type(GetNumSavedInstances) ~= "function" or type(GetSavedInstanceInfo) ~= "function" then
    return locked
  end
  local ok, count = pcall(GetNumSavedInstances)
  count = ok and ns.AsNumber(count) or 0
  if not count then
    return locked
  end
  for index = 1, count do
    local results = { pcall(GetSavedInstanceInfo, index) }
    if results[1] then
      local instanceID = ns.AsNumber(results[15])
      if instanceID and ns.Flag(results[6]) then
        locked[instanceID] = true
      end
    end
  end
  return locked
end

local function pinFor(entry, faction)
  if entry.pins and faction and type(entry.pins[faction]) == "table" then
    return entry.pins[faction]
  end
  if entry.pins and entry.pins.Alliance then
    return entry.pins.Alliance
  end
  return entry
end

local function collectiblesOpen(entry)
  local missingNames = {}
  local mounts = entry.mounts or {}
  local appearances = entry.appearances or {}
  local unresolved = false
  local sawOwned = false
  for i = 1, #mounts do
    local state = ns.MountState(mounts[i])
    if not state or state.known == false then
      unresolved = true
    elseif state.collected then
      sawOwned = true
    else
      missingNames[#missingNames + 1] = state.name
    end
  end
  for i = 1, #appearances do
    local owned = ns.PlayerHasAppearance(appearances[i])
    if owned == nil then
      unresolved = true
    elseif owned then
      sawOwned = true
    else
      missingNames[#missingNames + 1] = entry.fallbackTitle
    end
  end
  if #mounts == 0 and #appearances == 0 then
    return true, { entry.fallbackTitle }
  end
  if #missingNames == 0 and not unresolved and (sawOwned or #mounts + #appearances > 0) then
    return false, missingNames
  end
  if #missingNames == 0 then
    missingNames[1] = entry.fallbackTitle
  end
  return true, missingNames
end

local function Build(ctx)
  local tasks = {}
  local locked = ns.LockoutMap()
  for index = 1, #ns.Data.Farm do
    local entry = ns.Data.Farm[index]
    if not locked[entry.instanceID] then
      local open, names = collectiblesOpen(entry)
      if open then
        local pin = pinFor(entry, ctx.faction)
        local title = entry.fallbackTitle or "Raid"
        if type(names[1]) == "string" and names[1] ~= "" then
          title = names[1]
          if names[2] then
            title = title .. ", " .. names[2]
          end
        end
        local zone = ns.MapName(pin.mapID)
        if zone and zone ~= title then
          title = title .. " — " .. zone
        end
        tasks[#tasks + 1] = {
          id = entry.id,
          title = title,
          mapID = pin.mapID,
          x = pin.x,
          y = pin.y,
          estMinutes = entry.estMinutes or 30,
          priority = index,
          note = entry.note or ns.T("NOTE_FARM"),
          source = "farm",
          complete = { kind = "mount", mountIDs = entry.mounts },
        }
      end
    end
  end
  ns.farmNeedsJournal = not ns.MountJournalReady()
  table.sort(tasks, function(a, b)
    if a.estMinutes ~= b.estMinutes then
      return a.estMinutes < b.estMinutes
    end
    return (a.priority or 0) < (b.priority or 0)
  end)
  return tasks
end

ns.RegisterProvider({
  id = "farm",
  Build = Build,
})
