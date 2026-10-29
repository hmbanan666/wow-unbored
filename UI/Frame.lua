local _, ns = ...

ns.UI = ns.UI or {}

function ns.UI.ApplyBackdrop(frame)
  if not frame.SetBackdrop then
    return false
  end
  local ok = pcall(frame.SetBackdrop, frame, {
    bgFile = "Interface\\Buttons\\WHITE8x8",
    edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
    tile = true,
    tileSize = 8,
    edgeSize = 12,
    insets = { left = 3, right = 3, top = 3, bottom = 3 },
  })
  if not ok then
    return false
  end
  frame:SetBackdropColor(0.05, 0.05, 0.05, 0.9)
  frame:SetBackdropBorderColor(0.55, 0.45, 0.22, 1)
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
  end
  button:SetSize(width, height)
  button:SetText(text)
  return button
end

local function font(parent, template)
  return parent:CreateFontString(nil, "OVERLAY", template or "GameFontHighlight")
end

local function placeWindow(frame)
  local window = ns.DB and ns.DB.window or {}
  frame:ClearAllPoints()
  frame:SetPoint(window.point or "TOPRIGHT", UIParent, window.rel or "TOPRIGHT", window.x or -80, window.y or -220)
end

local function saveWindow(frame)
  local point, _, rel, x, y = frame:GetPoint(1)
  x, y = ns.AsNumber(x), ns.AsNumber(y)
  if not point or not x or not y or not ns.DB then
    return
  end
  ns.DB.window = { point = point, rel = rel or "TOPRIGHT", x = x, y = y }
end

function ns.UI.Create()
  if ns.UI.frame then
    return
  end
  local okFrame, frame = pcall(CreateFrame, "Frame", "UnboredFrame", UIParent, "BackdropTemplate")
  if not okFrame or not frame then
    frame = CreateFrame("Frame", "UnboredFrame", UIParent)
  end
  frame:SetSize(320, 308)
  frame:SetFrameStrata("MEDIUM")
  frame:SetClampedToScreen(true)
  frame:SetMovable(true)
  frame:EnableMouse(true)
  frame:Hide()
  ns.UI.ApplyBackdrop(frame)
  placeWindow(frame)

  local drag = CreateFrame("Frame", nil, frame)
  drag:SetPoint("TOPLEFT", 8, -4)
  drag:SetPoint("TOPRIGHT", -8, -4)
  drag:SetHeight(22)
  drag:EnableMouse(true)
  drag:RegisterForDrag("LeftButton")
  drag:SetScript("OnDragStart", function()
    frame:StartMoving()
  end)
  drag:SetScript("OnDragStop", function()
    frame:StopMovingOrSizing()
    saveWindow(frame)
  end)

  local title = font(frame, "GameFontNormal")
  title:SetPoint("TOPLEFT", 14, -8)
  title:SetText("Unbored")

  local close = ns.UI.MakeButton(frame, "x", 22, 18)
  close:SetPoint("TOPRIGHT", -8, -6)
  close:SetScript("OnClick", function()
    frame:Hide()
  end)

  local modeButton = ns.UI.MakeButton(frame, ns.ModeLabel("roam"), 118, 22)
  modeButton:SetPoint("TOPLEFT", 12, -32)

  local budgets = {
    { minutes = 30, caption = ns.T("BUDGET_30") },
    { minutes = 60, caption = ns.T("BUDGET_60") },
    { minutes = 120, caption = ns.T("BUDGET_120") },
  }
  local budgetButtons = {}
  for i = 1, #budgets do
    local info = budgets[i]
    local button = ns.UI.MakeButton(frame, info.caption, 36, 22)
    button:SetPoint("LEFT", modeButton, "RIGHT", 8 + (i - 1) * 40, 0)
    button.minutes = info.minutes
    button.caption = info.caption
    button:SetScript("OnClick", function()
      ns.Session:SetBudget(info.minutes)
    end)
    budgetButtons[i] = button
  end

  local timeText = font(frame, "GameFontHighlightSmall")
  timeText:SetPoint("TOPLEFT", 14, -60)
  timeText:SetJustifyH("LEFT")

  local importButton = ns.UI.MakeButton(frame, ns.T("IMPORT"), 70, 20)
  importButton:SetPoint("TOPRIGHT", -78, -56)
  importButton:SetScript("OnClick", function()
    if ns.ShowImport then
      ns.ShowImport()
    end
  end)

  local refreshButton = ns.UI.MakeButton(frame, ns.T("REFRESH"), 64, 20)
  refreshButton:SetPoint("TOPRIGHT", -10, -56)
  refreshButton:SetScript("OnClick", function()
    if ns.Session.state and ns.Session.state.source ~= "provider" then
      ns.Print(ns.T("CLEARED_IMPORT"))
    end
    ns.Session:Rebuild(ns.Session:Mode(), ns.Session:Budget())
  end)

  local banner = font(frame, "GameFontDisableSmall")
  banner:SetPoint("TOPLEFT", 14, -80)
  banner:SetPoint("TOPRIGHT", -14, -80)
  banner:SetJustifyH("LEFT")

  local nowLabel = font(frame, "GameFontNormal")
  nowLabel:SetPoint("TOPLEFT", 14, -98)
  nowLabel:SetText(ns.T("NOW"))

  local nowTitle = font(frame, "GameFontHighlight")
  nowTitle:SetPoint("TOPLEFT", 14, -116)
  nowTitle:SetPoint("TOPRIGHT", -14, -116)
  nowTitle:SetJustifyH("LEFT")
  nowTitle:SetWordWrap(true)
  nowTitle:SetHeight(36)

  local detail = font(frame, "GameFontHighlightSmall")
  detail:SetPoint("TOPLEFT", 14, -152)
  detail:SetPoint("TOPRIGHT", -14, -152)
  detail:SetJustifyH("LEFT")
  detail:SetWordWrap(true)
  detail:SetHeight(28)

  local done = ns.UI.MakeButton(frame, ns.T("DONE"), 84, 22)
  done:SetPoint("TOPLEFT", 12, -184)
  done:SetScript("OnClick", function()
    ns.Session:Done()
  end)
  local skip = ns.UI.MakeButton(frame, ns.T("SKIP"), 84, 22)
  skip:SetPoint("LEFT", done, "RIGHT", 6, 0)
  skip:SetScript("OnClick", function()
    ns.Session:Skip()
  end)
  local waypoint = ns.UI.MakeButton(frame, ns.T("WAYPOINT"), 100, 22)
  waypoint:SetPoint("LEFT", skip, "RIGHT", 6, 0)
  waypoint:SetScript("OnClick", function()
    ns.Session:Waypoint()
  end)

  local nextLabel = font(frame, "GameFontNormalSmall")
  nextLabel:SetPoint("TOPLEFT", 14, -216)
  nextLabel:SetText(ns.T("NEXT"))

  local nextTitle = font(frame, "GameFontHighlightSmall")
  nextTitle:SetPoint("TOPLEFT", 14, -232)
  nextTitle:SetPoint("TOPRIGHT", -14, -232)
  nextTitle:SetJustifyH("LEFT")

  local more = CreateFrame("Button", nil, frame)
  more:SetPoint("TOPLEFT", 14, -252)
  more:SetSize(220, 16)
  local moreText = more:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  moreText:SetAllPoints()
  moreText:SetJustifyH("LEFT")
  more.SetText = function(_, text)
    moreText:SetText(text or "")
  end
  more:SetScript("OnClick", function()
    ns.UI.expanded = not ns.UI.expanded
    ns.UI:Refresh()
  end)

  local extraLines = {}
  for i = 1, 6 do
    local line = font(frame, "GameFontDisableSmall")
    line:SetPoint("TOPLEFT", 14, -248 - (i - 1) * 14)
    line:SetPoint("TOPRIGHT", -14, -248 - (i - 1) * 14)
    line:SetJustifyH("LEFT")
    line:Hide()
    extraLines[i] = line
  end

  local catcher = CreateFrame("Button", nil, UIParent)
  catcher:SetAllPoints(UIParent)
  catcher:SetFrameStrata("DIALOG")
  catcher:EnableMouse(true)
  catcher:RegisterForClicks("AnyUp")
  catcher:Hide()

  local okMenu, menu = pcall(CreateFrame, "Frame", nil, UIParent, "BackdropTemplate")
  if not okMenu or not menu then
    menu = CreateFrame("Frame", nil, UIParent)
  end
  menu:SetFrameStrata("DIALOG")
  menu:SetFrameLevel(catcher:GetFrameLevel() + 5)
  menu:SetSize(140, #ns.MODES * 24 + 10)
  ns.UI.ApplyBackdrop(menu)
  menu:Hide()
  for i = 1, #ns.MODES do
    local mode = ns.MODES[i]
    local button = ns.UI.MakeButton(menu, ns.T(mode.key), 124, 20)
    button:SetPoint("TOPLEFT", 8, -6 - (i - 1) * 24)
    button:SetScript("OnClick", function()
      menu:Hide()
      catcher:Hide()
      ns.Session:SetMode(mode.id)
    end)
  end
  catcher:SetScript("OnClick", function()
    menu:Hide()
    catcher:Hide()
  end)
  modeButton:SetScript("OnClick", function()
    if menu:IsShown() then
      menu:Hide()
      catcher:Hide()
      return
    end
    catcher:Show()
    menu:ClearAllPoints()
    menu:SetPoint("TOPLEFT", modeButton, "BOTTOMLEFT", 0, -2)
    menu:Show()
  end)

  ns.UI.frame = frame
  ns.UI.modeButton = modeButton
  ns.UI.budgetButtons = budgetButtons
  ns.UI.timeText = timeText
  ns.UI.banner = banner
  ns.UI.nowTitle = nowTitle
  ns.UI.detail = detail
  ns.UI.done = done
  ns.UI.skip = skip
  ns.UI.waypoint = waypoint
  ns.UI.nextLabel = nextLabel
  ns.UI.nextTitle = nextTitle
  ns.UI.more = more
  ns.UI.extraLines = extraLines
  ns.UI.menu = menu
  ns.UI:Refresh()
end

local function setButtonColor(button, active)
  local label = button.GetFontString and button:GetFontString()
  if label and label.SetTextColor then
    if active then
      label:SetTextColor(1, 0.82, 0)
    else
      label:SetTextColor(1, 1, 1)
    end
  end
end

function ns.UI:Refresh()
  if not self.frame then
    return
  end
  local state = ns.Session and ns.Session.state
  local tasks = (state and state.tasks) or {}
  local current = tasks[1]
  local upcoming = tasks[2]
  local mode = (state and state.mode) or (ns.DB and ns.DB.mode) or "roam"
  local label = ns.ModeLabel(mode)
  if state and state.source and state.source ~= "provider" then
    label = label .. " *"
  end
  self.modeButton:SetText(label)

  local budget = (state and state.budget) or 60
  for i = 1, #self.budgetButtons do
    local button = self.budgetButtons[i]
    setButtonColor(button, button.minutes == budget)
  end

  local sum = 0
  for i = 1, #tasks do
    sum = sum + (tasks[i].estMinutes or 0)
  end
  self.timeText:SetText(ns.T("PLANNED", sum))

  if ns.IsCombat() then
    self.banner:SetText(ns.T("COMBAT"))
  elseif ns.IsInstance() then
    self.banner:SetText(ns.T("INSTANCE"))
  elseif state and state.pendingCalendar and #tasks == 0 then
    self.banner:SetText(ns.T("CALENDAR_WAIT"))
  else
    self.banner:SetText("")
  end

  local paused = ns.IsPaused()
  if not current then
    self.nowTitle:SetText(ns.T("EMPTY"))
    self.detail:SetText("")
    self.done:SetEnabled(false)
    self.skip:SetEnabled(false)
    self.waypoint:SetEnabled(false)
  else
    self.nowTitle:SetText(current.title)
    local bits = ns.T("MINUTES", current.estMinutes or 0)
    if current.note and current.note ~= "" then
      bits = bits .. "  " .. current.note
    end
    self.detail:SetText(bits)
    self.done:SetEnabled(true)
    self.skip:SetEnabled(true)
    local canPin = current.mapID and current.x and current.y and not paused
    self.waypoint:SetEnabled(canPin and true or false)
  end

  if upcoming then
    self.nextLabel:Show()
    self.nextTitle:Show()
    self.nextTitle:SetText(upcoming.title)
  else
    self.nextLabel:Hide()
    self.nextTitle:SetText("")
    self.nextTitle:Hide()
  end

  local extra = #tasks - 2
  for i = 1, #self.extraLines do
    self.extraLines[i]:Hide()
  end
  if self.expanded and extra > 0 then
    self.more:SetText(ns.T("LESS"))
    self.frame:SetHeight(308 + math.min(extra, 6) * 14)
    for i = 1, math.min(extra, 6) do
      local task = tasks[i + 2]
      self.extraLines[i]:SetText(task.title)
      self.extraLines[i]:Show()
    end
  else
    self.expanded = false
    self.frame:SetHeight(308)
    if extra == 1 then
      self.more:SetText(ns.T("MORE_ONE"))
    elseif extra > 1 then
      self.more:SetText(ns.T("MORE", extra))
    else
      self.more:SetText("")
    end
  end
end

function ns.UI:Show()
  if self.frame then
    self.frame:Show()
    self:Refresh()
  end
end

function ns.UI:Toggle()
  if not self.frame then
    return
  end
  if not ns.Session.state then
    ns.Session:Start()
  end
  if self.frame:IsShown() then
    self.frame:Hide()
  else
    self.frame:Show()
    self:Refresh()
  end
end
