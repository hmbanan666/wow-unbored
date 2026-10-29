-- Main window: the mascot asks one thing per screen. A question, "what to do
-- nearby", or "what is this item". Picking a plan and the active plan live
-- in the mascot bubble (UI/Mascot.lua).

local _, ns = ...

ns.UI = ns.UI or {}

local WIDTH = 340
local PAD = 16
local INNER = WIDTH - PAD * 2
local GAP = 10
local GOLD = { 1, 0.82, 0 }

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

-- Small popup menu, used when the game's MenuUtil is missing.
-- items: { text, func, checked (bool or function), children, title }
function ns.UI.ShowMenu(anchor, items)
  local rows = {}
  for i = 1, #items do
    if not items[i].title then
      rows[#rows + 1] = items[i]
    end
  end
  items = rows
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
    row.label:SetText(item.children and (item.text .. "  >") or item.text)
    local labelWidth = ns.AsNumber(row.label:GetStringWidth()) or 0
    width = math.max(width, math.ceil(labelWidth) + 40)
    local checked = item.checked
    if type(checked) == "function" then
      checked = checked()
    end
    row.check:SetShown(checked == true)
    row:SetScript("OnClick", function()
      menu:Hide()
      menu.catcher:Hide()
      if item.children then
        ns.UI.ShowMenu(anchor, item.children)
      elseif item.func then
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
  return ns.Mascot:SettingsTree()
end

-- A multiline box with a grey hint inside it. onChange(text) on every edit.
function ns.UI.MakeTextBox(parent, hint, maxLetters, onChange, width, height)
  width = width or INNER
  local okBox, box = pcall(CreateFrame, "Frame", nil, parent, "BackdropTemplate")
  if not okBox or not box then
    box = CreateFrame("Frame", nil, parent)
  end
  box:SetSize(width, height or 92)
  ns.UI.ApplyBackdrop(box, { 0, 0, 0, 0.55 }, { 0.4, 0.4, 0.4, 1 })
  local edit = CreateFrame("EditBox", nil, box)
  edit:SetMultiLine(true)
  edit:SetAutoFocus(false)
  edit:SetMaxLetters(maxLetters)
  edit:SetFontObject(ChatFontNormal or GameFontHighlight)
  edit:SetPoint("TOPLEFT", 8, -7)
  edit:SetPoint("BOTTOMRIGHT", -8, 7)
  edit:SetWidth(width - 16)
  edit:SetTextInsets(0, 0, 0, 0)
  local placeholder = font(box, "GameFontDisable")
  placeholder:SetPoint("TOPLEFT", 9, -8)
  placeholder:SetWidth(width - 18)
  placeholder:SetText(hint)
  box.placeholder = placeholder
  local function update()
    local text = edit:GetText() or ""
    placeholder:SetShown(text == "" and not edit:HasFocus())
  end
  box.UpdatePlaceholder = update
  edit:SetScript("OnEscapePressed", function(self)
    self:ClearFocus()
  end)
  edit:SetScript("OnTextChanged", function()
    update()
    if onChange then
      onChange(ns.Trim(edit:GetText() or ""))
    end
  end)
  edit:SetScript("OnEditFocusGained", update)
  edit:SetScript("OnEditFocusLost", update)
  box:EnableMouse(true)
  box:SetScript("OnMouseDown", function()
    edit:SetFocus()
  end)
  update()
  return box, edit
end

local function itemIcon(itemID)
  if C_Item and C_Item.GetItemIconByID then
    local icon = ns.Call(C_Item.GetItemIconByID, itemID)
    if icon then
      return icon
    end
  end
  return "Interface\\Icons\\INV_Misc_QuestionMark"
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

  ui.portrait = frame:CreateTexture(nil, "ARTWORK")
  ui.portrait:SetSize(36, 36)
  ui.portrait:SetPoint("TOPLEFT", PAD - 4, -8)
  ui.portrait:SetTexture(ns.MEDIA .. "WispIdle64")
  ui.title = frame:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
  ui.title:SetPoint("LEFT", ui.portrait, "RIGHT", 6, 0)
  ui.title:SetText(ns.MASCOT_NAME)
  ui.title:SetTextColor(0.37, 0.89, 0.83)

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

  -- Ask something / what to do nearby: one line from the mascot, one box.
  ui.speech = font(frame, "GameFontNormal")
  ui.askBox, ui.ask = ns.UI.MakeTextBox(frame, ns.T("ASK_HINT"), 300, function()
    ui.askError = nil
  end)

  -- What is this item: a slot to drop it on, then what is known about it.
  local slot = CreateFrame("Button", nil, frame)
  slot:SetSize(40, 40)
  slot:RegisterForClicks("AnyUp")
  slot.bg = slot:CreateTexture(nil, "BACKGROUND")
  slot.bg:SetAllPoints()
  slot.bg:SetTexture("Interface\\PaperDoll\\UI-Backpack-EmptySlot")
  slot.icon = slot:CreateTexture(nil, "ARTWORK")
  slot.icon:SetPoint("TOPLEFT", 2, -2)
  slot.icon:SetPoint("BOTTOMRIGHT", -2, 2)
  slot:SetHighlightTexture("Interface\\Buttons\\ButtonHilight-Square", "ADD")
  local function dropOnSlot()
    local item = ns.Items.FromCursor()
    if item then
      ui:OpenItem(item)
    end
  end
  slot:SetScript("OnReceiveDrag", dropOnSlot)
  slot:SetScript("OnClick", dropOnSlot)
  slot:SetScript("OnEnter", function(self)
    if not GameTooltip then
      return
    end
    GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
    if ui.item and ui.item.link then
      pcall(GameTooltip.SetHyperlink, GameTooltip, ui.item.link)
    else
      GameTooltip:SetText(ns.T("ITEM_DROP"))
    end
    GameTooltip:Show()
  end)
  slot:SetScript("OnLeave", function()
    if GameTooltip then
      GameTooltip:Hide()
    end
  end)
  ui.slot = slot
  ui.itemName = font(frame, "GameFontHighlight")
  ui.itemFacts = font(frame, "GameFontHighlightSmall")

  ui.primary = ns.UI.MakeButton(frame, ns.T("SEND"), INNER, 34)
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

-- What the one big button does depends on the screen. Every send saves the
-- request and reloads in the same click: ReloadUI needs a hardware event,
-- and the reload is what writes SavedVariables for the companion.
function ns.UI.OnPrimary()
  local ui = ns.UI
  local view = ui.view
  if view == "waiting" then
    ns.Session.LoadPlan()
    return
  end
  if view == "failed" then
    ns.Session:CancelRequest()
    return
  end
  local companion = ui.HasCompanion()
  local text = ns.Trim(ui.ask and ui.ask:GetText() or "")
  if view == "nearby" then
    if not companion then
      ns.Session:BuildHere("roam", ns.Session.ChosenBudget())
      return
    end
    if text == "" then
      text = ns.T("NEARBY_QUESTION")
    end
    if ns.Session:Ask({ type = "question", topic = "nearby", question = text }) then
      ui.ask:SetText("")
      ns.Session.LoadPlan()
    end
    return
  end
  if not companion then
    return
  end
  if view == "ask" then
    if text == "" then
      ui.askError = ns.T("ASK_EMPTY")
      ui:Refresh()
      return
    end
    if ns.Session:Ask({ type = "question", question = text }) then
      ui.ask:SetText("")
      ns.Session.LoadPlan()
    end
    return
  end
  if view == "item" and ui.item then
    if ns.Session:Ask({ type = "item", item = ui.item }) then
      ns.Session.LoadPlan()
    end
  end
end

-- Screens: ask, nearby, item; a request that is out shows waiting
-- or failed instead, whatever was opened.
function ns.UI.View()
  local note = ns.Session and ns.Session.requestNote
  if note == "failed" then
    return "failed"
  end
  if note == "sending" or note == "preparing" or note == "ready" then
    return "waiting"
  end
  local mode = ns.UI.mode
  if mode == "nearby" or mode == "item" then
    return mode
  end
  return "ask"
end

function ns.UI:Refresh()
  if not self.frame or not self.frame:IsShown() then
    return
  end
  local frame = self.frame
  local view = ns.UI.View()
  self.view = view
  local y = -52

  local function put(region, height, x)
    region:ClearAllPoints()
    region:SetPoint("TOPLEFT", frame, "TOPLEFT", PAD + (x or 0), y)
    region:Show()
    y = y - height
  end
  local function text(fs, value, gap, width)
    fs:SetText(value or "")
    local height = ns.UI.Measure(fs, width or INNER)
    if height == 0 then
      fs:Hide()
      return
    end
    put(fs, height)
    y = y - (gap or GAP)
  end
  local function primary(label, enabled)
    self.primary:SetText(label)
    if enabled == false then
      self.primary:Disable()
    else
      self.primary:Enable()
    end
    put(self.primary, self.primary:GetHeight())
    y = y - 6
  end

  local parts = {
    self.speech, self.askBox, self.slot, self.itemName, self.itemFacts,
    self.stateTitle, self.stateSummary, self.stateBody, self.stateNote, self.cancel, self.hint,
  }
  for i = 1, #parts do
    parts[i]:Hide()
  end
  local companion = ns.UI.HasCompanion()
  self.portrait:SetTexture(ns.MEDIA .. (view == "waiting" and "WispThinking64" or "WispIdle64"))

  if view == "ask" or view == "nearby" then
    local nearby = view == "nearby"
    text(self.speech, nearby and ns.T("NEARBY_TITLE") or ns.T("ASK_TITLE"), 8)
    self.askBox.placeholder:SetText(nearby and ns.T("NEARBY_HINT") or ns.T("ASK_HINT"))
    self.askBox.UpdatePlaceholder()
    put(self.askBox, self.askBox:GetHeight())
    y = y - GAP - 6
    if nearby and not companion then
      primary(ns.T("BUILD_PLAN"))
      text(self.hint, ns.T("BUILD_HINT"), 0)
    else
      primary(ns.T("SEND"), companion)
      local hint = ns.T("GET_PLAN_HINT")
      if not companion then
        hint = ns.T("NEED_COMPANION")
      elseif self.askError then
        hint = self.askError
      end
      text(self.hint, hint, 0)
    end
  elseif view == "item" then
    text(self.speech, ns.T("ITEM_TITLE"), 8)
    local item = self.item
    local top = y
    put(self.slot, 40)
    if item then
      self.slot.icon:SetTexture(itemIcon(item.itemID))
      self.slot.icon:Show()
    else
      self.slot.icon:Hide()
    end
    self.itemName:SetText(item and (item.link or item.name or ("#" .. item.itemID)) or ns.T("ITEM_DROP"))
    local nameHeight = ns.UI.Measure(self.itemName, INNER - 50)
    self.itemName:ClearAllPoints()
    self.itemName:SetPoint("TOPLEFT", frame, "TOPLEFT", PAD + 50, top - math.max(0, (40 - nameHeight) / 2))
    self.itemName:Show()
    y = math.min(y, top - nameHeight) - GAP
    if item then
      local facts = ns.Items.Facts(item.itemID, item.link, true)
      text(self.itemFacts, #facts > 0 and table.concat(facts, "\n\n") or ns.T("ITEM_NOTHING"), GAP + 4)
    end
    primary(ns.T("ITEM_ASK"), item ~= nil and companion)
    text(self.hint, companion and ns.T("GET_PLAN_HINT") or ns.T("NEED_COMPANION"), 0)
  elseif view == "waiting" then
    text(self.stateTitle, ns.T("THINKING"), 8)
    text(self.stateSummary, ns.Mascot.RequestSummary(ns.Session:PendingRequest() or {}), GAP)
    local note = ns.Session.requestNote
    text(self.stateBody, note == "sending" and ns.T("WAIT_SENDING") or ns.T("WAIT_PREPARING"), 6)
    local age = ns.Session:RequestAge()
    local notice = ns.T("WAIT_NOTIFY")
    if age and age > 20 * 60 then
      notice = ns.T("WAIT_STALE", math.floor(age / 60))
    end
    text(self.stateNote, notice, GAP + 4)
    primary(ns.T("LOAD_PLAN"))
    y = y - 2
    self.cancel:ClearAllPoints()
    self.cancel:SetPoint("TOP", frame, "TOP", 0, y)
    self.cancel:Show()
    y = y - 18
  else
    text(self.stateTitle, ns.T("SORRY"), 8)
    local reason = ns.Session.requestReason
    if type(reason) ~= "string" or reason == "" then
      reason = ns.T("REQUEST_FAILED")
    end
    text(self.stateBody, reason, GAP + 4)
    primary(ns.T("TRY_AGAIN"))
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

-- Opens one screen: ask, nearby, or item. A new plan is picked in the
-- mascot bubble, so "wizard" (the old screen) goes there.
function ns.UI:Open(mode)
  if mode == nil or mode == "wizard" then
    if self.frame then
      self.frame:Hide()
    end
    ns.Mascot:ShowChoice()
    return
  end
  self.mode = mode
  self.askError = nil
  if self.mode ~= "item" then
    self.item = nil
  end
  self:Show()
  if (self.mode == "ask" or self.mode == "nearby") and self.ask and self.view == self.mode then
    self.ask:SetFocus()
  end
end

function ns.UI:OpenItem(item)
  self.item = item
  self:Open("item")
end

function ns.UI:Toggle()
  if not self.frame then
    return
  end
  if self.frame:IsShown() then
    self.frame:Hide()
  else
    ns.Mascot:ShowChoice()
  end
end
