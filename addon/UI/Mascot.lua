-- The whole in-game UI (docs/adr/0004, 0016): a small round portrait and a
-- bubble beside it, with at most two older messages fading above it. The
-- bubble shows one thing: the presets, the wish or question box, an item, an
-- Answer, the Refresh offer, or the current step. Text always shows in full:
-- each string is measured after its width is set and the bubble grows.
-- The portrait and the bubble have their own size settings; the bubble is
-- parented to UIParent and only anchored to the portrait.

local _, ns = ...

ns.Mascot = {}

local SIZE = 52
local BUBBLE_WIDTH = 260
local PAD = 10
local INNER = BUBBLE_WIDTH - PAD * 2
local ACTION = 24
local GLYPH = 16
local TOP_ICON = 16
local TEAL = { 0.37, 0.89, 0.83 }
local MUTED = { 0.62, 0.7, 0.7 }
local COMBAT_ALPHA = 0.5
local CHIP_HEIGHT = 26
local SCALES = { 80, 100, 125, 150 }
local ECHOES = 2
local ECHO_SECONDS = 90
local ECHO_BYTES = 90
local ECHO_ALPHA = { 0.85, 0.55 }
local LEAD_SECONDS = 8
-- The drop hint stops once the player has handed Wisp this many items.
local DROP_TEACH = 3

local PORTRAITS = {
  idle = "WispIdle128",
  thinking = "WispThinking128",
  happy = "WispHappy128",
}

-- Every action looks the same: one frame, a glyph from Media/Icon*, and a
-- label when a glyph alone would not be clear.
local ACTIONS = {
  done = { icon = "IconDone", tip = "TIP_DONE" },
  skip = { icon = "IconSkip", tip = "TIP_SKIP" },
  list = { icon = "IconList", tip = "TIP_LIST" },
  send = { icon = "IconSend", tip = "SEND" },
  ask = { icon = "IconSend", tip = "TIP_ASK" },
  back = { icon = "IconBack", tip = "BACK" },
  ok = { icon = "IconDone", tip = "GOT_IT" },
  cancel = { icon = "IconClose", tip = "CANCEL_REQUEST" },
  plan = { icon = "IconPlan", label = "INTENT_PLAN" },
  refresh = { icon = "IconRefresh", label = "REFRESH", tip = "TIP_REFRESH" },
  load = { icon = "IconRefresh", label = "LOAD", tip = "TIP_REFRESH" },
  later = { label = "LATER" },
  retry = { label = "TRY_AGAIN" },
  use = { label = "OFFER_USE" },
  keep = { label = "OFFER_KEEP" },
  continue = { label = "CONTINUE" },
  new = { label = "SOMETHING_NEW" },
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

local function framed(parent)
  local ok, frame = pcall(CreateFrame, "Button", nil, parent, "BackdropTemplate")
  if not ok or not frame then
    frame = CreateFrame("Button", nil, parent)
  end
  return frame
end

local function glyph(parent, name, size)
  local texture = parent:CreateTexture(nil, "ARTWORK")
  texture:SetSize(size, size)
  texture:SetTexture(ns.MEDIA .. name)
  texture:SetVertexColor(TEAL[1], TEAL[2], TEAL[3])
  return texture
end

local function actionButton(parent, spec, onClick)
  local button = framed(parent)
  ns.UI.ApplyBackdrop(button, { 0.05, 0.16, 0.17, 0.92 }, { TEAL[1], TEAL[2], TEAL[3], 0.55 })
  button:SetHighlightTexture("Interface\\Buttons\\ButtonHilight-Square", "ADD")
  local width = ACTION
  if spec.icon then
    button.icon = glyph(button, spec.icon, GLYPH)
  end
  if spec.label then
    button.label = button:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    button.label:SetText(ns.T(spec.label))
    local labelWidth = math.ceil(ns.AsNumber(button.label:GetStringWidth()) or 40)
    if button.icon then
      button.icon:SetPoint("LEFT", 5, 0)
      button.label:SetPoint("LEFT", button.icon, "RIGHT", 3, 0)
      width = 5 + GLYPH + 3 + labelWidth + 8
    else
      button.label:SetPoint("CENTER")
      width = labelWidth + 18
    end
  else
    button.icon:SetPoint("CENTER")
  end
  button:SetSize(math.max(ACTION, width), ACTION)
  button:SetScript("OnClick", function(self, mouseButton)
    if ns.ClickSound then
      ns.ClickSound()
    end
    onClick(self, mouseButton)
  end)
  tooltip(button, ns.T(spec.tip or spec.label))
  button:Hide()
  return button
end

local function iconButton(parent, name, tip, onClick)
  local button = CreateFrame("Button", nil, parent)
  button:SetSize(TOP_ICON + 4, TOP_ICON + 4)
  button.icon = glyph(button, name, TOP_ICON)
  button.icon:SetPoint("CENTER")
  button:SetHighlightTexture("Interface\\Buttons\\ButtonHilight-Square", "ADD")
  button:RegisterForClicks("AnyUp")
  button:SetScript("OnClick", onClick)
  tooltip(button, tip)
  return button
end

local function chip(parent, template, onClick)
  local button = framed(parent)
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

local function fadeIn(region, from, seconds)
  if not region.CreateAnimationGroup then
    return nil
  end
  local ok, group = pcall(region.CreateAnimationGroup, region)
  if not ok or not group then
    return nil
  end
  local anim = group:CreateAnimation("Alpha")
  anim:SetFromAlpha(from)
  anim:SetToAlpha(1)
  anim:SetDuration(seconds)
  if anim.SetSmoothing then
    anim:SetSmoothing("OUT")
  end
  return group
end

local function bob(region)
  if not region.CreateAnimationGroup then
    return nil
  end
  local ok, group = pcall(region.CreateAnimationGroup, region)
  if not ok or not group then
    return nil
  end
  group:SetLooping("BOUNCE")
  local anim = group:CreateAnimation("Translation")
  anim:SetOffset(0, 4)
  anim:SetDuration(0.9)
  if anim.SetSmoothing then
    anim:SetSmoothing("IN_OUT")
  end
  return group
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
  if item then
    if ns.DB then
      ns.DB.dropsTaught = (tonumber(ns.DB.dropsTaught) or 0) + 1
    end
    ns.Mascot:ShowItem(item)
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

local function onAvatarClick(self, button, mouseButton)
  if ns.IsCombat() then
    return
  end
  if takeCursorItem() then
    return
  end
  if GameTooltip then
    GameTooltip:Hide()
  end
  if mouseButton == "RightButton" then
    self:OpenMenu(button)
    return
  end
  if self.IsHidden() or db().collapsed then
    self:Reveal()
  elseif self.WantsChoice() and (not self.view or self.view.kind ~= "choice") then
    self:ShowChoice()
  else
    self:Collapse()
  end
end

function ns.Mascot:CreatePortrait()
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

  self.art = frame:CreateTexture(nil, "ARTWORK")
  self.art:SetSize(SIZE, SIZE)
  self.art:SetPoint("CENTER")
  self.art:SetTexture(ns.MEDIA .. PORTRAITS.idle)
  self.bob = bob(self.art)

  -- Collapsed: a small "..." pill beside the portrait. A click brings the bubble back.
  local pill = framed(frame)
  pill:SetSize(34, 18)
  ns.UI.ApplyBackdrop(pill, { 0.03, 0.08, 0.09, 0.92 }, { TEAL[1], TEAL[2], TEAL[3], 0.9 })
  pill:RegisterForClicks("AnyUp")
  pill.text = pill:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
  pill.text:SetPoint("CENTER", 0, 1)
  pill.text:SetText("...")
  pill.text:SetTextColor(TEAL[1], TEAL[2], TEAL[3])
  pill:SetScript("OnClick", function(button, mouseButton)
    if mouseButton == "RightButton" then
      self:OpenMenu(button)
    else
      self:Reveal()
    end
  end)
  tooltip(pill, ns.T("TIP_PILL"))
  pill:Hide()
  self.pill = pill

  self.dropHint = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  self.dropHint:SetPoint("TOP", frame, "BOTTOM", 0, -2)
  self.dropHint:SetTextColor(TEAL[1], TEAL[2], TEAL[3])
  self.dropHint:SetText(ns.T("DROP_HINT"))
  self.dropHint:Hide()

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
    onAvatarClick(self, button, mouseButton)
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

  -- Pick mode: Esc hides this frame (UISpecialFrames), which ends it.
  local catcher = CreateFrame("Frame", "UnboredPickCatcher", UIParent)
  catcher:Hide()
  catcher:SetScript("OnHide", function()
    if self.picking then
      self:StopPick()
    end
  end)
  self.catcher = catcher
  if type(UISpecialFrames) == "table" then
    table.insert(UISpecialFrames, "UnboredPickCatcher")
  end
end

function ns.Mascot:CreateBubble()
  local okBubble, bubble = pcall(CreateFrame, "Frame", "UnboredMascotBubble", UIParent, "BackdropTemplate")
  if not okBubble or not bubble then
    bubble = CreateFrame("Frame", "UnboredMascotBubble", UIParent)
  end
  bubble:SetWidth(BUBBLE_WIDTH)
  bubble:SetFrameStrata("MEDIUM")
  bubble:SetClampedToScreen(true)
  bubble:SetScale(self.BubbleScale() / 100)
  bubble:EnableMouse(true)
  bubble:SetScript("OnReceiveDrag", takeCursorItem)
  bubble:SetScript("OnMouseUp", takeCursorItem)
  ns.UI.ApplyBackdrop(bubble, { 0.03, 0.08, 0.09, 0.92 }, { TEAL[1], TEAL[2], TEAL[3], 0.9 })
  bubble:Hide()
  self.bubble = bubble
  self.fade = fadeIn(bubble, 0.2, 0.25)

  self.meta = font(bubble, "GameFontHighlightSmall")
  self.tick = fadeIn(self.meta, 0.1, 0.4)
  self.header = font(bubble, "GameFontNormal")
  self.message = font(bubble, "GameFontHighlight")
  self.sub = font(bubble, "GameFontHighlightSmall")
  self.sub:SetTextColor(0.75, 0.82, 0.82)
  self.where = font(bubble, "GameFontNormalSmall")
  self.where:SetTextColor(1, 0.82, 0)

  self.collapse = iconButton(bubble, "IconChevron", ns.T("TIP_COLLAPSE"), function()
    self:Collapse()
  end)
  self.menuButton = iconButton(bubble, "IconMenu", ns.T("TIP_MENU"), function(button)
    self:OpenMenu(button)
  end)

  local handlers = {
    done = function() ns.Session:Done() end,
    skip = function() ns.Session:Skip() end,
    list = function() ns.Tracker:Toggle() end,
    send = function()
      if self.asking then
        self:SendAsk()
      else
        self:SendWish()
      end
    end,
    ask = function() self:AskItem() end,
    back = function() self:Back() end,
    ok = function() self:OnOk() end,
    cancel = function() ns.Session:CancelRequest() end,
    plan = function() ns.Session:AnswerPlan() end,
    -- ReloadUI straight from the click: it needs the hardware event.
    refresh = function() ns.Session.RefreshNow() end,
    load = function() self.OnLoad() end,
    later = function() self:OnLater() end,
    retry = function() self:Retry() end,
    use = function() ns.Session:AcceptOffer() end,
    keep = function() ns.Session:DeclineOffer() end,
    continue = function() ns.Session:ContinuePlan() end,
    new = function()
      ns.Session.welcomeBack = false
      self:ShowChoice()
    end,
  }
  self.buttons = {}
  for name, spec in pairs(ACTIONS) do
    self.buttons[name] = actionButton(bubble, spec, handlers[name])
  end

  -- The choice: one chip per preset, then "Something else...".
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

  self.wishBox, self.wishEdit = ns.UI.MakeTextBox(bubble, ns.T("WISH_HINT"), 300, function()
    self.wishError = nil
  end, INNER, 64)
  self.wishBox:Hide()
  -- Only the fully custom wish may carry minutes, and only when typed (docs/adr/0037).
  self.minutesBox, self.minutesEdit = ns.UI.MakeNumberBox(bubble, ns.T("WISH_MINUTES_HINT"), 3, INNER)
  self.minutesBox:Hide()

  self.echoFrames = {}
  for i = 1, ECHOES do
    local okEcho, echo = pcall(CreateFrame, "Frame", nil, bubble, "BackdropTemplate")
    if not okEcho or not echo then
      echo = CreateFrame("Frame", nil, bubble)
    end
    ns.UI.ApplyBackdrop(echo, { 0.03, 0.08, 0.09, 0.85 }, { TEAL[1], TEAL[2], TEAL[3], 0.5 })
    echo.text = font(echo, "GameFontHighlightSmall")
    echo.text:SetPoint("TOPLEFT", PAD, -6)
    echo:Hide()
    self.echoFrames[i] = echo
  end
end

function ns.Mascot:Create()
  if self.frame then
    return
  end
  self:CreatePortrait()
  self:CreateBubble()
end

-- The bubble opens toward the middle of the screen, so it is never cut off.
function ns.Mascot:OnRightHalf()
  local left = ns.AsNumber(ns.Call(self.frame.GetLeft, self.frame))
  local width = ns.AsNumber(ns.Call(UIParent.GetWidth, UIParent))
  local scale = self.Scale() / 100
  return left ~= nil and width ~= nil and width > 0 and (left + SIZE / 2) * scale > width / 2
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
  if self.bob then
    if mood == "thinking" then
      self.bob:Play()
    else
      self.bob:Stop()
    end
  end
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
  local text = preset and ns.T(preset.label) or ns.ModeLabel(req.mode)
  if not preset and tonumber(req.budget) then
    text = text .. "  ·  " .. ns.T("MINUTES", tonumber(req.budget))
  end
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

-- Nothing to do and nothing asked: a left click offers the presets.
function ns.Mascot.WantsChoice()
  return ns.Session:Current() == nil and ns.Session.UnreadAnswer() == nil
end

-- "Nice!" after Done, "Ok, next:" after Skip, for a few seconds.
function ns.Mascot:Lead(key)
  self.lead = { text = ns.T(key), at = ns.Now() }
end

local function leadText(mascot)
  local lead = mascot.lead
  if lead and ns.Now() - (lead.at or 0) <= LEAD_SECONDS then
    return lead.text
  end
  return nil
end

-- "1/5 · ~12 min"
local function progressMeta(session)
  local progress = session:Progress()
  if not progress or progress.steps == 0 or progress.remaining == 0 then
    return nil
  end
  local text = ns.T("STEP_COUNT", progress.step, progress.steps)
  if progress.minutesLeft and progress.minutesLeft > 0 then
    text = text .. " · " .. ns.T("MINUTES", progress.minutesLeft)
  end
  return text
end

local function stepView(mascot, session, task)
  return {
    kind = "step",
    key = task.id,
    mood = "idle",
    meta = progressMeta(session),
    header = leadText(mascot),
    message = task.title or "",
    sub = type(task.note) == "string" and task.note ~= "" and task.note or nil,
    where = ns.Tracker.CurrentMeta(task),
    buttons = { "done", "skip", "list" },
  }
end

local PROBLEMS = {
  stopped = "COMPANION_STOPPED",
  pairing = "COMPANION_PAIRING",
  revoked = "COMPANION_REVOKED",
  offline = "COMPANION_OFFLINE",
}

-- A Reason code from the Companion, in Wisp's words. The planner's own
-- reason (fail_request) is written for the player, so it is shown as is.
local REASONS = {
  not_approved = "COMPANION_PAIRING",
  companion_offline = "COMPANION_STOPPED",
  server_unreachable = "COMPANION_OFFLINE",
  rejected = "REASON_REJECTED",
  timeout = "WAIT_SLOW",
  planner_failed = "REASON_PLANNER_FAILED",
}

-- Why a Request that was sent is not back, and whether Try again helps.
local function waitLine(session)
  local problem = session.CompanionProblem()
  if problem then
    return ns.T(PROBLEMS[problem]), false
  end
  if session:IsSlow() then
    return ns.T("WAIT_SLOW"), true
  end
  return nil, false
end

local function choiceView(session, task, answer)
  local progress = session:Progress()
  local finished = progress ~= nil and progress.steps > 0 and progress.remaining == 0
  local empty = progress ~= nil and progress.steps == 0 and session.state.quick
  local message, mood = ns.T("CHOICE_HELLO"), "idle"
  if finished then
    message, mood = ns.T("CHOICE_AGAIN"), "happy"
  elseif empty then
    message = ns.T("QUICK_EMPTY")
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

local function busy(session)
  local note = session.requestNote
  return note == "sending" or note == "preparing" or note == "ready"
end

-- The Refresh offer for this Request id, folded into the view it belongs to.
local function offerFor(session, requestId, lang)
  local req = session:PendingRequest()
  if not requestId or not req or req.id ~= requestId then
    return nil
  end
  local offer = session:RefreshOffer()
  if offer then
    local key = offer.kind == "ready" and "READY_OFFER" or "REFRESH_AFTER"
    return ns.TL(lang or ns.LANG, key), { "refresh", "later" }
  end
  local line = waitLine(session)
  if line then
    return line, nil
  end
  if req.later then
    return ns.TL(lang or ns.LANG, "LATER_OK"), nil
  end
  return nil, nil
end

local function itemView(mascot, session, companion)
  local item = mascot.item
  if not item then
    return { kind = "item", mood = "idle", message = ns.T("ITEM_TITLE"), buttons = { "back" } }
  end
  local facts = mascot.itemFacts or {}
  local view = {
    kind = "item",
    key = item.itemID,
    mood = "idle",
    header = item.link or item.name or ns.T("ITEM_UNKNOWN"),
    message = #facts > 0 and table.concat(facts, "\n\n") or nil,
    buttons = { "back" },
  }
  local line, actions = offerFor(session, mascot.itemAsked)
  if mascot.itemAsked then
    view.message = view.message or ns.T("ITEM_NOTHING")
    view.sub = line
    view.buttons = actions and { actions[1], actions[2], "back" } or { "back" }
    return view
  end
  if not companion then
    view.message = view.message or ns.T("ITEM_NOTHING_LOCAL")
    view.sub = ns.T("NEED_COMPANION")
    return view
  end
  view.sub = busy(session) and ns.T("BUSY_REPLACES") or nil
  view.buttons = { "ask", "back" }
  return view
end

local function askView(mascot, session, companion)
  local mode = mascot.asking
  if mode == "item" then
    return itemView(mascot, session, companion)
  end
  local nearby = mode == "nearby"
  return {
    kind = mode,
    mood = "idle",
    message = nearby and ns.T("NEARBY_TITLE") or ns.T("ASK_TITLE"),
    sub = mascot.wishError or (busy(session) and companion and ns.T("BUSY_REPLACES")) or nil,
    wish = true,
    hint = nearby and ns.T("NEARBY_HINT") or ns.T("ASK_HINT"),
    buttons = { "send", "back" },
  }
end

local function answerView(session, answer)
  local messages = type(answer.messages) == "table" and #answer.messages > 0 and answer.messages
    or ns.Intents.Split(answer.message)
  local before = {}
  for i = 1, #messages - 1 do
    before[i] = messages[i]
  end
  local header = answer.itemLink
  if not header and type(answer.question) == "string" and answer.question ~= "" then
    header = "\"" .. answer.question .. "\""
  end
  local line, actions = offerFor(session, answer.requestId, answer.lang)
  local buttons = {}
  if type(answer.tasks) == "table" and #answer.tasks > 0 then
    buttons[#buttons + 1] = "plan"
  end
  if actions then
    buttons[#buttons + 1] = actions[1]
    buttons[#buttons + 1] = actions[2]
  else
    buttons[#buttons + 1] = "ok"
  end
  return {
    kind = "answer",
    key = (answer.isLocal and "local:" or "") .. tostring(answer.requestId or answer.at),
    mood = "happy",
    header = header,
    message = messages[#messages],
    before = before,
    sub = line,
    buttons = buttons,
  }
end

-- A Request is out: over a Quick plan the step stays doable and the line
-- goes on top; with no step it gets its own bubble until the player says ok.
local function pendingView(mascot, session, task)
  local req = session:PendingRequest()
  if not req then
    return nil
  end
  local offer = session:RefreshOffer()
  local line, slow = waitLine(session)
  local planning = req.type ~= "question" and req.type ~= "item"
  if planning and task and session.state.quick then
    local view = stepView(mascot, session, task)
    if offer then
      view.header = ns.T(offer.kind == "ready" and "READY_OFFER" or "REFRESH_AFTER_PLAN")
      view.buttons = { "done", "skip", "list", "refresh", "later" }
    else
      view.header = line or view.header or ns.T("QUICK_COOKING")
      if slow then
        view.buttons = { "done", "skip", "list", "retry" }
      end
    end
    view.slow = slow
    return view
  end
  if offer and offer.kind == "ready" then
    return {
      kind = "ready",
      key = req.id,
      mood = "happy",
      message = ns.T("READY_OFFER"),
      buttons = { "refresh", "later" },
    }
  end
  if (mascot.waitSeen or {})[req.id] then
    return nil
  end
  local empty = planning and session.state and session.state.quick and not task
  local buttons = { "ok", "cancel" }
  if offer then
    buttons = { "refresh", "later", "cancel" }
  elseif slow then
    buttons = { "retry", "cancel" }
  end
  return {
    kind = "waiting",
    key = req.id,
    mood = line and "idle" or "thinking",
    header = ns.Mascot.RequestSummary(req),
    message = empty and ns.T("QUICK_EMPTY") or (planning and ns.T("COOKING") or ns.T("THINKING")),
    sub = offer and ns.TL(req.lang or ns.LANG, "REFRESH_AFTER") or line or ns.T("WAITING_QUIET"),
    buttons = buttons,
    slow = slow,
  }
end

-- What the bubble says now. In order: what the player just opened (wish,
-- question, item, the presets), a failed Request, an unread Answer, the
-- welcome back, a Full plan on offer, an addon update, a Request that is
-- out, the presets when there is nothing to do, the current step.
function ns.Mascot.View()
  local mascot = ns.Mascot
  local session = ns.Session
  local companion = ns.UI.HasCompanion()
  local task = session:Current()
  local answer = session.UnreadAnswer()
  if mascot.wishing then
    return {
      kind = "wish",
      mood = "idle",
      message = ns.T("WISH_TITLE"),
      sub = mascot.wishError,
      wish = true,
      minutes = true,
      hint = ns.T("WISH_HINT"),
      buttons = { "send", "back" },
    }
  end
  if mascot.asking then
    return askView(mascot, session, companion)
  end
  if mascot.forceChoice then
    return choiceView(session, task, answer)
  end
  if session.requestNote == "failed" then
    local code = session.requestReasonCode
    local reason = session.requestReason
    local planner = code == "planner_failed" and type(reason) == "string" and reason ~= ""
    return {
      kind = "failed",
      mood = "idle",
      message = ns.T("SORRY"),
      sub = planner and reason or ns.T(REASONS[code] or "REQUEST_FAILED_GENERIC"),
      buttons = { "retry", "ok" },
    }
  end
  if answer then
    return answerView(session, answer)
  end
  if session.welcomeBack and task then
    return {
      kind = "welcome",
      mood = "happy",
      message = ns.T("CONTINUE_PLAN", session:PlanName()),
      buttons = { "continue", "new" },
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
  local update = session.UpdateWaiting()
  if update and not mascot.updateLater then
    if type(UnboredCharDB) == "table" and UnboredCharDB.updateTried == update then
      return { kind = "update", key = "restart", mood = "idle", message = ns.T("UPDATE_RESTART"), buttons = { "ok" } }
    end
    return {
      kind = "update",
      key = update,
      mood = "happy",
      message = ns.T("UPDATE_READY"),
      buttons = { "load", "later" },
    }
  end
  local pending = pendingView(mascot, session, task)
  if pending then
    return pending
  end
  if not task then
    return choiceView(session, nil, nil)
  end
  return stepView(mascot, session, task)
end

function ns.Mascot:OnOk()
  local view = self.view or {}
  if view.kind == "failed" then
    ns.Session:CancelRequest()
  elseif view.kind == "answer" then
    ns.Session:DismissAnswer()
  elseif view.kind == "update" then
    self.updateLater = true
    self:Refresh()
  elseif view.kind == "waiting" then
    self.waitSeen = self.waitSeen or {}
    self.waitSeen[view.key or ""] = true
    self:Refresh()
  end
end

function ns.Mascot:OnLater()
  if self.view and self.view.kind == "update" then
    self.updateLater = true
    self:Refresh()
    return
  end
  ns.Session:Later()
end

-- Load: ReloadUI in the same click. With an update waiting, it remembers
-- that Load was tried, so a client that still runs the old files is told to
-- restart instead of being asked to Load again.
function ns.Mascot.OnLoad()
  local update = ns.Session.UpdateWaiting()
  if update and type(UnboredCharDB) == "table" then
    UnboredCharDB.updateTried = update
  end
  ns.Session.RefreshNow()
end

function ns.Mascot:Retry()
  self:Reset()
  ns.Session:Retry()
end

function ns.Mascot:Reset()
  self.forceChoice = false
  self.wishing = false
  self.wishError = nil
  self.asking = nil
  self.item = nil
  self.itemFacts = nil
  self.itemAsked = nil
  if self.picking then
    self.picking = false
    if self.catcher then
      self.catcher:Hide()
    end
  end
end

function ns.Mascot:ShowChoice()
  self:Reset()
  ns.Session.welcomeBack = false
  self.forceChoice = true
  self:Reveal()
end

-- A question ("ask"), what to do nearby ("nearby"), or an item ("item").
function ns.Mascot:ShowAsk(mode, text)
  if mode == "item" then
    self:StartPick()
    return
  end
  self:Reset()
  self.asking = mode == "nearby" and "nearby" or "ask"
  if self.wishEdit then
    self.wishEdit:SetText(text or "")
  end
  self:Reveal()
  if self.wishEdit and self.view and self.view.wish then
    self.wishEdit:SetFocus()
  end
end

-- What is this item?: the next item picked up is read and put back.
function ns.Mascot:StartPick()
  self:Reset()
  self.asking = "item"
  self.picking = true
  if self.catcher then
    self.catcher:Show()
  end
  self:Reveal()
end

function ns.Mascot:StopPick()
  self.picking = false
  if self.catcher and self.catcher:IsShown() then
    self.catcher:Hide()
  end
  if self.asking == "item" and not self.item then
    self.asking = nil
  end
  self:Refresh()
end

-- The cursor picked up or dropped something.
function ns.Mascot:OnCursorChanged()
  local holds = cursorHoldsItem()
  if holds and self.picking then
    local item = ns.Items.FromCursor()
    if item then
      self:ShowItem(item)
    end
    return
  end
  local teach = (tonumber(ns.DB and ns.DB.dropsTaught) or 0) < DROP_TEACH
  if self.dropHint then
    self.dropHint:SetShown(holds and teach and self.frame:IsShown() and not ns.IsCombat())
  end
end

-- An unknown item goes straight to the Planner (docs/adr/0015).
function ns.Mascot:ShowItem(item)
  self:Reset()
  if self.dropHint then
    self.dropHint:Hide()
  end
  self.asking = "item"
  self.item = item
  if item then
    self.itemFacts = ns.Items.Facts(item.itemID, item.link, item)
    if #self.itemFacts == 0 and ns.UI.HasCompanion() and not busy(ns.Session) then
      self.itemAsked = ns.Session:Ask({ type = "item", item = item })
    end
  end
  self:Reveal()
end

function ns.Mascot:AskItem()
  local item = self.item
  if not item then
    return
  end
  self.itemAsked = ns.Session:Ask({ type = "item", item = item })
  self:Refresh()
end

function ns.Mascot:SendAsk()
  local nearby = self.asking == "nearby"
  local text = ns.Trim(self.wishEdit and self.wishEdit:GetText() or "")
  if text == "" and not nearby then
    self.wishError = ns.T("ASK_EMPTY")
    self:Refresh()
    return
  end
  self:Reset()
  if self.wishEdit.ClearFocus then
    self.wishEdit:ClearFocus()
  end
  self.wishEdit:SetText("")
  ns.Session:AskQuestion(text ~= "" and text or ns.T("NEARBY_QUESTION"), nearby and "nearby" or nil)
  self:Reveal()
end

function ns.Mascot:ShowWish()
  self:Reset()
  self.wishing = true
  if self.wishEdit then
    local last = type(UnboredCharDB) == "table" and UnboredCharDB.lastWish
    self.wishEdit:SetText(type(last) == "string" and last or "")
  end
  if self.minutesEdit then
    self.minutesEdit:SetText("")
  end
  self:Reveal()
  if self.wishEdit and self.view and self.view.kind == "wish" then
    self.wishEdit:SetFocus()
  end
end

function ns.Mascot:Back()
  if self.wishing or self.asking then
    self:Reset()
  else
    self.forceChoice = false
  end
  self:Refresh()
end

-- Called by the ticker: a Refresh offer that just came due, or a lead line
-- that ran out, redraws the bubble.
function ns.Mascot:CheckSlow()
  local view = self.view
  if not self.frame or not view or ns.IsCombat() then
    return
  end
  local due = ns.Session:RefreshOffer()
  local dueKind = due and due.kind or nil
  local lead = leadText(self) ~= nil
  if dueKind ~= self.offerKind or lead ~= (self.leadShown or false) then
    self:Refresh()
  end
end

-- One click: a Quick plan right away and, with the Companion, the Request
-- for the Full plan. Nothing reloads (docs/adr/0005, 0012).
function ns.Mascot:Choose(preset)
  self:Reset()
  ns.Session:QuickPlan(preset)
  if not ns.UI.HasCompanion() then
    return
  end
  ns.Session:Ask({ type = "plan", mode = preset.mode, topic = preset.id, wish = preset.wish })
end

function ns.Mascot:SendWish()
  local text = ns.Trim(self.wishEdit and self.wishEdit:GetText() or "")
  if text == "" then
    self.wishError = ns.T("WISH_EMPTY")
    self:Refresh()
    return
  end
  local minutes = ns.Trim(self.minutesEdit and self.minutesEdit:GetText() or "")
  local budget = nil
  if minutes ~= "" then
    budget = tonumber(minutes)
    if not budget or budget < 5 or budget > 240 or budget ~= math.floor(budget) then
      self.wishError = ns.T("WISH_MINUTES_BAD")
      self:Refresh()
      return
    end
  end
  local mode = ns.Session.ChosenMode()
  self:Reset()
  if self.wishEdit.ClearFocus then
    self.wishEdit:ClearFocus()
  end
  ns.Session:QuickPlan({ id = nil, mode = mode })
  if ns.UI.HasCompanion() and ns.Session:Ask({ type = "plan", wish = text, budget = budget }) then
    self.wishEdit:SetText("")
    self.minutesEdit:SetText("")
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

local function scaleSetting(key)
  local scale = tonumber(db()[key])
  for i = 1, #SCALES do
    if SCALES[i] == scale then
      return scale
    end
  end
  return 100
end

function ns.Mascot.Scale()
  return scaleSetting("scale")
end

function ns.Mascot.BubbleScale()
  return scaleSetting("bubbleScale")
end

function ns.Mascot:SetScale(percent)
  db().scale = percent
  if self.frame then
    self.frame:SetScale(self.Scale() / 100)
    self:Refresh()
  end
end

function ns.Mascot:SetBubbleScale(percent)
  db().bubbleScale = percent
  if self.bubble then
    self.bubble:SetScale(self.BubbleScale() / 100)
    self:Refresh()
  end
end

local function hideAll(mascot)
  mascot.bubble:Hide()
  mascot.pill:Hide()
  for i = 1, #mascot.echoFrames do
    mascot.echoFrames[i]:Hide()
  end
end

-- Everything the bubble may show starts hidden; Layout shows what the view uses.
local function clearBubble(mascot)
  for _, button in pairs(mascot.buttons) do
    button:Hide()
  end
  for i = 1, #mascot.chips do
    mascot.chips[i]:Hide()
  end
  mascot.otherChip:Hide()
  mascot.wishBox:Hide()
  mascot.minutesBox:Hide()
end

function ns.Mascot:Refresh()
  local frame = self.frame
  if not frame then
    return
  end
  local saved = db()
  if saved.hidden then
    frame:Hide()
    hideAll(self)
    return
  end
  frame:Show()
  if ns.IsCombat() then
    -- Out of the way in a fight; the portrait stays, faded, and ignores clicks.
    frame:SetAlpha(COMBAT_ALPHA)
    hideAll(self)
    self.dropHint:Hide()
    return
  end
  frame:SetAlpha(1)
  local view = self.View()
  local key = view.kind .. ":" .. tostring(view.key or "")
  local old = self.view
  local changed = key ~= self.lastKey
  if changed and old and old.message
    and (old.kind == "answer" or old.kind == "offer" or old.kind == "failed") then
    self:Echo(old.message, old.kind == "answer")
  end
  if changed and type(view.before) == "table" then
    for i = 1, #view.before do
      self:Echo(view.before[i], true)
    end
  end
  if changed and (view.kind == "answer" or view.kind == "failed" or view.kind == "choice" or view.kind == "offer"
    or view.kind == "update" or view.kind == "welcome" or view.kind == "ready") then
    saved.collapsed = false
  end
  local stepped = changed and view.kind == "step" and old and old.kind == "step"
  self.lastKey = key
  self.view = view
  local due = ns.Session:RefreshOffer()
  self.offerKind = due and due.kind or nil
  self.leadShown = leadText(self) ~= nil
  self:SetMood(view.mood)
  clearBubble(self)
  self:ExpireEchoes(true)
  for i = 1, #self.echoFrames do
    self.echoFrames[i]:Hide()
  end
  local right = self:OnRightHalf()
  if saved.collapsed then
    self.bubble:Hide()
    self.pill:ClearAllPoints()
    if right then
      self.pill:SetPoint("RIGHT", frame, "LEFT", -4, 0)
    else
      self.pill:SetPoint("LEFT", frame, "RIGHT", 4, 0)
    end
    self.pill:Show()
    return
  end
  self.pill:Hide()
  self:Layout(view, right)
  if stepped then
    if self.fade then
      self.fade:Stop()
      self.fade:Play()
    end
    if self.tick then
      self.tick:Stop()
      self.tick:Play()
    end
  end
end

function ns.Mascot:Layout(view, right)
  local bubble = self.bubble
  local frame = self.frame
  bubble:ClearAllPoints()
  if right then
    bubble:SetPoint("TOPRIGHT", frame, "TOPLEFT", -8, 0)
  else
    bubble:SetPoint("TOPLEFT", frame, "TOPRIGHT", 8, 0)
  end
  bubble:Show()
  if self.collapse.icon.SetTexCoord then
    if right then
      self.collapse.icon:SetTexCoord(1, 0, 0, 1)
    else
      self.collapse.icon:SetTexCoord(0, 1, 0, 1)
    end
  end

  local y = -PAD + 2
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

  -- Top row: the small muted meta on the left, menu and collapse on the right.
  self.collapse:ClearAllPoints()
  self.collapse:SetPoint("TOPRIGHT", bubble, "TOPRIGHT", -4, -4)
  self.menuButton:ClearAllPoints()
  self.menuButton:SetPoint("RIGHT", self.collapse, "LEFT", -2, 0)
  if view.meta then
    self.meta:SetTextColor(MUTED[1], MUTED[2], MUTED[3])
  else
    self.meta:SetTextColor(TEAL[1], TEAL[2], TEAL[3])
  end
  put(self.meta, view.meta or ns.MASCOT_NAME, 6, INNER - (TOP_ICON + 4) * 2 - 4)
  put(self.header, view.header, 4)
  put(self.message, view.message, 6)
  put(self.sub, view.sub, 4)
  put(self.where, view.where, 4)

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
  elseif view.wish then
    self.wishBox.placeholder:SetText(view.hint or ns.T("WISH_HINT"))
    y = y - place(self.wishBox, PAD, ns.AsNumber(self.wishBox:GetHeight()) or 64) - 6
    self.wishBox.UpdatePlaceholder()
    if view.minutes then
      y = y - place(self.minutesBox, PAD, 24) - 6
      self.minutesBox.UpdatePlaceholder()
    end
  end

  -- One action bar; a row that would not fit wraps.
  local buttons = view.buttons or {}
  if #buttons > 0 then
    y = y - 2
    local x = PAD
    for i = 1, #buttons do
      local button = self.buttons[buttons[i]]
      local width = ns.AsNumber(button:GetWidth()) or ACTION
      if x > PAD and x + width > PAD + INNER then
        x = PAD
        y = y - ACTION - 4
      end
      button:ClearAllPoints()
      button:SetPoint("TOPLEFT", bubble, "TOPLEFT", x, y)
      button:Show()
      x = x + width + 6
    end
    y = y - ACTION
  end
  bubble:SetHeight(math.ceil(-y + PAD))
  self:LayoutEchoes(right)
end

-- An older message, kept for a little while above the bubble. Done/Skip
-- lines are one short line; parts of an Answer are kept whole.
function ns.Mascot:Echo(text, full)
  if type(text) ~= "string" then
    return
  end
  local short = ns.Trim(text)
  if not full then
    short = ns.Trim(text:match("^[^\n]*") or "")
    local cut = ns.Utf8Truncate(short, ECHO_BYTES)
    if cut ~= short then
      short = cut .. "..."
    end
  end
  if short == "" then
    return
  end
  self.echoes = self.echoes or {}
  local last = self.echoes[#self.echoes]
  if last and last.text == short then
    last.at = ns.Now()
    return
  end
  self.echoes[#self.echoes + 1] = { text = short, at = ns.Now() }
  while #self.echoes > ECHOES do
    table.remove(self.echoes, 1)
  end
end

-- Drops echoes older than ECHO_SECONDS. Called by the ticker too, so they
-- go away on their own; returns true when one went.
function ns.Mascot:ExpireEchoes(quiet)
  local list = self.echoes or {}
  local now = ns.Now()
  local dropped = false
  for i = #list, 1, -1 do
    if now - (tonumber(list[i].at) or 0) > ECHO_SECONDS then
      table.remove(list, i)
      dropped = true
    end
  end
  if dropped and not quiet then
    self:Refresh()
  end
  return dropped
end

function ns.Mascot:LayoutEchoes(right)
  local list = self.echoes or {}
  local below = self.bubble
  for n = 1, math.min(#list, ECHOES) do
    local entry = list[#list - n + 1]
    local echo = self.echoFrames[n]
    echo.text:SetText(entry.text)
    local width = math.min(INNER, math.ceil(ns.AsNumber(echo.text:GetStringWidth()) or INNER) + 2)
    local height = ns.UI.Measure(echo.text, width)
    echo:SetSize(width + PAD * 2, height + 12)
    echo:ClearAllPoints()
    if right then
      echo:SetPoint("BOTTOMRIGHT", below, "TOPRIGHT", 0, 4)
    else
      echo:SetPoint("BOTTOMLEFT", below, "TOPLEFT", 0, 4)
    end
    echo:SetAlpha(ECHO_ALPHA[n] or 0.3)
    echo:Show()
    below = echo
  end
end

-- Called by the ticker: only the distance line changes.
function ns.Mascot:UpdateDistance()
  local view = self.view
  local task = ns.Session and ns.Session:Current()
  if not self.bubble or not self.bubble:IsShown() or not view or view.kind ~= "step" or not task then
    return
  end
  if ns.Tracker.CurrentMeta(task) ~= view.where then
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

function ns.Mascot:Hide(quiet)
  db().hidden = true
  if self.frame then
    self.frame:Hide()
    hideAll(self)
  end
  if not quiet then
    ns.Print(ns.T("HIDDEN_CHAT", ns.MASCOT_NAME))
  end
end

function ns.Mascot.IsHidden()
  return db().hidden == true
end

-- The minimap button's left click: Wisp in or out of view.
function ns.Mascot:ToggleShown()
  if self.IsHidden() or db().collapsed then
    self:Reveal()
  else
    self:Hide(true)
  end
end

local function sizeItems(current, set)
  local out = {}
  for i = 1, #SCALES do
    local percent = SCALES[i]
    out[i] = {
      text = ns.T("SCALE_PCT", percent),
      checked = function() return current() == percent end,
      func = function() set(percent) end,
    }
  end
  return out
end

-- Off keeps only the Sections a Plan Request needs (docs/adr/0031).
function ns.Mascot:SetSharing(on)
  ns.DB.shareData = on and true or false
  if ns.Snapshot then
    if on then
      pcall(ns.Snapshot.LoginPass)
    else
      pcall(ns.Snapshot.ApplySharing)
    end
  end
  self:Echo(ns.T(on and "SHARE_ON" or "SHARE_OFF"))
end

-- Settings stay basic: sizes, lock, hide, sharing, keybinds. The rest is under More.
function ns.Mascot:SettingsTree()
  return {
    { text = ns.T("MENU_WISP_SIZE"), children = sizeItems(self.Scale, function(p) self:SetScale(p) end) },
    {
      text = ns.T("MENU_BUBBLE_SIZE"),
      children = sizeItems(self.BubbleScale, function(p) self:SetBubbleScale(p) end),
    },
    {
      text = ns.T("MENU_LOCK_MASCOT"),
      checked = function() return self:Locked() end,
      func = function() self:SetLocked(not self:Locked()) end,
    },
    {
      text = ns.T("MENU_SHARE_DATA"),
      checked = function() return ns.DB.shareData ~= false end,
      func = function() self:SetSharing(ns.DB.shareData == false) end,
    },
    {
      text = ns.T("MENU_TOOLTIP_LINES"),
      checked = function() return ns.DB.tooltipLines ~= false end,
      func = function() ns.DB.tooltipLines = ns.DB.tooltipLines == false end,
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
  items[#items + 1] = { text = ns.T("MENU_ITEM"), func = function() self:StartPick() end }
  items[#items + 1] = { text = ns.T("MENU_ASK"), func = function() self:ShowAsk("ask") end }
  if ns.Session:PendingRequest() then
    items[#items + 1] = { text = ns.T("MENU_REFRESH"), func = function() ns.Session.RefreshNow() end }
  end
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

-- The toggle key and /unbored: the presets, or the bubble back.
function ns.Mascot:Toggle()
  if self.IsHidden() or db().collapsed then
    self:Reveal()
  elseif self.WantsChoice() and (not self.view or self.view.kind ~= "choice") then
    self:ShowChoice()
  elseif self.frame then
    self:OpenMenu(self.frame)
  end
end
