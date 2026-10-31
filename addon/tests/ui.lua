-- Drives Bory (portrait, bubble, menu), tooltips, and the list view against a fake frame
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
  CreateTexture = function(self, _, layer)
    local texture = newWidget("Texture", nil, self)
    texture.layer = layer
    return texture
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
    self.stopped = true
  end,
  -- Like the client: the loop runs out, then OnFinished fires.
  Finish = function(self)
    self.playing = false
    self.finished = true
    if self.scripts.OnFinished then
      self.scripts.OnFinished(self)
    end
  end,
  SetTexture = function(self, texture)
    self.texture = texture
  end,
  SetRotation = function(self, radians)
    self.rotation = radians
  end,
  SetTexCoord = function(self, ...)
    self.texCoord = { ... }
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
local mapOpened
OpenWorldMap = function(id)
  mapOpened = id
end
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
local INNER = 240
local CARD_INNER = 280
check(ns.Tracker == nil and _G.UnboredTracker == nil, "there is no separate steps window (D90)")
check(ui.frame == nil and _G.UnboredFrame == nil, "there is no main window, only Bory")
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
  local inner = mascot.view.card and CARD_INNER or INNER
  check(right <= 10 + inner, label .. ": the action row fits: " .. right)
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
check(mascot.otherChip == nil and mascot.wishBox == nil and mascot.minutesBox == nil and mascot.wishEdit == nil,
  "no Something else, no wish box, no minutes box: nothing to type (D122)")
check(ns.Mascot.ShowAsk == nil and ns.Mascot.ShowWish == nil and ns.Mascot.SendAsk == nil, "no Ask view (D122)")
for _, key in ipairs({ "MENU_ASK", "ASK_TITLE", "ASK_HINT", "PRESET_OTHER", "WISH_TITLE", "WISH_HINT",
  "WISH_MINUTES_HINT", "SURVEY_TITLE", "SURVEY_HINT", "NEARBY_TITLE", "MAKE_PLAN" }) do
  check(ns.Locales.en[key] == nil and ns.Locales.ru[key] == nil, "no " .. key .. " string left")
end
check(not mascot.buttons.done:IsShown(), "no step buttons in the greeting")
check(mascot.art.texture:find("BoryIdle128", 1, true) ~= nil, "idle portrait")
check(mascot.back.layer == "BACKGROUND" and mascot.back.texture:find("BoryBack128", 1, true) ~= nil,
  "a disc behind Bory")
check(mascot.art.layer == "ARTWORK" and mascot.ring.layer == "OVERLAY"
  and mascot.ring.texture:find("BoryFrame128", 1, true) ~= nil, "the gold ring sits on top of the art")
check(mascot.art.parent == mascot.holder and mascot.ring.parent == mascot.holder
  and mascot.float.parent == mascot.holder,
  "the bob moves art and ring together, so the ring never slides")
check(mascot.bubble.height > (#mascot.chips + 1) * 26, "the bubble fits all chips: " .. mascot.bubble.height)
check(textOf(mascot.meta) == "Bory", "the top row says who is talking")
check(mascot.collapse:IsShown() ~= false and mascot.menuButton ~= nil, "collapse and menu icons on the top row")
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
check(menuLabels() == "New plan|What is this item?|Settings", "no-plan menu, no Ask: " .. menuLabels())
ui.menu:Hide()
mascot.menuButton:Click()
check(ui.menu:IsShown(), "the menu icon in the bubble opens it too")
ui.menu:Hide()

-- The game's menu: two sizes, Bory and bubble apart.
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
check(made[1] and made[1].title == "Bory", "the game menu has the mascot as title")
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
check(table.concat(names, "|") == "Bory size|Bubble size|Lock position|Share game data to make Bory smarter"
  .. "|Bory lines in tooltips|Hide|Keybinds|More",
  "Settings: " .. table.concat(names, "|"))
local borySize = entry(settings.children, "Bory size")
local bubbleSize = entry(settings.children, "Bubble size")
check(#borySize.children == 4 and borySize.children[2].isSelected(), "Bory size: 100% by default")
entry(borySize.children, "125%").setSelected()
check(mascot.frame.scale == 1.25 and UnboredDB.mascot.scale == 125, "Bory size scales the portrait")
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

-- One click on a preset: a Quick plan at once, nothing sent, nothing reloads (D65).
local realNow = ns.Now
local clock = realNow()
ns.Now = function()
  return clock
end
mascot.chips[2]:Click()
check(reloads == 0, "a preset click does not reload")
check(ns.Session:PendingRequest() == nil and ns.Session:FlowState() == "quick", "nothing is sent yet")
local quick = ns.Session.state
check(quick and quick.quick and quick.topic == "mount", "a Quick plan is built here")
check(mascot.view.kind == "step" and textOf(mascot.message) == ns.Session:Current().title, "Bory shows the first step")
check(textOf(mascot.header) == "", "no Refresh talk over the Quick plan: " .. textOf(mascot.header))
check(shownButtons() == "done,skip,proper", "Done, Skip and one proper-plan button: " .. shownButtons())
check(textOf(mascot.buttons.proper.label) == "Want a proper plan?", "the button asks")
rowFits("quick plan with the proper-plan button")
check(mascot.view.card and mascot.bubble.width == CARD_INNER + 20,
  "a Step is one 300 px card (D92): " .. mascot.bubble.width)
check(textOf(mascot.title) == "Get a mount", "the Quick plan is named after its preset: " .. textOf(mascot.title))
check(mascot.view.pips == nil or mascot.view.pips.done == 0, "no step done yet")

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

-- Want a proper plan? -> Confirm at once: nothing to type, no time (D122, D125).
mascot.buttons.proper:Click()
check(mascot.view.kind == "confirm" and textOf(mascot.message) == "Shall I send this to the planner?", "Confirm")
check(textOf(mascot.header) == "Get a mount", "it says what the plan is for: " .. textOf(mascot.header))
check(shownButtons() == "sendnow,back", "one primary action: Send now (D85): " .. shownButtons())
mascot.buttons.back:Click()
check(ns.Session:FlowState() == "quick" and mascot.view.kind == "step", "Back returns to the Quick plan")
mascot.buttons.proper:Click()
rowFits("confirm")
check(reloads == 0, "still nothing reloaded")
mascot.buttons.sendnow:Click()
local req = UnboredCharDB.request
check(reloads == 1, "Send now reloads in the click")
check(req and req.type == "plan" and req.mode == "farm" and req.topic == "mount" and req.state == "sent",
  "the preset is sent with its mode")
check(req.budget == nil and req.custom == nil, "with no time budget and nothing typed")

-- After the reload: waiting, locked, the Quick plan still doable (D67).
ns.Session:MarkLoaded()
ns.Session:RefreshUI()
check(req.onDisk and req.state == "waiting" and ns.Session:Locked(), "after the reload it waits, locked")
check(mascot.view.kind == "step" and textOf(mascot.header):find("I'm on it", 1, true), "the step with the wait line")
check(shownButtons() == "done,skip", "the step stays doable: " .. shownButtons())
mascot:ShowChoice()
check(mascot.view.kind ~= "choice" and textOf(mascot.echoFrames[1].text) == "One thing at a time, I'm still thinking.",
  "no presets while waiting")
mascot.frame:Click("RightButton")
check(menuRow("Cancel my request") ~= nil and menuRow("Refresh now") ~= nil, "Cancel and Refresh live in the menu")
ui.menu:Hide()
clock = clock + 15 * 60
ns.Events.Pulse()
check(not mascot.buttons.refresh:IsShown(), "no ETA offer while the file does not name the request")
clock = clock - 15 * 60
UnboredExternalPlan = { v = 1, kind = "plan", requestId = req.id, requestStatus = "pending", eta = 300 }
ns.Session:NoteRequest()
ns.Session:RefreshUI()
check(not mascot.buttons.refresh:IsShown(), "before the ETA: just the wait")
clock = req.sentAt + 301
ns.Events.Pulse()
check(textOf(mascot.header) == "Should be ready. Refresh?", "after the ETA: one Refresh offer")
check(shownButtons() == "done,skip,refresh", "with Refresh: " .. shownButtons())
mascot.buttons.refresh:Click()
check(reloads == 2 and req.checks == 1, "Refresh reloads from the click")
ns.Session:MarkLoaded()
ns.Session:RefreshUI()
check(textOf(mascot.header) == "Almost. Give me a couple more minutes.", "still pending: almost")

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
  title = "Ride to Dalaran",
  goal = "Get to Dalaran and set your hearth there",
  details = "You are level 80.\n\nThe portal room is upstairs.",
  rewards = { "{item:6948|Hearthstone}" },
  tasks = {
    {
      id = "a",
      title = "Fly to Dalaran. Portal is next to you in Orgrimmar, then keep riding along the long coast road",
      why = "Dalaran has the portal you need",
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
check(mascot.view.kind == "offer" and textOf(mascot.message) == "Better plan's ready! Load it in?", "Bory asks first")
check(mascot.buttons.use:IsShown() and mascot.buttons.keep:IsShown(), "Switch or keep")
rowFits("the plan offer")
mascot.buttons.use:Click()
check(ns.Session.state.source == "companion" and #ns.Session.state.tasks == 3, "Switch starts the Full plan")
check(mascot.view.kind == "step" and textOf(mascot.message):find("Fly to Dalaran", 1, true) == 1, "the step as written")
check(textOf(mascot.title) == "Ride to Dalaran", "the card is titled by the plan: " .. textOf(mascot.title))
-- Closed by default (casual first): title, what to do, why, the main reward, Done and Skip.
check(not ns.Mascot.CardOpen(), "the card starts closed")
check(textOf(mascot.why) == "Dalaran has the portal you need", "the Step says why")
check(mascot.message.height >= 2 * LINE_HEIGHT, "a long step wraps")
check(mascot.rewardLines[1]:IsShown() and textOf(mascot.rewardLines[1]):find("Hearthstone", 1, true)
  and not mascot.rewardsHeader:IsShown(), "closed: the main reward, no header: " .. textOf(mascot.rewardLines[1]))
for _, region in ipairs({ "pipRow", "goal", "details", "list", "where" }) do
  check(not mascot[region]:IsShown(), "closed: no " .. region)
end
check(mascot.cardToggle:IsShown() and textOf(mascot.cardToggle.label) == "Show more", "one Show more toggle")
check(mascot.cardToggle.chevron.rotation == math.pi / 2, "closed: the chevron points down (D166)")
check(mascot.collapse.icon.rotation == -math.pi / 2, "the collapse icon points up: fold it up (D166)")
local function shownRegions()
  local out = {}
  for _, name in ipairs({ "meta", "header", "title", "condition", "message", "why", "sub", "where", "goal",
    "details", "pipRow", "list", "rewardsHeader", "cardToggle" }) do
    if mascot[name]:IsShown() then
      out[#out + 1] = name
    end
  end
  for i = 1, #mascot.rewardLines do
    if mascot.rewardLines[i]:IsShown() then
      out[#out + 1] = "reward" .. i
    end
  end
  return table.concat(out, ",")
end
local closedRegions = shownRegions()
check(C_Map.pin and C_Map.pin.uiMapID == 84, "the current step is pinned")
check(shownButtons() == "done,skip", "a plain step: Done and Skip")
rowFits("a step card")
local closedHeight = mascot.bubble.height

mascot.cardToggle:Click()
check(ns.Mascot.CardOpen() and UnboredDB.mascot.cardOpen == true, "Show more opens the card and is remembered")
check(textOf(mascot.cardToggle.label) == "Show less", "the toggle now says Show less")
check(mascot.view.pips and mascot.view.pips.done == 1 and mascot.view.pips.total == 4, "open: the pips, 1 of 4 done")
check(mascot.pipRow:IsShown(), "the pip row is on the card")
check(textOf(mascot.goal) == "Get to Dalaran and set your hearth there", "open: the goal")
check(mascot.details:IsShown() and textOf(mascot.details):find("portal room", 1, true), "open: the plan details")
check(textOf(mascot.details):find("never be cut", 1, true) and mascot.details.height >= 4 * LINE_HEIGHT,
  "the Step note is in Details and wraps")
check(mascot.rewardsHeader:IsShown() and textOf(mascot.rewardLines[1]):find("Hearthstone", 1, true),
  "open: the rewards with their header")
check(textOf(mascot.where):find("Point 1/2: Gate", 1, true), "open: the route point: " .. textOf(mascot.where))
check(not textOf(mascot.where):find("~", 1, true), "the footer has no ~: " .. textOf(mascot.where))
local rowCount = 0
for _, row in ipairs(mascot.list.rows or {}) do
  if row:IsShown() then
    rowCount = rowCount + 1
  end
end
check(mascot.list:IsShown() and rowCount == 4, "open: every step is a row, the done one too: " .. rowCount)
check(mascot.list.height <= 260, "the list scrolls past its cap")
check(mascot.bubble.height > closedHeight, "the open card is taller")
mascot.list.rows[3]:Click()
check(mascot.view.all[3].detail == "second note", "a click on a later step shows its note")
mascot.cardToggle:Click()
check(not ns.Mascot.CardOpen() and not mascot.list:IsShown() and mascot.bubble.height == closedHeight,
  "Show less closes it again")
-- D165: the open card had a footer; closed, nothing of the open card is left on screen.
for _, region in ipairs({ "where", "goal", "details", "list", "pipRow", "rewardsHeader" }) do
  check(not mascot[region]:IsShown(), "closed after open: no " .. region)
end
check(textOf(mascot.where) == "", "closed: the footer time is emptied too")
for i = 2, #mascot.rewardLines do
  check(not mascot.rewardLines[i]:IsShown(), "closed after open: no reward line " .. i)
end
check(shownRegions() == closedRegions, "closed -> open -> closed shows only what the closed view lists: "
  .. shownRegions() .. " vs " .. closedRegions)
check(mascot.cardToggle.chevron.rotation == math.pi / 2, "closed again: the chevron points down")
mascot.cardToggle:Click()
check(mascot.cardToggle.chevron.rotation == -math.pi / 2, "open: the chevron points up")
mascot.cardToggle:Click()

-- Welcome back on login.
ns.Session.welcomeBack = true
ns.Session:RefreshUI()
check(mascot.view.kind == "welcome" and textOf(mascot.message):find("Welcome back!", 1, true), "welcome back")
check(shownButtons() == "continue,new", "Continue or Something new")
mascot.buttons.continue:Click()
check(mascot.view.kind == "step", "Continue shows the step")

-- With a plan the menu is about the step first.
mascot.frame:Click("RightButton")
check(menuLabels() == "What next?|Skip this step|Show route on map|New plan|What is this item?|Settings",
  "plan menu order: " .. menuLabels())
ui.menu:Hide()

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

-- A Request a 0.7 client queued for logout: Bory offers Send now.
UnboredCharDB.request = { id = "req-old", type = "plan", mode = "custom", wish = "old", state = "queued",
  createdAt = clock }
ns.Session:RefreshUI()
check(shownButtons() == "sendnow" and textOf(mascot.message) == "Shall I send this to the planner?",
  "a 0.7 queued Request: Send now: " .. shownButtons())
ns.Session:CancelRequest()
check(not ns.Session:Locked(), "Cancel unlocks")

-- A 0.6 question Request still on disk: its Answer is shown in up to three bubbles.
UnboredCharDB.request = { id = "req-q", type = "question", question = "Where?", createdAt = clock, onDisk = true }
ns.Session:MarkLoaded()
UnboredExternalPlan = {
  requestId = "req-q",
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
check(mascot.view.kind == "item" and mascot.item.itemID == 6948, "and Bory shows it")
check(mascot.item.bag == 0 and mascot.item.slot == 3 and mascot.item.count == 1, "the bag slot is found")
check(textOf(mascot.header) == HEARTH, "the bubble shows the item link")
check(textOf(mascot.message):find("inn", 1, true) ~= nil, "and what Bory knows about it")
check(shownButtons() == "back", "items are answered here only (D64): " .. shownButtons())
check(UnboredCharDB.request == nil, "no item Request")
mascot.buttons.back:Click()

-- The drop hint shows while an item is on the cursor, until it has been learned.
UnboredDB.dropsTaught = 0
cursor = { itemID = 6948, link = HEARTH }
driver.scripts.OnEvent(driver, "CURSOR_CHANGED")
check(mascot.dropHint:IsShown() and textOf(mascot.dropHint) == "Drop it on me to ask", "the drop hint shows")
mascot.frame.scripts.OnReceiveDrag(mascot.frame)
check(mascot.view.kind == "item" and not mascot.dropHint:IsShown(), "dropping an item on Bory shows it")
mascot.buttons.back:Click()
UnboredDB.dropsTaught = 3
cursor = { itemID = 6948, link = HEARTH }
driver.scripts.OnEvent(driver, "CURSOR_CHANGED")
check(not mascot.dropHint:IsShown(), "after a few drops the hint stops")
mascot.bubble.scripts.OnMouseUp(mascot.bubble)
check(mascot.view.kind == "item", "dropping on the bubble works too")
mascot.buttons.back:Click()

-- An item Bory knows nothing about: said plainly, nothing is sent.
mascot:ShowItem({ itemID = 4242, link = "|Hitem:4242|h[Odd Thing]|h" })
check(UnboredCharDB.request == nil and textOf(mascot.message) == "I don't know this one yet.", "unknown item")
mascot.buttons.back:Click()

-- Tooltip Advice (docs/adr/0035): a line only when it is about this player.
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
check(tip(1234) == "|cffe8b04aBory:|r New for your collection", "a toy nobody on the Account has: " .. tip(1234))
check(tip(555):find("New for your collection", 1, true), "a new mount: " .. tip(555))
check(tip(900) == "", "junk: no line")
check(tip(901) == "", "a reagent no Alt uses: no line")
UnboredDB.alts = {
  ["Area 52-Alty"] = {
    name = "Alty",
    realm = "Area 52",
    faction = "Alliance",
    seenAt = 1,
    professions = { { skillLine = 171, name = "Alchemy", skill = 50 } },
  },
}
check(tip(901):find("Send to Alty (Alchemy 50): mail it", 1, true), "a reagent for an Alt: " .. tip(901))
UnboredDB.alts["Area 52-Alty"].realm = "Stormrage"
check(tip(901):find("warband bank", 1, true), "another realm: the warband bank")
check(tip(902) == "", "an item Bory has nothing personal about: no line, no drop hint")
local logged = false
for _, seen in ipairs((ns.Snapshot.Body("unresolvedIds") or {}).list or {}) do
  logged = logged or (seen.kind == "advice" and seen.id == 902)
end
check(logged, "an unmatched item is logged for the Planner")
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
check(tip(902):find("the Planner says", 1, true), "Personal advice from the Server")
check(tip(903) == "", "never sell an epic, even if told")
check(tip(900) == "", "an unsafe line is dropped")
local localAlts = UnboredDB.alts
UnboredDB.alts = {}
check(tip(901) == "", "no Alt on this PC, no digest: no line")
UnboredAdvice.characters["Area 52-Hero"].alts = {
  { name = "Brew", realm = "Area 52", faction = "Alliance", seenAt = 9,
    professions = { { skillLine = 171, name = "Alchemy", skill = 75 }, { name = "no id" } } },
  { realm = "no name" },
  "junk",
}
check(tip(901):find("Send to Brew (Alchemy 75): mail it", 1, true),
  "an Alt only seen on another PC still gets the reagent: " .. tip(901))
UnboredDB.alts = {
  ["Area 52-Brew"] = { name = "Brew", realm = "Stormrage", seenAt = 1,
    professions = { { skillLine = 171, name = "Alchemy", skill = 75 } } },
}
check(tip(901):find("warband bank", 1, true), "what this PC saw wins over the digest: " .. tip(901))
check(#ns.Profile.Alts() == 1, "the digest never adds an Alt twice")
UnboredDB.alts = localAlts

-- Holdings (docs/adr/0048): one muted line under Bory's, never this character's own place.
ITEMS[905] = { name = "Linen", quality = 1, classID = 15 }
UnboredAdvice.characters["Area 52-Hero"].alts = nil
UnboredAdvice.holdings = {
  places = { "Grubbyman-Area 52", "Hero-Area 52", "Alty-Area 52", "Brew-Area 52", "Zed-Area 52", "warband" },
  items = {
    [902] = "w:200,1:40,2:5",
    [905] = "1:3,3:2,4:9,5:1,w:7",
    [906] = "2:20",
    [901] = "3:12",
  },
}
local MUTED_HEX = "|cffb8a385"
local first, second = tip(902)
check(first:find("the Planner says", 1, true) and second == MUTED_HEX .. "Also: Warband bank 200, Grubbyman 40|r",
  "Bory's line, then where else it is, without this character's own bags: " .. tostring(second))
first, second = tip(905)
check(first == MUTED_HEX .. "Also: Brew 9, Warband bank 7, Grubbyman 3, +2|r" and second == nil,
  "holdings alone is fine, up to three places then +N: " .. first)
ITEMS[906] = { name = "Own Thing", quality = 1, classID = 15 }
check(tip(906) == "", "only this character has it: nothing")
check(#ns.Items.Facts(905) >= 1 and ns.Items.Facts(905)[1]:find("Also:", 1, true), "the item bubble says it too")
UnboredDB.alts = {
  ["Area 52-Alty"] = { name = "Alty", realm = "Area 52", faction = "Alliance", seenAt = 1,
    professions = { { skillLine = 171, name = "Alchemy", skill = 50 } } },
  ["Area 52-Brew"] = { name = "Brew", realm = "Area 52", faction = "Alliance", seenAt = 1,
    professions = { { skillLine = 171, name = "Alchemy", skill = 90 } } },
}
check(tip(901):find("Send to Alty (has 12): mail it", 1, true),
  "routing prefers the Alt who already has a stack (D145): " .. tip(901))
UnboredDB.alts = localAlts
check(ns.Advice.HoldingsLine(902, "ru") == "Ещё: банк отряда 200, Grubbyman 40", "and in Russian")
UnboredDB.shareData = false
check(select(2, tip(902)) == nil, "data sharing off: no holdings line (D147)")
UnboredDB.shareData = true
UnboredAdvice.holdings.places[2] = "Hero-Other Realm"
check(tip(905) == "", "an index for another Account says nothing")
UnboredAdvice.holdings = nil
check(tip(905) == "", "no index: nothing")
UnboredAdvice = nil
local toyStep = { id = "toy", title = "Get {item:1234|the toy}", complete = { kind = "toy", itemID = 1234 } }
ns.Session:ApplyPlan({ tasks = { toyStep } }, "import", false)
check(tip(1234) == "|cffe8b04aBory:|r Needed for your plan: Get Silly toy",
  "needed for the plan names the Step: " .. tip(1234))
UnboredDB.tooltipLines = false
check(tip(1234) == "", "the menu toggle turns every line off")
UnboredDB.tooltipLines = true

-- A failed Request: Bory's words for each Reason code, never raw text.
local function waitingRequest(id, sentAt)
  return { id = id, type = "plan", mode = "farm", topic = "mount", wish = "a mount", state = "waiting",
    createdAt = sentAt, sentAt = sentAt, onDisk = true }
end
local function fail(code, reason)
  UnboredCharDB.request = waitingRequest("req-x", clock)
  UnboredExternalPlan = { requestId = "req-x", requestStatus = "failed", requestReason = reason,
    requestReasonCode = code }
  ns.Session:NoteRequest()
  ns.Session:RefreshUI()
end
local before = reloads
fail("planner_failed", "Nothing nearby.")
check(mascot.view.kind == "failed" and textOf(mascot.sub) == "Nothing nearby.", "the Planner's own reason is shown")
check(shownButtons() == "retry,ok", "with Try again and Got it")
fail("rejected", "HTTP 400 bad body")
check(textOf(mascot.sub):find("another idea", 1, true) and not bubbleText():find("HTTP", 1, true),
  "rejected: no raw error")
fail("not_approved", "403")
check(textOf(mascot.sub):find("one-time OK", 1, true), "not approved: pairing")
fail("server_unreachable", "ECONNREFUSED")
check(textOf(mascot.sub):find("can't reach the planner", 1, true), "unreachable")
fail("weird_code", "stack trace")
check(textOf(mascot.sub) == "Something went wrong on my side. Try again?", "anything else: one plain line")
mascot.buttons.retry:Click()
check(reloads == before and ns.Session:FlowState() == "confirm" and UnboredCharDB.request.id == nil,
  "Try again goes back to the confirm step, no reload")
check(UnboredCharDB.request.topic == "mount", "with the same choice")
fail("weird_code", "stack trace")
mascot.buttons.ok:Click()
check(UnboredCharDB.request == nil and mascot.view.kind ~= "failed", "Got it clears the failure")

-- Every wait says why, in plain words. The Companion's state is judged at the load.
UnboredExternalPlan = nil
ns.Session:MarkLoaded()
local function waitFor(status, sentAt)
  UnboredCompanionStatus = status
  UnboredCharDB.request = waitingRequest("req-w", sentAt or ns.Session.loadedAt)
  ns.Session:NoteRequest()
  ns.Session:RefreshUI()
end
waitFor({ v = 1, pairing = "pending", online = true, seenAt = clock })
check(bubbleText():find("one-time OK", 1, true), "waiting for approval is said")
check(not bubbleText():find("req-", 1, true), "no request id in the bubble")
waitFor({ v = 1, pairing = "revoked", online = true, seenAt = clock })
check(bubbleText():find("disconnected", 1, true), "a revoked PC is said")
waitFor({ v = 1, pairing = "approved", online = false, seenAt = clock })
check(bubbleText():find("can't reach the planner", 1, true), "an unreachable planner is said")
waitFor({ v = 1, pairing = "approved", online = true, seenAt = ns.Session.loadedAt - 20 * 60 })
check(bubbleText():find("isn't running", 1, true), "a Companion that was not running at load is said")
waitFor({ v = 1, pairing = "approved", online = true, seenAt = ns.Session.loadedAt })
clock = clock + 50 * 60
ns.Events.Pulse()
check(not bubbleText():find("isn't running", 1, true), "a long session alone does not mean it stopped")
clock = clock - 50 * 60
ns.Session:RefreshUI()
check(bubbleText():find("I'm on it.", 1, true), "all fine: on it, keep playing")
check(not mascot.buttons.refresh:IsShown(), "no Refresh while the Companion file does not name it")
check(mascot.float.playing and mascot.glow.playing, "and Bory visibly thinks")
check(mascot.art.texture:find("BoryThinking128", 1, true) ~= nil, "with his thinking face")
local ringTexture = mascot.ring.texture
check(mascot.thinkingDots:IsShown(), "with three dots by the name")
UnboredCharDB.request.sentAt = ns.Session.loadedAt - 11 * 60
ns.Session:RefreshUI()
check(bubbleText():find("taking long", 1, true), "a slow request is said")
check(mascot.buttons.retry:IsShown(), "with Try again")
check(mascot.mood == "waiting" and mascot.art.texture:find("BoryWaiting128", 1, true) ~= nil,
  "a long wait makes Bory yawn: " .. tostring(mascot.art.texture))
check(mascot.ring.texture == ringTexture, "a mood never touches the ring")
ns.Session:CancelRequest()
ns.Session:RefreshUI()
check(UnboredCharDB.request == nil, "Cancel drops it")
check(not mascot.float.playing and not mascot.glow.playing, "and Bory stops thinking")
check(mascot.float.finished and mascot.glow.finished and not mascot.float.stopped and not mascot.glow.stopped,
  "the loop runs out, never cut mid-move (D88)")
check(not mascot.finishing and mascot.art.texture:find("BoryThinking", 1, true) == nil, "the new picture once it ends")
check(not mascot.thinkingDots:IsShown(), "and the dots go")
waitFor({ v = 1, pairing = "approved", online = true, seenAt = clock }, clock - 61 * 60)
check(mascot.view.kind == "expired" and shownButtons() == "retry,ok", "after an hour: lost, Try again or Got it")
mascot.buttons.ok:Click()
check(UnboredCharDB.request == nil, "Got it drops the lost one")

-- The Companion put a newer addon on disk: Load applies it.
UnboredCompanionStatus.addonVersion = "9.9.9"
ns.Session:RefreshUI()
check(mascot.view.kind == "update" and shownButtons() == "load", "an update waiting: one Load button")
mascot.collapse:Click()
check(mascot.updateLater, "collapsing the bubble means later (D87)")
mascot.pill:Click("LeftButton")
mascot.updateLater = nil
ns.Session:RefreshUI()
mascot.buttons.load:Click()
check(reloads == 3 and UnboredCharDB.updateTried == "9.9.9", "Load reloads and remembers the try")
ns.Session:RefreshUI()
check(textOf(mascot.message):find("restart the game", 1, true), "still old after Load: restart once")
mascot.buttons.ok:Click()
check(mascot.view.kind ~= "update", "and it can be put away")
UnboredCompanionStatus.addonVersion = ns.VERSION
mascot.updateLater = nil
check(ns.VersionNewer("0.10.0", "0.9.9") and not ns.VersionNewer("0.6.0", "0.6.0"), "versions compare by number")

-- Combat: Bory steps aside and ignores clicks.
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

-- D127: the calendar is asked again 5 s after loading, never during a fight.
local timers, opened = {}, 0
local savedAfter, savedCalendarApi = C_Timer.After, C_Calendar
C_Timer.After = function(delay, fn)
  timers[#timers + 1] = { delay = delay, fn = fn }
end
C_Calendar = { OpenCalendar = function() opened = opened + 1 end }
ns.AskCalendarLater()
check(#timers == 1 and timers[1].delay == 5 and opened == 0, "the calendar is asked 5 s later, not now")
fighting = true
table.remove(timers, 1).fn()
check(opened == 0 and #timers == 1, "in combat it waits another 5 s")
fighting = false
table.remove(timers, 1).fn()
check(opened == 1, "and asks once the fight is over")
C_Timer.After, C_Calendar = savedAfter, savedCalendarApi
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
check(not mascot.buttons.proper:IsShown(), "no Companion: no proper-plan button")
check(tip(902) == "", "no Companion: no drop-to-ask line")
ns.UI:OpenItem({ itemID = 6948, link = HEARTH })
check(mascot.view.kind == "item", "no Companion: the item still opens")
mascot.buttons.back:Click()
C_AddOns.IsAddOnLoaded = loaded

-- Ideas first (D139): up to four chips, then Surprise me and More ideas on one row.
local savedHas = ns.UI.HasCompanion
ns.UI.HasCompanion = function() return true end
UnboredCharDB.request = nil
UnboredSuggestions = { v = 1, computedAt = clock, characters = { ["Area 52-Hero"] = {
  { id = "mount:183", kind = "collection", title = "Tempest Keep", goal = "Run Tempest Keep for {item:6948}.",
    rewards = { "{item:6948}" }, reason = { kind = "alts", count = 2 },
    request = { topic = "suggestion", suggestionId = "mount:183", wish = "Tempest Keep: a mount." } },
  { id = "rare:x", kind = "rare", title = "Huolon", goal = "Hunt Huolon.", rewards = {}, reason = { kind = "near" } },
} } }
ns.Suggestions.cache = { at = clock, list = {} }
local savedIcon = C_Item.GetItemIconByID
C_Item.GetItemIconByID = function(id) return id == 6948 and 134414 or nil end
mascot:ShowChoice()
check(mascot.view.kind == "choice" and #mascot.view.ideas == 2, "the choice leads with ideas")
check(mascot.ideaChips[1]:IsShown() and textOf(mascot.ideaChips[1].label) == "Tempest Keep",
  "an idea chip shows its title")
check(textOf(mascot.ideaChips[1].sub) == "None of your 2 characters has it yet", "and a muted line under it")
check(mascot.ideaChips[1].icon:IsShown() and not mascot.ideaChips[2].icon:IsShown(),
  "one reward picture on the right, none without a reward")
check(not mascot.ideaChips[3]:IsShown(), "only as many chips as ideas")
local surpriseAt, moreAt = mascot.surpriseChip.points[1], mascot.moreIdeas.points[1]
check(mascot.surpriseChip:IsShown() and mascot.moreIdeas:IsShown() and surpriseAt[5] == moreAt[5]
  and surpriseAt[4] < moreAt[4], "Surprise me and More ideas sit side by side")
check(textOf(mascot.surpriseChip.label) == "Surprise me" and textOf(mascot.moreIdeas.label) == "More ideas",
  "with their labels")
check(not mascot.chips[1]:IsShown(), "the presets wait behind More ideas")
mascot.moreIdeas:Click()
local presetsShown = 0
for i = 1, #mascot.chips do
  presetsShown = presetsShown + (mascot.chips[i]:IsShown() and 1 or 0)
end
check(presetsShown == 5 and not mascot.chips[6]:IsShown(), "More ideas shows the other five presets")
check(textOf(mascot.moreIdeas.label) == "Show less", "and folds back")
mascot.ideaChips[1]:Click()
check(mascot.view.kind == "confirm" and textOf(mascot.header) == "Tempest Keep", "an idea goes straight to Confirm")
check(textOf(mascot.sub):find("You will get:", 1, true) ~= nil, "Confirm shows its rewards")
check(shownButtons() == "sendnow,back", "with Send now and Back")
check(UnboredCharDB.request.topic == "suggestion" and UnboredCharDB.request.suggestionId == "mount:183",
  "the flow remembers the idea")
ns.Session:CancelRequest()
local many = {}
for i = 1, 6 do
  many[i] = { id = "rare:" .. i, kind = "rare", title = "Rare " .. i, goal = "Hunt it.", rewards = {},
    reason = { kind = "near" } }
end
UnboredSuggestions.characters["Area 52-Hero"] = many
ns.Suggestions.cache = { at = clock, list = {} }
mascot.showPresets = false
mascot:ShowChoice()
check(mascot.ideaChips[4]:IsShown() and not mascot.ideaChips[5]:IsShown(), "four ideas at first")
mascot.moreIdeas:Click()
check(mascot.ideaChips[5]:IsShown() and mascot.ideaChips[6]:IsShown()
  and textOf(mascot.ideaChips[6].label) == "Rare 6", "More ideas shows the next ideas")
mascot.moreIdeas:Click()
UnboredSuggestions = nil
ns.Suggestions.cache = nil
mascot:ShowChoice()
check(mascot.chips[6]:IsShown() and not mascot.surpriseChip:IsShown() and not mascot.moreIdeas:IsShown(),
  "no ideas: the six presets as before")
ns.Suggestions.cache = nil
ns.UI.HasCompanion = savedHas
C_Item.GetItemIconByID = savedIcon

-- Entity markup: the shared fixture parses the same as on the Server.
local function readJson(path)
  local file = assert(io.open(path, "r"))
  local text = file:read("*a")
  file:close()
  return assert(ns.JSON.Decode(text))
end
local markup = readJson("../packages/contracts/fixtures/markup.json")
local function tidy(text)
  return ns.Trim((text:gsub("  +", " ")))
end
local savedItem, savedMap = C_Item, C_Map
C_Item, C_Map = nil, nil
for _, case in ipairs(markup.cases) do
  local tokens = {}
  for _, part in ipairs(ns.Markup.Parse(case.text)) do
    if type(part) == "table" then
      tokens[#tokens + 1] = part
    end
  end
  local same = #tokens == #case.tokens
  for i = 1, math.min(#tokens, #case.tokens) do
    local want, got = case.tokens[i], tokens[i]
    for _, field in ipairs({ "type", "id", "mapID", "x", "y", "label" }) do
      same = same and want[field] == got[field]
    end
  end
  check(same, "markup tokens: " .. case.name)
  local plain = ns.Markup.Plain(case.text, ns.Markup.CleanEntities(markup.entities))
  check(plain == tidy(case.plain), "markup plain text: " .. case.name .. ": " .. tostring(plain))
end
C_Item, C_Map = savedItem, savedMap

-- The shared plan fixtures: what the Companion writes for 0.8, and a 0.7 plan.
local savedPlan = UnboredExternalPlan
assert(loadfile("../packages/contracts/fixtures/plan-card.lua"))()
local card = assert(ns.ValidatePlan(UnboredExternalPlan, false))
UnboredExternalPlan = savedPlan
check(card.title == "Ashes in one evening" and card.goal and card.details and #card.rewards == 2,
  "plan-card.lua keeps the plan card fields")
check(card.tasks[1].why and #card.tasks[1].rewards == 1, "and a Step's why and rewards")
check(card.tasks[2].condition and card.tasks[2].condition.check.kind == "level"
  and card.tasks[2].condition.check.id == 70, "and its condition")
assert(loadfile("../packages/contracts/fixtures/plan-group.lua"))()
local caged = assert(ns.ValidatePlan(UnboredExternalPlan, false))
UnboredExternalPlan = savedPlan
local cageContents = caged.contains and caged.contains["{item:128025}"]
check(cageContents and #cageContents == 3, "plan-group.lua keeps the cage contents")
check(not caged.tasks[1].group and caged.tasks[2].group == "rares" and caged.tasks[4].group == "rares"
  and not caged.tasks[5].group, "and the step group")
local reEncoded = ns.DecodeImport(ns.EncodePlan(card))
check(reEncoded.title == card.title and reEncoded.tasks[2].condition.text == card.tasks[2].condition.text,
  "the card fields survive an export")
local old = assert(ns.ValidatePlan(readJson("../packages/contracts/fixtures/plan.json"), false))
check(old.title == nil and old.rewards == nil and #old.tasks == 2, "a 0.7 plan still loads, with no card fields")

-- A plan with links: the Bubble shows native links, other places plain names.
local linked = assert(ns.ValidatePlan(markup.plan, false))
check(linked.tasks[1].npcs and linked.tasks[1].npcs["12345"].name == "Fixer Kev", "a Step keeps the npcs it links")
check(ns.DecodeImport(ns.EncodePlan(linked)).tasks[1].npcs["12345"].mapID == 2339, "npcs survive an export")
UnboredCharDB.request = nil
ns.Session.answer = nil
ns.Session:ApplyPlan(linked, "companion", true)
mascot.forceChoice = nil
mascot:Refresh()
check(textOf(mascot.message) == "Talk to |cffffd100|Haddon:Unbored:npc:12345|h[Fixer Kev]|h|r",
  "an npc link in the title: " .. textOf(mascot.message))
if not ns.Mascot.CardOpen() then
  mascot.cardToggle:Click()
end
check(textOf(mascot.details):find("|Hitem:6948|h[Hearthstone]|h", 1, true) ~= nil, "an item link with the game's name")
check(textOf(mascot.details):find("|Haddon:Unbored:pin:2339:52.1:47.3|h[the forge]|h", 1, true) ~= nil, "a pin link")
check(ns.Markup.Plain(linked.tasks[1].title, linked.tasks[1].npcs) == "Talk to Fixer Kev", "plain text for the tracker")
tooltipLines = {}
mascot.bubble.scripts.OnHyperlinkEnter(mascot.bubble, "addon:Unbored:npc:12345", "[Fixer Kev]")
check(tooltipLines[1] == "Fixer Kev" and tooltipLines[2] == "Stormwind City" and tooltipLines[3] == "52.1, 47.3",
  "the npc tooltip: name, zone, place")
mascot.bubble.scripts.OnHyperlinkClick(mascot.bubble, "addon:Unbored:npc:12345", "[Fixer Kev]", "LeftButton")
check(C_Map.pin and C_Map.pin.uiMapID == 2339 and math.abs(C_Map.pin.position.x - 0.521) < 1e-9,
  "an npc click sets the waypoint")
mascot.bubble.scripts.OnHyperlinkClick(mascot.bubble, "addon:Unbored:pin:2339:40:60", "[x]", "LeftButton")
check(math.abs(C_Map.pin.position.y - 0.6) < 1e-9, "a pin click sets the waypoint")
local hovered, referred
GameTooltip.SetHyperlink = function(_, link)
  hovered = link
end
SetItemRef = function(link, text, button)
  referred = link .. "|" .. text .. "|" .. button
end
mascot.bubble.scripts.OnHyperlinkEnter(mascot.bubble, "item:6948", "[Hearthstone]")
check(hovered == "item:6948", "a game link shows the game tooltip")
mascot.bubble.scripts.OnHyperlinkClick(mascot.bubble, "item:6948", "[Hearthstone]", "LeftButton")
check(referred == "item:6948|[Hearthstone]|LeftButton", "a game link click goes to the game (shift-click: chat)")
mascot.bubble.scripts.OnHyperlinkLeave(mascot.bubble)
SetItemRef = nil

-- A name that is not cached yet: the label while it loads, a link once it does,
-- and plain text plus a note for the Server when it never comes.
local titles, listeners, redraws = {}, {}, 0
C_QuestLog = {
  GetTitleForQuestID = function(id)
    return titles[id]
  end,
}
QuestEventListener = {
  AddCallback = function(_, id, done)
    listeners[id] = done
  end,
}
local function redraw()
  redraws = redraws + 1
end
check(ns.Markup.Render("Do {quest:500|The Hunt}", nil, redraw) == "Do The Hunt", "loading: the label")
titles[500] = "The Great Hunt"
listeners[500]()
check(redraws == 1, "a loaded name redraws the Bubble")
check(ns.Markup.Render("Do {quest:500|The Hunt}", nil, redraw) == "Do |cffffff00|Hquest:500:-1|h[The Great Hunt]|h|r",
  "loaded: a quest link built from the title")
check(ns.Markup.Render("Do {quest:501|Lost one}", nil, redraw) == "Do Lost one", "another quest waits")
local realGetTime = GetTime
GetTime = function()
  return realGetTime() + 4
end
check(ns.Markup.Render("Do {quest:501|Lost one}", nil, redraw) == "Do Lost one", "after the wait: plain label")
GetTime = realGetTime
local unresolved = ns.Snapshot.Body("unresolvedIds")
check(unresolved and unresolved.list[#unresolved.list].kind == "quest" and unresolved.list[#unresolved.list].id == 501,
  "the unresolved id is kept for the Server")
check(ns.Markup.Render("{ach:42|Old}", nil, redraw) == "Old", "an achievement the game does not know: plain label")
C_QuestLog, QuestEventListener = nil, nil

-- An answer with links keeps its npcs.
UnboredCharDB.request = { id = "req-l", type = "question", question = "Who?", createdAt = clock, onDisk = true }
ns.Session:MarkLoaded()
UnboredExternalPlan = {
  requestId = "req-l",
  requestStatus = "fulfilled",
  requestType = "question",
  answer = {
    message = "Find {npc:777}.",
    entities = { npc = { ["777"] = { name = "Old Ma", mapID = 84, x = 10, y = 20 }, ["8"] = { name = "Unused" } } },
  },
}
check(ns.Session:AutoApplyExternal() == true, "an answer with links is taken")
ns.Session:RefreshUI()
check(textOf(mascot.message) == "Find |cffffd100|Haddon:Unbored:npc:777|h[Old Ma]|h|r.", "the answer links its npc")
check(UnboredCharDB.answer.npcs["8"] == nil, "and keeps only the npcs it links")
mascot.bubble.scripts.OnHyperlinkClick(mascot.bubble, "addon:Unbored:npc:777", "[Old Ma]", "LeftButton")
check(C_Map.pin.uiMapID == 84 and math.abs(C_Map.pin.position.x - 0.1) < 1e-9, "its click uses the answer's npc")
mascot.buttons.ok:Click()
UnboredExternalPlan = nil

-- The card for every kind of plan (D91-D97).
UnboredCharDB.request = nil
ns.Session.answer = nil
local function applyCard(plan)
  ns.Session:ApplyPlan(assert(ns.ValidatePlan(plan, false)), "companion", true)
  mascot.forceChoice = nil
  mascot:Refresh()
end
applyCard({ v = 1, kind = "plan", mode = "custom", note = "Plan for request mode surprise",
  tasks = { { id = "o1", title = "Old step", estMinutes = 25 }, { id = "o2", title = "Old two" } } })
check(textOf(mascot.title) == "Your plan", "a 0.7 plan without a title: never its note (D96): " .. textOf(mascot.title))
check(not mascot.rewardsHeader:IsShown(), "no rewards: no reward row")
check(not mascot.why:IsShown() and not mascot.condition:IsShown(), "no why, no condition line")
check(textOf(mascot.where) == "about 25 min", "the footer time in words: " .. textOf(mascot.where))
check(not bubbleText():find("~", 1, true), "no ~ anywhere on the card")
check(ns.Steps.Duration(100) == "1 h 40 min" and ns.Steps.Duration(120) == "2 h", "hours read as words")

local coins = 3200
C_CurrencyInfo = {
  GetCurrencyInfo = function(id)
    return id == 1166 and { quantity = coins } or nil
  end,
}
applyCard({ v = 1, kind = "plan", mode = "custom", title = "Badges for a mount",
  tasks = {
    { id = "c1", title = "Buy the mount",
      condition = { text = "If you have 5,000 {currency:1166|badges}",
        check = { kind = "currency", id = 1166, atLeast = 5000 } } },
    { id = "c2", title = "Run a dungeon", rewards = { "{item:6948|Hearthstone}" } },
  } })
check(mascot.condition:IsShown() and textOf(mascot.condition):find("If you have 5,000", 1, true),
  "the condition line before the step: " .. textOf(mascot.condition))
check(mascot.view.notYet, "unmet: the step is marked not yet")
if not ns.Mascot.CardOpen() then
  mascot.cardToggle:Click()
end
check(textOf(mascot.details):find("3,200 / 5,000", 1, true),
  "unmet: the live count in Details: " .. textOf(mascot.details))
mascot.buttons.skip:Click()
local cardState = ns.Session.state
check(#(cardState.skipped or {}) == 0 and ns.Session:Current().id == "c2",
  "Skip on a not-yet step moves on, not skipped")
check(mascot.rewardsHeader:IsShown() and textOf(mascot.rewardLines[1]):find("Hearthstone", 1, true),
  "a Step's own rewards show")
coins = 5000
mascot.buttons.done:Click()
check(ns.Session:Current() and ns.Session:Current().id == "c1", "the waiting step comes back")
check(not mascot.view.notYet and textOf(mascot.condition):find("Ready", 1, true),
  "met: Ready: " .. textOf(mascot.condition))
C_CurrencyInfo = nil
local holidayCard = ns.Steps.QuickCard({
  { title = "a", holiday = "Hallow's End", complete = { kind = "achievement", achievementID = 291 } },
  { title = "b", holiday = "Hallow's End", complete = { kind = "achievement", achievementID = 291 } },
}, ns.Data.Presets[1])
check(holidayCard.title == "Hallow's End" and holidayCard.goal and #holidayCard.rewards == 1,
  "a holiday Quick plan: its name, a goal, the achievement once (D97)")
check(ns.Steps.QuickCard({ { title = "x" } }, ns.Data.Presets[1]).title == "Stay here, do stuff nearby",
  "any other Quick plan: the preset label")

C_Spell = {
  GetSpellLink = function(id)
    return "|cff71d5ff|Hspell:" .. id .. ":0|h[Sky Wisp]|h|r"
  end,
}
-- The new link kinds: a mount the game knows, a pet and a zone as our own links.
check(ns.Markup.Render("{mount:99|x}", nil, redraw):find("Sky Wisp", 1, true) ~= nil,
  "a mount renders with the game's name: " .. ns.Markup.Render("{mount:99|x}", nil, redraw))
check(ns.Markup.Render("{zone:84|City}", nil, redraw):find("|Haddon:Unbored:zone:84|h", 1, true) ~= nil,
  "a zone is our own link")
check(ns.Markup.Render("{mount:4242|Lost mount}", nil, redraw) == "Lost mount", "an unknown mount: plain label")
check(ns.Markup.Render("{pet:7|Some pet}", nil, redraw) == "Some pet", "a pet the game does not know: plain label")
local unknownMount = false
for _, seen in ipairs((ns.Snapshot.Body("unresolvedIds") or {}).list or {}) do
  unknownMount = unknownMount or (seen.kind == "mount" and seen.id == 4242)
end
check(unknownMount, "the unknown mount is kept for the Server")
mascot.bubble.scripts.OnHyperlinkClick(mascot.bubble, "addon:Unbored:zone:84", "[City]", "LeftButton")
check(mapOpened == 84, "a zone click opens the world map on it")

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
check(mascot.view.kind == "choice", "/unbored ask opens the ideas: nothing is typed any more")
Unbored_Toggle()
check(mascot.view.kind == "choice", "the toggle key offers the presets")
-- The paste window is gone (D214): import and export only print the help.
for _, command in ipairs({ "import UNB1:abc", "export" }) do
  local printedBefore = #printed
  SlashCmdList.UNBORED(command)
  check(#printed == printedBefore + 1 and printed[#printed]:find(ns.T("SLASH_HELP"), 1, true) ~= nil
    and not printed[#printed]:find("import", 1, true), "/unbored " .. command .. " only prints the help")
end
check(ns.ShowImport == nil and ns.ShowExport == nil and ns.L.IMPORT_TITLE == nil and ns.L.ERR_KIND_PROGRESS == nil,
  "the import window, its strings and the progress-paste error are gone")

-- Moods (D149): one table, every view kind in it, only the four pictures.
local MOODS = mascot.MOOD_FOR_VIEW
local pictures = { idle = true, thinking = true, waiting = true, happy = true }
for _, kind in ipairs({ "choice", "lively", "finished", "item", "answer", "confirm", "queued", "sent", "slow",
  "problem", "ready", "step", "stepDone", "welcome", "offer", "update", "restart", "failed", "expired", "bored" }) do
  check(pictures[MOODS[kind]], "a mood for " .. kind)
end
check(MOODS.confirm == "idle" and MOODS.sent == "thinking" and MOODS.slow == "waiting" and MOODS.ready == "happy"
  and MOODS.failed == "waiting" and MOODS.expired == "waiting" and MOODS.problem == "waiting"
  and MOODS.stepDone == "happy" and MOODS.finished == "happy", "the moods D149 asks for")
local moodTimers = {}
local savedTimer = C_Timer.After
C_Timer.After = function(delay, fn)
  moodTimers[#moodTimers + 1] = { delay = delay, fn = fn }
end
mascot.stepHappy = nil
check(mascot:MoodFor({ kind = "step", mood = "idle" }) == "idle", "a Step: idle")
mascot:StepDone()
check(mascot:MoodFor({ kind = "step", mood = "idle" }) == "happy" and moodTimers[#moodTimers].delay == 4,
  "a Step done: happy for four seconds")
check(mascot:MoodFor({ kind = "step", mood = "thinking" }) == "thinking", "never over a wait")
moodTimers[#moodTimers].fn()
check(mascot:MoodFor({ kind = "step", mood = "idle" }) == "idle", "then back")
local choiceIdle = { kind = "choice", mood = "idle" }
mascot.boredUsed, mascot.touchedAt = nil, nil
mascot:ArmBored(600)
check(moodTimers[#moodTimers].delay == 600, "ten minutes after login")
local savedCurrent = ns.Session.Current
ns.Session.Current = function() return nil end
moodTimers[#moodTimers].fn()
check(mascot:MoodFor(choiceIdle) == "waiting", "no plan for ten minutes: Bory yawns")
check(mascot:MoodFor({ kind = "choice", mood = "happy" }) == "happy", "not over a happy view")
mascot:Touch()
check(mascot:MoodFor(choiceIdle) == "idle", "any click ends it")
local armed = #moodTimers
mascot:ArmBored(600)
check(#moodTimers == armed, "once per session")
mascot.boredUsed, mascot.touchedAt = nil, ns.Now()
mascot:ArmBored(600)
moodTimers[#moodTimers].fn()
check(not mascot.bored and moodTimers[#moodTimers].delay > 0 and #moodTimers == armed + 2,
  "a recent click waits longer")
mascot.boredUsed = true
ns.Session.Current = savedCurrent
C_Timer.After = savedTimer
UnboredSuggestions = { v = 1, computedAt = clock, characters = { ["Area 52-Hero"] = {
  { id = "event:brewfest:1", kind = "event", title = "Brewfest", goal = "Go.", rewards = {},
    reason = { kind = "ends", at = clock + 3600 } },
} } }
ns.Suggestions.cache = nil
ns.Session.state = ns.Session.state or {}
mascot:ShowChoice()
check(mascot.view.kind == "choice" and mascot.view.mood == "happy", "an event on now: happy ideas")
UnboredSuggestions.characters["Area 52-Hero"][1].reason = { kind = "starts", at = clock + 86400, count = 1 }
ns.Suggestions.cache = nil
mascot:ShowChoice()
check(mascot.view.mood == "idle", "one that has not started: idle")
UnboredSuggestions = nil
ns.Suggestions.cache = nil

-- Reward contents (docs/adr/0055) and a Step group (docs/adr/0056) on the card.
do
  local savedMount = C_MountJournal.GetMountInfoByID
  C_MountJournal.GetMountInfoByID = function(mountID)
    local cageMounts = { [611] = "Felsteel Annihilator", [612] = "Bristling Hellboar", [613] = "Coalfist Gronnling" }
    if cageMounts[mountID] then
      return cageMounts[mountID], 1, 1, false, true, 0, false, false, 0, false, mountID == 612
    end
    return savedMount(mountID)
  end
  local cage = {
    title = "Cage Hunt in Tanaan",
    rewards = { "{item:128025|Rattling Iron Cage}" },
    contains = { ["{item:128025}"] = { "{mount:611|Felsteel Annihilator}", "{mount:612|Bristling Hellboar}",
      "{mount:613|Coalfist Gronnling}" } },
    tasks = {
      { id = "r1", title = "Rare 1", group = "rares", complete = { kind = "quest", questID = 39001 } },
      { id = "r2", title = "Rare 2", group = "rares", complete = { kind = "quest", questID = 39002 } },
      { id = "r3", title = "Rare 3", group = "rares", complete = { kind = "quest", questID = 39003 } },
      { id = "r4", title = "Rare 4", group = "rares", complete = { kind = "quest", questID = 39004 } },
      { id = "open", title = "Open the cage" },
    },
  }
  UnboredDB.mascot.cardOpen = false
  ns.Session:ApplyPlan(assert(ns.ValidatePlan(cage, true)), "companion", true)
  ns.Session:RefreshUI()
  local line = textOf(mascot.rewardLines[1])
  check(line:find("may contain 1 of 2 mounts", 1, true) and not line:find("\n", 1, true),
    "closed: the cage says what it may hold on one line, owned mounts left out: " .. line)
  check(mascot.groupRow:IsShown() and textOf(mascot.groupRow.text) == "1 of 4 · any order",
    "a group step shows where it is in the group: " .. textOf(mascot.groupRow.text))
  check(mascot.groupRow.next.icon.rotation == math.pi and mascot.groupRow.prev.icon.rotation == nil,
    "the right arrow is the chevron turned around")
  check(shownButtons() == "done,skip", "a group step has no new action buttons")
  mascot.buttons.skip.scripts.OnEnter(mascot.buttons.skip)
  check(textOf(GameTooltip) == ns.T("TIP_SKIP_GROUP"), "Skip in a group says it drops the step")
  mascot.groupRow.next:Click()
  check(ns.Session:Current().id == "r2" and textOf(mascot.groupRow.text) == "2 of 4 · any order",
    "the right arrow shows the next rare")
  mascot.cardToggle:Click()
  local open = textOf(mascot.rewardLines[1])
  local _, links = open:gsub("|Hspell:", "")
  check(open:find("\n", 1, true) and links == 2, "open: a muted line links the two mounts the cage may hold: " .. open)
  mascot.cardToggle:Click()
  C_MountJournal.GetMountInfoByID = function(mountID)
    if mountID >= 611 and mountID <= 613 then
      return "Mount", 1, 1, false, true, 0, false, false, 0, false, true
    end
    return savedMount(mountID)
  end
  ns.Session:RefreshUI()
  check(textOf(mascot.rewardLines[1]):find("you have all of them", 1, true), "all owned: you have all of them")
  C_MountJournal.GetMountInfoByID = savedMount

  -- A plain plan looks as in 0.9.
  ns.Session:ApplyPlan(assert(ns.ValidatePlan({ tasks = { { id = "a", title = "A" }, { id = "b", title = "B" } } },
    true)), "companion", true)
  ns.Session:RefreshUI()
  check(not mascot.groupRow:IsShown(), "a sequential plan has no arrows")
  mascot.buttons.skip.scripts.OnEnter(mascot.buttons.skip)
  check(textOf(GameTooltip) == ns.T("TIP_SKIP"), "Skip outside a group is unchanged")
  ns.Session.state = nil
  ns.Session:RefreshUI()
end

-- A caught error: one friendly line, the details kept.
local lines = #printed
ns.ReportError("Interface/AddOns/Unbored/UI/Mascot.lua:1: boom")
ns.ReportError("again")
check(#printed == lines + 1 and not printed[#printed]:find("Mascot.lua", 1, true), "one friendly line, no trace")
check(#UnboredDB.errors == 2, "the details are kept")

-- The 0.6 profile is gone (D113); the snapshot is what the Companion uploads.
driver.scripts.OnEvent(driver, "PLAYER_LOGOUT")
check(UnboredCharDB.profile == nil, "no 0.6 profile is saved")
check(type(UnboredCharDB.data) == "table" and type(UnboredCharDB.data.sections) == "table",
  "the snapshot is saved with the game")

check(reloads == 3, "only the Send now, Refresh and Load clicks ever reloaded: " .. reloads)
ns.Now = realNow

if fails > 0 then
  io.stderr:write(fails .. " failed, " .. checks .. " checks\n")
  os.exit(1)
end
print(checks .. " UI checks passed")
