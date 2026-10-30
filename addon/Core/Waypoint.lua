-- The current step always has the arrow. The native user waypoint is set and
-- super-tracked so Blizzard's on-screen arrow and distance appear at once.
-- When TomTom is loaded its crazy arrow is added on top, unless turned off.
-- https://warcraft.wiki.gg/wiki/API_C_Map.SetUserWaypoint
-- https://warcraft.wiki.gg/wiki/API_C_SuperTrack.SetSuperTrackedUserWaypoint

local _, ns = ...

ns.ARRIVE_YARDS = 30

ns.Waypoint = {
  key = nil,
  nativePoint = nil,
  tomtomUID = nil,
}

-- The point the arrow should show for a task: its route point, else its pin.
function ns.Waypoint.Target(task)
  if type(task) ~= "table" then
    return nil
  end
  local list = task.waypoints
  if type(list) == "table" and #list > 0 then
    local index = math.max(1, math.min(tonumber(task.wpIndex) or 1, #list))
    return list[index], index, #list
  end
  if task.mapID and task.x and task.y then
    return { mapID = task.mapID, x = task.x, y = task.y }, 1, 1
  end
  return nil
end

function ns.Waypoint:ClearTomTom()
  if self.tomtomUID and type(TomTom) == "table" and type(TomTom.RemoveWaypoint) == "function" then
    pcall(TomTom.RemoveWaypoint, TomTom, self.tomtomUID)
  end
  self.tomtomUID = nil
end

local function samePoint(a, b)
  if not a or not b then
    return false
  end
  local ok, same = pcall(function()
    return a.mapID == b.mapID and math.abs(a.x - b.x) < 0.0005 and math.abs(a.y - b.y) < 0.0005
  end)
  return ok and same
end

-- Only clears the user waypoint if it is still the one Unbored placed, so a
-- pin the player set by hand survives.
function ns.Waypoint:ClearNative()
  local mine = self.nativePoint
  self.nativePoint = nil
  if not mine or not C_Map or not C_Map.ClearUserWaypoint then
    return
  end
  local current = C_Map.GetUserWaypoint and ns.Call(C_Map.GetUserWaypoint)
  if current then
    local x, y = ns.ReadXY(current.position)
    local seen = { mapID = ns.AsNumber(current.uiMapID), x = x, y = y }
    if not samePoint(seen, mine) then
      return
    end
  end
  pcall(C_Map.ClearUserWaypoint)
end

function ns.Waypoint:ClearOwned()
  self:ClearNative()
  self:ClearTomTom()
  self.key = nil
end

local function setNative(point)
  if not C_Map or not C_Map.SetUserWaypoint then
    return false
  end
  if C_Map.CanSetUserWaypointOnMap then
    local okCan, can = pcall(C_Map.CanSetUserWaypointOnMap, point.mapID)
    if okCan and can == false then
      return false
    end
  end
  local mapPoint
  if UiMapPoint and UiMapPoint.CreateFromCoordinates then
    mapPoint = ns.Call(UiMapPoint.CreateFromCoordinates, point.mapID, point.x, point.y)
  end
  if not mapPoint then
    mapPoint = { uiMapID = point.mapID, position = { x = point.x, y = point.y } }
  end
  local ok, wasSet = pcall(C_Map.SetUserWaypoint, mapPoint)
  if not ok or wasSet == false then
    return false
  end
  if C_SuperTrack and C_SuperTrack.SetSuperTrackedUserWaypoint then
    pcall(C_SuperTrack.SetSuperTrackedUserWaypoint, true)
  end
  return true
end

local function setTomTom(point, title)
  if ns.DB and ns.DB.tomtomArrow == false then
    return nil
  end
  if not ns.AddonLoaded("TomTom") or type(TomTom) ~= "table" or type(TomTom.AddWaypoint) ~= "function" then
    return nil
  end
  local ok, uid = pcall(TomTom.AddWaypoint, TomTom, point.mapID, point.x, point.y, {
    title = title,
    persistent = false,
    minimap = true,
    world = true,
    crazy = true,
    from = "Unbored",
    silent = true,
  })
  if not ok or uid == nil then
    return nil
  end
  if type(TomTom.SetCrazyArrow) == "function" then
    pcall(TomTom.SetCrazyArrow, TomTom, uid, ns.ARRIVE_YARDS, title)
  end
  return uid
end

function ns.Waypoint.Label(task, point)
  if point and type(point.label) == "string" and point.label ~= "" then
    return point.label
  end
  return task and ns.Markup.Plain(task.title, task.npcs) or "Unbored"
end

-- A place the player clicked in the Bubble (a pin or npc link). The step keeps
-- its key, so the next Sync leaves this arrow until the step changes.
function ns.Waypoint:Point(mapID, x, y, title)
  if ns.IsPaused() or not mapID or not x or not y then
    return false
  end
  self:ClearNative()
  self:ClearTomTom()
  local point = { mapID = mapID, x = x, y = y }
  local native = setNative(point)
  if native then
    self.nativePoint = point
  end
  self.tomtomUID = setTomTom(point, title or "Unbored")
  return native or self.tomtomUID ~= nil
end

-- Point the arrow at the task's current target. Does nothing when that target
-- already has the arrow, so it is cheap to call on every refresh.
function ns.Waypoint:Sync(task, force)
  local point, index = ns.Waypoint.Target(task)
  if not point then
    if self.key then
      self:ClearOwned()
    end
    return false
  end
  local key = tostring(task.id) .. "#" .. tostring(index)
  if key == self.key and not force then
    return true
  end
  if ns.IsPaused() then
    return false
  end
  self:ClearOwned()
  local native = setNative(point)
  if native then
    self.nativePoint = { mapID = point.mapID, x = point.x, y = point.y }
  end
  self.tomtomUID = setTomTom(point, ns.Waypoint.Label(task, point))
  self.key = key
  return native or self.tomtomUID ~= nil
end

-- Move to the next route point once the player reaches the current one.
-- The last point stays; finishing the task is the completion rule's job.
function ns.Waypoint.Advance(task)
  if type(task) ~= "table" or type(task.waypoints) ~= "table" then
    return false
  end
  local count = #task.waypoints
  local index = tonumber(task.wpIndex) or 1
  if count < 2 or index >= count then
    return false
  end
  local point = task.waypoints[index]
  if not ns.Near(point.mapID, point.x, point.y, ns.ARRIVE_YARDS) then
    return false
  end
  task.wpIndex = index + 1
  return true
end

function ns.Waypoint.DistanceTo(point)
  if not point then
    return nil
  end
  local mapID, x, y = ns.PlayerPosition()
  if not mapID or not x or not y then
    return nil
  end
  return ns.YardsBetween(mapID, x, y, point.mapID, point.x, point.y)
end

function ns.Waypoint:Retrack(task)
  self.key = nil
  if not self:Sync(task, true) and task and not ns.Waypoint.Target(task) then
    ns.Print(ns.T("WAYPOINT_NO_POINT"))
  end
end
