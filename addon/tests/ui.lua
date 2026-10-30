-- Drives Wisp (portrait, bubble, menu), tooltips, and the list view against a fake frame
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
    local was = self.shown
    self.shown = false
    if was and self.scripts.OnHide then
      self.scripts.OnHide(self)
    end
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
    -- Like the client: a string with a fixed height reports at most that.
    if self.height > 0 then
      return math.min(lines * LINE_HEIGHT, self.height)
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
local ITEMS = { [6948] = { name = "Hearthstone", quality = 1, classID = 15 } }
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


C_Item = {
  GetItemInfo = function(item)
    local id = tonumber(type(item) == "number" and item or tostring(item):match("item:(%d+)") or item)
    local row = ITEMS[id]
    if not row then
      return nil
    end
    return row.name, "|Hitem:" .. id .. "|h[" .. row.name .. "]|h", row.quality or 1, 10, 0, "", "", 1,
      row.equipLoc or "", 0, row.sellPrice or 0, row.classID or 15, row.subclassID or 0, row.bindType or 0,
      0, 0, row.isReagent or false
  end,
}
UnitClass = function()
  return "Warrior", "WARRIOR"
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
local mascot = ns.Mascot
local tracker = ns.Tracker
local INNER = 240
check(ui.frame == nil and _G.UnboredFrame == nil, "there is no main window, only Wisp")
check(mascot.frame ~= nil and mascot.frame:IsShown(), "the mascot is on screen from the start")
check(tooltipCalls[0] ~= nil, "item tooltips get a post call")
check(next(hooks) == nil, "no secure hooks: bag buttons and item clicks are left alone")

local function bubbleText()
  return table.concat({ textOf(mascot.header), textOf(mascot.message), textOf(mascot.sub), textOf(mascot.where) }, " ")
end
local function shownButtons()
  local out = {}
  for _, name in ipairs(mascot.view.buttons or {}) do
    if mascot.buttons[name]:IsShown() then
      out[#out + 1] = name
    end
  end
  return table.concat(out, ",")
end
-- Every row of actions stays inside the bubble.
local function rowFits(label)
  local right = 0
  for _, name in ipairs(mascot.view.buttons or {}) do
    local button = mascot.buttons[name]
    local x = button.points[1] and button.points[1][4] or 0
    right = math.max(right, x + button:GetWidth())
  end
  check(right <= 10 + INNER, label .. ": the action row fits: " .. right)
end

-- First run: the presets right in the bubble.
check(mascot.view.kind == "choice", "a fresh character gets the choice")
check(textOf(mascot.message) == "Hi! What shall we do?", "the greeting asks what to do")
check(mascot.bubble:IsShown(), "the greeting is open")
check(#mascot.chips == #ns.Data.Presets, "one chip per preset")
for i, button in ipairs(mascot.chips) do
  check(button:IsShown() and textOf(button.label) ~= "", "preset chip " .. i .. " is shown")
  check(button:GetWidth() == INNER and button:GetHeight() >= 26, "preset chip " .. i .. " spans the bubble")
end
check(textOf(mascot.chips[1].label) == "Stay here, do stuff nearby", "the first chip is Stay here")
check(mascot.otherChip:IsShown() and textOf(mascot.otherChip.label) == "Something else...", "Something else is there")
check(mascot.timeChips == nil and not mascot.minutesBox:IsShown(), "presets ask no time (docs/adr/0037)")
check(not mascot.buttons.done:IsShown(), "no step buttons in the greeting")
check(mascot.art.texture:find("WispIdle", 1, true) ~= nil, "idle portrait")
check(mascot.bubble.height > (#mascot.chips + 1) * 26, "the bubble fits all chips: " .. mascot.bubble.height)
check(textOf(mascot.meta) == "Wisp", "the top row says who is talking")
check(mascot.collapse:IsShown() ~= false and mascot.menuButton ~= nil, "collapse and menu icons on the top row")
check(not tracker.frame:IsShown(), "the list view is closed by default")

local ids = {}
for _, preset in ipairs(ns.Data.Presets) do
  ids[#ids + 1] = preset.id
  check(ns.MODE_IDS[preset.mode] and preset.mode ~= "custom", "preset " .. preset.id .. " has a real mode")
  check(ns.T(preset.label) ~= preset.label, "preset " .. preset.id .. " has a label")
end
check(table.concat(ids, ",") == "nearby,mount,collect,grind,gold,surprise", "the six presets")

-- Text is measured in full, also when it grows (docs/adr/0016).
local probe = mascot.sub
probe:SetText("short")
local short = ns.UI.Measure(probe, 100)
probe:SetText(string.rep("word ", 60))
local long = ns.UI.Measure(probe, 100)
check(long > short * 5, "a longer text measures taller after a short one: " .. short .. " -> " .. long)
probe:SetText("")
check(ns.UI.Measure(probe, 100) == 0, "an empty string measures 0")

-- The fallback menu (no MenuUtil).
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
mascot.frame:Click("RightButton")
check(ui.menu and ui.menu:IsShown(), "right click opens the menu")
check(menuLabels() == "New plan|What is this item?|Ask something|Settings", "no-plan menu: " .. menuLabels())
ui.menu:Hide()
mascot.menuButton:Click()
check(ui.menu:IsShown(), "the menu icon in the bubble opens it too")
ui.menu:Hide()

-- The game's menu: two sizes, Wisp and bubble apart.
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
check(table.concat(names, "|") == "Wisp size|Bubble size|Lock position|Share game data to make Wisp smarter"
  .. "|Wisp lines in tooltips|Hide|Keybinds|More",
  "Settings: " .. table.concat(names, "|"))
local wispSize = entry(settings.children, "Wisp size")
local bubbleSize = entry(settings.children, "Bubble size")
check(#wispSize.children == 4 and wispSize.children[2].isSelected(), "Wisp size: 100% by default")
entry(wispSize.children, "125%").setSelected()
check(mascot.frame.scale == 1.25 and UnboredDB.mascot.scale == 125, "Wisp size scales the portrait")
check(mascot.bubble.scale == 1, "and not the bubble")
entry(bubbleSize.children, "150%").setSelected()
check(mascot.bubble.scale == 1.5 and mascot.frame.scale == 1.25, "Bubble size scales the bubble alone")
mascot:SetScale(100)
mascot:SetBubbleScale(100)
check(mascot.frame.scale == 1 and mascot.bubble.scale == 1, "sizes back to 100%")
local lock = entry(settings.children, "Lock position")
lock.setSelected()
check(mascot:Locked(), "the lock checkbox locks the mascot")
mascot:SetLocked(false)
MenuUtil = nil

-- Collapsed: a "..." pill next to the portrait; a click on it brings the bubble back.
mascot.collapse:Click()
check(not mascot.bubble:IsShown() and mascot.pill:IsShown(), "collapsed: the portrait and a pill")
mascot.pill:Click("LeftButton")
check(mascot.bubble:IsShown() and not mascot.pill:IsShown(), "the pill brings the bubble back")

-- One click on a preset: a Quick plan at once, the Request saved, nothing reloads.
local realNow = ns.Now
local clock = realNow()
ns.Now = function()
  return clock
end
mascot.chips[2]:Click()
check(reloads == 0, "a preset click does not reload")
local req = UnboredCharDB.request
check(req and req.type == "plan" and req.mode == "farm" and req.topic == "mount", "the preset is sent with its mode")
check(req and req.budget == nil and not req.onDisk, "with no time budget, not on disk yet")
local quick = ns.Session.state
check(quick and quick.quick and quick.topic == "mount", "a Quick plan is built here")
check(mascot.view.kind == "step" and textOf(mascot.message) == ns.Session:Current().title, "Wisp shows the first step")
check(textOf(mascot.header) == "Your full plan comes after a refresh. The quick one is ready now.",
  "and offers one Refresh: " .. textOf(mascot.header))
check(shownButtons() == "done,skip,list,refresh,later", "Done, Skip, List, Refresh, Later: " .. shownButtons())
rowFits("quick plan with the offer")
check(textOf(mascot.meta):find("^1/") ~= nil, "progress sits small on the top row: " .. textOf(mascot.meta))

mascot.buttons.later:Click()
check(reloads == 0 and req.later == true, "Later remembers, no reload")
check(textOf(mascot.header) == "Quick plan for now. A better one is cooking.", "then just says it's cooking")
check(not mascot.buttons.refresh:IsShown(), "and the offer is not shown again")

local firstStep = ns.Session:Current().id
mascot.buttons.done:Click()
check(#quick.done == 1 and quick.done[1].id == firstStep, "a Quick plan step can be done")
check(textOf(mascot.header) == "Nice!", "Done gets a short lead line")
local echo1 = mascot.echoFrames[1]
check(echo1:IsShown() and textOf(echo1.text):find("Done: ", 1, true) == 1, "the done step echoes above the bubble")
check(echo1.points[1][2] == mascot.bubble, "it sits right above the bubble")
clock = clock + 10
ns.Events.Pulse()
check(textOf(mascot.header) ~= "Nice!", "the lead line goes away by itself")

-- Refresh from the menu while a Request is out: the one reload, from a click.
mascot.frame:Click("RightButton")
check(menuRow("Refresh now") ~= nil, "the menu offers Refresh while something is cooking")
menuRow("Refresh now"):Click()
check(reloads == 1, "Refresh now reloads from the click")

-- After the reload: the Request is on disk. No guess while the Companion
-- file does not name it; once it says "preparing", nothing for a while,
-- then one "New stuff is ready" guess.
ns.Session:MarkLoaded()
check(req.onDisk and ns.Session:RefreshOffer() == nil, "right after a load there is no offer")
ns.Session:RefreshUI()
check(not mascot.buttons.refresh:IsShown(), "no Refresh button yet")
clock = clock + ns.READY_GUESS_SECONDS + 1
ns.Events.Pulse()
check(not mascot.buttons.refresh:IsShown(), "no ready guess while the file does not name the request")
UnboredExternalPlan = { v = 1, kind = "plan", requestId = req.id, requestStatus = "pending" }
ns.Session:MarkLoaded()
ns.Session:NoteRequest()
check(ns.Session.requestNote == "preparing", "the file names the request as being prepared")
clock = clock + ns.READY_GUESS_SECONDS + 1
ns.Events.Pulse()
check(textOf(mascot.header) == "New stuff is ready. Refresh now?", "the ready guess comes once")
check(mascot.buttons.refresh:IsShown() and mascot.buttons.later:IsShown(), "with Refresh and Later")
mascot.buttons.later:Click()
check(ns.Session:RefreshOffer() == nil and not mascot.buttons.refresh:IsShown(), "Later puts it off")
check(reloads == 1, "nothing reloaded by itself")

-- The Full plan was in the file at the next load.
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
    { id = firstStep, title = "Already done in the Quick plan", estMinutes = 10 },
  },
}
check(ns.Session:AutoApplyExternal() == true, "the Full plan is taken on load")
ns.Session:RefreshUI()
check(mascot.view.kind == "offer" and textOf(mascot.message) == "Better plan's ready! Load it in?", "Wisp asks first")
check(mascot.buttons.use:IsShown() and mascot.buttons.keep:IsShown(), "Switch or keep")
rowFits("the plan offer")
mascot.buttons.use:Click()
check(ns.Session.state.source == "companion" and #ns.Session.state.tasks == 3, "Switch starts the Full plan")
check(mascot.view.kind == "step" and textOf(mascot.message):find("Fly to Dalaran", 1, true) == 1, "the step as written")
check(textOf(mascot.meta):find("2/4", 1, true) == 1, "small progress: " .. textOf(mascot.meta))
check(textOf(mascot.sub):find("never be cut", 1, true) and mascot.sub.height >= 4 * LINE_HEIGHT, "the note wraps")
check(mascot.message.height >= 2 * LINE_HEIGHT, "a long step wraps")
check(textOf(mascot.where):find("Point 1/2: Gate", 1, true), "the route point: " .. textOf(mascot.where))
check(mascot.bubble.height > mascot.sub.height + mascot.message.height, "the bubble grows with the text")
check(C_Map.pin and C_Map.pin.uiMapID == 84, "the current step is pinned")
check(shownButtons() == "done,skip,list", "a plain step: Done, Skip, List")

-- Welcome back on login.
ns.Session.welcomeBack = true
ns.Session:RefreshUI()
check(mascot.view.kind == "welcome" and textOf(mascot.message):find("Welcome back!", 1, true), "welcome back")
check(shownButtons() == "continue,new", "Continue or Something new")
mascot.buttons.continue:Click()
check(mascot.view.kind == "step", "Continue shows the step")

-- With a plan the menu is about the step first.
mascot.frame:Click("RightButton")
check(menuLabels() == "What next?|Skip this step|Show route on map|New plan|What is this item?|Ask something|Settings",
  "plan menu order: " .. menuLabels())
ui.menu:Hide()

mascot.buttons.list:Click()
check(tracker.frame:IsShown(), "the list opens from the List button")
check(textOf(tracker.sub):find("Step 2 of 4", 1, true) ~= nil, "the list shows the step count")
mascot.buttons.list:Click()
check(not tracker.frame:IsShown(), "and closes again")

mascot.buttons.skip:Click()
check(ns.Session:Current().id == "b" and textOf(mascot.header) == "Ok, next:", "Skip moves on with a lead line")
mascot.buttons.done:Click()
mascot.buttons.done:Click()
mascot.buttons.done:Click()
check(ns.Session:Current() == nil, "the plan can be finished")
check(#mascot.echoes == 2, "at most two older messages")
check(mascot.echoFrames[2].alpha < mascot.echoFrames[1].alpha, "the oldest fades most")
clock = clock + 120
ns.Events.Pulse()
check(#mascot.echoes == 0, "older messages go away by themselves")
check(mascot.view.kind == "choice" and textOf(mascot.message) == "All done, nice work! What next?", "it celebrates")

-- Something else...: one free-text box.
mascot.otherChip:Click()
check(mascot.view.kind == "wish" and mascot.wishBox:IsShown(), "Something else opens the wish box")
check(mascot.minutesBox:IsShown() and textOf(mascot.minutesEdit) == "", "with an empty, optional minutes box")
check(textOf(mascot.minutesBox.placeholder) == "Minutes, only if you have a limit", "that says it is optional")
mascot.buttons.send:Click()
check(textOf(mascot.sub) == "Type a few words first.", "an empty wish is not sent")
mascot.wishEdit:SetText("mount, no raids")
mascot.buttons.send:Click()
req = UnboredCharDB.request
check(reloads == 1, "Send does not reload")
check(req and req.type == "plan" and req.wish == "mount, no raids", "the wish is sent as written")
check(req.budget == nil, "an empty minutes box sends no budget")
check(UnboredCharDB.lastWish == "mount, no raids", "the wish is remembered")
ns.Session:CancelRequest()
mascot.otherChip:Click()
mascot.wishEdit:SetText("all of Hallowfall's exploration")
mascot.minutesEdit:SetText("300")
mascot.buttons.send:Click()
check(textOf(mascot.sub) == "Minutes: a whole number from 5 to 240, or leave it empty.", "bad minutes are not sent")
mascot.minutesEdit:SetText("45")
mascot.buttons.send:Click()
req = UnboredCharDB.request
check(req and req.budget == 45 and req.wish == "all of Hallowfall's exploration", "typed minutes go with the wish")
check(textOf(mascot.minutesEdit) == "", "and the minutes box starts empty again")
ns.Session:CancelRequest()

-- Ask: the local answer at once, the fuller one after a refresh (docs/adr/0014).
mascot.frame:Click("RightButton")
menuRow("Ask something"):Click()
check(mascot.view.kind == "ask" and mascot.wishBox:IsShown(), "Ask is one box in the bubble")
check(textOf(mascot.wishBox.placeholder) == "e.g. where can I get a flying mount?", "with its own hint")
mascot.buttons.send:Click()
check(textOf(mascot.sub) == "Type your question first.", "an empty question is not sent")
mascot.wishEdit:SetText("What can I do nearby?")
mascot.buttons.send:Click()
req = UnboredCharDB.request
check(reloads == 1, "asking does not reload")
check(req and req.type == "question" and req.question == "What can I do nearby?" and req.lang == "en",
  "the question goes to the Planner too")
local answer = UnboredCharDB.answer
check(answer and answer.isLocal and answer.intent == "here" and answer.requestId == req.id, "a local answer at once")
check(mascot.view.kind == "answer" and textOf(mascot.header):find("nearby", 1, true), "the bubble shows it")
check(textOf(mascot.sub) == "I'll have a fuller answer after a refresh.", "and says once a fuller one comes")
check(mascot.buttons.refresh:IsShown() and mascot.buttons.later:IsShown(), "with Refresh and Later")
rowFits("a local answer")
mascot.buttons.later:Click()
check(textOf(mascot.sub) == "Okay! It'll be here next time you log in.", "Later is fine")
check(mascot.buttons.ok:IsShown() and not mascot.buttons.refresh:IsShown(), "and the answer can be put away")
mascot.buttons.ok:Click()
check(mascot.view.kind ~= "answer", "Got it closes the answer")

-- A question Wisp cannot answer here.
mascot:ShowAsk("ask", "Why is the sky blue?")
mascot.buttons.send:Click()
check(textOf(mascot.message) == "Good question! I passed it to the planner.", "unknown: passed on")

-- A Russian question gets Russian lines.
mascot:ShowAsk("ask", "Что делать рядом?")
mascot.buttons.send:Click()
req = UnboredCharDB.request
check(req.lang == "ru" and UnboredCharDB.answer.intent == "here", "the Russian question is understood")
check(textOf(mascot.message):find("[\208\209]") ~= nil, "the answer is in Russian: " .. textOf(mascot.message))
check(textOf(mascot.sub) == "Полный ответ будет после обновления.", "and the offer too")

-- The Planner's answer was in the file at the next load: up to three bubbles.
UnboredCharDB.answer.seen = true
ns.Session:MarkLoaded()
UnboredExternalPlan = {
  requestId = req.id,
  requestStatus = "fulfilled",
  requestType = "question",
  answer = {
    message = "First part.\n\nSecond part.\n\nThird part " .. string.rep("goes on and on. ", 10),
    waypoints = { { mapID = 84, x = 0.5, y = 0.5, label = "Rare" } },
  },
}
check(ns.Session:AutoApplyExternal() == true, "an answer is taken on load")
ns.Session:RefreshUI()
check(UnboredCharDB.request == nil and mascot.view.kind == "answer", "the bubble shows the answer")
check(textOf(mascot.message):find("Third part", 1, true) == 1, "the last part in the bubble")
check(#mascot.echoes >= 2 and textOf(mascot.echoFrames[1].text) == "Second part.", "earlier parts above it")
check(mascot.message.height >= 3 * LINE_HEIGHT, "a long answer wraps")
check(ns.Session:Current() and ns.Session:Current().title == "Rare", "waypoints in an answer become a step")
check(ns.Session:AutoApplyExternal() == false, "the same answer is not taken twice")
mascot.buttons.ok:Click()
mascot.buttons.done:Click()
clock = clock + 200
ns.Events.Pulse()

-- Items: pick mode from the menu, Esc leaves it.
mascot.frame:Click("RightButton")
menuRow("What is this item?"):Click()
check(mascot.picking and mascot.catcher:IsShown() and mascot.view.kind == "item", "pick mode starts")
check(textOf(mascot.message) == ns.T("ITEM_TITLE"), "and says what it waits for")
local escapes = false
for _, name in ipairs(UISpecialFrames) do
  escapes = escapes or name == "UnboredPickCatcher"
end
check(escapes, "Esc ends pick mode")
mascot.catcher:Hide()
check(not mascot.picking and mascot.view.kind ~= "item", "Esc leaves pick mode")

-- Pick mode, then the player picks up an item: read and put back.
mascot:StartPick()
cursor = { itemID = 6948, link = HEARTH }
driver.scripts.OnEvent(driver, "CURSOR_CHANGED")
check(cursor == nil and cleared == 1, "the picked item goes back to the bag")
check(mascot.view.kind == "item" and mascot.item.itemID == 6948, "and Wisp shows it")
check(mascot.item.bag == 0 and mascot.item.slot == 3 and mascot.item.count == 1, "the bag slot is found")
check(textOf(mascot.header) == HEARTH, "the bubble shows the item link")
check(textOf(mascot.message):find("inn", 1, true) ~= nil, "and what Wisp knows about it")
check(shownButtons() == "ask,back", "it can be asked about, or not")
mascot.buttons.ask:Click()
req = UnboredCharDB.request
check(reloads == 1 and req.type == "item" and req.item.itemID == 6948 and req.item.bag == 0, "item request saved")
check(textOf(mascot.sub) == "I'll have a fuller answer after a refresh.", "the item says a refresh brings more")
mascot.buttons.back:Click()
ns.Session:CancelRequest()

-- The drop hint shows while an item is on the cursor, until it has been learned.
UnboredDB.dropsTaught = 0
cursor = { itemID = 6948, link = HEARTH }
driver.scripts.OnEvent(driver, "CURSOR_CHANGED")
check(mascot.dropHint:IsShown() and textOf(mascot.dropHint) == "Drop it on me to ask", "the drop hint shows")
mascot.frame.scripts.OnReceiveDrag(mascot.frame)
check(mascot.view.kind == "item" and not mascot.dropHint:IsShown(), "dropping an item on Wisp shows it")
mascot.buttons.back:Click()
UnboredDB.dropsTaught = 3
cursor = { itemID = 6948, link = HEARTH }
driver.scripts.OnEvent(driver, "CURSOR_CHANGED")
check(not mascot.dropHint:IsShown(), "after a few drops the hint stops")
mascot.bubble.scripts.OnMouseUp(mascot.bubble)
check(mascot.view.kind == "item", "dropping on the bubble works too")
mascot.buttons.back:Click()

-- An item Wisp knows nothing about goes to the Planner at once.
mascot:ShowItem({ itemID = 4242, link = "|Hitem:4242|h[Odd Thing]|h" })
check(UnboredCharDB.request and UnboredCharDB.request.type == "item", "an unknown item is asked at once")
check(textOf(mascot.message) ~= "" and textOf(mascot.sub) == "I'll have a fuller answer after a refresh.",
  "Wisp says a fuller answer comes")
mascot.buttons.back:Click()
ns.Session:CancelRequest()

-- Tooltip Advice (docs/adr/0019): one teal line, first match wins.
ITEMS[1234] = { name = "Silly toy", quality = 1 }
ITEMS[555] = { name = "Sky Wisp Reins", quality = 3, classID = 15, subclassID = 5 }
ITEMS[900] = { name = "Broken Fang", quality = 0, sellPrice = 50 }
ITEMS[901] = { name = "Peacebloom", quality = 1, classID = 7, subclassID = 9, isReagent = true }
ITEMS[902] = { name = "Weird Rock", quality = 1, classID = 15 }
ITEMS[903] = { name = "Shiny Epic", quality = 4, classID = 15 }
local function tip(id, owner)
  tooltipLines = {}
  tooltipCalls[0](owner or GameTooltip, { id = id })
  return tooltipLines[1] or "", tooltipLines[2]
end
check(tip(1234):find("Wisp:", 1, true) and tip(1234):find("new toy", 1, true), "a toy: " .. tip(1234))
check(tip(555):find("learn Sky Wisp", 1, true), "a mount: " .. tip(555))
check(tip(900):find("Junk: sell it", 1, true), "junk: " .. tip(900))
check(tip(901):find("Not for your professions", 1, true), "a reagent nobody uses: " .. tip(901))
UnboredDB.alts = {
  ["Area 52-Alty"] = {
    name = "Alty",
    realm = "Area 52",
    faction = "Alliance",
    seenAt = 1,
    professions = { { skillLine = 171, name = "Alchemy", skill = 50 } },
  },
}
check(tip(901):find("Send to Alty (Alchemy): mail it", 1, true), "a reagent for an Alt: " .. tip(901))
UnboredDB.alts["Area 52-Alty"].realm = "Stormrage"
check(tip(901):find("warband bank", 1, true), "another realm: the warband bank")
check(tip(902):find("Drop on Wisp to ask", 1, true), "unknown, with the Companion: drop to ask")
local profile = UnboredCharDB.profile
local logged = false
for _, id in ipairs(profile and profile.unmatchedItems or {}) do
  logged = logged or (type(id) == "table" and id.itemID or id) == 902
end
check(logged, "an unmatched item is logged to grow the rules")
check(tip(42) == "", "nothing until the game has the item")
check(tip(1234, mascot.frame) == "", "other tooltips are left alone")
UnboredAdvice = {
  characters = {
    ["Area 52-Hero"] = {
      items = {
        [902] = { line = "Keep it: the Planner says a quest wants it", action = "keep" },
        [903] = { line = "Sell it to a vendor", action = "sell" },
        [900] = { line = "Delete this", action = "info" },
      },
    },
  },
}
check(tip(902):find("the Planner says", 1, true), "Personal advice from the Companion")
check(not tip(903):find("vendor", 1, true), "never sell an epic, even if told")
check(tip(900):find("Junk: sell it", 1, true), "an unsafe line is dropped")
UnboredAdvice = nil

-- A failed Request: Wisp's words for each Reason code, never raw text.
local function fail(code, reason)
  UnboredCharDB.request = { id = "req-x", type = "question", question = "?", createdAt = clock, onDisk = true }
  UnboredExternalPlan = { requestId = "req-x", requestStatus = "failed", requestReason = reason,
    requestReasonCode = code }
  ns.Session:NoteRequest()
  ns.Session:RefreshUI()
end
fail("planner_failed", "Nothing nearby.")
check(mascot.view.kind == "failed" and textOf(mascot.sub) == "Nothing nearby.", "the Planner's own reason is shown")
check(shownButtons() == "retry,ok", "with Try again and Got it")
fail("rejected", "HTTP 400 bad body")
check(textOf(mascot.sub):find("another way", 1, true) and not bubbleText():find("HTTP", 1, true),
  "rejected: no raw error")
fail("not_approved", "403")
check(textOf(mascot.sub):find("one-time OK", 1, true), "not approved: pairing")
fail("server_unreachable", "ECONNREFUSED")
check(textOf(mascot.sub):find("can't reach the planner", 1, true), "unreachable")
fail("weird_code", "stack trace")
check(textOf(mascot.sub) == "Something went wrong on my side. Try again?", "anything else: one plain line")
mascot.buttons.retry:Click()
check(reloads == 1 and UnboredCharDB.request.id ~= "req-x", "Try again sends it again, no reload")
UnboredCharDB.request.id = "req-x"
ns.Session:NoteRequest()
ns.Session:RefreshUI()
mascot.buttons.ok:Click()
check(UnboredCharDB.request == nil and mascot.view.kind ~= "failed", "Got it clears the failure")

-- Every wait says why, in plain words. The Companion's state is judged at the load.
UnboredExternalPlan = nil
ns.Session:MarkLoaded()
local function waitFor(status)
  UnboredCompanionStatus = status
  ns.Session:CancelRequest()
  ns.Session:Ask({ type = "question", question = "Where is the bank?" })
  UnboredCharDB.request.onDisk = true
  ns.Session:RefreshUI()
end
waitFor({ v = 1, pairing = "pending", online = true, seenAt = clock })
check(textOf(mascot.sub):find("one-time OK", 1, true), "waiting for approval is said")
check(not bubbleText():find("req-", 1, true), "no request id in the bubble")
waitFor({ v = 1, pairing = "revoked", online = true, seenAt = clock })
check(textOf(mascot.sub):find("disconnected", 1, true), "a revoked PC is said")
waitFor({ v = 1, pairing = "approved", online = false, seenAt = clock })
check(textOf(mascot.sub):find("can't reach the planner", 1, true), "an unreachable planner is said")
waitFor({ v = 1, pairing = "approved", online = true, seenAt = ns.Session.loadedAt - 20 * 60 })
check(textOf(mascot.sub):find("isn't running", 1, true), "a Companion that was not running at load is said")
waitFor({ v = 1, pairing = "approved", online = true, seenAt = ns.Session.loadedAt })
clock = clock + 60 * 60
ns.Events.Pulse()
check(not textOf(mascot.sub):find("isn't running", 1, true), "a long session alone does not mean it stopped")
clock = clock - 60 * 60
ns.Session:RefreshUI()
check(textOf(mascot.sub) == "Working on it in the background. It shows up when you next log in.", "all fine: quiet")
check(mascot.art.texture:find("WispThinking", 1, true) ~= nil, "and Wisp thinks")
UnboredCharDB.request.createdAt = ns.Session.loadedAt - 11 * 60
ns.Session:RefreshUI()
check(textOf(mascot.sub):find("taking long", 1, true), "a slow request is said")
check(shownButtons() == "retry,cancel", "with Try again and Cancel")
mascot.buttons.cancel:Click()
check(UnboredCharDB.request == nil, "Cancel drops it")

-- The Companion put a newer addon on disk: Load applies it.
UnboredCompanionStatus.addonVersion = "9.9.9"
ns.Session:RefreshUI()
check(mascot.view.kind == "update" and shownButtons() == "load,later", "an update waiting: Load or Later")
mascot.buttons.load:Click()
check(reloads == 2 and UnboredCharDB.updateTried == "9.9.9", "Load reloads and remembers the try")
ns.Session:RefreshUI()
check(textOf(mascot.message):find("restart the game", 1, true), "still old after Load: restart once")
mascot.buttons.ok:Click()
check(mascot.view.kind ~= "update", "and it can be put away")
UnboredCompanionStatus.addonVersion = ns.VERSION
mascot.updateLater = nil
check(ns.VersionNewer("0.10.0", "0.9.9") and not ns.VersionNewer("0.6.0", "0.6.0"), "versions compare by number")

-- Combat: Wisp steps aside and ignores clicks.
local fighting = true
InCombatLockdown = function()
  return fighting
end
driver.scripts.OnEvent(driver, "PLAYER_REGEN_DISABLED")
check(not mascot.bubble:IsShown() and mascot.frame.alpha == 0.5, "in combat: just a faded portrait")
check(tip(1234) == "", "no tooltip lines in combat")
fighting = false
driver.scripts.OnEvent(driver, "PLAYER_REGEN_ENABLED")
check(mascot.bubble:IsShown() and mascot.frame.alpha == 1, "after combat the bubble is back")
InCombatLockdown = nil

-- No Companion: local answers only, never a wait.
local loaded = C_AddOns.IsAddOnLoaded
C_AddOns.IsAddOnLoaded = function()
  return false
end
UnboredExternalPlan = nil
UnboredCompanionStatus = nil
mascot:ShowChoice()
mascot.chips[1]:Click()
check(UnboredCharDB.request == nil and mascot.view.kind ~= "waiting", "no Companion: a preset makes no Request")
mascot:ShowAsk("ask", "Why is the sky blue?")
mascot.buttons.send:Click()
check(UnboredCharDB.request == nil and textOf(mascot.message):find("Unbored Companion", 1, true),
  "no Companion: Wisp says the planner needs it")
check(not mascot.buttons.refresh:IsShown(), "and offers no Refresh")
mascot.buttons.ok:Click()
check(tip(902) == "", "no Companion: no drop-to-ask line")
ns.UI:OpenItem({ itemID = 6948, link = HEARTH })
check(mascot.view.kind == "item" and not mascot.buttons.ask:IsShown(), "no Companion: no Ask on an item")
check(textOf(mascot.sub) == "Questions need Unbored Companion on your PC.", "and says why")
mascot.buttons.back:Click()
C_AddOns.IsAddOnLoaded = loaded

-- The bubble opens toward the middle of the screen.
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

-- Hide and bring back.
mascot:Hide()
check(not mascot.frame:IsShown() and UnboredDB.mascot.hidden, "Hide hides the mascot")
check(printed[#printed]:find("minimap", 1, true) ~= nil, "hiding says how to get it back")
mascot:ToggleShown()
check(mascot.frame:IsShown(), "the minimap button brings it back")

-- The old slash commands still work.
SlashCmdList.UNBORED("")
check(mascot.view.kind == "choice" and mascot.bubble:IsShown(), "/unbored offers the presets")
SlashCmdList.UNBORED("ask where to fish?")
check(mascot.view.kind == "ask" and textOf(mascot.wishEdit) == "where to fish?", "/unbored ask still asks")
Unbored_Toggle()
check(mascot.view.kind == "choice", "the toggle key offers the presets")

-- A caught error: one friendly line, the details kept.
local lines = #printed
ns.ReportError("Interface/AddOns/Unbored/UI/Mascot.lua:1: boom")
ns.ReportError("again")
check(#printed == lines + 1 and not printed[#printed]:find("Mascot.lua", 1, true), "one friendly line, no trace")
check(#UnboredDB.errors == 2, "the details are kept")

-- The profile is kept current and saved with the game.
driver.scripts.OnEvent(driver, "PLAYER_LOGOUT")
profile = UnboredCharDB.profile
check(profile and profile.character == "Hero" and profile.realm == "Area 52", "a profile is saved")
check(profile and profile.context and profile.context.mapID == 84, "the profile has the player context")

check(reloads == 2, "only the two Refresh/Load clicks ever reloaded: " .. reloads)
ns.Now = realNow

if fails > 0 then
  io.stderr:write(fails .. " failed, " .. checks .. " checks\n")
  os.exit(1)
end
print(checks .. " UI checks passed")
