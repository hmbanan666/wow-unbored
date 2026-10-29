-- Drives the mascot, the main window, and the list view against a fake frame
-- API, so a layout error or a nil call shows up without the game client.

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
  CreateAnimationGroup = function(self)
    local group = newWidget("AnimationGroup", nil, self)
    group.playing = false
    return group
  end,
  CreateAnimation = function(self, kind)
    return newWidget(kind, nil, self)
  end,
  Play = function(self)
    self.playing = true
  end,
  Stop = function(self)
    self.playing = false
  end,
  SetTexture = function(self, texture)
    self.texture = texture
  end,
  Enable = function(self)
    self.disabled = false
  end,
  Disable = function(self)
    self.disabled = true
  end,
  SetTextColor = function(self, r, g, b)
    self.color = { r, g, b }
  end,
  SetAlpha = function(self, alpha)
    self.alpha = alpha
  end,
  SetScale = function(self, scale)
    self.scale = scale
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
SlashCmdList = {}
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

local printed = {}
DEFAULT_CHAT_FRAME = {
  AddMessage = function(_, message)
    printed[#printed + 1] = message
  end,
}
local tooltipLines = {}
GameTooltip.AddLine = function(_, text)
  tooltipLines[#tooltipLines + 1] = text
end
local hooks = {}
hooksecurefunc = function(name, fn)
  hooks[name] = fn
end
HandleModifiedItemClick = function() end
local tooltipCalls = {}
Enum = { TooltipDataType = { Item = 0 } }
TooltipDataProcessor = {
  AddTooltipPostCall = function(kind, fn)
    tooltipCalls[kind] = fn
  end,
}
local altDown = false
IsAltKeyDown = function()
  return altDown
end
GetMouseButtonClicked = function()
  return "RightButton"
end
local cursor = nil
GetCursorInfo = function()
  if cursor then
    return "item", cursor.itemID, cursor.link
  end
  return nil
end
local cleared = 0
ClearCursor = function()
  cursor = nil
  cleared = cleared + 1
end
local HEARTH = "|cffffffff|Hitem:6948::::::::80:::::|h[Hearthstone]|h|r"
C_Container = {
  GetContainerNumSlots = function(bag)
    return bag == 0 and 4 or 0
  end,
  GetContainerItemInfo = function(bag, slot)
    if bag == 0 and slot == 3 then
      return { itemID = 6948, stackCount = 1, hyperlink = HEARTH }
    end
    return nil
  end,
}
C_ToyBox = {
  GetToyInfo = function(itemID)
    if itemID == 1234 then
      return 1234, "Silly toy"
    end
    return nil
  end,
}
PlayerHasToy = function()
  return false
end
C_MountJournal = {
  GetMountFromItem = function(itemID)
    return itemID == 555 and 99 or nil
  end,
  GetMountInfoByID = function(mountID)
    if mountID == 99 then
      return "Sky Wisp", 1, 1, false, true, 0, false, false, 0, false, false
    end
  end,
}

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
local mascot = ns.Mascot
local tracker = ns.Tracker
check(ui.frame == nil and _G.UnboredFrame == nil, "there is no main window, only Wisp")
check(mascot.frame ~= nil and mascot.frame:IsShown(), "the mascot is on screen from the start")
check(tooltipCalls[0] ~= nil, "item tooltips get a post call")
check(hooks.HandleModifiedItemClick ~= nil, "modified item clicks are post-hooked")

-- First run: the mascot greets with the presets right in the bubble.
check(mascot.view.kind == "choice", "a fresh character gets the choice")
check(textOf(mascot.message) == "Hi! What shall we do?", "the greeting asks what to do")
check(mascot.bubble:IsShown(), "the greeting is open")
check(#mascot.chips == #ns.Data.Presets, "one chip per preset")
for i, button in ipairs(mascot.chips) do
  check(button:IsShown() and textOf(button.label) ~= "", "preset chip " .. i .. " is shown")
  check(button:GetWidth() > 200 and button:GetHeight() >= 26, "preset chip " .. i .. " is big")
end
check(textOf(mascot.chips[1].label) == "Stay here, do stuff nearby", "the first chip is Stay here")
check(mascot.otherChip:IsShown() and textOf(mascot.otherChip.label) == "Something else...", "Something else is there")
check(#mascot.timeChips == 3, "three time chips")
for i, button in ipairs(mascot.timeChips) do
  check(button:IsShown() and button:GetWidth() < 60, "time chip " .. i .. " is small and shown")
end
local function gold(button)
  return button.label.color and button.label.color[1] == 1 and button.label.color[3] == 0
end
check(textOf(mascot.timeChips[2].label) == "1h" and gold(mascot.timeChips[2]), "1h is the default time")
check(not gold(mascot.timeChips[1]) and not gold(mascot.timeChips[3]), "only one time is picked")
check(not mascot.buttons.done:IsShown() and not mascot.buttons.back:IsShown(), "no step buttons in the greeting")
check(mascot.art.texture:find("WispIdle", 1, true) ~= nil, "idle portrait")
check(mascot.bubble.height > (#mascot.chips + 1) * 26, "the bubble fits all chips: " .. mascot.bubble.height)
check(not tracker.frame:IsShown(), "the list view is closed by default")

-- The presets are one data table.
local ids = {}
for _, preset in ipairs(ns.Data.Presets) do
  ids[#ids + 1] = preset.id
  check(ns.MODE_IDS[preset.mode] and preset.mode ~= "custom", "preset " .. preset.id .. " has a real mode")
  check(preset.id:match("^[a-z_-]+$") ~= nil, "preset " .. preset.id .. " is a valid topic")
  check(ns.T(preset.label) ~= preset.label, "preset " .. preset.id .. " has a label")
  check(type(preset.wish) == "string" and #preset.wish > 10, "preset " .. preset.id .. " tells the planner")
end
check(table.concat(ids, ",") == "nearby,mount,collect,grind,gold,surprise", "the six presets")

-- With the choice open, the portrait opens the menu (the fallback menu here: no MenuUtil).
local function menuRow(label)
  local menu = ui.menu
  for i = 1, #(menu and menu.rows or {}) do
    local row = menu.rows[i]
    if row:IsShown() and textOf(row.label):find(label, 1, true) == 1 then
      return row
    end
  end
  return nil
end
local function menuLabels()
  local out = {}
  for i = 1, #ui.menu.rows do
    local row = ui.menu.rows[i]
    if row:IsShown() then
      out[#out + 1] = (textOf(row.label):gsub("  >$", ""))
    end
  end
  return table.concat(out, "|")
end
mascot.frame:Click("LeftButton")
check(ui.menu and ui.menu:IsShown(), "with the choice open, a click opens the menu")
check(menuLabels() == "New plan|What is this item?|Ask something|Settings", "no-plan menu: " .. menuLabels())
ui.menu:Hide()

local made = {}
local function fakeRoot(list)
  return {
    CreateTitle = function(_, text)
      list[#list + 1] = { title = text }
    end,
    CreateButton = function(_, text, fn)
      local entry = { text = text, fn = fn, children = {} }
      list[#list + 1] = entry
      return fakeRoot(entry.children)
    end,
    CreateCheckbox = function(_, text, isSelected, setSelected)
      list[#list + 1] = { text = text, checkbox = true, isSelected = isSelected, setSelected = setSelected }
    end,
  }
end
MenuUtil = {
  CreateContextMenu = function(owner, generator)
    generator(owner, fakeRoot(made))
  end,
}
mascot.frame:Click("RightButton")
check(made[1] and made[1].title == "Wisp", "the game menu has the mascot as title")
local function entry(list, text)
  for i = 1, #list do
    if list[i].text == text then
      return list[i]
    end
  end
  return nil
end
local settings = entry(made, "Settings")
check(settings ~= nil and made[#made] == settings, "Settings is last")
local names = {}
for i = 1, #(settings and settings.children or {}) do
  names[i] = settings.children[i].text
end
local settingNames = table.concat(names, "|")
check(settingNames == "Size|Lock position|Hide|Keybinds|More", "Settings are basic: " .. settingNames)
local size = entry(settings.children, "Size")
check(#size.children == 4 and size.children[2].checkbox and size.children[2].isSelected(), "size: 100% by default")
entry(size.children, "125%").setSelected()
check(mascot.frame.scale == 1.25 and UnboredDB.mascot.scale == 125, "a size scales the mascot")
check(entry(size.children, "125%").isSelected() and not size.children[2].isSelected(), "the size is checked")
local lock = entry(settings.children, "Lock position")
check(lock and lock.checkbox and lock.isSelected() == false, "lock is a checkbox, off")
lock.setSelected()
check(mascot:Locked(), "the lock checkbox locks the mascot")
mascot:SetLocked(false)
entry(settings.children, "Keybinds").fn()
check(printed[#printed]:find("Keybindings", 1, true) ~= nil, "Keybinds says where to bind")
local more = entry(settings.children, "More")
local moreNames = {}
for i = 1, #more.children do
  moreNames[i] = more.children[i].text
end
check(table.concat(moreNames, "|") == "Show all steps|One chat line per step|Reset position",
  "More has no import, export, or build: " .. table.concat(moreNames, "|"))
mascot:SetScale(100)
check(mascot.frame.scale == 1, "size back to 100%")
MenuUtil = nil

-- Collapsed, a click with no plan opens the choice again.
mascot.collapse:Click()
check(not mascot.bubble:IsShown() and not mascot.badge:IsShown(), "collapsed greeting: just the portrait")
mascot.frame:Click("LeftButton")
check(mascot.bubble:IsShown() and mascot.view.kind == "choice", "clicking the mascot with no plan offers the presets")
check(not ui.menu:IsShown(), "and not the menu")

-- Time is optional and one small chip.
mascot.timeChips[3]:Click()
check(UnboredDB.budget == 120 and gold(mascot.timeChips[3]) and not gold(mascot.timeChips[2]), "a time chip picks 2h")
mascot.timeChips[2]:Click()
check(UnboredDB.budget == 60, "and back to 1h")

-- One click on a preset: a Quick plan at once, the Request saved, and the UI
-- reloads in the same click.
check(reloads == 0, "nothing reloaded yet")
mascot.chips[2]:Click()
check(reloads == 1, "a preset click reloads in the same click")
local req = UnboredCharDB.request
check(req and req.type == "plan" and req.mode == "farm" and req.topic == "mount", "the preset is sent with its mode")
check(req and req.budget == 60, "with the default 1h")
check(req and req.wish and req.wish:find("mount", 1, true), "and its words for the planner")
check(req and req.context and req.context.mapID == 84, "the request has context")
check(UnboredCharDB.lastWish == nil, "a preset does not overwrite the player's own wish")
local quick = ns.Session.state
check(quick and quick.quick and quick.topic == "mount" and quick.source == "provider", "a Quick plan is built here")
check(ns.Session:Current() ~= nil and #quick.tasks <= 7, "the Quick plan has a first step, 7 at most")
check(UnboredCharDB.session == quick, "the Quick plan is saved before the reload")
check(mascot.view.kind == "step" and textOf(mascot.message) == ns.Session:Current().title, "Wisp shows the first step")
check(textOf(mascot.header) == "Quick plan for now. A better one is cooking.", "and says a better one is cooking")
check(mascot.buttons.done:IsShown() and mascot.buttons.load:IsShown(), "Done and Load while cooking")
check(not mascot.bob.playing, "no thinking bob over a step")
local quickDone = ns.Session:Current().id
mascot.buttons.done:Click()
check(#quick.done == 1 and quick.done[1].id == quickDone, "a Quick plan step can be done")
local echo1 = mascot.echoFrames[1]
check(echo1:IsShown() and textOf(echo1.text):find("Done: ", 1, true) == 1, "the done step echoes above the bubble")
check(echo1.alpha and echo1.alpha < 1, "an older message is faded")
check(echo1.points[1][1] == "BOTTOMLEFT" and echo1.points[1][2] == mascot.bubble, "it sits right above the bubble")

check(mascot.buttons.load:IsShown() and textOf(mascot.buttons.load) == "Load", "the bubble offers Load")
mascot.buttons.load:Click()
check(reloads == 2, "Load reloads")

UnboredExternalPlan = {
  v = 1,
  kind = "plan",
  mode = "farm",
  budget = 120,
  generatedAt = 50,
  requestId = req.id,
  requestStatus = "fulfilled",
  requestType = "plan",
  tasks = {
    {
      id = "a",
      title = "Fly to Dalaran. Portal is next to you in Orgrimmar, then keep riding along the long coast road",
      estMinutes = 20,
      note = string.rep("A long note that must wrap and never be cut. ", 8),
      waypoints = {
        { mapID = 84, x = 0.25, y = 0.25, label = "Gate" },
        { mapID = 84, x = 0.6, y = 0.6, label = "Bridge" },
      },
    },
    { id = "b", title = "Second", estMinutes = 10, note = "second note" },
    { id = "c", title = "Third", estMinutes = 10 },
    { id = quickDone, title = "Already done in the Quick plan", estMinutes = 10 },
  },
}
check(ns.Session:AutoApplyExternal() == true, "the Full plan is taken on load")
check(ns.Session.state == quick and UnboredCharDB.request == nil, "it does not replace the Quick plan by itself")
check(mascot.view.kind == "offer" and textOf(mascot.message) == "Better plan's ready! Load it in?", "Wisp asks first")
check(textOf(mascot.sub):find("4 steps. First: Fly to Dalaran", 1, true) == 1, "the offer says what it is")
check(mascot.buttons.use:IsShown() and mascot.buttons.keep:IsShown(), "Switch or keep")
check(mascot.art.texture:find("WispHappy", 1, true) ~= nil, "happy portrait for the offer")
check(ns.Session:AutoApplyExternal() == false, "the same Full plan is not offered twice")
mascot.buttons.use:Click()
check(UnboredCharDB.offer == nil and ns.Session.state.source == "companion", "Switch starts the Full plan")
check(#ns.Session.state.tasks == 3 and ns.Session.state.done[1].id == quickDone, "finished steps carry over")
check(mascot.view.kind == "step", "the bubble shows the step")
check(not mascot.bob.playing, "thinking stops when the plan is in")
check(not mascot.forceChoice and not mascot.wishing, "a new plan clears the choice")
check(textOf(mascot.message):find("Fly to Dalaran", 1, true) == 1, "the bubble says the step as written")
check(textOf(mascot.count) == "2/4", "the bubble shows small progress: " .. textOf(mascot.count))
local noteText = textOf(mascot.sub)
check(noteText:find("never be cut", 1, true) and #noteText > 300, "the full note is shown")
check(mascot.sub.height >= 4 * LINE_HEIGHT, "a long note wraps to several lines")
check(mascot.message.height >= 2 * LINE_HEIGHT, "a long step wraps")
check(textOf(mascot.meta):find("Point 1/2: Gate", 1, true), "the bubble shows the route point")
check(mascot.buttons.done:IsShown() and mascot.buttons.skip:IsShown(), "Done and Skip are there")
local height = mascot.bubble.height
check(height > mascot.sub.height + mascot.message.height, "the bubble grows with the text")
check(C_Map.pin and C_Map.pin.uiMapID == 84 and C_SuperTrack.on == true, "the current step is pinned and super-tracked")
check(not tracker.frame:IsShown(), "the list view stays closed")

-- Keep this one: the offer goes away and the plan stays.
UnboredCharDB.offer = { plan = { tasks = { { id = "z", title = "Other" } } }, key = "k", requestId = "req-z" }
ns.Session:RefreshUI()
check(mascot.view.kind == "offer", "an offer shows over the step")
mascot.buttons.keep:Click()
check(UnboredCharDB.offer == nil and ns.Session:Current().id == "a", "Keep this one keeps the plan")

-- With a plan, the menu is about the step first.
mascot.frame:Click("LeftButton")
check(ui.menu:IsShown(), "with a plan, a click opens the menu")
check(menuLabels() == "What next?|Skip this step|Show route on map|New plan|What is this item?|Ask something|Settings",
  "plan menu order: " .. menuLabels())
local opened
OpenWorldMap = function(mapID)
  opened = mapID
end
menuRow("Show route on map"):Click()
check(opened == 84, "Show route opens the map on the step")
OpenWorldMap = nil
mascot.frame:Click("LeftButton")
menuRow("New plan"):Click()
check(mascot.view.kind == "choice" and textOf(mascot.message) == "What shall we do next?", "New plan offers presets")
check(mascot.chips[1]:IsShown() and mascot.buttons.back:IsShown(), "with a way back")
mascot.frame:Click("LeftButton")
check(ui.menu:IsShown() and menuRow("What next?") ~= nil, "a plan is running: the click is the menu")
menuRow("What next?"):Click()
check(mascot.view.kind == "step" and not mascot.chips[1]:IsShown(), "What next? shows the step")
mascot:ShowChoice()
mascot.buttons.back:Click()
check(mascot.view.kind == "step", "Back returns to the step")

C_Map.GetPlayerMapPosition = function()
  return { x = 0.25, y = 0.25 }
end
ns.Session:AdvanceRoute()
check(textOf(mascot.meta):find("Point 2/2: Bridge", 1, true), "arrival moves to the next point")

-- The list view on demand.
tracker:Toggle()
check(tracker.frame:IsShown(), "the list view opens on demand")
check(textOf(tracker.sub):find("Step 2 of 4", 1, true) ~= nil, "the list shows the step count")
tracker:Toggle()
check(not tracker.frame:IsShown(), "and closes again")

-- Collapse to the portrait.
mascot.collapse:Click()
check(not mascot.bubble:IsShown() and mascot.badge:IsShown(), "collapse leaves just the portrait")
mascot.frame:Click("LeftButton")
check(menuRow("Show message") ~= nil, "the menu offers the message back")
menuRow("Show message"):Click()
check(mascot.bubble:IsShown(), "the bubble is back")

mascot.frame:Click("LeftButton")
menuRow("Skip this step"):Click()
check(ns.Session:Current().id == "b", "Skip this step moves on")
mascot.buttons.done:Click()
check(ns.Session:Current().id == "c", "Done moves to the next step")
check(textOf(mascot.count) == "3/4", "progress follows Done")
mascot.buttons.skip:Click()
check(ns.Session:Current().id == "a", "Skip moves on")
mascot.buttons.done:Click()
mascot.buttons.done:Click()
check(ns.Session:Current() == nil, "the plan can be finished")
local shownEchoes = 0
for _, frame in ipairs(mascot.echoFrames) do
  shownEchoes = shownEchoes + (frame:IsShown() and 1 or 0)
end
check(shownEchoes == 2 and #mascot.echoes == 2, "at most 3 messages: the bubble and two older ones")
check(textOf(mascot.echoFrames[1].text):find("Done: ", 1, true) == 1, "the newest older message is at the bottom")
check(mascot.echoFrames[2].alpha < mascot.echoFrames[1].alpha, "the oldest fades most")
check(mascot.echoFrames[2].points[1][2] == mascot.echoFrames[1], "older messages stack upward")
local realNow = ns.Now
ns.Now = function()
  return realNow() + 120
end
ns.Events.Pulse()
check(#mascot.echoes == 0 and not mascot.echoFrames[1]:IsShown(), "older messages go away by themselves")
ns.Now = realNow
check(mascot.view.kind == "choice" and textOf(mascot.message) == "All done, nice work! What next?",
  "a finished plan celebrates")
check(mascot.chips[1]:IsShown() and not mascot.buttons.back:IsShown(), "and offers the presets again")
check(mascot.art.texture:find("WispHappy", 1, true) ~= nil, "happy portrait when done")

-- Something else...: one free-text box in the bubble.
mascot.otherChip:Click()
check(mascot.view.kind == "wish" and mascot.wishBox:IsShown(), "Something else opens the wish box")
check(mascot.buttons.send:IsShown() and mascot.buttons.back:IsShown(), "with Send and Back")
check(not mascot.chips[1]:IsShown(), "the chips step aside")
mascot.buttons.send:Click()
check(reloads == 2 and textOf(mascot.sub) == "Type a few words first.", "an empty wish is not sent")
mascot.buttons.back:Click()
check(mascot.view.kind == "choice", "Back returns to the presets")
mascot.otherChip:Click()
mascot.wishEdit:SetText("mount, no raids")
mascot.buttons.send:Click()
check(reloads == 3, "Send reloads in the same click")
req = UnboredCharDB.request
check(req and req.type == "plan" and req.wish == "mount, no raids" and req.topic == nil, "the wish is sent as written")
check(req and req.mode == "farm" and req.budget == 120, "with the last mode and time")
check(UnboredCharDB.lastWish == "mount, no raids", "the wish is remembered")
check(mascot.view.kind == "waiting" and textOf(mascot.message) == "Got it, cooking a plan...", "cooking again")
check(mascot.bob and mascot.bob.playing and mascot.pulse.playing, "the mascot bobs and glows while thinking")
check(mascot.art.texture:find("WispThinking", 1, true) ~= nil, "thinking portrait")
check(textOf(mascot.header):find("mount, no raids", 1, true), "the bubble shows the wish")
ns.Session:CancelRequest()
check(mascot.view.kind == "choice", "cancel goes back to the presets")

-- Ask something: the same box, in the bubble.
mascot.frame:Click("LeftButton")
menuRow("Ask something"):Click()
check(mascot.view.kind == "ask" and mascot.wishBox:IsShown(), "Ask is one box in the bubble")
check(textOf(mascot.wishBox.placeholder) == "e.g. where can I get a flying mount?", "with its own hint")
check(textOf(mascot.wishEdit) == "", "the box starts empty")
mascot.buttons.send:Click()
check(reloads == 3 and textOf(mascot.sub) == "Type your question first.", "an empty question is not sent")
mascot.wishEdit:SetText("Where can I get a flying mount?")
mascot.buttons.send:Click()
check(reloads == 4, "Send reloads in the same click")
req = UnboredCharDB.request
check(req and req.type == "question" and req.question == "Where can I get a flying mount?", "the question is saved")
check(req and req.mode == nil and req.budget == nil, "a question has no mode or budget")
check(mascot.view.kind == "waiting" and mascot.view.header:find("flying mount", 1, true),
  "the bubble shows the question")
check(textOf(mascot.message) == "Thinking..." and mascot.buttons.cancel:IsShown(), "thinking, with a way out")

UnboredExternalPlan = {
  requestId = req.id,
  requestStatus = "fulfilled",
  requestType = "question",
  answer = {
    message = "Head to the rare east of you.\n" .. string.rep("It drops a mount sometimes. ", 10),
    waypoints = { { mapID = 84, x = 0.5, y = 0.5, label = "Rare" } },
  },
}
check(ns.Session:AutoApplyExternal() == true, "an answer is taken on load")
check(UnboredCharDB.request == nil, "the question is no longer pending")
check(mascot.view.kind == "answer", "the bubble shows the answer")
check(textOf(mascot.message):find("It drops a mount sometimes.", 1, true), "the answer is shown as written")
check(mascot.message.height >= 3 * LINE_HEIGHT, "a long answer wraps")
check(textOf(mascot.header):find("flying mount", 1, true), "the answer says what was asked")
check(mascot.art.texture:find("WispHappy", 1, true) ~= nil, "happy portrait for an answer")
check(ns.Session:Current() and ns.Session:Current().title == "Rare", "waypoints in an answer become a step")
check(ns.Session:AutoApplyExternal() == false, "the same answer is not taken twice")
mascot.buttons.ok:Click()
check(mascot.view.kind == "step" and textOf(mascot.message) == "Rare", "after the answer the bubble shows the step")
mascot.buttons.done:Click()

-- What to do nearby.
ns.UI:Open("nearby")
check(mascot.view.kind == "nearby" and mascot.wishBox:IsShown(), "nearby asks for an optional wish")
mascot.buttons.send:Click()
req = UnboredCharDB.request
check(reloads == 5 and req.type == "question" and req.topic == "nearby", "nearby sends a nearby question")
check(req.question == "What can I do nearby right now?", "nearby fills in the question")
ns.Session:CancelRequest()

-- What is this item: Alt+Right-click in bags shows it in the bubble.
altDown = true
hooks.HandleModifiedItemClick(HEARTH, {
  IsBagAndSlot = function()
    return true
  end,
  GetBagAndSlot = function()
    return 0, 3
  end,
})
altDown = false
check(mascot.view.kind == "item" and mascot.bubble:IsShown(), "Alt+Right-click shows the item in the bubble")
local shown = mascot.item
check(shown and shown.itemID == 6948 and shown.bag == 0 and shown.slot == 3, "the bag slot is kept")
check(shown.count == 1 and shown.name == "Hearthstone", "count and name are kept")
check(textOf(mascot.header) == HEARTH, "the bubble shows the item link")
check(textOf(mascot.message):find("inn", 1, true) ~= nil, "and what Wisp knows about it")
check(mascot.buttons.ask:IsShown() and mascot.buttons.back:IsShown(), "it can be asked about, or not")
check(reloads == 5, "the click hook never reloads")
mascot.buttons.ask:Click()
req = UnboredCharDB.request
check(reloads == 6 and req.type == "item" and req.item.itemID == 6948 and req.item.bag == 0, "item request saved")
check(mascot.view.kind == "waiting" and textOf(mascot.header) == HEARTH, "Wisp thinks about the item")

UnboredExternalPlan = {
  requestId = req.id,
  requestStatus = "fulfilled",
  requestType = "item",
  answer = { message = "Your Hearthstone. Set it at any inn.\nUse it often." },
}
check(ns.Session:AutoApplyExternal() == true, "the item answer is taken")
check(mascot.view.kind == "answer" and textOf(mascot.header) == HEARTH, "the answer shows the item link")
check(UnboredDB.itemNotes[6948].message:find("Set it at any inn", 1, true), "the item answer is remembered")
tooltipLines = {}
tooltipCalls[0](GameTooltip, { id = 6948 })
check(tooltipLines[1] and tooltipLines[1]:find("Wisp:", 1, true), "the tooltip line is from the mascot")
check(tooltipLines[1]:find("Set it at any inn", 1, true) and not tooltipLines[1]:find("often", 1, true),
  "the tooltip shows the first line of the answer")
mascot.buttons.ok:Click()

tooltipLines = {}
tooltipCalls[0](GameTooltip, { id = 1234 })
check(tooltipLines[1] and tooltipLines[1]:find("toy you don't have", 1, true), "an unowned toy is pointed out")
tooltipLines = {}
tooltipCalls[0](GameTooltip, { id = 555 })
check(tooltipLines[1] and tooltipLines[1]:find("mount you don't have", 1, true), "an unowned mount is pointed out")
tooltipLines = {}
tooltipCalls[0](GameTooltip, { id = 42 })
check(#tooltipLines == 0, "nothing is added when there is nothing to say")
tooltipCalls[0](mascot.frame, { id = 6948 })
check(#tooltipLines == 0, "other tooltips are left alone")

-- Dropping an item on the mascot.
cursor = { itemID = 6948, link = HEARTH }
mascot.frame:Click("LeftButton")
check(mascot.view.kind == "item" and mascot.item.itemID == 6948 and cleared == 1, "dropping an item on Wisp shows it")
check(mascot.item.bag == 0 and mascot.item.slot == 3, "a dropped item is found in the bags")
mascot.buttons.back:Click()
check(mascot.view.kind ~= "item", "Back leaves the item")

-- A failed request.
UnboredCharDB.request = { id = "req-x", type = "question", question = "?", createdAt = os.time() }
UnboredExternalPlan = { requestId = "req-x", requestStatus = "failed", requestReason = "Nothing nearby." }
ns.Session:NoteRequest()
ns.Session:RefreshUI()
check(mascot.view.kind == "failed" and textOf(mascot.sub) == "Nothing nearby.", "a failed request says why")
check(mascot.buttons.retry:IsShown() and mascot.buttons.ok:IsShown(), "with Try again and Got it")
local before = reloads
mascot.buttons.retry:Click()
check(reloads == before + 1 and UnboredCharDB.request.id ~= "req-x", "Try again sends it again and reloads")
check(UnboredCharDB.request.question == "?" and UnboredCharDB.request.type == "question", "the same question")
UnboredCharDB.request.id = "req-x"
ns.Session:NoteRequest()
ns.Session:RefreshUI()
mascot.buttons.ok:Click()
check(UnboredCharDB.request == nil and mascot.view.kind ~= "failed", "ok clears the failure")

-- Hide and bring back.
mascot.frame:Click("RightButton")
menuRow("Settings"):Click()
menuRow("Hide"):Click()
check(not mascot.frame:IsShown() and UnboredDB.mascot.hidden, "Hide hides the mascot")
check(printed[#printed]:find("minimap", 1, true) ~= nil, "hiding says how to get it back")
mascot:Toggle()
check(mascot.frame:IsShown(), "the minimap button brings it back")

UIParent.width = 1000
mascot.frame.GetLeft = function()
  return 900
end
mascot:Refresh()
check(mascot.bubble.points[1][1] == "TOPRIGHT", "near the right edge the bubble opens to the left")
mascot.frame.GetLeft = function()
  return 40
end
mascot:Refresh()
check(mascot.bubble.points[1][1] == "TOPLEFT", "otherwise it opens to the right")

-- The old slash commands still work.
SlashCmdList.UNBORED("")
check(mascot.view.kind == "choice" and mascot.bubble:IsShown(), "/unbored offers the presets")
SlashCmdList.UNBORED("30")
check(UnboredDB.budget == 30 and mascot.view.kind == "choice", "/unbored 30 picks the time")
check(mascot.Budget() == 30 and gold(mascot.timeChips[1]), "and the chip shows it")
SlashCmdList.UNBORED("quests")
check(UnboredDB.mode == "quests" and mascot.view.kind == "wish", "/unbored quests picks the mode, then the wish")
mascot.buttons.back:Click()
SlashCmdList.UNBORED("ask where to fish?")
check(mascot.view.kind == "ask" and textOf(mascot.wishEdit) == "where to fish?", "/unbored ask still asks")
ui:Open("wizard")
check(mascot.view.kind == "choice", "the old wizard opens the presets")
mascot.buttons.back:Click()
Unbored_Toggle()
check(mascot.view.kind == "choice", "the toggle key offers the presets")

-- No companion: a preset builds a plan in the game, no reload.
local reloadsBefore = reloads
local isLoaded = C_AddOns.IsAddOnLoaded
C_AddOns.IsAddOnLoaded = function()
  return false
end
UnboredExternalPlan = nil
mascot:ShowChoice()
mascot.chips[1]:Click()
check(reloads == reloadsBefore and UnboredCharDB.request == nil, "no companion: no request and no reload")
check(mascot.view.kind ~= "waiting", "no companion: nothing to wait for: " .. mascot.view.kind)
C_AddOns.IsAddOnLoaded = isLoaded

-- Every wait says why, in plain words, and never shows ids or raw errors.
local function bubbleText()
  return table.concat({ textOf(mascot.header), textOf(mascot.message), textOf(mascot.sub) }, " ")
end
local function askNow()
  ns.Session:CancelRequest()
  ns.Session:Ask({ type = "question", question = "Where is the bank?" })
  ns.Session:RefreshUI()
end
local now = os.time()
UnboredExternalPlan = nil
UnboredCompanionStatus = { v = 1, pairing = "pending", online = true, seenAt = now, addonVersion = ns.VERSION }
askNow()
check(mascot.view.kind == "waiting" and textOf(mascot.sub):find("one-time OK", 1, true), "waiting for approval is said")
check(not mascot.buttons.retry:IsShown() and mascot.buttons.load:IsShown(), "no Try again while pairing")
check(not bubbleText():find("req-", 1, true), "no request id in the bubble")
UnboredCompanionStatus.pairing = "revoked"
ns.Session:RefreshUI()
check(textOf(mascot.sub):find("disconnected", 1, true), "a revoked PC is said")
UnboredCompanionStatus.pairing = "approved"
UnboredCompanionStatus.online = false
ns.Session:RefreshUI()
check(textOf(mascot.sub):find("can't reach the planner", 1, true), "an unreachable planner is said")
UnboredCompanionStatus.online = true
UnboredCompanionStatus.seenAt = now - 20 * 60
ns.Session:RefreshUI()
check(textOf(mascot.sub):find("isn't running", 1, true), "a Companion that is not running is said")
UnboredCompanionStatus.seenAt = now
ns.Session:RefreshUI()
check(textOf(mascot.sub) == "Keep playing. When your PC says it's ready, press Load.", "all fine: keep playing")
check(mascot.art.texture:find("WispThinking", 1, true) ~= nil, "and Wisp thinks")

-- More than 10 minutes: Try again shows up by itself.
UnboredCharDB.request.createdAt = now - 11 * 60
ns.Events.Pulse()
check(textOf(mascot.sub):find("longer than usual", 1, true), "a slow request is said")
check(mascot.buttons.retry:IsShown() and mascot.buttons.cancel:IsShown(), "with Try again and Cancel")
before = reloads
local oldId = UnboredCharDB.request.id
mascot.buttons.retry:Click()
check(reloads == before + 1 and UnboredCharDB.request.id ~= oldId, "Try again sends a new request")
check(UnboredCharDB.request.question == "Where is the bank?", "with the same question")
check(not mascot.buttons.retry:IsShown(), "a fresh request is not slow")

-- A slow Full plan keeps the Quick plan going, with Try again next to Load.
ns.Session:CancelRequest()
mascot:ShowChoice()
mascot.chips[2]:Click()
UnboredCharDB.request.createdAt = now - 11 * 60
ns.Session:RefreshUI()
check(mascot.view.kind == "step" and textOf(mascot.header):find("longer than usual", 1, true), "slow over a Quick plan")
check(mascot.buttons.done:IsShown() and mascot.buttons.load:IsShown() and mascot.buttons.retry:IsShown(),
  "the step stays doable, with Load and Try again")
local rowRight = 0
for _, name in ipairs(mascot.view.buttons) do
  local button = mascot.buttons[name]
  local x = button.points[1][4] or 0
  rowRight = math.max(rowRight, x + button:GetWidth())
end
check(rowRight <= 260, "the button row fits the bubble: " .. rowRight)
ns.Session:CancelRequest()

-- The Companion put a newer addon on disk: Load applies it.
UnboredCompanionStatus.addonVersion = "9.9.9"
ns.Session:RefreshUI()
check(mascot.view.kind == "update" and textOf(mascot.message) == "I've been updated! Press Load to apply.",
  "an update waiting is said")
check(mascot.buttons.load:IsShown() and mascot.buttons.later:IsShown(), "Load or Later")
before = reloads
mascot.buttons.load:Click()
check(reloads == before + 1 and UnboredCharDB.updateTried == "9.9.9", "Load reloads and remembers the try")
ns.Session:RefreshUI()
check(mascot.view.kind == "update" and textOf(mascot.message):find("restart the game", 1, true),
  "still old after Load: restart the game once")
mascot.buttons.ok:Click()
check(mascot.view.kind ~= "update", "and it can be put away")
mascot.updateLater = nil
UnboredCompanionStatus.addonVersion = ns.VERSION
ns.Session:RefreshUI()
check(mascot.view.kind ~= "update", "the same version is no update")
check(ns.VersionNewer("0.10.0", "0.9.9") and not ns.VersionNewer("0.5.0", "0.5.0") and not ns.VersionNewer("", "1"),
  "versions compare by number")

-- Combat: Wisp steps aside and ignores clicks, then comes back.
local fighting = true
InCombatLockdown = function()
  return fighting
end
driver.scripts.OnEvent(driver, "PLAYER_REGEN_DISABLED")
check(not mascot.bubble:IsShown() and mascot.frame:IsShown() and mascot.frame.alpha == 0.5,
  "in combat: just a faded portrait")
ui.menu:Hide()
mascot.frame:Click("LeftButton")
check(not ui.menu:IsShown() and not mascot.bubble:IsShown(), "clicks wait until the fight is over")
fighting = false
driver.scripts.OnEvent(driver, "PLAYER_REGEN_ENABLED")
check(mascot.bubble:IsShown() and mascot.frame.alpha == 1, "after combat the bubble is back")
InCombatLockdown = nil

-- No companion: the item shows what Wisp knows, without an Ask button.
local loaded = C_AddOns.IsAddOnLoaded
C_AddOns.IsAddOnLoaded = function()
  return false
end
UnboredCompanionStatus = nil
mascot:ShowChoice()
mascot.chips[6]:Click()
check(#ns.Session.state.tasks == 0 and mascot.view.kind == "choice", "an empty Quick plan offers the presets")
check(textOf(mascot.message) == "I found nothing for that around here. Try another one?", "and says so")
ns.UI:OpenItem({ itemID = 6948, link = HEARTH })
check(mascot.view.kind == "item" and not mascot.buttons.ask:IsShown(), "no companion: no Ask")
check(textOf(mascot.sub) == "Questions need Unbored Companion on your PC.", "and says why")
mascot.buttons.back:Click()
C_AddOns.IsAddOnLoaded = loaded

-- A caught error: one friendly line, the details kept for the developer.
local lines = #printed
ns.ReportError("Interface/AddOns/Unbored/UI/Mascot.lua:1: boom")
ns.ReportError("again")
check(#printed == lines + 1 and printed[#printed]:find("tripped", 1, true), "one friendly line per session")
check(not printed[#printed]:find("Mascot.lua", 1, true), "no stack trace in chat")
check(#UnboredDB.errors == 2 and UnboredDB.errors[1].text:find("boom", 1, true), "the details are kept")
SlashCmdList.UNBORED("errors")
check(printed[#printed]:find("again", 1, true), "/unbored errors shows them")

-- The player profile is written when the game saves (logout or reload).
driver.scripts.OnEvent(driver, "PLAYER_ENTERING_WORLD", true, false)
driver.scripts.OnEvent(driver, "PLAYER_LOGOUT")
local profile = UnboredCharDB.profile
check(profile and profile.v == 1 and profile.character == "Hero" and profile.realm == "Area 52", "a profile is saved")
check(profile and profile.context and profile.context.mapID == 84, "the profile has the player context")
local hearth
for _, row in ipairs(profile and profile.bags or {}) do
  if row.itemID == 6948 then
    hearth = row.count
  end
end
check(hearth == 1, "the profile counts bag items")
check(profile and #profile.recentSteps >= 5 and profile.recentSteps[1].bucket, "the profile keeps recent steps")
check(profile and #profile.sessions >= 1 and profile.sessions[#profile.sessions].stop, "the profile keeps sessions")


if fails > 0 then
  io.stderr:write(fails .. " failed, " .. checks .. " checks\n")
  os.exit(1)
end
print(checks .. " UI checks passed")
