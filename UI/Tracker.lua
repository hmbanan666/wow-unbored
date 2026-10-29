-- The whole plan as a list, shown only on demand (the mascot bubble shows
-- one step at a time). Small, movable, lockable.
-- Every string is measured after its width is set, and the frame height is
-- the sum of what was drawn, so text wraps instead of being cut.

local _, ns = ...

ns.Tracker = {
  expanded = {},
  showAll = false,
  rows = {},
}

local WIDTH = 270
local PAD = 10
local INDENT = 14
local ICONS = 40
local MAX_UPCOMING = 4

local function db()
  if not ns.DB then
    return {}
  end
  if type(ns.DB.tracker) ~= "table" then
    ns.DB.tracker = {}
  end
  return ns.DB.tracker
end

local function font(parent, template)
  local fs = parent:CreateFontString(nil, "OVERLAY", template)
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

local function tooltip(owner, text)
  owner:SetScript("OnEnter", function(self)
    if GameTooltip then
      GameTooltip:SetOwner(self, "ANCHOR_LEFT")
      GameTooltip:SetText(text, 1, 1, 1, 1, true)
      GameTooltip:Show()
    end
  end)
  owner:SetScript("OnLeave", function()
    if GameTooltip then
      GameTooltip:Hide()
    end
  end)
end

local function iconButton(parent, texture, tip, onClick)
  local button = CreateFrame("Button", nil, parent)
  button:SetSize(16, 16)
  button:SetNormalTexture(texture)
  button:SetHighlightTexture("Interface\\Buttons\\ButtonHilight-Square", "ADD")
  button:SetScript("OnClick", onClick)
  tooltip(button, tip)
  return button
end

function ns.Tracker.Locked()
  return db().locked == true
end

function ns.Tracker:SetLocked(locked)
  db().locked = locked and true or false
  if self.frame then
    self.frame:SetMovable(not locked)
  end
end

function ns.Tracker:SavePosition()
  local point, _, rel, x, y = self.frame:GetPoint(1)
  x, y = ns.AsNumber(x), ns.AsNumber(y)
  if point and x and y then
    local saved = db()
    saved.point, saved.rel, saved.x, saved.y = point, rel or point, x, y
  end
end

function ns.Tracker:Place()
  local saved = db()
  self.frame:ClearAllPoints()
  self.frame:SetPoint(saved.point or "TOPRIGHT", UIParent, saved.rel or "TOPRIGHT", saved.x or -300, saved.y or -230)
end

function ns.Tracker:ResetPosition()
  local saved = db()
  saved.point, saved.rel, saved.x, saved.y = nil, nil, nil, nil
  if self.frame then
    self:Place()
  end
end

function ns.Tracker:MenuItems()
  return {
    { text = ns.T("MENU_OPEN"), func = function() ns.Mascot:Reveal() end },
    { text = ns.T("MENU_WAYPOINT"), func = function() ns.Session:Waypoint() end },
    { text = ns.T("MENU_LOCK"), checked = self:Locked(), func = function() self:SetLocked(not self:Locked()) end },
    { text = ns.T("MENU_HIDE"), func = function() self:Hide() end },
  }
end

function ns.Tracker:Create()
  if self.frame then
    return
  end
  local okFrame, frame = pcall(CreateFrame, "Frame", "UnboredTracker", UIParent, "BackdropTemplate")
  if not okFrame or not frame then
    frame = CreateFrame("Frame", "UnboredTracker", UIParent)
  end
  frame:SetWidth(WIDTH)
  frame:SetFrameStrata("MEDIUM")
  frame:SetClampedToScreen(true)
  frame:SetMovable(not self:Locked())
  frame:EnableMouse(true)
  frame:Hide()
  ns.UI.ApplyBackdrop(frame, { 0, 0, 0, 0.5 }, { 0.3, 0.3, 0.3, 0.6 })
  self.frame = frame
  self:Place()

  local header = CreateFrame("Button", nil, frame)
  header:SetPoint("TOPLEFT", 0, 0)
  header:SetPoint("TOPRIGHT", 0, 0)
  header:RegisterForClicks("AnyUp")
  header:RegisterForDrag("LeftButton")
  header:SetScript("OnDragStart", function()
    if not self:Locked() then
      frame:StartMoving()
    end
  end)
  header:SetScript("OnDragStop", function()
    frame:StopMovingOrSizing()
    self:SavePosition()
  end)
  header:SetScript("OnClick", function(button, mouse)
    if mouse == "RightButton" then
      ns.UI.ShowMenu(button, self:MenuItems())
    end
  end)
  tooltip(header, ns.T("TIP_HEADER"))
  self.header = header

  self.title = font(frame, "GameFontNormal")
  self.sub = font(frame, "GameFontHighlightSmall")
  self.sub:SetTextColor(0.7, 0.7, 0.7)

  self.collapse = CreateFrame("Button", nil, frame)
  self.collapse:SetSize(16, 16)
  self.collapse:SetPoint("TOPRIGHT", -6, -7)
  self.collapse:SetHighlightTexture("Interface\\Buttons\\UI-PlusButton-Hilight", "ADD")
  self.collapse:SetScript("OnClick", function()
    db().collapsed = not db().collapsed
    self:Refresh()
  end)

  self.banner = font(frame, "GameFontHighlightSmall")
  self.bannerButton = ns.UI.MakeButton(frame, ns.T("LOAD_PLAN"), 110, 22)

  self.more = ns.UI.MakeLink(frame, "")
  self.more:SetScript("OnClick", function()
    self.showAll = not self.showAll
    self:Refresh()
  end)

  self.done = iconButton(frame, "Interface\\RaidFrame\\ReadyCheck-Ready", ns.T("TIP_DONE"), function()
    ns.Session:Done()
  end)
  self.skip = iconButton(frame, "Interface\\Buttons\\UI-SpellbookIcon-NextPage-Up", ns.T("TIP_SKIP"), function()
    ns.Session:Skip()
  end)
end

function ns.Tracker:Row(index)
  local row = self.rows[index]
  if row then
    return row
  end
  row = CreateFrame("Button", nil, self.frame)
  row:RegisterForClicks("LeftButtonUp")
  row.bar = row:CreateTexture(nil, "ARTWORK")
  row.bar:SetColorTexture(1, 0.82, 0, 0.9)
  row.bar:SetPoint("TOPLEFT", 0, -1)
  row.bar:SetPoint("BOTTOMLEFT", 0, 1)
  row.bar:SetWidth(2)
  row.title = font(row, "GameFontHighlight")
  row.meta = font(row, "GameFontNormalSmall")
  row.note = font(row, "GameFontHighlightSmall")
  row:SetScript("OnClick", function(button)
    if button.current then
      ns.Session:Waypoint()
    elseif button.taskId then
      self.expanded[button.taskId] = not self.expanded[button.taskId]
      self:Refresh()
    end
  end)
  self.rows[index] = row
  return row
end

function ns.Tracker.CurrentMeta(task)
  local point, index, count = ns.Waypoint.Target(task)
  local parts = {}
  if point and count > 1 then
    local label = ns.T("POINT", index, count)
    if type(point.label) == "string" and point.label ~= "" then
      label = label .. ": " .. point.label
    end
    parts[#parts + 1] = label
  end
  local yards = point and ns.Waypoint.DistanceTo(point)
  if yards then
    parts[#parts + 1] = ns.T("YARDS", math.floor(yards + 0.5))
  end
  parts[#parts + 1] = ns.T("MINUTES", task.estMinutes or 0)
  return table.concat(parts, "  ·  ")
end

-- Lays out one row at the top of the cursor; returns its height.
local function layoutRow(row, task, number, current, expanded, noNote)
  local textWidth = WIDTH - PAD * 2 - INDENT - (current and ICONS or 0)
  row.current = current
  row.taskId = task.id
  row.bar:SetShown(current)
  row.title:ClearAllPoints()
  row.title:SetPoint("TOPLEFT", INDENT, 0)
  if current then
    row.title:SetFontObject("GameFontHighlight")
    row.title:SetTextColor(1, 1, 1)
    row.title:SetText(task.title or "")
  else
    row.title:SetFontObject("GameFontHighlightSmall")
    row.title:SetTextColor(0.6, 0.6, 0.6)
    row.title:SetText(number .. ".  " .. (task.title or ""))
  end
  local height = ns.UI.Measure(row.title, textWidth)

  row.meta:ClearAllPoints()
  if current then
    row.meta:SetPoint("TOPLEFT", row.title, "BOTTOMLEFT", 0, -3)
    row.meta:SetText(ns.Tracker.CurrentMeta(task))
    row.meta:SetTextColor(1, 0.82, 0)
    row.metaHeight = ns.UI.Measure(row.meta, WIDTH - PAD * 2 - INDENT)
    height = height + 3 + row.metaHeight
    row.meta:Show()
  elseif expanded then
    row.meta:SetPoint("TOPLEFT", row.title, "BOTTOMLEFT", 0, -2)
    row.meta:SetText(ns.T("MINUTES", task.estMinutes or 0))
    row.meta:SetTextColor(0.55, 0.55, 0.55)
    height = height + 2 + ns.UI.Measure(row.meta, textWidth)
    row.meta:Show()
  else
    row.meta:Hide()
  end

  local showNote = not noNote and (current or expanded) and type(task.note) == "string" and task.note ~= ""
  row.note:ClearAllPoints()
  if showNote then
    row.note:SetPoint("TOPLEFT", row.meta, "BOTTOMLEFT", 0, -3)
    row.note:SetText(task.note)
    if current then
      row.note:SetTextColor(0.9, 0.9, 0.9)
    else
      row.note:SetTextColor(0.55, 0.55, 0.55)
    end
    height = height + 3 + ns.UI.Measure(row.note, WIDTH - PAD * 2 - INDENT)
    row.note:Show()
  else
    row.note:SetText("")
    row.note:Hide()
  end
  row:SetHeight(height)
  return height
end

local function planTitle(state)
  if type(state.note) == "string" and ns.Trim(state.note) ~= "" then
    return state.note
  end
  if state.mode and state.mode ~= "custom" then
    return "Unbored: " .. ns.ModeLabel(state.mode)
  end
  return ns.T("PLAN_TITLE_DEFAULT")
end

function ns.Tracker:Refresh()
  local frame = self.frame
  if not frame then
    return
  end
  local saved = db()
  local state = ns.Session and ns.Session.state
  local tasks = (state and state.tasks) or {}
  local note = ns.Session and ns.Session.requestNote
  local waiting = note == "sending" or note == "preparing" or note == "ready"
  local progress = ns.Session:Progress()
  local finished = state and #tasks == 0 and progress and progress.steps > 0
  if not saved.open or (#tasks == 0 and not waiting and not finished) then
    frame:Hide()
    return
  end
  frame:Show()

  local y = -PAD + 2
  local width = WIDTH - PAD * 2
  local function put(region, height, x)
    region:ClearAllPoints()
    region:SetPoint("TOPLEFT", frame, "TOPLEFT", PAD + (x or 0), y)
    region:Show()
    y = y - height
  end

  self.title:SetText(state and #tasks > 0 and planTitle(state) or "Unbored")
  put(self.title, ns.UI.Measure(self.title, width - 20))
  local collapsed = saved.collapsed == true
  self.collapse:SetNormalTexture(collapsed and "Interface\\Buttons\\UI-PlusButton-Up"
    or "Interface\\Buttons\\UI-MinusButton-Up")
  self.collapse:SetShown(#tasks > 0)

  if progress and #tasks > 0 then
    self.sub:SetText(ns.T("STEP_OF", progress.step, progress.steps) .. "  ·  " .. ns.T("LEFT", progress.minutesLeft))
    y = y - 2
    put(self.sub, ns.UI.Measure(self.sub, width))
  else
    self.sub:Hide()
  end
  self.header:SetHeight(-y + 2)
  y = y - 8

  self.banner:Hide()
  self.bannerButton:Hide()
  if waiting or finished then
    self.banner:SetText(waiting and ns.T("TRACKER_WAITING") or ns.T("TRACKER_DONE"))
    local bannerHeight = ns.UI.Measure(self.banner, width - 118)
    self.bannerButton:ClearAllPoints()
    self.bannerButton:SetPoint("TOPRIGHT", frame, "TOPRIGHT", -PAD, y + 4)
    if waiting then
      self.bannerButton:SetText(ns.T("LOAD_PLAN"))
      self.bannerButton:SetScript("OnClick", function()
        ns.Mascot:OnLoad()
      end)
    else
      self.bannerButton:SetText(ns.T("NEW_PLAN"))
      self.bannerButton:SetScript("OnClick", function()
        ns.Mascot:ShowChoice()
      end)
    end
    self.bannerButton:Show()
    local top = y
    put(self.banner, bannerHeight)
    y = math.min(y, top - 22) - 10
  end

  for i = 1, #self.rows do
    self.rows[i]:Hide()
  end
  self.done:Hide()
  self.skip:Hide()
  self.more:Hide()

  local first = progress and (progress.step - 1) or 0
  local shown = 0
  local limit = collapsed and 1 or (self.showAll and #tasks or (MAX_UPCOMING + 1))
  for i = 1, math.min(#tasks, limit) do
    local task = tasks[i]
    local row = self:Row(i)
    local current = i == 1
    local height = layoutRow(row, task, first + i, current, self.expanded[task.id], collapsed)
    row:ClearAllPoints()
    row:SetPoint("TOPLEFT", frame, "TOPLEFT", PAD, y)
    row:SetPoint("TOPRIGHT", frame, "TOPRIGHT", -PAD, y)
    row:Show()
    if current then
      self.done:ClearAllPoints()
      self.done:SetPoint("TOPRIGHT", row, "TOPRIGHT", -20, 0)
      self.skip:ClearAllPoints()
      self.skip:SetPoint("TOPRIGHT", row, "TOPRIGHT", 0, 0)
      self.done:SetFrameLevel(row:GetFrameLevel() + 2)
      self.skip:SetFrameLevel(row:GetFrameLevel() + 2)
      self.done:Show()
      self.skip:Show()
      self.currentRow = row
    end
    y = y - height - (current and 10 or 5)
    shown = shown + 1
  end
  local hidden = #tasks - shown
  if not collapsed and (hidden > 0 or self.showAll and #tasks > MAX_UPCOMING + 1) then
    self.more:SetLabel(hidden > 0 and ns.T("MORE_STEPS", hidden) or ns.T("LESS"))
    put(self.more, 18, INDENT - 4)
  end
  frame:SetHeight(math.ceil(-y + PAD - 4))
end

-- Called by the ticker: only the distance on the current row changes.
function ns.Tracker:UpdateDistance()
  local row = self.currentRow
  local task = ns.Session and ns.Session:Current()
  if not self.frame or not self.frame:IsShown() then
    return
  end
  if not row or not row:IsShown() or not task or row.taskId ~= task.id then
    return
  end
  local text = ns.Tracker.CurrentMeta(task)
  if text == row.meta:GetText() then
    return
  end
  row.meta:SetText(text)
  local height = ns.UI.Measure(row.meta, WIDTH - PAD * 2 - INDENT)
  if height ~= row.metaHeight then
    self:Refresh()
  end
end

function ns.Tracker.IsOpen()
  return db().open == true
end

function ns.Tracker:Reveal()
  db().open = true
  self:Refresh()
end

function ns.Tracker:Hide()
  db().open = false
  if self.frame then
    self.frame:Hide()
  end
  if ns.UI and ns.UI.Refresh then
    ns.UI:Refresh()
  end
end

function ns.Tracker:Toggle()
  if self:IsOpen() then
    self:Hide()
  else
    self:Reveal()
  end
end
