-- The main in-game UI: a small round portrait with one chat bubble beside it.
-- The bubble shows exactly one message: the current step, an answer, or
-- "Thinking..." while a request is out. Every string is measured after its
-- width is set, so text wraps and the bubble grows instead of cutting it.

local _, ns = ...

ns.Mascot = {}

local SIZE = 64
local GLOW = 100
local BUBBLE_WIDTH = 260
local PAD = 10
local INNER = BUBBLE_WIDTH - PAD * 2
local ICON = 22
local TEAL = { 0.37, 0.89, 0.83 }
local STALE_SECONDS = 20 * 60

local PORTRAITS = {
  idle = "WispIdle128",
  thinking = "WispThinking128",
  happy = "WispHappy128",
}

local function db()
  if not ns.DB then
    return {}
  end
  if type(ns.DB.mascot) ~= "table" then
    ns.DB.mascot = {}
  end
  return ns.DB.mascot
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
      GameTooltip:SetOwner(self, "ANCHOR_TOP")
      GameTooltip:SetText(type(text) == "function" and text() or text, 1, 1, 1, 1, true)
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
  button:SetSize(ICON, ICON)
  button:SetNormalTexture(texture)
  button:SetHighlightTexture("Interface\\Buttons\\ButtonHilight-Square", "ADD")
  button:SetScript("OnClick", onClick)
  tooltip(button, tip)
  return button
end

local function cursorHoldsItem()
  if type(GetCursorInfo) ~= "function" then
    return false
  end
  return ns.Call(GetCursorInfo) == "item"
end

local function takeCursorItem()
  if not cursorHoldsItem() then
    return false
  end
  local item = ns.Items.FromCursor()
  if item and ns.UI and ns.UI.OpenItem then
    ns.UI:OpenItem(item)
  end
  return true
end

function ns.Mascot.Locked()
  return db().locked == true
end

function ns.Mascot:SetLocked(locked)
  db().locked = locked and true or false
  if self.frame then
    self.frame:SetMovable(not locked)
  end
end

function ns.Mascot:Place()
  local saved = db()
  self.frame:ClearAllPoints()
  self.frame:SetPoint(saved.point or "LEFT", UIParent, saved.rel or "LEFT", saved.x or 40, saved.y or 140)
end

function ns.Mascot:SavePosition()
  local point, _, rel, x, y = self.frame:GetPoint(1)
  x, y = ns.AsNumber(x), ns.AsNumber(y)
  if point and x and y then
    local saved = db()
    saved.point, saved.rel, saved.x, saved.y = point, rel or point, x, y
  end
end

function ns.Mascot:ResetPosition()
  local saved = db()
  saved.point, saved.rel, saved.x, saved.y = nil, nil, nil, nil
  if self.frame then
    self:Place()
  end
end

local function animation(region, kind, setup)
  if not region.CreateAnimationGroup then
    return nil
  end
  local ok, group = pcall(region.CreateAnimationGroup, region)
  if not ok or not group then
    return nil
  end
  group:SetLooping("BOUNCE")
  local anim = group:CreateAnimation(kind)
  setup(anim)
  anim:SetDuration(0.9)
  if anim.SetSmoothing then
    anim:SetSmoothing("IN_OUT")
  end
  return group
end

function ns.Mascot:Create()
  if self.frame then
    return
  end
  local frame = CreateFrame("Button", "UnboredMascot", UIParent)
  frame:SetSize(SIZE, SIZE)
  frame:SetFrameStrata("MEDIUM")
  frame:SetClampedToScreen(true)
  frame:SetMovable(not self:Locked())
  frame:EnableMouse(true)
  frame:RegisterForClicks("AnyUp")
  frame:RegisterForDrag("LeftButton")
  frame:Hide()
  self.frame = frame
  self:Place()

  self.glow = frame:CreateTexture(nil, "BACKGROUND")
  self.glow:SetSize(GLOW, GLOW)
  self.glow:SetPoint("CENTER")
  self.glow:SetTexture(ns.MEDIA .. "WispGlow")
  self.glow:SetBlendMode("ADD")
  self.glow:SetAlpha(0.6)

  self.art = frame:CreateTexture(nil, "ARTWORK")
  self.art:SetSize(SIZE, SIZE)
  self.art:SetPoint("CENTER")
  self.art:SetTexture(ns.MEDIA .. PORTRAITS.idle)

  self.bob = animation(self.art, "Translation", function(anim)
    anim:SetOffset(0, 5)
  end)
  self.pulse = animation(self.glow, "Alpha", function(anim)
    anim:SetFromAlpha(0.25)
    anim:SetToAlpha(1)
  end)

  self.badge = frame:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
  self.badge:SetPoint("TOPRIGHT", 2, 4)
  self.badge:SetText("...")
  self.badge:SetTextColor(TEAL[1], TEAL[2], TEAL[3])
  self.badge:Hide()

  frame:SetScript("OnDragStart", function(button)
    if not self:Locked() then
      button:StartMoving()
    end
  end)
  frame:SetScript("OnDragStop", function(button)
    button:StopMovingOrSizing()
    self:SavePosition()
    self:Refresh()
  end)
  frame:SetScript("OnClick", function(button)
    if takeCursorItem() then
      return
    end
    if GameTooltip then
      GameTooltip:Hide()
    end
    self:OpenMenu(button)
  end)
  frame:SetScript("OnReceiveDrag", takeCursorItem)
  tooltip(frame, function()
    return ns.MASCOT_NAME .. "\n" .. (self:Locked() and ns.T("TIP_MASCOT_LOCKED") or ns.T("TIP_MASCOT"))
  end)

  local okBubble, bubble = pcall(CreateFrame, "Frame", "UnboredMascotBubble", frame, "BackdropTemplate")
  if not okBubble or not bubble then
    bubble = CreateFrame("Frame", "UnboredMascotBubble", frame)
  end
  bubble:SetWidth(BUBBLE_WIDTH)
  bubble:EnableMouse(true)
  bubble:SetScript("OnReceiveDrag", takeCursorItem)
  bubble:SetScript("OnMouseUp", takeCursorItem)
  ns.UI.ApplyBackdrop(bubble, { 0.03, 0.08, 0.09, 0.92 }, { TEAL[1], TEAL[2], TEAL[3], 0.9 })
  self.bubble = bubble

  self.name = font(bubble, "GameFontNormalSmall")
  self.name:SetTextColor(TEAL[1], TEAL[2], TEAL[3])
  self.count = bubble:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  self.count:SetJustifyH("RIGHT")
  self.count:SetTextColor(0.7, 0.7, 0.7)
  self.header = font(bubble, "GameFontNormal")
  self.message = font(bubble, "GameFontHighlight")
  self.sub = font(bubble, "GameFontHighlightSmall")
  self.sub:SetTextColor(0.75, 0.82, 0.82)
  self.meta = font(bubble, "GameFontNormalSmall")

  self.collapse = CreateFrame("Button", nil, bubble)
  self.collapse:SetSize(14, 14)
  self.collapse:SetPoint("TOPRIGHT", -6, -6)
  self.collapse:SetNormalTexture("Interface\\Buttons\\UI-MinusButton-Up")
  self.collapse:SetHighlightTexture("Interface\\Buttons\\UI-PlusButton-Hilight", "ADD")
  self.collapse:SetScript("OnClick", function()
    self:Collapse()
  end)
  tooltip(self.collapse, ns.T("TIP_COLLAPSE"))

  self.buttons = {
    done = iconButton(bubble, "Interface\\RaidFrame\\ReadyCheck-Ready", ns.T("TIP_DONE"), function()
      ns.Session:Done()
    end),
    skip = iconButton(bubble, "Interface\\Buttons\\UI-SpellbookIcon-NextPage-Up", ns.T("TIP_SKIP"), function()
      ns.Session:Skip()
    end),
    ok = iconButton(bubble, "Interface\\RaidFrame\\ReadyCheck-Ready", ns.T("GOT_IT"), function()
      self:OnOk()
    end),
    load = ns.UI.MakeButton(bubble, ns.T("LOAD"), 96, 24),
    new = ns.UI.MakeButton(bubble, ns.T("NEW_PLAN"), 110, 24),
    cancel = ns.UI.MakeLink(bubble, ns.T("CANCEL")),
  }
  -- ReloadUI straight from the click: it needs the hardware event.
  self.buttons.load:SetScript("OnClick", ns.Session.LoadPlan)
  tooltip(self.buttons.load, ns.T("TIP_LOAD"))
  self.buttons.new:SetScript("OnClick", function()
    ns.UI:Open("wizard")
  end)
  self.buttons.cancel:SetScript("OnClick", function()
    ns.Session:CancelRequest()
  end)
end

-- The bubble opens toward the middle of the screen, so it is never cut off.
function ns.Mascot:OnRightHalf()
  local left = ns.AsNumber(ns.Call(self.frame.GetLeft, self.frame))
  local width = ns.AsNumber(ns.Call(UIParent.GetWidth, UIParent))
  return left ~= nil and width ~= nil and width > 0 and left + SIZE / 2 > width / 2
end

function ns.Mascot:SetMood(mood)
  if not PORTRAITS[mood] then
    mood = "idle"
  end
  if self.mood == mood then
    return
  end
  self.mood = mood
  self.art:SetTexture(ns.MEDIA .. PORTRAITS[mood])
  if mood == "thinking" then
    if self.bob then
      self.bob:Play()
    end
    if self.pulse then
      self.pulse:Play()
    end
    return
  end
  if self.bob then
    self.bob:Stop()
  end
  if self.pulse then
    self.pulse:Stop()
  end
  self.glow:SetAlpha(mood == "happy" and 0.95 or 0.6)
end

function ns.Mascot.RequestSummary(req)
  if req.type == "item" then
    local item = type(req.item) == "table" and req.item or {}
    return item.link or item.name
  end
  if req.type == "question" then
    if req.topic == "nearby" then
      return ns.T("MENU_NEARBY")
    end
    return req.question and ("\"" .. req.question .. "\"") or nil
  end
  local budget = ns.T("BUDGET_" .. tostring(req.budget))
  if budget == "BUDGET_" .. tostring(req.budget) then
    budget = ns.T("MINUTES", tonumber(req.budget) or 0)
  end
  local text = ns.ModeLabel(req.mode) .. "  ·  " .. budget
  if type(req.wish) == "string" and req.wish ~= "" then
    text = text .. "\n\"" .. req.wish .. "\""
  end
  return text
end

-- What the bubble says now. One message, in this order: a request that is
-- out, an answer not yet read, the current step, a finished plan, hello.
function ns.Mascot.View()
  local session = ns.Session
  local note = session.requestNote
  if note == "failed" then
    local reason = session.requestReason
    return {
      kind = "failed",
      mood = "idle",
      message = ns.T("SORRY"),
      sub = type(reason) == "string" and reason ~= "" and reason or nil,
      buttons = { "ok" },
    }
  end
  if note == "sending" or note == "preparing" or note == "ready" then
    local req = session:PendingRequest() or {}
    local age = session:RequestAge()
    local sub = ns.T("THINKING_HINT")
    if age and age > STALE_SECONDS then
      sub = ns.T("WAIT_STALE", math.floor(age / 60))
    end
    return {
      kind = "waiting",
      mood = "thinking",
      header = ns.Mascot.RequestSummary(req),
      message = ns.T("THINKING"),
      sub = sub,
      buttons = { "load", "cancel" },
    }
  end
  local answer = session.UnreadAnswer()
  if answer then
    local header = answer.itemLink
    if not header and type(answer.question) == "string" and answer.question ~= "" then
      header = "\"" .. answer.question .. "\""
    end
    return {
      kind = "answer",
      key = answer.requestId,
      mood = "happy",
      header = header,
      message = answer.message,
      buttons = { "ok" },
    }
  end
  local task = session:Current()
  if task then
    local progress = session:Progress()
    return {
      kind = "step",
      mood = "idle",
      message = task.title or "",
      sub = type(task.note) == "string" and task.note ~= "" and task.note or nil,
      meta = ns.Tracker.CurrentMeta(task),
      count = progress and ns.T("STEP_COUNT", progress.step, progress.steps) or nil,
      buttons = { "done", "skip" },
    }
  end
  local progress = session:Progress()
  if progress and progress.steps > 0 then
    return { kind = "done", mood = "happy", message = ns.T("BUBBLE_DONE"), buttons = { "new", "ok" } }
  end
  return { kind = "greeting", mood = "idle", message = ns.T("HELLO", ns.MASCOT_NAME), buttons = { "new" } }
end

function ns.Mascot:OnOk()
  local view = self.view or {}
  if view.kind == "failed" then
    ns.Session:CancelRequest()
  elseif view.kind == "answer" then
    ns.Session:DismissAnswer()
  elseif view.kind == "done" then
    ns.Session:ClearFinished()
  end
end

function ns.Mascot:Refresh()
  local frame = self.frame
  if not frame then
    return
  end
  local saved = db()
  if saved.hidden then
    frame:Hide()
    return
  end
  frame:Show()
  local view = self.View()
  local key = view.kind .. ":" .. tostring(view.key or "")
  if key ~= self.lastKey and (view.kind == "answer" or view.kind == "failed") then
    saved.collapsed = false
  end
  self.lastKey = key
  self.view = view
  self:SetMood(view.mood)
  for _, button in pairs(self.buttons) do
    button:Hide()
  end
  if saved.collapsed then
    self.bubble:Hide()
    self.badge:SetShown(view.kind ~= "greeting")
    return
  end
  self.badge:Hide()
  self.bubble:Show()

  local bubble = self.bubble
  bubble:ClearAllPoints()
  if self:OnRightHalf() then
    bubble:SetPoint("TOPRIGHT", frame, "TOPLEFT", -8, 0)
  else
    bubble:SetPoint("TOPLEFT", frame, "TOPRIGHT", 8, 0)
  end
  local y = -PAD
  local function put(fs, value, gap, width)
    if not value or value == "" then
      fs:SetText("")
      fs:Hide()
      return
    end
    fs:SetText(value)
    local height = ns.UI.Measure(fs, width or INNER)
    fs:ClearAllPoints()
    fs:SetPoint("TOPLEFT", bubble, "TOPLEFT", PAD, y)
    fs:Show()
    y = y - height - (gap or 4)
  end

  self.count:SetText(view.count or "")
  self.count:ClearAllPoints()
  self.count:SetPoint("TOPRIGHT", bubble, "TOPRIGHT", -26, -PAD)
  self.count:SetShown(view.count ~= nil)
  put(self.name, ns.MASCOT_NAME, 4, INNER - 60)
  put(self.header, view.header, 4)
  put(self.message, view.message, 6)
  put(self.sub, view.sub, 4)
  self.meta:SetTextColor(1, 0.82, 0)
  put(self.meta, view.meta, 4)

  y = y - 2
  local x = PAD
  local rowHeight = 0
  for i = 1, #view.buttons do
    local button = self.buttons[view.buttons[i]]
    button:ClearAllPoints()
    button:SetPoint("TOPLEFT", bubble, "TOPLEFT", x, y)
    button:Show()
    x = x + (ns.AsNumber(button:GetWidth()) or ICON) + 8
    rowHeight = math.max(rowHeight, ns.AsNumber(button:GetHeight()) or ICON)
  end
  y = y - rowHeight - PAD + 2
  bubble:SetHeight(math.ceil(-y))
end

-- Called by the ticker: only the distance line changes.
function ns.Mascot:UpdateDistance()
  local view = self.view
  local task = ns.Session and ns.Session:Current()
  if not self.bubble or not self.bubble:IsShown() or not view or view.kind ~= "step" or not task then
    return
  end
  local text = ns.Tracker.CurrentMeta(task)
  if text ~= self.meta:GetText() then
    self:Refresh()
  end
end

function ns.Mascot:Reveal()
  local saved = db()
  saved.hidden = false
  saved.collapsed = false
  self:Refresh()
end

function ns.Mascot:Collapse()
  db().collapsed = true
  self:Refresh()
end

function ns.Mascot:Hide()
  db().hidden = true
  if self.frame then
    self.frame:Hide()
  end
  ns.Print(ns.T("HIDDEN_CHAT", ns.MASCOT_NAME))
end

function ns.Mascot.IsHidden()
  return db().hidden == true
end

function ns.Mascot:SettingsTree()
  local items = {
    {
      text = ns.T("MENU_LOCK_MASCOT"),
      checked = function() return self:Locked() end,
      func = function() self:SetLocked(not self:Locked()) end,
    },
    {
      text = ns.T("MENU_LIST"),
      checked = function() return ns.Tracker:IsOpen() end,
      func = function() ns.Tracker:Toggle() end,
    },
  }
  if ns.Session:Current() then
    items[#items + 1] = { text = ns.T("MENU_WAYPOINT"), func = function() ns.Session:Waypoint() end }
  end
  if ns.AddonLoaded("TomTom") then
    items[#items + 1] = {
      text = ns.T("MENU_TOMTOM"),
      checked = function() return ns.DB.tomtomArrow ~= false end,
      func = function()
        ns.DB.tomtomArrow = ns.DB.tomtomArrow == false
        ns.Session:Waypoint()
      end,
    }
  end
  items[#items + 1] = {
    text = ns.T("MENU_CHAT"),
    checked = function() return ns.DB.chatNotes == true end,
    func = function() ns.DB.chatNotes = not ns.DB.chatNotes end,
  }
  items[#items + 1] = { text = ns.T("MENU_BUILD"), func = function() ns.Session:BuildHere() end }
  items[#items + 1] = { text = ns.T("MENU_IMPORT"), func = function() ns.ShowImport() end }
  items[#items + 1] = { text = ns.T("MENU_EXPORT"), func = function() ns.ShowExport() end }
  items[#items + 1] = {
    text = ns.T("MENU_RESET"),
    func = function()
      self:ResetPosition()
      ns.Tracker:ResetPosition()
    end,
  }
  return items
end

function ns.Mascot:MenuTree()
  local items = { { title = ns.MASCOT_NAME } }
  if db().collapsed then
    items[#items + 1] = { text = ns.T("MENU_SHOW_BUBBLE"), func = function() self:Reveal() end }
  end
  items[#items + 1] = { text = ns.T("NEW_PLAN"), func = function() ns.UI:Open("wizard") end }
  items[#items + 1] = { text = ns.T("MENU_ITEM"), func = function() ns.UI:Open("item") end }
  items[#items + 1] = { text = ns.T("MENU_NEARBY"), func = function() ns.UI:Open("nearby") end }
  items[#items + 1] = { text = ns.T("MENU_ASK"), func = function() ns.UI:Open("ask") end }
  items[#items + 1] = { text = ns.T("MENU_SETTINGS"), children = self:SettingsTree() }
  items[#items + 1] = { text = ns.T("MENU_HIDE_MASCOT"), func = function() self:Hide() end }
  return items
end

local function buildMenu(root, items)
  for i = 1, #items do
    local item = items[i]
    if item.title then
      root:CreateTitle(item.title)
    elseif item.children then
      buildMenu(root:CreateButton(item.text), item.children)
    elseif item.checked ~= nil then
      root:CreateCheckbox(item.text, item.checked, function()
        item.func()
      end)
    else
      root:CreateButton(item.text, function()
        item.func()
      end)
    end
  end
end

-- The game's own context menu when there is one, else the small fallback.
function ns.Mascot:OpenMenu(anchor)
  local items = self:MenuTree()
  if MenuUtil and MenuUtil.CreateContextMenu then
    local ok = pcall(MenuUtil.CreateContextMenu, anchor, function(_, root)
      buildMenu(root, items)
    end)
    if ok then
      return
    end
  end
  ns.UI.ShowMenu(anchor, items)
end

function ns.Mascot:Toggle()
  if self.IsHidden() then
    self:Reveal()
  elseif self.frame then
    self:OpenMenu(self.frame)
  end
end
