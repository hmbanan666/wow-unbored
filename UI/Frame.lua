-- Main window: choose what to do and ask for a plan. Nothing else.
-- The active plan lives in the tracker (UI/Tracker.lua).

local _, ns = ...

ns.UI = ns.UI or {}

local WIDTH = 340
local PAD = 16
local INNER = WIDTH - PAD * 2
local GAP = 10
local GOLD = { 1, 0.82, 0 }

local MODE_CARDS = {
  { id = "roam", name = "MODE_ROAM", desc = "DESC_ROAM" },
  { id = "quests", name = "MODE_QUESTS", desc = "DESC_QUESTS" },
  { id = "events", name = "MODE_EVENTS", desc = "DESC_EVENTS" },
  { id = "fun", name = "MODE_FUN_LONG", desc = "DESC_FUN" },
  { id = "farm", name = "MODE_FARM", desc = "DESC_FARM" },
}

local BUDGETS = {
  { minutes = 30, caption = "BUDGET_30" },
  { minutes = 60, caption = "BUDGET_60" },
  { minutes = 120, caption = "BUDGET_120" },
}

function ns.UI.ApplyBackdrop(frame, bg, border)
  if not frame.SetBackdrop then
    return false
  end
  local ok = pcall(frame.SetBackdrop, frame, {
    bgFile = "Interface\\Buttons\\WHITE8x8",
    edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
    tile = true,
    tileSize = 8,
    edgeSize = 14,
    insets = { left = 3, right = 3, top = 3, bottom = 3 },
  })
  if not ok then
    return false
  end
  bg = bg or { 0.04, 0.04, 0.05, 0.94 }
  border = border or { 0.6, 0.5, 0.25, 1 }
  frame:SetBackdropColor(bg[1], bg[2], bg[3], bg[4])
  frame:SetBackdropBorderColor(border[1], border[2], border[3], border[4])
  return true
end

function ns.UI.MakeButton(parent, text, width, height)
  local button
  local ok, created = pcall(CreateFrame, "Button", nil, parent, "UIPanelButtonTemplate")
  if ok and created then
    button = created
  else
    button = CreateFrame("Button", nil, parent)
    local label = button:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    label:SetPoint("CENTER")
    button.Text = label
    button.SetText = function(self, value)
      self.Text:SetText(value)
    end
    button.GetFontString = function(self)
      return self.Text
    end
  end
  button:SetSize(width, height)
  button:SetText(text)
  return button
end

-- A borderless text button, for secondary actions like "Cancel request".
function ns.UI.MakeLink(parent, text)
  local button = CreateFrame("Button", nil, parent)
  local label = button:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
  label:SetPoint("CENTER")
  button.label = label
  button.SetLabel = function(self, value)
    self.label:SetText(value)
    local width = ns.AsNumber(self.label:GetStringWidth()) or 80
    self:SetSize(math.ceil(width) + 8, 18)
  end
  button:SetScript("OnEnter", function(self)
    self.label:SetTextColor(1, 1, 1)
  end)
  button:SetScript("OnLeave", function(self)
    self.label:SetTextColor(GOLD[1], GOLD[2], GOLD[3])
  end)
  button:SetLabel(text)
  return button
end

local function font(parent, template)
  local fs = parent:CreateFontString(nil, "OVERLAY", template or "GameFontHighlight")
  fs:SetJustifyH("LEFT")
  fs:SetJustifyV("TOP")
  if fs.SetWordWrap then
    fs:SetWordWrap(true)
  end
  if fs.SetNonSpaceWrap then
    fs:SetNonSpaceWrap(true)
  end
  return fs
end

-- Width first, then the wrapped height, so the next row never overlaps.
function ns.UI.Measure(fs, width)
  fs:SetWidth(width)
  local text = fs:GetText()
  if not text or text == "" then
    fs:SetHeight(1)
    return 0
  end
  local height = ns.AsNumber(fs:GetStringHeight()) or 12
  height = math.ceil(height) + 1
  fs:SetHeight(height)
  return height
end

local function setPrimaryFont(button)
  if button.SetNormalFontObject then
    pcall(button.SetNormalFontObject, button, "GameFontNormalLarge")
    pcall(button.SetHighlightFontObject, button, "GameFontHighlightLarge")
    pcall(button.SetDisabledFontObject, button, "GameFontDisableLarge")
  end
end

-- Small popup menu. items: { text, func, checked (true/false/nil) }
function ns.UI.ShowMenu(anchor, items)
  local menu = ns.UI.menu
  if not menu then
    local catcher = CreateFrame("Button", nil, UIParent)
    catcher:SetAllPoints(UIParent)
    catcher:SetFrameStrata("FULLSCREEN_DIALOG")
    catcher:EnableMouse(true)
    catcher:RegisterForClicks("AnyUp")
    catcher:Hide()
    local okMenu, created = pcall(CreateFrame, "Frame", nil, UIParent, "BackdropTemplate")
    menu = okMenu and created or CreateFrame("Frame", nil, UIParent)
    menu:SetFrameStrata("FULLSCREEN_DIALOG")
    menu:SetFrameLevel(catcher:GetFrameLevel() + 5)
    menu:SetClampedToScreen(true)
    ns.UI.ApplyBackdrop(menu)
    menu:Hide()
    menu.rows = {}
    menu.catcher = catcher
    catcher:SetScript("OnClick", function()
      menu:Hide()
      catcher:Hide()
    end)
    ns.UI.menu = menu
  end
  local width = 220
  for i = 1, #menu.rows do
    menu.rows[i]:Hide()
  end
  for i = 1, #items do
    local row = menu.rows[i]
    if not row then
      row = CreateFrame("Button", nil, menu)
      row:SetHeight(20)
      row:SetHighlightTexture("Interface\\QuestFrame\\UI-QuestTitleHighlight", "ADD")
      row.check = row:CreateTexture(nil, "ARTWORK")
      row.check:SetSize(16, 16)
      row.check:SetPoint("LEFT", 4, 0)
      row.check:SetTexture("Interface\\Buttons\\UI-CheckBox-Check")
      row.label = row:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
      row.label:SetPoint("LEFT", 22, 0)
      row.label:SetPoint("RIGHT", -6, 0)
      row.label:SetJustifyH("LEFT")
      menu.rows[i] = row
    end
    local item = items[i]
    row:ClearAllPoints()
    row:SetPoint("TOPLEFT", 6, -6 - (i - 1) * 20)
    row:SetPoint("TOPRIGHT", -6, -6 - (i - 1) * 20)
    row.label:SetText(item.text)
    local labelWidth = ns.AsNumber(row.label:GetStringWidth()) or 0
    width = math.max(width, math.ceil(labelWidth) + 40)
    row.check:SetShown(item.checked == true)
    row:SetScript("OnClick", function()
      menu:Hide()
      menu.catcher:Hide()
      if item.func then
        item.func()
      end
    end)
    row:Show()
  end
  menu:SetSize(width, #items * 20 + 12)
  menu:ClearAllPoints()
  menu:SetPoint("TOPRIGHT", anchor, "BOTTOMRIGHT", 0, -2)
  menu.catcher:Show()
  menu:Show()
end

local function placeWindow(frame)
  local window = ns.DB and ns.DB.window or {}
  frame:ClearAllPoints()
  frame:SetPoint(window.point or "CENTER", UIParent, window.rel or "CENTER", window.x or 0, window.y or 80)
end

local function saveWindow(frame)
  local point, _, rel, x, y = frame:GetPoint(1)
  x, y = ns.AsNumber(x), ns.AsNumber(y)
  if not point or not x or not y or not ns.DB then
    return
  end
  ns.DB.window = { point = point, rel = rel or point, x = x, y = y }
end

function ns.UI.HasCompanion()
  if type(UnboredExternalPlan) == "table" or ns.AddonLoaded("Unbored_Plan") then
    return true
  end
  return false
end

function ns.UI.MenuItems()
  local items = {
    { text = ns.T("MENU_BUILD"), func = function() ns.Session:BuildHere() end },
    { text = ns.T("MENU_IMPORT"), func = function() ns.ShowImport() end },
    { text = ns.T("MENU_EXPORT"), func = function() ns.ShowExport() end },
  }
  if ns.Tracker and ns.Tracker.frame then
    if ns.Tracker.frame:IsShown() then
      items[#items + 1] = { text = ns.T("MENU_HIDE"), func = function() ns.Tracker:Hide() end }
    else
      items[#items + 1] = { text = ns.T("SHOW_TRACKER"), func = function() ns.Tracker:Reveal() end }
    end
    items[#items + 1] = {
      text = ns.T("MENU_LOCK"),
      checked = ns.Tracker:Locked(),
      func = function() ns.Tracker:SetLocked(not ns.Tracker:Locked()) end,
    }
  end
  if ns.Session:Current() then
    items[#items + 1] = { text = ns.T("MENU_WAYPOINT"), func = function() ns.Session:Waypoint() end }
  end
  if ns.AddonLoaded("TomTom") then
    items[#items + 1] = {
      text = ns.T("MENU_TOMTOM"),
      checked = ns.DB.tomtomArrow ~= false,
      func = function()
        ns.DB.tomtomArrow = ns.DB.tomtomArrow == false
        ns.Session:Waypoint()
      end,
    }
  end
  items[#items + 1] = {
    text = ns.T("MENU_CHAT"),
    checked = ns.DB.chatNotes == true,
    func = function() ns.DB.chatNotes = not ns.DB.chatNotes end,
  }
  return items
end

local function makeCard(parent, info)
  local okCard, card = pcall(CreateFrame, "Button", nil, parent, "BackdropTemplate")
  if not okCard or not card then
    card = CreateFrame("Button", nil, parent)
  end
  card:SetWidth(INNER)
  card:SetHighlightTexture("Interface\\QuestFrame\\UI-QuestTitleHighlight", "ADD")
  card.name = font(card, "GameFontNormal")
  card.name:SetPoint("TOPLEFT", 10, -7)
  card.name:SetText(ns.T(info.name))
  card.desc = font(card, "GameFontHighlightSmall")
  card.desc:SetText(ns.T(info.desc))
  card.mode = info.id
  card:SetScript("OnClick", function()
    ns.ClickSound()
    ns.Session:SetMode(info.id)
  end)
  return card
end

local function layoutCard(card, selected)
  local nameHeight = ns.UI.Measure(card.name, INNER - 20)
  card.desc:ClearAllPoints()
  card.desc:SetPoint("TOPLEFT", card.name, "BOTTOMLEFT", 0, -2)
  local descHeight = ns.UI.Measure(card.desc, INNER - 20)
  local height = 7 + nameHeight + 2 + descHeight + 8
  card:SetHeight(height)
  if card.SetBackdrop then
    if selected then
      ns.UI.ApplyBackdrop(card, { 0.3, 0.22, 0.04, 0.55 }, { 1, 0.82, 0, 1 })
      card.name:SetTextColor(1, 0.82, 0)
      card.desc:SetTextColor(1, 1, 1)
    else
      ns.UI.ApplyBackdrop(card, { 0, 0, 0, 0.35 }, { 0.35, 0.35, 0.35, 0.9 })
      card.name:SetTextColor(0.9, 0.78, 0.4)
      card.desc:SetTextColor(0.75, 0.75, 0.75)
    end
  end
  return height
end

function ns.UI.Create()
  if ns.UI.frame then
    return
  end
  local okFrame, frame = pcall(CreateFrame, "Frame", "UnboredFrame", UIParent, "BackdropTemplate")
  if not okFrame or not frame then
    frame = CreateFrame("Frame", "UnboredFrame", UIParent)
  end
  frame:SetWidth(WIDTH)
  frame:SetFrameStrata("DIALOG")
  frame:SetToplevel(true)
  frame:SetClampedToScreen(true)
  frame:SetMovable(true)
  frame:EnableMouse(true)
  frame:Hide()
  ns.UI.ApplyBackdrop(frame)
  placeWindow(frame)
  if type(UISpecialFrames) == "table" then
    table.insert(UISpecialFrames, "UnboredFrame")
  end
  frame:RegisterForDrag("LeftButton")
  frame:SetScript("OnDragStart", function(self)
    self:StartMoving()
  end)
  frame:SetScript("OnDragStop", function(self)
    self:StopMovingOrSizing()
    saveWindow(self)
  end)
  frame:SetScript("OnShow", function()
    ns.UI:Refresh()
  end)

  local ui = ns.UI
  ui.frame = frame

  ui.title = frame:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
  ui.title:SetPoint("TOPLEFT", PAD, -14)
  ui.title:SetText("Unbored")

  local okClose, close = pcall(CreateFrame, "Button", nil, frame, "UIPanelCloseButton")
  if not okClose or not close then
    close = ns.UI.MakeButton(frame, "x", 22, 22)
  end
  close:SetPoint("TOPRIGHT", -4, -4)
  close:SetScript("OnClick", function()
    frame:Hide()
  end)

  local menuButton = CreateFrame("Button", nil, frame)
  menuButton:SetSize(20, 20)
  menuButton:SetPoint("RIGHT", close, "LEFT", -2, 0)
  menuButton:SetNormalTexture("Interface\\Buttons\\UI-OptionsButton")
  menuButton:SetHighlightTexture("Interface\\Buttons\\UI-Common-MouseHilight", "ADD")
  menuButton:SetScript("OnClick", function(self)
    ns.UI.ShowMenu(self, ns.UI.MenuItems())
  end)
  menuButton:SetScript("OnEnter", function(self)
    if GameTooltip then
      GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
      GameTooltip:SetText(ns.T("MENU_IMPORT") .. ", " .. ns.T("MENU_BUILD"):lower() .. "...")
      GameTooltip:Show()
    end
  end)
  menuButton:SetScript("OnLeave", function()
    if GameTooltip then
      GameTooltip:Hide()
    end
  end)

  -- Active plan line (wizard only).
  ui.activeText = font(frame, "GameFontHighlightSmall")
  ui.activeLink = ns.UI.MakeLink(frame, ns.T("SHOW_TRACKER"))
  ui.activeLink:SetScript("OnClick", function()
    ns.Tracker:Reveal()
  end)

  -- Wizard.
  ui.stepWhat = font(frame, "GameFontNormal")
  ui.stepWhat:SetText(ns.T("STEP_WHAT"))
  ui.cards = {}
  for i = 1, #MODE_CARDS do
    ui.cards[i] = makeCard(frame, MODE_CARDS[i])
  end

  ui.stepTime = font(frame, "GameFontNormal")
  ui.stepTime:SetText(ns.T("STEP_TIME"))
  ui.budgetButtons = {}
  local budgetWidth = math.floor((INNER - 16) / 3)
  for i = 1, #BUDGETS do
    local info = BUDGETS[i]
    local button = ns.UI.MakeButton(frame, ns.T(info.caption), budgetWidth, 26)
    button.minutes = info.minutes
    button:SetScript("OnClick", function()
      ns.Session:SetBudget(info.minutes)
    end)
    ui.budgetButtons[i] = button
  end

  ui.stepWish = font(frame, "GameFontNormal")
  ui.stepWish:SetText(ns.T("STEP_WISH"))
  local okBox, box = pcall(CreateFrame, "Frame", nil, frame, "BackdropTemplate")
  if not okBox or not box then
    box = CreateFrame("Frame", nil, frame)
  end
  box:SetSize(INNER, 92)
  ns.UI.ApplyBackdrop(box, { 0, 0, 0, 0.55 }, { 0.4, 0.4, 0.4, 1 })
  local wish = CreateFrame("EditBox", nil, box)
  wish:SetMultiLine(true)
  wish:SetAutoFocus(false)
  wish:SetMaxLetters(300)
  wish:SetFontObject(ChatFontNormal or GameFontHighlight)
  wish:SetPoint("TOPLEFT", 8, -7)
  wish:SetPoint("BOTTOMRIGHT", -8, 7)
  wish:SetWidth(INNER - 16)
  wish:SetTextInsets(0, 0, 0, 0)
  local placeholder = font(box, "GameFontDisable")
  placeholder:SetPoint("TOPLEFT", 9, -8)
  placeholder:SetWidth(INNER - 18)
  placeholder:SetText(ns.T("WISH_HINT"))
  local function updatePlaceholder()
    local text = wish:GetText() or ""
    placeholder:SetShown(text == "" and not wish:HasFocus())
  end
  wish:SetScript("OnEscapePressed", function(self)
    self:ClearFocus()
  end)
  wish:SetScript("OnTextChanged", function()
    updatePlaceholder()
    if type(UnboredCharDB) == "table" then
      local text = ns.Trim(wish:GetText() or "")
      UnboredCharDB.lastWish = text ~= "" and text or nil
    end
  end)
  wish:SetScript("OnEditFocusGained", updatePlaceholder)
  wish:SetScript("OnEditFocusLost", updatePlaceholder)
  box:EnableMouse(true)
  box:SetScript("OnMouseDown", function()
    wish:SetFocus()
  end)
  if type(UnboredCharDB) == "table" and type(UnboredCharDB.lastWish) == "string" then
    wish:SetText(UnboredCharDB.lastWish)
  end
  updatePlaceholder()
  ui.wishBox = box
  ui.wish = wish

  ui.primary = ns.UI.MakeButton(frame, ns.T("GET_PLAN"), INNER, 34)
  setPrimaryFont(ui.primary)
  ui.primary:SetScript("OnClick", function()
    ns.UI.OnPrimary()
  end)
  ui.hint = font(frame, "GameFontDisableSmall")
  ui.hint:SetJustifyH("CENTER")

  -- Waiting and failed screens.
  ui.stateTitle = font(frame, "GameFontNormalLarge")
  ui.stateSummary = font(frame, "GameFontHighlight")
  ui.stateBody = font(frame, "GameFontHighlightSmall")
  ui.stateNote = font(frame, "GameFontDisableSmall")
  ui.cancel = ns.UI.MakeLink(frame, ns.T("CANCEL_REQUEST"))
  ui.cancel:SetScript("OnClick", function()
    ns.Session:CancelRequest()
  end)

  ns.Session:NoteRequest()
  ui:Refresh()
end

-- What the one big button does depends on the screen.
function ns.UI.OnPrimary()
  local view = ns.UI.view
  if view == "waiting" then
    ns.Session.LoadPlan()
    return
  end
  if view == "failed" then
    ns.Session:CancelRequest()
    return
  end
  if not ns.UI.HasCompanion() then
    ns.Session:BuildHere(ns.Session.ChosenMode(), ns.Session.ChosenBudget())
    return
  end
  local text = ns.UI.wish and ns.UI.wish:GetText() or ""
  ns.Session:RequestPlan(text)
  -- Same click: ReloadUI needs a hardware event, and the reload is what
  -- writes SavedVariables for the companion.
  ns.Session.LoadPlan()
end

function ns.UI.View()
  local note = ns.Session and ns.Session.requestNote
  if note == "failed" then
    return "failed"
  end
  if note == "sending" or note == "preparing" or note == "ready" then
    return "waiting"
  end
  return "wizard"
end

local function summaryOfRequest()
  local req = ns.Session:PendingRequest()
  if not req then
    return ""
  end
  local parts = { ns.ModeLabel(req.mode), ns.T("BUDGET_" .. tostring(req.budget)) }
  if parts[2] == "BUDGET_" .. tostring(req.budget) then
    parts[2] = ns.T("MINUTES", tonumber(req.budget) or 0)
  end
  local text = table.concat(parts, "  ·  ")
  if type(req.wish) == "string" and req.wish ~= "" then
    text = text .. "\n\"" .. req.wish .. "\""
  end
  return text
end

function ns.UI:Refresh()
  if not self.frame or not self.frame:IsShown() then
    return
  end
  local frame = self.frame
  local view = ns.UI.View()
  self.view = view
  local y = -44

  local function put(region, height, x)
    region:ClearAllPoints()
    region:SetPoint("TOPLEFT", frame, "TOPLEFT", PAD + (x or 0), y)
    region:Show()
    y = y - height
  end
  local function text(fs, value, gap)
    fs:SetText(value or "")
    local height = ns.UI.Measure(fs, INNER)
    if height == 0 then
      fs:Hide()
      return
    end
    put(fs, height)
    y = y - (gap or GAP)
  end

  local wizardParts = { self.stepWhat, self.stepTime, self.stepWish, self.wishBox, self.activeText, self.activeLink }
  for i = 1, #wizardParts do
    wizardParts[i]:Hide()
  end
  for i = 1, #self.cards do
    self.cards[i]:Hide()
  end
  for i = 1, #self.budgetButtons do
    self.budgetButtons[i]:Hide()
  end
  local stateParts = { self.stateTitle, self.stateSummary, self.stateBody, self.stateNote, self.cancel }
  for i = 1, #stateParts do
    stateParts[i]:Hide()
  end
  self.hint:Hide()

  if view == "wizard" then
    local progress = ns.Session:Progress()
    if progress and progress.remaining > 0 then
      self.activeText:SetText(ns.T("ACTIVE_PLAN", progress.step, progress.steps))
      local height = ns.UI.Measure(self.activeText, INNER - 110)
      put(self.activeText, 0)
      self.activeLink:ClearAllPoints()
      self.activeLink:SetPoint("TOPRIGHT", frame, "TOPRIGHT", -PAD + 4, y + 2)
      self.activeLink:SetShown(not (ns.Tracker and ns.Tracker.frame and ns.Tracker.frame:IsShown()))
      y = y - math.max(height, 16) - GAP
    end

    text(self.stepWhat, ns.T("STEP_WHAT"), 6)
    local chosen = ns.Session.ChosenMode()
    for i = 1, #self.cards do
      local card = self.cards[i]
      local height = layoutCard(card, card.mode == chosen)
      put(card, height)
      y = y - 4
    end
    y = y - GAP + 4

    text(self.stepTime, ns.T("STEP_TIME"), 6)
    local budget = ns.Session.ChosenBudget()
    for i = 1, #self.budgetButtons do
      local button = self.budgetButtons[i]
      button:ClearAllPoints()
      button:SetPoint("TOPLEFT", frame, "TOPLEFT", PAD + (i - 1) * (button:GetWidth() + 8), y)
      button:Show()
      local label = button.GetFontString and button:GetFontString()
      if button.minutes == budget then
        if button.LockHighlight then
          button:LockHighlight()
        end
        if label then
          label:SetTextColor(GOLD[1], GOLD[2], GOLD[3])
        end
      else
        if button.UnlockHighlight then
          button:UnlockHighlight()
        end
        if label then
          label:SetTextColor(1, 1, 1)
        end
      end
    end
    y = y - 26 - GAP - 4

    text(self.stepWish, ns.T("STEP_WISH"), 6)
    put(self.wishBox, self.wishBox:GetHeight())
    y = y - GAP - 6

    local companion = ns.UI.HasCompanion()
    self.primary:SetText(companion and ns.T("GET_PLAN") or ns.T("BUILD_PLAN"))
    self.primary:Enable()
    put(self.primary, self.primary:GetHeight())
    y = y - 6
    text(self.hint, companion and ns.T("GET_PLAN_HINT") or ns.T("BUILD_HINT"), 0)
  elseif view == "waiting" then
    text(self.stateTitle, ns.T("WAIT_TITLE"), 8)
    text(self.stateSummary, summaryOfRequest(), GAP)
    local note = ns.Session.requestNote
    text(self.stateBody, note == "sending" and ns.T("WAIT_SENDING") or ns.T("WAIT_PREPARING"), 6)
    local age = ns.Session:RequestAge()
    local notice = ns.T("WAIT_NOTIFY")
    if age and age > 20 * 60 then
      notice = ns.T("WAIT_STALE", math.floor(age / 60))
    end
    text(self.stateNote, notice, GAP + 4)
    self.primary:SetText(ns.T("LOAD_PLAN"))
    self.primary:Enable()
    put(self.primary, self.primary:GetHeight())
    y = y - 8
    self.cancel:ClearAllPoints()
    self.cancel:SetPoint("TOP", frame, "TOP", 0, y)
    self.cancel:Show()
    y = y - 18
  else
    text(self.stateTitle, ns.T("FAIL_TITLE"), 8)
    local reason = ns.Session.requestReason
    if type(reason) ~= "string" or reason == "" then
      reason = ns.T("REQUEST_FAILED")
    end
    text(self.stateBody, reason, GAP + 4)
    self.primary:SetText(ns.T("TRY_AGAIN"))
    self.primary:Enable()
    put(self.primary, self.primary:GetHeight())
  end

  frame:SetHeight(math.ceil(-y + PAD))
end

function ns.UI:Show()
  if not self.frame then
    return
  end
  if ns.Session and not ns.Session.started then
    ns.Session:Start()
  end
  self.frame:Show()
  self:Refresh()
end

function ns.UI:Toggle()
  if not self.frame then
    return
  end
  if self.frame:IsShown() then
    self.frame:Hide()
  else
    self:Show()
  end
end
