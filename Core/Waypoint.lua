-- One marker. Native user waypoint by default.
-- TomTom, when enabled, replaces that pin. It is never added on top.
-- C_Map.SetUserWaypoint / C_SuperTrack.SetSuperTrackedUserWaypoint:
-- https://warcraft.wiki.gg/wiki/API_C_Map.SetUserWaypoint

local _, ns = ...

ns.Waypoint = {
  owned = nil,
  taskId = nil,
  tomtomUID = nil,
}

local function canCall()
  return not ns.IsPaused()
end

function ns.Waypoint:ClearTomTom()
  if self.tomtomUID and type(TomTom) == "table" and type(TomTom.RemoveWaypoint) == "function" then
    pcall(TomTom.RemoveWaypoint, TomTom, self.tomtomUID)
  end
  self.tomtomUID = nil
end

function ns.Waypoint.ClearNative()
  if C_Map and C_Map.ClearUserWaypoint then
    pcall(C_Map.ClearUserWaypoint)
  end
  if C_SuperTrack and C_SuperTrack.SetSuperTrackedUserWaypoint then
    pcall(C_SuperTrack.SetSuperTrackedUserWaypoint, false)
  end
end

function ns.Waypoint:ClearIfOwned()
  if self.owned == "native" then
    self:ClearNative()
  elseif self.owned == "tomtom" then
    self:ClearTomTom()
  end
  self.owned = nil
  self.taskId = nil
end

function ns.Waypoint:ClearIfTask(taskId)
  if self.taskId == taskId then
    self:ClearIfOwned()
  end
end

local function setTomTom(task)
  if not ns.DB or not ns.DB.useTomTom then
    return false
  end
  if not ns.AddonLoaded("TomTom") or type(TomTom) ~= "table" or type(TomTom.AddWaypoint) ~= "function" then
    return false
  end
  local ok, uid = pcall(TomTom.AddWaypoint, TomTom, task.mapID, task.x, task.y, {
    title = task.title,
    persistent = false,
    minimap = true,
    world = true,
    from = "Unbored",
    silent = true,
  })
  if not ok or uid == nil then
    return false
  end
  ns.Waypoint.tomtomUID = uid
  return true
end

local function setNative(task)
  if not C_Map or not C_Map.SetUserWaypoint then
    return false
  end
  if C_Map.CanSetUserWaypointOnMap then
    local okCan, can = pcall(C_Map.CanSetUserWaypointOnMap, task.mapID)
    if okCan and not can then
      return false
    end
  end
  local point
  if UiMapPoint and UiMapPoint.CreateFromCoordinates then
    local okPoint, created = pcall(UiMapPoint.CreateFromCoordinates, task.mapID, task.x, task.y)
    if okPoint then
      point = created
    end
  end
  if not point then
    point = { uiMapID = task.mapID, position = { x = task.x, y = task.y } }
  end
  local ok, wasSet = pcall(C_Map.SetUserWaypoint, point)
  if not ok or wasSet == false then
    return false
  end
  if C_SuperTrack and C_SuperTrack.SetSuperTrackedUserWaypoint then
    pcall(C_SuperTrack.SetSuperTrackedUserWaypoint, true)
  end
  return true
end

function ns.Waypoint:Set(task)
  if not canCall() then
    ns.Print(ns.T("PAUSED"))
    return false
  end
  if not task or not task.mapID or not task.x or not task.y then
    ns.Print(ns.T("WAYPOINT_NO_POINT"))
    return false
  end
  self:ClearIfOwned()
  if setTomTom(task) then
    self.owned = "tomtom"
    self.taskId = task.id
    ns.Print(ns.T("WAYPOINT_SET"))
    return true
  end
  if setNative(task) then
    self.owned = "native"
    self.taskId = task.id
    ns.Print(ns.T("WAYPOINT_SET"))
    return true
  end
  ns.Print(ns.T("WAYPOINT_FAILED"))
  return false
end
