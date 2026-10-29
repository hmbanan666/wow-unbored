-- The main in-game UI: a small round portrait with one chat bubble beside it.
-- The bubble shows exactly one thing: what to do (preset chips) when there is
-- no plan, the current step, an answer, or "Thinking..." while a request is
-- out. Every string is measured after its width is set, so text wraps and the
-- bubble grows instead of cutting it.

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
local CHIP_HEIGHT = 26
local TIME_CHIP_WIDTH = 44
local SCALES = { 80, 100, 125, 150 }

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

local function chip(parent, template, onClick)
  local ok, button = pcall(CreateFrame, "Button", nil, parent, "BackdropTemplate")
  if not ok or not button then
    button = CreateFrame("Button", nil, parent)
  end
  button:SetHeight(CHIP_HEIGHT)
  button:SetHighlightTexture("Interface\\QuestFrame\\UI-QuestTitleHighlight", "ADD")
  button.label = font(button, template)
  button.label:SetPoint("LEFT", 10, 0)
  button:SetScript("OnClick", function()
    if ns.ClickSound then
      ns.ClickSound()
    end
    onClick(button)
  end)
  button:Hide()
  return button
end

local function styleChip(button, selected)
  if selected then
    ns.UI.ApplyBackdrop(button, { 0.3, 0.22, 0.04, 0.6 }, { 1, 0.82, 0, 1 })
    button.label:SetTextColor(1, 0.82, 0)
  else
    ns.UI.ApplyBackdrop(button, { 0.05, 0.16, 0.17, 0.9 }, { TEAL[1], TEAL[2], TEAL[3], 0.55 })
    button.label:SetTextColor(1, 1, 1)
  end
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
  frame:SetScale(self.Scale() / 100)
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
  frame:SetScript("OnClick", function(button, mouseButton)
    if takeCursorItem() then
      return
    end
    if GameTooltip then
      GameTooltip:Hide()
    end
    if mouseButton ~= "RightButton" and self.WantsChoice() then
      local view = self.view
      if db().collapsed or not view or view.kind ~= "choice" then
        self:ShowChoice()
        return
      end
    end
    self:OpenMenu(button)
  end)
  frame:SetScript("OnReceiveDrag", takeCursorItem)
  tooltip(frame, function()
    local tip = ns.T("TIP_MASCOT")
    if self.WantsChoice() then
      tip = ns.T("TIP_MASCOT_CHOICE")
    elseif self:Locked() then
      tip = ns.T("TIP_MASCOT_LOCKED")
    end
    return ns.MASCOT_NAME .. "\n" .. tip
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
    send = ns.UI.MakeButton(bubble, ns.T("SEND"), 96, 24),
    cancel = ns.UI.MakeLink(bubble, ns.T("CANCEL")),
    back = ns.UI.MakeLink(bubble, ns.T("BACK")),
    use = ns.UI.MakeButton(bubble, ns.T("OFFER_USE"), 96, 24),
    keep = ns.UI.MakeLink(bubble, ns.T("OFFER_KEEP")),
  }
  self.buttons.use:SetScript("OnClick", function()
    ns.Session:AcceptOffer()
  end)
  self.buttons.keep:SetScript("OnClick", function()
    ns.Session:DeclineOffer()
  end)
  -- ReloadUI straight from the click: it needs the hardware event.
  self.buttons.load:SetScript("OnClick", ns.Session.LoadPlan)
  tooltip(self.buttons.load, ns.T("TIP_LOAD"))
  self.buttons.send:SetScript("OnClick", function()
    self:SendWish()
  end)
  tooltip(self.buttons.send, ns.T("GET_PLAN_HINT"))
  self.buttons.cancel:SetScript("OnClick", function()
    ns.Session:CancelRequest()
  end)
  self.buttons.back:SetScript("OnClick", function()
    self:Back()
  end)

  -- The choice: one chip per preset, then the time chips, then "Something else...".
  self.chips = {}
  for i = 1, #ns.Data.Presets do
    local preset = ns.Data.Presets[i]
    local button = chip(bubble, "GameFontNormal", function()
      self:Choose(preset)
    end)
    button.preset = preset
    self.chips[i] = button
  end
  self.otherChip = chip(bubble, "GameFontNormal", function()
    self:ShowWish()
  end)
  self.timeLabel = font(bubble, "GameFontHighlightSmall")
  self.timeLabel:SetTextColor(0.75, 0.82, 0.82)
  self.timeChips = {}
  for i = 1, #ns.Data.PresetBudgets do
    local minutes = ns.Data.PresetBudgets[i]
    local button = chip(bubble, "GameFontHighlightSmall", function()
      ns.Session:SetBudget(minutes)
    end)
    button:SetSize(TIME_CHIP_WIDTH, 20)
    button.label:ClearAllPoints()
    button.label:SetPoint("CENTER")
    button.minutes = minutes
    self.timeChips[i] = button
  end

  -- "Something else...": the player's own words.
  self.wishBox, self.wishEdit = ns.UI.MakeTextBox(bubble, ns.T("WISH_HINT"), 300, function()
    self.wishError = nil
  end, INNER, 64)
  self.wishBox:Hide()
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
  local preset = ns.Mascot.Preset(req.topic)
  local text = (preset and ns.T(preset.label) or ns.ModeLabel(req.mode)) .. "  ·  " .. ns.Mascot.BudgetLabel(req.budget)
  if not preset and type(req.wish) == "string" and req.wish ~= "" then
    text = text .. "\n\"" .. req.wish .. "\""
  end
  return text
end

function ns.Mascot.Preset(id)
  for i = 1, #ns.Data.Presets do
    if ns.Data.Presets[i].id == id then
      return ns.Data.Presets[i]
    end
  end
  return nil
end

function ns.Mascot.BudgetLabel(minutes)
  local label = ns.T("BUDGET_" .. tostring(minutes))
  if label == "BUDGET_" .. tostring(minutes) then
    label = ns.T("MINUTES", tonumber(minutes) or 0)
  end
  return label
end

-- The time a preset is sent with: the player's last pick if it is one of
-- the chips, else the default.
function ns.Mascot.Budget()
  local chosen = ns.Session.ChosenBudget()
  for i = 1, #ns.Data.PresetBudgets do
    if ns.Data.PresetBudgets[i] == chosen then
      return chosen
    end
  end
  return ns.Data.PresetDefaultBudget
end

local function requestOut()
  local note = ns.Session.requestNote
  return note == "sending" or note == "preparing" or note == "ready" or note == "failed"
end

-- Nothing to do and nothing asked: a left click offers the presets.
function ns.Mascot.WantsChoice()
  return not requestOut() and ns.Session:Current() == nil
end

local function stepView(session, task)
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

-- What the bubble says now. One message, in this order: a request that is
-- out (a Quick plan keeps showing its step meanwhile), a Full plan on offer,
-- the wish box, the choice (no plan, a finished plan, or "New plan"),
-- an answer not yet read, the current step.
function ns.Mascot.View()
  local mascot = ns.Mascot
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
    local planning = req.type ~= "question" and req.type ~= "item"
    local quick = session:Current()
    if planning and quick and session.state.quick and not mascot.wishing and not mascot.forceChoice then
      local view = stepView(session, quick)
      view.header = ns.T("QUICK_COOKING")
      view.buttons = { "done", "skip", "load" }
      return view
    end
    return {
      kind = "waiting",
      mood = "thinking",
      header = ns.Mascot.RequestSummary(req),
      message = planning and ns.T("COOKING") or ns.T("THINKING"),
      sub = sub,
      buttons = { "load", "cancel" },
    }
  end
  local offer = session.Offer()
  if offer then
    local first = offer.plan.tasks[1]
    return {
      kind = "offer",
      key = offer.requestId or offer.key,
      mood = "happy",
      message = ns.T("BETTER_READY"),
      sub = first and ns.T("BETTER_FIRST", #offer.plan.tasks, first.title or "") or nil,
      buttons = { "use", "keep" },
    }
  end
  if mascot.wishing then
    return {
      kind = "wish",
      mood = "idle",
      message = ns.T("WISH_TITLE"),
      sub = mascot.wishError,
      wish = true,
      buttons = { "send", "back" },
    }
  end
  local answer = session.UnreadAnswer()
  local task = session:Current()
  if mascot.forceChoice or (not task and not answer) then
    local progress = session:Progress()
    local finished = progress ~= nil and progress.steps > 0 and progress.remaining == 0
    local message, mood = ns.T("CHOICE_HELLO"), "idle"
    if finished then
      message, mood = ns.T("CHOICE_AGAIN"), "happy"
    elseif task or answer then
      message = ns.T("CHOICE_NEW")
    end
    return {
      kind = "choice",
      key = finished and "done" or nil,
      mood = mood,
      message = message,
      choice = true,
      buttons = (task or answer) and { "back" } or {},
    }
  end
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
  return stepView(session, task)
end

function ns.Mascot:OnOk()
  local view = self.view or {}
  if view.kind == "failed" then
    ns.Session:CancelRequest()
  elseif view.kind == "answer" then
    ns.Session:DismissAnswer()
  end
end

function ns.Mascot:Reset()
  self.forceChoice = false
  self.wishing = false
  self.wishError = nil
end

function ns.Mascot:ShowChoice()
  self.forceChoice = true
  self.wishing = false
  self:Reveal()
end

function ns.Mascot:ShowWish()
  self.wishing = true
  self.wishError = nil
  if self.wishEdit and (self.wishEdit:GetText() or "") == "" and type(UnboredCharDB) == "table"
    and type(UnboredCharDB.lastWish) == "string" then
    self.wishEdit:SetText(UnboredCharDB.lastWish)
  end
  self:Reveal()
  if self.wishEdit and self.view and self.view.kind == "wish" then
    self.wishEdit:SetFocus()
  end
end

function ns.Mascot:Back()
  if self.wishing then
    self.wishing = false
    self.wishError = nil
  else
    self.forceChoice = false
  end
  self:Refresh()
end

-- One click: a Quick plan right away, and with the companion the Request is
-- saved and the UI reloads in the same click (ReloadUI needs the hardware
-- event). The Full plan is offered after Load (docs/adr/0005).
function ns.Mascot:Choose(preset)
  local budget = self.Budget()
  self:Reset()
  ns.Session:QuickPlan(preset, budget)
  if not ns.UI.HasCompanion() then
    return
  end
  if ns.Session:Ask({ type = "plan", mode = preset.mode, budget = budget, topic = preset.id, wish = preset.wish }) then
    ns.Session.LoadPlan()
  end
end

function ns.Mascot:SendWish()
  local text = ns.Trim(self.wishEdit and self.wishEdit:GetText() or "")
  if text == "" then
    self.wishError = ns.T("WISH_EMPTY")
    self:Refresh()
    return
  end
  local budget = self.Budget()
  self:Reset()
  if self.wishEdit.ClearFocus then
    self.wishEdit:ClearFocus()
  end
  if not ns.UI.HasCompanion() then
    ns.Session:BuildHere(ns.Session.ChosenMode(), budget)
    return
  end
  if ns.Session:Ask({ type = "plan", wish = text, budget = budget }) then
    self.wishEdit:SetText("")
    ns.Session.LoadPlan()
  end
end

function ns.Mascot.ShowRoute()
  local task = ns.Session:Current()
  if not task then
    return
  end
  ns.Session:Waypoint()
  local point = ns.Waypoint.Target(task)
  local mapID = point and point.mapID or task.mapID
  if mapID and type(OpenWorldMap) == "function" and pcall(OpenWorldMap, mapID) then
    return
  end
  if type(ToggleWorldMap) == "function" then
    pcall(ToggleWorldMap)
  end
end

function ns.Mascot.Scale()
  local scale = tonumber(db().scale)
  for i = 1, #SCALES do
    if SCALES[i] == scale then
      return scale
    end
  end
  return 100
end

function ns.Mascot:SetScale(percent)
  db().scale = percent
  if self.frame then
    self.frame:SetScale(self.Scale() / 100)
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
  if key ~= self.lastKey and (view.kind == "answer" or view.kind == "failed" or view.kind == "choice"
    or view.kind == "offer") then
    saved.collapsed = false
  end
  self.lastKey = key
  self.view = view
  self:SetMood(view.mood)
  for _, button in pairs(self.buttons) do
    button:Hide()
  end
  for i = 1, #self.chips do
    self.chips[i]:Hide()
  end
  for i = 1, #self.timeChips do
    self.timeChips[i]:Hide()
  end
  self.otherChip:Hide()
  self.timeLabel:Hide()
  self.wishBox:Hide()
  if saved.collapsed then
    self.bubble:Hide()
    self.badge:SetShown(view.kind ~= "choice")
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

  local function place(region, x, height)
    region:ClearAllPoints()
    region:SetPoint("TOPLEFT", bubble, "TOPLEFT", x, y)
    region:Show()
    return height
  end
  local function layoutChip(button, text, selected)
    button.label:SetText(text)
    local height = math.max(CHIP_HEIGHT, ns.UI.Measure(button.label, INNER - 20) + 10)
    button:SetSize(INNER, height)
    styleChip(button, selected)
    y = y - place(button, PAD, height) - 4
  end
  if view.choice then
    y = y - 2
    for i = 1, #self.chips do
      layoutChip(self.chips[i], ns.T(self.chips[i].preset.label), false)
    end
    layoutChip(self.otherChip, ns.T("PRESET_OTHER"), false)
    y = y - 2
    self.timeLabel:SetText(ns.T("CHOICE_TIME"))
    local labelWidth = math.ceil(ns.AsNumber(self.timeLabel:GetStringWidth()) or 30)
    self.timeLabel:SetSize(labelWidth + 2, 20)
    self.timeLabel:SetJustifyV("MIDDLE")
    place(self.timeLabel, PAD, 20)
    local budget = self.Budget()
    local x = PAD + labelWidth + 8
    for i = 1, #self.timeChips do
      local button = self.timeChips[i]
      button.label:SetText(self.BudgetLabel(button.minutes))
      styleChip(button, button.minutes == budget)
      place(button, x, 20)
      x = x + TIME_CHIP_WIDTH + 4
    end
    y = y - 20 - 4
  elseif view.wish then
    y = y - place(self.wishBox, PAD, ns.AsNumber(self.wishBox:GetHeight()) or 64) - 6
    self.wishBox.UpdatePlaceholder()
  end

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

-- Settings stay basic: size, lock, hide, keybinds. The rest is under More.
function ns.Mascot:SettingsTree()
  local sizes = {}
  for i = 1, #SCALES do
    local percent = SCALES[i]
    sizes[i] = {
      text = ns.T("SCALE_PCT", percent),
      checked = function() return self.Scale() == percent end,
      func = function() self:SetScale(percent) end,
    }
  end
  return {
    { text = ns.T("MENU_SCALE"), children = sizes },
    {
      text = ns.T("MENU_LOCK_MASCOT"),
      checked = function() return self:Locked() end,
      func = function() self:SetLocked(not self:Locked()) end,
    },
    { text = ns.T("MENU_HIDE_MASCOT"), func = function() self:Hide() end },
    { text = ns.T("MENU_KEYBINDS"), func = function() ns.Print(ns.T("KEYBIND_INFO")) end },
    { text = ns.T("MENU_MORE"), children = self:MoreTree() },
  }
end

function ns.Mascot:MoreTree()
  local items = {
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

-- With a plan running, the step comes first; then new things; Settings last.
function ns.Mascot:MenuTree()
  local items = { { title = ns.MASCOT_NAME } }
  if db().collapsed then
    items[#items + 1] = { text = ns.T("MENU_SHOW_BUBBLE"), func = function() self:Reveal() end }
  end
  if ns.Session:Current() then
    items[#items + 1] = {
      text = ns.T("MENU_WHAT_NEXT"),
      func = function()
        self:Reset()
        self:Reveal()
      end,
    }
    items[#items + 1] = { text = ns.T("MENU_SKIP_STEP"), func = function() ns.Session:Skip() end }
    items[#items + 1] = { text = ns.T("MENU_ROUTE"), func = function() self.ShowRoute() end }
  end
  items[#items + 1] = { text = ns.T("NEW_PLAN"), func = function() self:ShowChoice() end }
  items[#items + 1] = { text = ns.T("MENU_ITEM"), func = function() ns.UI:Open("item") end }
  items[#items + 1] = { text = ns.T("MENU_ASK"), func = function() ns.UI:Open("ask") end }
  items[#items + 1] = { text = ns.T("MENU_SETTINGS"), children = self:SettingsTree() }
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
  if self.IsHidden() or db().collapsed then
    self:Reveal()
  elseif self.WantsChoice() and (not self.view or self.view.kind ~= "choice") then
    self:ShowChoice()
  elseif self.frame then
    self:OpenMenu(self.frame)
  end
end
