-- Drives the main window and the tracker against a fake frame API, so a
-- layout error or a nil call shows up without the game client.

local fails = 0
local checks = 0

local function check(cond, message)
  checks = checks + 1
  if not cond then
    fails = fails + 1
    io.stderr:write("FAIL: " .. message .. "\n")
  end
end

local CHAR_WIDTH = 6
local LINE_HEIGHT = 12

local Widget = {}
local frames = {}

local function newWidget(kind, name, parent)
  local widget = {
    kind = kind,
    name = name,
    parent = parent,
    shown = kind ~= "Frame" or parent ~= nil,
    width = 0,
    height = 0,
    text = "",
    scripts = {},
    points = {},
  }
  setmetatable(widget, Widget)
  frames[#frames + 1] = widget
  return widget
end

local methods = {
  Show = function(self)
    self.shown = true
    if self.scripts.OnShow then
      self.scripts.OnShow(self)
    end
  end,
  Hide = function(self)
    self.shown = false
  end,
  SetShown = function(self, shown)
    if shown then
      self:Show()
    else
      self:Hide()
    end
  end,
  IsShown = function(self)
    return self.shown
  end,
  SetWidth = function(self, width)
    self.width = width
  end,
  SetHeight = function(self, height)
    assert(type(height) == "number" and height == height, "height must be a number")
    self.height = height
  end,
  SetSize = function(self, width, height)
    self.width = width
    self.height = height
  end,
  GetWidth = function(self)
    return self.width
  end,
  GetHeight = function(self)
    return self.height
  end,
  SetText = function(self, text)
    self.text = text == nil and "" or tostring(text)
  end,
  GetText = function(self)
    return self.text
  end,
  SetScript = function(self, event, fn)
    self.scripts[event] = fn
  end,
  GetScript = function(self, event)
    return self.scripts[event]
  end,
  SetPoint = function(self, ...)
    self.points[#self.points + 1] = { ... }
  end,
  ClearAllPoints = function(self)
    self.points = {}
  end,
  GetPoint = function()
    return "CENTER", nil, "CENTER", 0, 0
  end,
  CreateFontString = function(self)
    return newWidget("FontString", nil, self)
  end,
  CreateTexture = function(self)
    return newWidget("Texture", nil, self)
  end,
  GetFontString = function(self)
    if not self.fontString then
      self.fontString = newWidget("FontString", nil, self)
    end
    return self.fontString
  end,
  GetStringWidth = function(self)
    return #self.text * CHAR_WIDTH
  end,
  GetStringHeight = function(self)
    if self.text == "" then
      return 0
    end
    local width = self.width > 0 and self.width or 1000
    local lines = 0
    for line in (self.text .. "\n"):gmatch("([^\n]*)\n") do
      lines = lines + math.max(1, math.ceil(#line * CHAR_WIDTH / width))
    end
    return lines * LINE_HEIGHT
  end,
  GetFrameLevel = function()
    return 1
  end,
  HasFocus = function()
    return false
  end,
  IsMouseOver = function()
    return false
  end,
  GetScale = function()
    return 1
  end,
  GetEffectiveScale = function()
    return 1
  end,
  GetLeft = function()
    return 0
  end,
  GetTop = function()
    return 0
  end,
  Click = function(self, button)
    if self.scripts.OnClick then
      self.scripts.OnClick(self, button or "LeftButton")
    end
  end,
}
Widget.__index = function(_, key)
  if methods[key] then
    return methods[key]
  end
  if type(key) == "string" and key:match("^%u") then
    return function() end
  end
  return nil
end

local function textOf(region)
  return region and region.text or ""
end

CreateFrame = function(kind, name, parent)
  local widget = newWidget(kind, name, parent)
  if name then
    _G[name] = widget
  end
  return widget
end
UIParent = newWidget("Frame", "UIParent", nil)
UIParent.shown = true
Minimap = newWidget("Frame", "Minimap", UIParent)
GameTooltip = newWidget("Frame", "GameTooltip", UIParent)
UISpecialFrames = {}
GetLocale = function()
  return "enUS"
end
GetTime = function()
  return 100
end
time = os.time
C_Timer = {
  NewTicker = function()
    return { Cancel = function() end }
  end,
  After = function() end,
}
C_AddOns = {
  IsAddOnLoaded = function(name)
    return name == "Unbored_Plan"
  end,
}
UnitName = function()
  return "Hero"
end
GetRealmName = function()
  return "Area 52"
end
UnitLevel = function()
  return 80
end
UnitFactionGroup = function()
  return "Alliance"
end
C_Map = {
  GetBestMapForUnit = function()
    return 84
  end,
  GetPlayerMapPosition = function()
    return { x = 0.2, y = 0.2 }
  end,
  GetMapInfo = function(id)
    return { mapID = id, name = "Stormwind City", parentMapID = 0 }
  end,
  GetWorldPosFromMapPos = function(_, pos)
    return 1, { x = pos.x * 1000, y = pos.y * 1000 }
  end,
  CanSetUserWaypointOnMap = function()
    return true
  end,
  SetUserWaypoint = function(point)
    C_Map.pin = point
  end,
  GetUserWaypoint = function()
    return C_Map.pin
  end,
  ClearUserWaypoint = function()
    C_Map.pin = nil
  end,
}
UiMapPoint = {
  CreateFromCoordinates = function(mapID, x, y)
    return { uiMapID = mapID, position = { x = x, y = y } }
  end,
}
C_SuperTrack = {
  SetSuperTrackedUserWaypoint = function(on)
    C_SuperTrack.on = on
  end,
}
local reloads = 0
ReloadUI = function()
  reloads = reloads + 1
end

local ns = {}
local toc = io.open("Unbored.toc", "r")
local files = {}
for line in toc:lines() do
  local path = line:match("^([%w_\\]+%.lua)%s*$")
  if path then
    files[#files + 1] = (path:gsub("\\", "/"))
  end
end
toc:close()
for i = 1, #files do
  local chunk = assert(loadfile(files[i]))
  chunk("Unbored", ns)
end

local driver
for i = 1, #frames do
  if frames[i].scripts.OnEvent then
    driver = frames[i]
  end
end
check(driver ~= nil, "init registers an event frame")
UnboredDB = nil
UnboredCharDB = nil
UnboredExternalPlan = nil
driver.scripts.OnEvent(driver, "ADDON_LOADED", "Unbored")
driver.scripts.OnEvent(driver, "PLAYER_LOGIN")
if ns.Session and not ns.Session.started then
  driver.scripts.OnEvent(driver, "PLAYER_ENTERING_WORLD", true, false)
end

local ui = ns.UI
check(ui.frame ~= nil, "main window exists")
check(ns.Tracker.frame ~= nil, "tracker exists")
ui:Show()
check(ui.frame:IsShown(), "main window shows")
check(ui.view == "wizard", "a fresh character sees the wizard")
check(ui.primary.text == "Get plan", "companion present: the button says Get plan")
check(ui.frame.height > 300, "wizard has a real height: " .. tostring(ui.frame.height))
for i = 1, #ui.cards do
  check(ui.cards[i]:IsShown(), "mode card " .. i .. " is shown")
end
check(not ui.stateTitle:IsShown(), "no state screen in the wizard")

ui.cards[5]:Click()
check(UnboredDB.mode == "farm", "a card picks the mode")
ui.budgetButtons[3]:Click()
check(UnboredDB.budget == 120, "a budget button picks the time")
ui.wish:SetText("mount, no raids")
ui.primary:Click()
check(reloads == 1, "Get plan reloads in the same click")
local req = UnboredCharDB.request
check(req and req.mode == "farm" and req.budget == 120 and req.wish == "mount, no raids", "Get plan saves the request")
check(req and req.context and req.context.mapID == 84, "Get plan saves context")
ui:Refresh()
check(ui.view == "waiting", "after Get plan the window waits")
check(ui.primary.text == "Load plan", "waiting shows Load plan")
check(ui.cancel:IsShown(), "waiting offers cancel")
check(not ui.cards[1]:IsShown(), "waiting hides the wizard")
ui.primary:Click()
check(reloads == 2, "Load plan reloads")

ns.Tracker:Refresh()
check(ns.Tracker.frame:IsShown(), "tracker shows while waiting")
check(ns.Tracker.bannerButton:IsShown() and textOf(ns.Tracker.bannerButton) == "Load plan", "tracker offers Load plan")

UnboredExternalPlan = {
  v = 1,
  kind = "plan",
  mode = "farm",
  budget = 120,
  generatedAt = 50,
  requestId = req.id,
  requestStatus = "fulfilled",
  tasks = {
    {
      id = "a",
      title = "Ride to the gate and then keep riding along the long coast road",
      estMinutes = 20,
      note = string.rep("A long note that must wrap and never be cut. ", 8),
      waypoints = {
        { mapID = 84, x = 0.25, y = 0.25, label = "Gate" },
        { mapID = 84, x = 0.6, y = 0.6, label = "Bridge" },
      },
    },
    { id = "b", title = "Second", estMinutes = 10, note = "second note" },
    { id = "c", title = "Third", estMinutes = 10 },
  },
}
check(ns.Session:AutoApplyExternal() == true, "the requested plan starts")
check(not ui.frame:IsShown(), "starting a plan hides the main window")
local tracker = ns.Tracker
check(tracker.frame:IsShown(), "starting a plan shows the tracker")
check(textOf(tracker.sub):find("Step 1 of 3", 1, true) ~= nil, "tracker shows the step count: " .. textOf(tracker.sub))
local row = tracker.currentRow
check(row and row:IsShown(), "current row is shown")
local noteText = row and row.note and row.note.text or ""
check(noteText:find("never be cut", 1, true) and #noteText > 300, "the full note is shown")
check(row.note.height >= 4 * LINE_HEIGHT, "a long note wraps to several lines")
local meta = textOf(row.meta)
check(meta:find("Point 1/2: Gate", 1, true), "meta shows the route point: " .. meta)
check(C_Map.pin and C_Map.pin.uiMapID == 84 and C_SuperTrack.on == true, "the current step is pinned and super-tracked")
local height = tracker.frame.height
check(height > row.note.height, "tracker grows with the note")

C_Map.GetPlayerMapPosition = function()
  return { x = 0.25, y = 0.25 }
end
ns.Session:AdvanceRoute()
check(textOf(tracker.currentRow.meta):find("Point 2/2: Bridge", 1, true), "arrival moves to the next point")
check(math.abs(C_Map.pin.position.x - 0.6) < 1e-6, "the pin moves with the route")

tracker.collapse:Click()
check(tracker.frame.height < height, "collapse makes the tracker shorter")
tracker.collapse:Click()

tracker.done:Click()
check(ns.Session:Current().id == "b", "Done moves to the next step")
check(textOf(tracker.sub):find("Step 2 of 3", 1, true) ~= nil, "step count follows Done")
tracker.skip:Click()
check(ns.Session:Current().id == "c", "Skip moves on")
tracker.done:Click()
tracker.done:Click()
check(ns.Session:Current() == nil, "the plan can be finished")
check(tracker.bannerButton:IsShown() and textOf(tracker.bannerButton) == "New plan", "a finished plan offers New plan")
tracker.bannerButton:Click()
check(ui.frame:IsShown() and ui.view == "wizard", "New plan opens the wizard")

UnboredCharDB.request = {
  id = "req-x",
  createdAt = os.time(),
  mode = "roam",
  budget = 30,
}
UnboredExternalPlan = { requestId = "req-x", requestStatus = "failed", requestReason = "Nothing nearby." }
ns.Session:NoteRequest()
ui:Refresh()
check(ui.view == "failed" and ui.stateBody.text == "Nothing nearby.", "a failed request shows its reason")
ui.primary:Click()
check(UnboredCharDB.request == nil and ui.view == "wizard", "Try again returns to the wizard")

local items = ui.MenuItems()
check(#items >= 3, "gear menu has items")
ns.UI.ShowMenu(ui.frame, items)

if fails > 0 then
  io.stderr:write(fails .. " failed, " .. checks .. " checks\n")
  os.exit(1)
end
print(checks .. " UI checks passed")
