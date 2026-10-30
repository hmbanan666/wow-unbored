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
-- The plan card is wider (D92): two-line titles and a Rewards row need room.
local CARD_WIDTH = 300
local PAD = 10
local INNER = BUBBLE_WIDTH - PAD * 2
local CARD_INNER = CARD_WIDTH - PAD * 2
local ACTION = 24
local GLYPH = 16
local TOP_ICON = 16
local P = ns.PALETTE
local ACCENT = P.gold
local RAISED = { P.raised[1], P.raised[2], P.raised[3], 0.92 }
local EDGE = { P.gold[1], P.gold[2], P.gold[3], 0.55 }
local MUTED = P.muted
local CREAM = P.cream
local COMBAT_ALPHA = 0.5
local CHIP_HEIGHT = 26
local IDEA_ICON = 20
local SCALES = { 80, 100, 125, 150 }
local ECHOES = 2
local ECHO_SECONDS = 90
local ECHO_BYTES = 90
local ECHO_ALPHA = { 0.85, 0.55 }
local LEAD_SECONDS = 8
local GOLD = P.highlight
local PIPS = 12
local PIP = 7
local LIST_MAX_HEIGHT = 260
local LIST_ROW_GAP = 4
-- The drop hint stops once the player has handed Bory this many items.
local DROP_TEACH = 3

-- The portrait is layers (BRAND.md): a disc, Bory, and the gold ring on top.
-- A mood swaps only Bory's layer.
local PORTRAITS = {
  idle = "BoryIdle128",
  thinking = "BoryThinking128",
  waiting = "BoryWaiting128",
  happy = "BoryHappy128",
}
local PORTRAIT_BACK = "BoryBack128"
local PORTRAIT_RING = "BoryFrame128"

-- Every action looks the same: one frame, a glyph from Media/Icon*, and a
-- label when a glyph alone would not be clear.
local ACTIONS = {
  done = { icon = "IconDone", tip = "TIP_DONE" },
  skip = { icon = "IconSkip", tip = "TIP_SKIP" },
  send = { icon = "IconSend", tip = "SEND" },
  back = { icon = "IconBack", tip = "BACK" },
  ok = { icon = "IconDone", tip = "GOT_IT" },
  cancel = { icon = "IconClose", tip = "CANCEL_REQUEST" },
  plan = { icon = "IconPlan", label = "INTENT_PLAN" },
  refresh = { icon = "IconRefresh", label = "REFRESH", tip = "TIP_REFRESH" },
  load = { icon = "IconRefresh", label = "LOAD", tip = "TIP_REFRESH" },
  retry = { label = "TRY_AGAIN" },
  use = { label = "OFFER_USE" },
  keep = { label = "OFFER_KEEP" },
  continue = { label = "CONTINUE" },
  new = { label = "SOMETHING_NEW" },
  proper = { icon = "IconPlan", label = "WANT_PROPER", tip = "TIP_WANT_PROPER" },
  next = { icon = "IconSend", label = "NEXT" },
  sendnow = { icon = "IconSend", label = "SEND_NOW", tip = "TIP_SEND_NOW" },
  makeplan = { icon = "IconPlan", label = "MAKE_PLAN" },
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
  texture:SetVertexColor(ACCENT[1], ACCENT[2], ACCENT[3])
  return texture
end

local function actionButton(parent, spec, onClick)
  local button = framed(parent)
  ns.UI.ApplyBackdrop(button, RAISED, EDGE)
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

-- An idea: its title, a muted line under it, one reward picture on the right.
local function ideaChip(parent, onClick)
  local button = chip(parent, "GameFontHighlight", onClick)
  button.sub = font(button, "GameFontHighlightSmall")
  button.sub:SetTextColor(MUTED[1], MUTED[2], MUTED[3])
  button.icon = button:CreateTexture(nil, "ARTWORK")
  button.icon:SetSize(IDEA_ICON, IDEA_ICON)
  button.icon:SetPoint("RIGHT", -8, 0)
  button.icon:Hide()
  tooltip(button, function()
    local idea = button.idea
    if not idea then
      return ""
    end
    local lines = { idea.title, ns.Markup.Plain(idea.goal) }
    for i = 1, #idea.rewards do
      lines[#lines + 1] = "- " .. (ns.Markup.Plain(idea.rewards[i]) or "")
    end
    return table.concat(lines, "\n")
  end)
  return button
end

local function styleChip(button, selected)
  if selected then
    local fill = { P.burgundy[1], P.burgundy[2], P.burgundy[3], 0.85 }
    ns.UI.ApplyBackdrop(button, fill, { GOLD[1], GOLD[2], GOLD[3], 1 })
    button.label:SetTextColor(GOLD[1], GOLD[2], GOLD[3])
  else
    ns.UI.ApplyBackdrop(button, RAISED, EDGE)
    button.label:SetTextColor(CREAM[1], CREAM[2], CREAM[3])
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

-- Thinking (D88): loops made once, each step there and back again, so every
-- loop starts and ends at rest. They stop with Finish() at the end of a loop,
-- never with Stop(), which snaps the portrait back mid-move.
-- TODO(verify-in-game): Finish() on a REPEAT group in 12.x.
local LOOP_SECONDS = 1.2
local FINISH_CAP = LOOP_SECONDS * 2

local function loop(region)
  if not region.CreateAnimationGroup then
    return nil
  end
  local ok, group = pcall(region.CreateAnimationGroup, region)
  if not ok or not group then
    return nil
  end
  group:SetLooping("REPEAT")
  return group
end

local function step(group, kind, order, seconds)
  local anim = group:CreateAnimation(kind)
  anim:SetOrder(order)
  anim:SetDuration(seconds)
  if anim.SetSmoothing then
    anim:SetSmoothing("IN_OUT")
  end
  return anim
end

local function float(region)
  local group = loop(region)
  if not group then
    return nil
  end
  step(group, "Translation", 1, LOOP_SECONDS):SetOffset(0, 3)
  step(group, "Translation", 2, LOOP_SECONDS):SetOffset(0, -3)
  return group
end

local function glow(region)
  local group = loop(region)
  if not group then
    return nil
  end
  local down = step(group, "Alpha", 1, LOOP_SECONDS)
  down:SetFromAlpha(1)
  down:SetToAlpha(0.85)
  local up = step(group, "Alpha", 2, LOOP_SECONDS)
  up:SetFromAlpha(0.85)
  up:SetToAlpha(1)
  return group
end

-- Three dots that light up in turn while Bory waits (D89).
-- TODO(verify-in-game): Animation:SetTarget on a child font string.
local DOT_ALPHA = 0.25
local DOT_SECONDS = 0.4

local function dots(parent)
  local frame = CreateFrame("Frame", nil, parent)
  frame:SetSize(18, 10)
  frame.dots = {}
  for i = 1, 3 do
    local dot = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    dot:SetText(".")
    dot:SetTextColor(ACCENT[1], ACCENT[2], ACCENT[3])
    dot:SetPoint("LEFT", (i - 1) * 5, 0)
    dot:SetAlpha(DOT_ALPHA)
    frame.dots[i] = dot
  end
  local group = loop(frame)
  if group then
    for i = 1, 3 do
      local up = step(group, "Alpha", i, DOT_SECONDS)
      up:SetFromAlpha(DOT_ALPHA)
      up:SetToAlpha(1)
      local down = step(group, "Alpha", i + 1, DOT_SECONDS)
      down:SetFromAlpha(1)
      down:SetToAlpha(DOT_ALPHA)
      if up.SetTarget then
        pcall(up.SetTarget, up, frame.dots[i])
        pcall(down.SetTarget, down, frame.dots[i])
      end
    end
  end
  frame.group = group
  frame:Hide()
  return frame
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
  if ns.Session:Locked() then
    ns.Mascot:Busy()
    return true
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

  -- One holder for all three layers: the bob moves them together, so the
  -- ring never slides against the art. The glow dims Bory alone.
  local holder = CreateFrame("Frame", nil, frame)
  holder:SetSize(SIZE, SIZE)
  holder:SetPoint("CENTER")
  self.holder = holder
  self.back = holder:CreateTexture(nil, "BACKGROUND")
  self.back:SetAllPoints(holder)
  self.back:SetTexture(ns.MEDIA .. PORTRAIT_BACK)
  self.art = holder:CreateTexture(nil, "ARTWORK")
  self.art:SetAllPoints(holder)
  self.art:SetTexture(ns.MEDIA .. PORTRAITS.idle)
  self.ring = holder:CreateTexture(nil, "OVERLAY")
  self.ring:SetAllPoints(holder)
  self.ring:SetTexture(ns.MEDIA .. PORTRAIT_RING)
  self.float = float(holder)
  self.glow = glow(self.art)
  if self.float then
    self.float:SetScript("OnFinished", function()
      self:FinishMood()
    end)
  end

  -- Collapsed: a small "..." pill beside the portrait. A click brings the bubble back.
  local pill = framed(frame)
  pill:SetSize(34, 18)
  ns.UI.ApplyBackdrop(pill, { P.bg[1], P.bg[2], P.bg[3], 0.94 }, { ACCENT[1], ACCENT[2], ACCENT[3], 0.9 })
  pill:RegisterForClicks("AnyUp")
  pill.text = pill:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
  pill.text:SetPoint("CENTER", 0, 1)
  pill.text:SetText("...")
  pill.text:SetTextColor(ACCENT[1], ACCENT[2], ACCENT[3])
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
  self.dropHint:SetTextColor(ACCENT[1], ACCENT[2], ACCENT[3])
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

-- "Show more" / "Show less": the card's one text toggle, with a chevron.
local function textToggle(parent, onClick)
  local button = CreateFrame("Button", nil, parent)
  button:SetHeight(16)
  button.label = button:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
  button.label:SetPoint("LEFT", 0, 0)
  button.label:SetTextColor(ACCENT[1], ACCENT[2], ACCENT[3])
  button.chevron = glyph(button, "IconChevron", 10)
  button.chevron:SetPoint("LEFT", button.label, "RIGHT", 3, 0)
  button:SetHighlightTexture("Interface\\Buttons\\ButtonHilight-Square", "ADD")
  button:SetScript("OnClick", function()
    if ns.ClickSound then
      ns.ClickSound()
    end
    onClick()
  end)
  -- TODO(verify-in-game): which way IconChevron points; it is turned for open and closed.
  button.SetOpen = function(self, text, open)
    self.label:SetText(text)
    local width = math.ceil(ns.AsNumber(self.label:GetStringWidth()) or 60)
    self:SetWidth(width + 16)
    if self.chevron.SetRotation then
      self.chevron:SetRotation(open and math.pi / 2 or -math.pi / 2)
    end
  end
  button:Hide()
  return button
end

-- Progress pips (D91): done filled, the current one a gold ring, the rest dim.
local function pipRow(parent)
  local frame = CreateFrame("Frame", nil, parent)
  frame:SetHeight(PIP)
  frame:EnableMouse(true)
  frame.pips = {}
  for i = 1, PIPS do
    local pip = frame:CreateTexture(nil, "ARTWORK")
    pip:SetSize(PIP, PIP)
    pip:SetPoint("LEFT", (i - 1) * (PIP + 4), 0)
    local hole = frame:CreateTexture(nil, "OVERLAY")
    hole:SetSize(PIP - 4, PIP - 4)
    hole:SetPoint("CENTER", pip, "CENTER")
    hole:SetColorTexture(P.bg[1], P.bg[2], P.bg[3], 1)
    pip.hole = hole
    frame.pips[i] = pip
  end
  frame.more = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  frame.more:SetTextColor(MUTED[1], MUTED[2], MUTED[3])
  frame:SetScript("OnEnter", function(self)
    if GameTooltip and self.tip then
      GameTooltip:SetOwner(self, "ANCHOR_TOP")
      GameTooltip:SetText(self.tip, 1, 1, 1, 1, true)
      GameTooltip:Show()
    end
  end)
  frame:SetScript("OnLeave", function()
    if GameTooltip then
      GameTooltip:Hide()
    end
  end)
  frame:Hide()
  return frame
end

local function drawPips(frame, done, total)
  local shown = math.min(total, PIPS)
  for i = 1, PIPS do
    local pip = frame.pips[i]
    if i > shown then
      pip:Hide()
      pip.hole:Hide()
    else
      pip:Show()
      if i <= done then
        pip:SetColorTexture(ACCENT[1], ACCENT[2], ACCENT[3], 1)
        pip.hole:Hide()
      elseif i == done + 1 then
        pip:SetColorTexture(GOLD[1], GOLD[2], GOLD[3], 1)
        pip.hole:Show()
      else
        pip:SetColorTexture(MUTED[1], MUTED[2], MUTED[3], 0.35)
        pip.hole:Hide()
      end
    end
  end
  local width = shown * (PIP + 4)
  if total > PIPS then
    frame.more:SetText("+" .. (total - PIPS))
    frame.more:ClearAllPoints()
    frame.more:SetPoint("LEFT", width, 0)
    frame.more:Show()
    width = width + math.ceil(ns.AsNumber(frame.more:GetStringWidth()) or 12)
  else
    frame.more:Hide()
  end
  frame:SetWidth(math.max(width, 1))
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
  if bubble.SetHyperlinksEnabled then
    bubble:SetHyperlinksEnabled(true)
  end
  bubble:SetScript("OnHyperlinkEnter", function(frame, link, text)
    ns.Markup.OnEnter(frame, link, text)
  end)
  bubble:SetScript("OnHyperlinkLeave", function()
    ns.Markup.OnLeave()
  end)
  bubble:SetScript("OnHyperlinkClick", function(_, link, text, button)
    ns.Markup.OnClick(link, text, button)
  end)
  ns.UI.ApplyBackdrop(bubble, { P.bg[1], P.bg[2], P.bg[3], 0.94 }, { ACCENT[1], ACCENT[2], ACCENT[3], 0.9 })
  bubble:Hide()
  self.bubble = bubble
  self.fade = fadeIn(bubble, 0.2, 0.25)

  self.meta = font(bubble, "GameFontHighlightSmall")
  self.thinkingDots = dots(bubble)
  self.tick = fadeIn(self.meta, 0.1, 0.4)
  self.header = font(bubble, "GameFontNormal")
  self.header:SetTextColor(GOLD[1], GOLD[2], GOLD[3])
  self.message = font(bubble, "GameFontHighlight")
  self.message:SetTextColor(CREAM[1], CREAM[2], CREAM[3])
  self.sub = font(bubble, "GameFontHighlightSmall")
  self.sub:SetTextColor(CREAM[1], CREAM[2], CREAM[3])
  self.where = font(bubble, "GameFontHighlightSmall")
  self.where:SetTextColor(MUTED[1], MUTED[2], MUTED[3])

  -- The plan card (D91).
  self.title = font(bubble, "GameFontNormal")
  self.title:SetTextColor(GOLD[1], GOLD[2], GOLD[3])
  self.pipRow = pipRow(bubble)
  self.goal = font(bubble, "GameFontHighlightSmall")
  self.goal:SetTextColor(CREAM[1], CREAM[2], CREAM[3])
  self.condition = font(bubble, "GameFontHighlightSmall")
  self.condition:SetTextColor(MUTED[1], MUTED[2], MUTED[3])
  self.why = font(bubble, "GameFontHighlightSmall")
  self.why:SetTextColor(MUTED[1], MUTED[2], MUTED[3])
  self.cardToggle = textToggle(bubble, function()
    self.peek = nil
    self:ToggleCard()
  end)
  self.details = font(bubble, "GameFontHighlightSmall")
  self.details:SetTextColor(CREAM[1], CREAM[2], CREAM[3])
  local okList, list = pcall(CreateFrame, "ScrollFrame", nil, bubble)
  if not okList or not list then
    list = CreateFrame("Frame", nil, bubble)
  end
  list.child = CreateFrame("Frame", nil, list)
  if list.SetScrollChild then
    list:SetScrollChild(list.child)
  end
  list:EnableMouseWheel(true)
  list:SetScript("OnMouseWheel", function(frame, delta)
    if not frame.GetVerticalScroll or not frame.SetVerticalScroll then
      return
    end
    local range = ns.AsNumber(frame.GetVerticalScrollRange and frame:GetVerticalScrollRange()) or 0
    local at = (ns.AsNumber(frame:GetVerticalScroll()) or 0) - delta * 24
    frame:SetVerticalScroll(math.max(0, math.min(range, at)))
  end)
  list.rows = {}
  list:Hide()
  self.list = list
  self.rewardsHeader = font(bubble, "GameFontNormalSmall")
  self.rewardsHeader:SetTextColor(GOLD[1], GOLD[2], GOLD[3])
  self.rewardLines = {}
  for i = 1, ns.PLAN_LIMITS.rewards do
    self.rewardLines[i] = font(bubble, "GameFontHighlightSmall")
  end

  self.collapse = iconButton(bubble, "IconChevron", ns.T("TIP_COLLAPSE"), function()
    self:Collapse()
  end)
  self.menuButton = iconButton(bubble, "IconMenu", ns.T("TIP_MENU"), function(button)
    self:OpenMenu(button)
  end)

  local handlers = {
    done = function() ns.Session:Done() end,
    skip = function() ns.Session:Skip() end,
    send = function() self:SendAsk() end,
    back = function() self:Back() end,
    ok = function() self:OnOk() end,
    cancel = function() ns.Session:CancelRequest() end,
    plan = function() ns.Session:AnswerPlan() end,
    -- ReloadUI straight from the click: it needs the hardware event.
    refresh = function()
      if ns.Session:RefreshOffer() then
        ns.Session:CheckAgain()
      else
        ns.Session.RefreshNow()
      end
    end,
    load = function() self.OnLoad() end,
    retry = function() self:Retry() end,
    use = function() ns.Session:AcceptOffer() end,
    keep = function() ns.Session:DeclineOffer() end,
    continue = function() ns.Session:ContinuePlan() end,
    new = function()
      ns.Session.welcomeBack = false
      self:ShowChoice()
    end,
    proper = function()
      ns.Session:ToSurvey()
      self:FocusWish()
    end,
    next = function() self:SurveyNext() end,
    -- Send now reloads in this click: it needs the hardware event (D66).
    sendnow = function() ns.Session:Send() end,
    makeplan = function() self:PlanFromAnswer() end,
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

  -- Ideas first (D108): up to four, then Surprise me and Something else side
  -- by side, and "More ideas" for the other presets.
  self.ideaChips = {}
  for i = 1, ns.Suggestions.MAX do
    self.ideaChips[i] = ideaChip(bubble, function(button)
      self:ChooseSuggestion(button.idea)
    end)
  end
  self.surpriseChip = chip(bubble, "GameFontNormal", function()
    self:Choose(self.Preset("surprise"))
  end)
  self.moreIdeas = textToggle(bubble, function()
    self.showPresets = not self.showPresets
    self:Refresh()
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
    ns.UI.ApplyBackdrop(echo, { P.bg[1], P.bg[2], P.bg[3], 0.85 }, { ACCENT[1], ACCENT[2], ACCENT[3], 0.5 })
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

-- Only here, and only on a change of mood, are the loops played or
-- finished (D88). Refresh never touches them. While a loop runs out, the new
-- picture waits; a mood change meanwhile only changes which one it will be.
function ns.Mascot:SetMood(mood)
  if not PORTRAITS[mood] then
    mood = "idle"
  end
  if self.mood == mood then
    return
  end
  self.mood = mood
  local thinking = mood == "thinking"
  if thinking == (self.thinking or false) then
    if self.finishing then
      self.pendingArt = PORTRAITS[mood]
    elseif not thinking then
      self.art:SetTexture(ns.MEDIA .. PORTRAITS[mood])
    end
    return
  end
  self.thinking = thinking
  local groups = { self.float, self.glow, self.thinkingDots and self.thinkingDots.group }
  if thinking then
    self.finishing = false
    self.pendingArt = nil
    -- The loops start at rest, so the swap here never shows a jump.
    self.art:SetTexture(ns.MEDIA .. PORTRAITS.thinking)
    for i = 1, 3 do
      if groups[i] then
        groups[i]:Play()
      end
    end
    return
  end
  self.finishing = true
  self.pendingArt = PORTRAITS[mood]
  self.finishToken = (self.finishToken or 0) + 1
  local token = self.finishToken
  for i = 1, 3 do
    if groups[i] then
      groups[i]:Finish()
    end
  end
  if not self.float then
    self:FinishMood()
  elseif C_Timer and C_Timer.After then
    C_Timer.After(FINISH_CAP, function()
      if self.finishing and self.finishToken == token then
        self:FinishMood()
      end
    end)
  end
end

-- The thinking loop ran out: the picture the mood asked for, at rest.
function ns.Mascot:FinishMood()
  if not self.finishing then
    return
  end
  self.finishing = false
  if self.pendingArt then
    self.art:SetTexture(ns.MEDIA .. self.pendingArt)
    self.pendingArt = nil
  end
  if self.thinkingDots and not self.thinking then
    self.thinkingDots:Hide()
  end
end

-- Bory is waiting on a Request: one short line instead of the new thing (D67).
function ns.Mascot:Busy()
  self:Echo(ns.T("BUSY_ONE"))
  self:Reveal()
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
  local wish = type(req.wish) == "string" and req.wish ~= "" and req.wish or nil
  local idea = req.topic == "suggestion" and type(req.suggestion) == "table" and req.suggestion or nil
  local text
  if idea and type(idea.title) == "string" and idea.title ~= "" then
    text = idea.title
    if type(req.extra) == "string" and req.extra ~= "" then
      text = text .. "\n\"" .. req.extra .. "\""
    end
  elseif preset then
    text = ns.T(preset.label)
    if type(req.extra) == "string" and req.extra ~= "" then
      text = text .. "\n\"" .. req.extra .. "\""
    end
  elseif wish then
    text = "\"" .. wish .. "\""
  else
    text = ns.ModeLabel(req.mode or ns.Session.ChosenMode())
  end
  if not preset and tonumber(req.budget) then
    text = text .. "  ·  " .. ns.T("MINUTES", tonumber(req.budget))
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

-- A name that loads after the Bubble was drawn draws it again.
local function relink()
  ns.Mascot:Refresh()
end

local function render(text, npcs)
  if type(text) ~= "string" or ns.Trim(text) == "" then
    return nil
  end
  return ns.Markup.Render(text, npcs, relink)
end

local function merged(a, b)
  if type(a) ~= "table" then
    return b
  end
  if type(b) ~= "table" then
    return a
  end
  local out = {}
  for key, value in pairs(b) do
    out[key] = value
  end
  for key, value in pairs(a) do
    out[key] = value
  end
  return out
end

-- Plan Rewards first, then the Step's own, at most 6 (D91).
local function rewardLines(state, task)
  local out, seen = {}, {}
  for _, list in ipairs({ state.rewards or {}, task.rewards or {} }) do
    for i = 1, #(type(list) == "table" and list or {}) do
      local token = list[i]
      if type(token) == "string" and not seen[token] and #out < ns.PLAN_LIMITS.rewards then
        seen[token] = true
        local line = ns.Markup.RenderReward(token, relink)
        if line then
          out[#out + 1] = line
        end
      end
    end
  end
  return out
end

local function conditionLine(task, check)
  local condition = type(task.condition) == "table" and task.condition or nil
  local text = condition and render(condition.text, task.npcs) or nil
  if not check then
    return text
  end
  local tag = check.met and (ns.Hex(P.ok) .. ns.T("READY") .. "|r") or (ns.Hex(ACCENT) .. ns.T("NOT_YET") .. "|r")
  return text and (text .. "  " .. tag) or tag
end

-- Every Step of the plan in order, finished ones first, for the inline list.
local function allRows(state, mascot)
  local rows = {}
  local finished = {}
  for _, bucket in ipairs({ "done", "skipped" }) do
    for _, entry in ipairs(state[bucket] or {}) do
      if type(entry) == "table" and type(entry.title) == "string" then
        finished[#finished + 1] = { title = entry.title, at = tonumber(entry.at) or 0, state = bucket }
      end
    end
  end
  table.sort(finished, function(a, b)
    return a.at < b.at
  end)
  for i = 1, #finished do
    rows[#rows + 1] = finished[i]
  end
  for i = 1, #(state.tasks or {}) do
    local task = state.tasks[i]
    local row = {
      id = task.id,
      title = ns.Markup.Plain(task.title or "", task.npcs),
      state = i == 1 and "current" or "ahead",
    }
    if mascot.peek == task.id and i > 1 then
      local parts = {}
      for _, name in ipairs({ "why", "note" }) do
        local field = task[name]
        if type(field) == "string" and ns.Trim(field) ~= "" then
          parts[#parts + 1] = ns.Markup.Plain(field, task.npcs)
        end
      end
      row.detail = #parts > 0 and table.concat(parts, "\n") or nil
    end
    rows[#rows + 1] = row
  end
  return rows
end

-- The plan card (D91): what the Bubble shows for the current Step.
local function stepView(mascot, session, task)
  local state = session.state or {}
  local progress = session:Progress() or { step = 1, steps = 1, remaining = 1, minutesLeft = 0 }
  local check = ns.Steps.Condition(task)
  local open = mascot.CardOpen()
  local details = {}
  local progressText = ns.Steps.Progress(check)
  if progressText and not check.met then
    details[#details + 1] = progressText
  end
  details[#details + 1] = render(task.note, task.npcs)
  details[#details + 1] = render(state.details, state.npcs)
  local goal = render(state.goal, state.npcs)
  local rewards = rewardLines(state, task)
  local where = ns.Steps.Footer(task)
  local many = progress.steps > 1
  local tip = ns.T("STEP_OF", progress.step, progress.steps)
  local left = ns.Steps.Duration(progress.minutesLeft)
  if left then
    tip = tip .. "\n" .. ns.T("LEFT", left)
  end
  return {
    kind = "step",
    key = task.id,
    mood = "idle",
    card = true,
    title = session:PlanName(),
    header = leadText(mascot),
    condition = conditionLine(task, check),
    notYet = check ~= nil and not check.met,
    message = ns.Markup.Render(task.title or "", task.npcs, relink),
    why = render(task.why, task.npcs),
    reward = rewards[1],
    -- Everything below sits behind the one toggle.
    expandable = many or goal ~= nil or #details > 0 or #rewards > 1 or where ~= nil,
    open = open,
    pips = open and many and { done = progress.step - 1, total = progress.steps } or nil,
    pipTip = tip,
    goal = open and goal or nil,
    details = open and #details > 0 and table.concat(details, "\n\n") or nil,
    all = open and many and allRows(state, mascot) or nil,
    rewards = open and rewards or {},
    where = open and where or nil,
    npcs = merged(task.npcs, state.npcs),
    buttons = { "done", "skip" },
  }
end

local PROBLEMS = {
  stopped = "COMPANION_STOPPED",
  pairing = "COMPANION_PAIRING",
  revoked = "COMPANION_REVOKED",
  offline = "COMPANION_OFFLINE",
}

-- A Reason code from the Companion, in Bory's words. The planner's own
-- reason (fail_request) is written for the player, so it is shown as is.
local REASONS = {
  not_approved = "COMPANION_PAIRING",
  companion_offline = "COMPANION_STOPPED",
  server_unreachable = "COMPANION_OFFLINE",
  rejected = "REASON_REJECTED",
  timeout = "EXPIRED",
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
  if session:CheckedAgain() then
    return ns.T("ETA_ALMOST"), false
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
    ideas = ns.Suggestions.List(),
    buttons = (task or answer) and { "back" } or {},
  }
end

local function itemView(mascot)
  local item = mascot.item
  if not item then
    return { kind = "item", mood = "idle", message = ns.T("ITEM_TITLE"), buttons = { "back" } }
  end
  local facts = mascot.itemFacts or {}
  return {
    kind = "item",
    key = item.itemID,
    mood = "idle",
    header = item.link or item.name or ns.T("ITEM_UNKNOWN"),
    message = #facts > 0 and table.concat(facts, "\n\n") or ns.T("ITEM_NOTHING_LOCAL"),
    buttons = { "back" },
  }
end

local function askView(mascot)
  local mode = mascot.asking
  if mode == "item" then
    return itemView(mascot)
  end
  local nearby = mode == "nearby"
  return {
    kind = mode,
    mood = "idle",
    message = nearby and ns.T("NEARBY_TITLE") or ns.T("ASK_TITLE"),
    sub = mascot.wishError,
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
    before[i] = ns.Markup.Plain(messages[i], answer.npcs)
  end
  local header = answer.itemLink
  if not header and type(answer.question) == "string" and answer.question ~= "" then
    header = "\"" .. answer.question .. "\""
  end
  local buttons = {}
  if type(answer.tasks) == "table" and #answer.tasks > 0 then
    buttons[#buttons + 1] = "plan"
  end
  if answer.planWish and not session:Locked() then
    buttons[#buttons + 1] = "makeplan"
  end
  buttons[#buttons + 1] = "ok"
  return {
    kind = "answer",
    key = (answer.isLocal and "local:" or "") .. tostring(answer.requestId or answer.at),
    mood = "happy",
    header = header,
    message = ns.Markup.Render(messages[#messages], answer.npcs, relink),
    before = before,
    npcs = answer.npcs,
    buttons = buttons,
  }
end

-- The Survey and Confirm (D65): what the player is about to ask for.
local function flowSummary(req)
  return ns.Mascot.RequestSummary(req)
end

local function surveyView(mascot, req)
  return {
    kind = "survey",
    key = req.topic or "custom",
    mood = "idle",
    header = req.topic and flowSummary(req) or nil,
    message = req.quickEmpty and ns.T("SURVEY_EMPTY") or (req.custom and ns.T("WISH_TITLE") or ns.T("SURVEY_TITLE")),
    sub = mascot.wishError,
    wish = true,
    minutes = req.custom == true,
    hint = req.custom and ns.T("WISH_HINT") or ns.T("SURVEY_HINT"),
    buttons = { "next", "back" },
  }
end

-- An idea shows its goal and rewards above the question (D109).
local function ideaLines(req)
  local idea = req.topic == "suggestion" and type(req.suggestion) == "table" and req.suggestion or nil
  if not idea or type(idea.goal) ~= "string" then
    return nil
  end
  local lines = { render(idea.goal) }
  local shown = {}
  for _, token in ipairs(type(idea.rewards) == "table" and idea.rewards or {}) do
    shown[#shown + 1] = ns.Markup.RenderReward(token, relink)
  end
  if #shown > 0 then
    lines[#lines + 1] = ns.T("REWARDS") .. " " .. table.concat(shown, "  ")
  end
  return table.concat(lines, "\n")
end

local function confirmView(req)
  return {
    kind = "confirm",
    key = (req.topic or "custom") .. ":" .. tostring(req.suggestionId or ""),
    mood = "idle",
    header = flowSummary(req),
    message = ns.T("CONFIRM_TITLE"),
    sub = ideaLines(req),
    buttons = { "sendnow", "back" },
  }
end

-- Queued or waiting: the only Bubble while locked (D67). Over a Quick plan
-- the step stays doable and the line goes on top.
local function waitingView(mascot, session, task, state)
  local req = session.Flow()
  local offer = state == "waiting" and session:RefreshOffer() or nil
  local line, slow = waitLine(session)
  local message
  if state == "queued" then
    message = ns.T("CONFIRM_TITLE")
  elseif offer then
    message = ns.T("ETA_READY")
  else
    message = ns.T("WAITING_ON_IT")
  end
  local extra = {}
  if state == "queued" then
    extra[1] = "sendnow"
  elseif offer then
    extra[1] = "refresh"
  elseif slow then
    extra[1] = "retry"
  end
  local mood = "thinking"
  if offer or state == "queued" then
    mood = "happy"
  elseif slow then
    mood = "waiting"
  elseif line then
    mood = "idle"
  end
  if task then
    local view = stepView(mascot, session, task)
    view.header = leadText(mascot) or (offer and message) or line or message
    for i = 1, #extra do
      view.buttons[#view.buttons + 1] = extra[i]
    end
    view.slow = slow
    view.mood = mood
    return view
  end
  return {
    kind = "waiting",
    key = (req and req.id or "") .. ":" .. state .. ":" .. (offer and "eta" or ""),
    mood = mood,
    header = req and flowSummary(req) or nil,
    message = message,
    sub = not offer and line or nil,
    buttons = extra,
    slow = slow,
  }
end

function ns.Mascot.View()
  local mascot = ns.Mascot
  local session = ns.Session
  local task = session:Current()
  local answer = session.UnreadAnswer()
  local state = session:FlowState()
  local req = session.Flow()
  if mascot.asking then
    return askView(mascot)
  end
  if state == "survey" then
    return surveyView(mascot, req)
  end
  if state == "confirm" then
    return confirmView(req)
  end
  if mascot.forceChoice then
    return choiceView(session, task, answer)
  end
  if state == "failed" then
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
  if state == "expired" then
    return { kind = "expired", mood = "idle", message = ns.T("EXPIRED"), buttons = { "retry", "ok" } }
  end
  if answer then
    return answerView(session, answer)
  end
  if session.welcomeBack and task and not session:Locked() then
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
      sub = first and ns.T("BETTER_FIRST", #offer.plan.tasks, ns.Markup.Plain(first.title or "", first.npcs)) or nil,
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
      buttons = { "load" },
    }
  end
  if state == "queued" or state == "sent" or state == "waiting" then
    return waitingView(mascot, session, task, state)
  end
  if not task then
    return choiceView(session, nil, nil)
  end
  local view = stepView(mascot, session, task)
  if state == "quick" then
    view.buttons[#view.buttons + 1] = "proper"
  end
  return view
end

function ns.Mascot:OnOk()
  local view = self.view or {}
  if view.kind == "failed" or view.kind == "expired" then
    ns.Session:CancelRequest()
  elseif view.kind == "answer" then
    ns.Session:DismissAnswer()
  elseif view.kind == "update" then
    self.updateLater = true
    self:Refresh()
  end
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
  self.wishError = nil
  self.asking = nil
  self.item = nil
  self.itemFacts = nil
  if self.picking then
    self.picking = false
    if self.catcher then
      self.catcher:Hide()
    end
  end
end

function ns.Mascot:ShowChoice()
  if ns.Session:Locked() then
    self:Busy()
    return
  end
  self:Reset()
  ns.Session.welcomeBack = false
  self.forceChoice = true
  self.showPresets = false
  self:Reveal()
end

-- A question ("ask"), what to do nearby ("nearby"), or an item ("item").
function ns.Mascot:ShowAsk(mode, text)
  if ns.Session:Locked() then
    self:Busy()
    return
  end
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
  if ns.Session:Locked() then
    self:Busy()
    return
  end
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

-- What Bory knows about an item, from the game only (D64: no item Requests).
function ns.Mascot:ShowItem(item)
  self:Reset()
  if self.dropHint then
    self.dropHint:Hide()
  end
  self.asking = "item"
  self.item = item
  if item then
    self.itemFacts = ns.Items.Facts(item.itemID, item.link, item)
  end
  self:Reveal()
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

-- "Something else...": the Survey with free text.
function ns.Mascot:ShowWish()
  if ns.Session:Locked() then
    self:Busy()
    return
  end
  self:Reset()
  local last = type(UnboredCharDB) == "table" and UnboredCharDB.lastWish
  ns.Session:BeginSurvey({ wish = type(last) == "string" and last or nil })
  self:FocusWish()
end

-- The Survey box starts with what the flow has, and gets the focus.
function ns.Mascot:FocusWish()
  local req = ns.Session.Flow()
  if self.wishEdit then
    self.wishEdit:SetText(req and req.custom and type(req.wish) == "string" and req.wish or "")
  end
  if self.minutesEdit then
    self.minutesEdit:SetText("")
  end
  self:Reveal()
  if self.wishEdit and self.view and self.view.wish then
    self.wishEdit:SetFocus()
  end
end

-- "Make a plan" under an Answer Bory could not give here.
function ns.Mascot:PlanFromAnswer()
  local answer = ns.Session.UnreadAnswer()
  local wish = answer and answer.planWish
  if answer then
    answer.seen = true
  end
  self:Reset()
  ns.Session:BeginSurvey({ wish = wish })
  self:FocusWish()
end

function ns.Mascot:Back()
  local state = ns.Session:FlowState()
  if self.asking then
    self:Reset()
  elseif state == "survey" or state == "confirm" then
    self.wishError = nil
    ns.Session:FlowBack()
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
  local state = ns.Session:FlowState()
  if dueKind ~= self.offerKind or lead ~= (self.leadShown or false) or state ~= self.flowShown then
    self:Refresh()
  end
end

-- One click: a Quick plan right away and, with the Companion, one button
-- for a proper plan. Nothing is sent yet (D65).
function ns.Mascot:Choose(preset)
  if ns.Session:Locked() then
    self:Busy()
    return
  end
  self:Reset()
  ns.Session:BeginQuick(preset)
  if ns.Session:FlowState() == "survey" then
    self:FocusWish()
  end
end

-- An idea chip: its Quick plan or straight to Confirm (D109).
function ns.Mascot:ChooseSuggestion(idea)
  if not idea then
    return
  end
  if ns.Session:Locked() then
    self:Busy()
    return
  end
  self:Reset()
  ns.Session:BeginSuggestion(idea)
  if ns.Session:FlowState() == "survey" then
    self:FocusWish()
  end
end

-- Survey -> Confirm. A custom wish needs words; minutes are optional (docs/adr/0037).
function ns.Mascot:SurveyNext()
  local req = ns.Session.Flow()
  if not req then
    return
  end
  local text = ns.Trim(self.wishEdit and self.wishEdit:GetText() or "")
  if req.custom and text == "" then
    self.wishError = ns.T("WISH_EMPTY")
    self:Refresh()
    return
  end
  local budget = nil
  local minutes = req.custom and ns.Trim(self.minutesEdit and self.minutesEdit:GetText() or "") or ""
  if minutes ~= "" then
    budget = tonumber(minutes)
    if not budget or budget < 5 or budget > 240 or budget ~= math.floor(budget) then
      self.wishError = ns.T("WISH_MINUTES_BAD")
      self:Refresh()
      return
    end
  end
  self.wishError = nil
  if self.wishEdit.ClearFocus then
    self.wishEdit:ClearFocus()
  end
  self.wishEdit:SetText("")
  self.minutesEdit:SetText("")
  ns.Session:SurveyDone(text, budget)
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

-- The card opens and closes as a whole; the choice is kept for the Account.
function ns.Mascot.CardOpen()
  return db().cardOpen == true
end

function ns.Mascot:ToggleCard()
  db().cardOpen = not self.CardOpen() or nil
  self:Refresh()
end

-- A row in the inline list; a click shows that Step's why and note.
function ns.Mascot:ListRow(index)
  local list = self.list
  local row = list.rows[index]
  if row then
    return row
  end
  row = CreateFrame("Button", nil, list.child)
  row:RegisterForClicks("LeftButtonUp")
  row:SetHighlightTexture("Interface\\QuestFrame\\UI-QuestTitleHighlight", "ADD")
  row.text = font(row, "GameFontHighlightSmall")
  row.text:SetPoint("TOPLEFT", 0, 0)
  row.detail = font(row, "GameFontHighlightSmall")
  row.detail:SetTextColor(MUTED[1], MUTED[2], MUTED[3])
  row:SetScript("OnClick", function(button)
    if button.taskId then
      self.peek = self.peek ~= button.taskId and button.taskId or nil
      self:Refresh()
    end
  end)
  list.rows[index] = row
  return row
end

local ROW_COLORS = {
  done = P.faint,
  skipped = P.faint,
  current = CREAM,
  ahead = MUTED,
}

-- Finished Steps are dimmed and marked; the list scrolls past LIST_MAX_HEIGHT.
function ns.Mascot:LayoutList(rows, width)
  local list = self.list
  for i = 1, #list.rows do
    list.rows[i]:Hide()
  end
  local y = 0
  for i = 1, #rows do
    local entry = rows[i]
    local row = self:ListRow(i)
    local mark = (entry.state == "done" and ns.Hex(P.ok) .. "+|r ") or (entry.state == "skipped" and "- ")
      or (entry.state == "current" and ns.Hex(GOLD) .. ">|r ") or ""
    row.taskId = entry.state == "ahead" and entry.id or nil
    row.text:SetText(mark .. (entry.title or ""))
    local color = ROW_COLORS[entry.state] or MUTED
    row.text:SetTextColor(color[1], color[2], color[3])
    local height = ns.UI.Measure(row.text, width)
    if entry.detail then
      row.detail:SetText(entry.detail)
      row.detail:ClearAllPoints()
      row.detail:SetPoint("TOPLEFT", row.text, "BOTTOMLEFT", 8, -2)
      height = height + 2 + ns.UI.Measure(row.detail, width - 8)
      row.detail:Show()
    else
      row.detail:SetText("")
      row.detail:Hide()
    end
    row:SetSize(width, height)
    row:ClearAllPoints()
    row:SetPoint("TOPLEFT", list.child, "TOPLEFT", 0, -y)
    row:Show()
    y = y + height + LIST_ROW_GAP
  end
  local total = math.max(y - LIST_ROW_GAP, 0)
  list.child:SetSize(width, math.max(total, 1))
  local shown = math.min(total, LIST_MAX_HEIGHT)
  list:SetSize(width, math.max(shown, 1))
  return shown
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
  for i = 1, #mascot.ideaChips do
    mascot.ideaChips[i]:Hide()
    mascot.ideaChips[i].idea = nil
  end
  mascot.surpriseChip:Hide()
  mascot.moreIdeas:Hide()
  mascot.wishBox:Hide()
  mascot.minutesBox:Hide()
  for _, region in ipairs({ mascot.title, mascot.pipRow, mascot.goal, mascot.condition, mascot.why,
    mascot.cardToggle, mascot.details, mascot.list, mascot.rewardsHeader }) do
    region:Hide()
  end
  for i = 1, #mascot.rewardLines do
    mascot.rewardLines[i]:Hide()
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
    or view.kind == "update" or view.kind == "welcome" or view.kind == "survey" or view.kind == "confirm"
    or view.kind == "expired" or ns.Session:RefreshOffer() ~= nil) then
    saved.collapsed = false
  end
  local stepped = changed and view.kind == "step" and old and old.kind == "step"
  self.lastKey = key
  self.view = view
  local due = ns.Session:RefreshOffer()
  self.offerKind = due and due.kind or nil
  self.leadShown = leadText(self) ~= nil
  self.flowShown = ns.Session:FlowState()
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
  local inner = view.card and CARD_INNER or INNER
  bubble:SetWidth(inner + PAD * 2)
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
    local height = ns.UI.Measure(fs, width or inner)
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
    self.meta:SetTextColor(ACCENT[1], ACCENT[2], ACCENT[3])
  end
  ns.Markup.UseNpcs(view.npcs)
  local topWidth = inner - (TOP_ICON + 4) * 2 - 4
  if view.card then
    self.meta:SetText("")
    self.meta:Hide()
    put(self.title, view.title, 8, topWidth)
    self:LayoutCard(view, inner, function(region, height, gap, x)
      region:ClearAllPoints()
      region:SetPoint("TOPLEFT", bubble, "TOPLEFT", PAD + (x or 0), y)
      region:Show()
      y = y - height - (gap or 4)
    end, put)
  else
    put(self.meta, view.meta or ns.MASCOT_NAME, 6, topWidth)
    put(self.header, view.header, 4)
    put(self.message, view.message, 6)
    put(self.sub, view.sub, 4)
    self.where:SetJustifyH("LEFT")
    put(self.where, view.where, 4)
  end
  local dotsFor = view.card and self.title or self.meta
  if self.thinking or self.finishing then
    local width = math.min(math.ceil(ns.AsNumber(dotsFor:GetStringWidth()) or 0), topWidth)
    self.thinkingDots:ClearAllPoints()
    self.thinkingDots:SetPoint("TOPLEFT", dotsFor, "TOPLEFT", width + 3, 0)
    self.thinkingDots:Show()
  else
    self.thinkingDots:Hide()
  end

  local function place(region, x, height)
    region:ClearAllPoints()
    region:SetPoint("TOPLEFT", bubble, "TOPLEFT", x, y)
    region:Show()
    return height
  end
  local function layoutChip(button, text, selected)
    button.label:SetText(text)
    local height = math.max(CHIP_HEIGHT, ns.UI.Measure(button.label, inner - 20) + 10)
    button:SetSize(inner, height)
    styleChip(button, selected)
    y = y - place(button, PAD, height) - 4
  end
  local function layoutIdea(button, idea)
    button.idea = idea
    button.label:SetText(idea.title)
    local line = ns.Suggestions.Line(idea)
    button.sub:SetText(line or "")
    local icon = idea.rewards[1] and ns.Markup.RewardIcon(idea.rewards[1])
    local width = inner - 20 - (icon and IDEA_ICON + 6 or 0)
    local height = ns.UI.Measure(button.label, width) + 10
    button.label:ClearAllPoints()
    button.label:SetPoint("TOPLEFT", 10, -5)
    button.sub:ClearAllPoints()
    if line then
      button.sub:SetPoint("TOPLEFT", button.label, "BOTTOMLEFT", 0, -2)
      height = height + ns.UI.Measure(button.sub, width) + 2
      button.sub:Show()
    else
      button.sub:Hide()
    end
    if icon then
      button.icon:SetTexture(icon)
      button.icon:Show()
    else
      button.icon:Hide()
    end
    height = math.max(CHIP_HEIGHT, height)
    button:SetSize(inner, height)
    styleChip(button, false)
    y = y - place(button, PAD, height) - 4
  end
  -- Two small chips on one row.
  local function layoutPair(left, leftText, rightChip, rightText)
    local half = math.floor((inner - 4) / 2)
    left.label:SetText(leftText)
    rightChip.label:SetText(rightText)
    local height = math.max(CHIP_HEIGHT, ns.UI.Measure(left.label, half - 20) + 10,
      ns.UI.Measure(rightChip.label, inner - half - 24) + 10)
    left:SetSize(half, height)
    rightChip:SetSize(inner - half - 4, height)
    styleChip(left, false)
    styleChip(rightChip, false)
    place(left, PAD, height)
    place(rightChip, PAD + half + 4, height)
    y = y - height - 4
  end
  if view.choice and #(view.ideas or {}) > 0 then
    y = y - 2
    for i = 1, math.min(#view.ideas, #self.ideaChips) do
      layoutIdea(self.ideaChips[i], view.ideas[i])
    end
    layoutPair(self.surpriseChip, ns.T("PRESET_SURPRISE"), self.otherChip, ns.T("PRESET_OTHER"))
    self.moreIdeas:SetOpen(self.showPresets and ns.T("LESS") or ns.T("MORE_IDEAS"), self.showPresets)
    y = y - place(self.moreIdeas, PAD, 16) - 4
    if self.showPresets then
      for i = 1, #self.chips do
        if self.chips[i].preset.id ~= "surprise" then
          layoutChip(self.chips[i], ns.T(self.chips[i].preset.label), false)
        end
      end
    end
  elseif view.choice then
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
      if x > PAD and x + width > PAD + inner then
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

-- The card below its title row. Closed, it is only what to do now: the
-- step, why, and the main reward. "Show more" opens the rest in place.
-- place(region, height, gap, x) puts a region at the cursor; put(fs, text, gap) a string.
function ns.Mascot:LayoutCard(view, inner, place, put)
  put(self.header, view.header, 6)
  put(self.condition, view.condition, 3)
  put(self.message, view.message, 4)
  put(self.why, view.why, 8)
  if view.reward and not view.open then
    put(self.rewardLines[1], view.reward, 8)
  end
  if view.expandable then
    self.cardToggle:SetOpen(view.open and ns.T("LESS") or ns.T("CARD_MORE"), view.open)
    place(self.cardToggle, 16, 8)
  end
  if not view.open then
    return
  end
  if view.pips and view.pips.total > 1 then
    drawPips(self.pipRow, view.pips.done, view.pips.total)
    self.pipRow.tip = view.pipTip
    place(self.pipRow, PIP, 8, 1)
  end
  put(self.goal, view.goal, 8)
  put(self.details, view.details, 8)
  if view.all then
    local height = self:LayoutList(view.all, inner - 4)
    place(self.list, height, 8, 4)
  end
  if #view.rewards > 0 then
    put(self.rewardsHeader, ns.T("REWARDS"), 4)
    for i = 1, #self.rewardLines do
      put(self.rewardLines[i], view.rewards[i], 3)
    end
  end
  if view.where then
    self.where:SetJustifyH("RIGHT")
    put(self.where, view.where, 4)
  end
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
  if ns.Steps.Footer(task) ~= view.where then
    self:Refresh()
  end
end

function ns.Mascot:Reveal()
  local saved = db()
  saved.hidden = false
  saved.collapsed = false
  self:Refresh()
end

-- On the update view the collapse is the "later" (D87).
function ns.Mascot:Collapse()
  if self.view and self.view.kind == "update" then
    self.updateLater = true
  end
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

-- The minimap button's left click: Bory in or out of view.
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
    { text = ns.T("MENU_BORY_SIZE"), children = sizeItems(self.Scale, function(p) self:SetScale(p) end) },
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
  local items = {}
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
  if ns.Session.undo then
    items[#items + 1] = { text = ns.T("MENU_UNDO_PLAN"), func = function() ns.Session:UndoReplace() end }
  end
  items[#items + 1] = { text = ns.T("MENU_ITEM"), func = function() self:StartPick() end }
  items[#items + 1] = { text = ns.T("MENU_ASK"), func = function() self:ShowAsk("ask") end }
  if ns.Session:PendingRequest() then
    items[#items + 1] = { text = ns.T("MENU_REFRESH"), func = function() ns.Session.RefreshNow() end }
  end
  if ns.Session:Locked() then
    items[#items + 1] = { text = ns.T("MENU_CANCEL_REQUEST"), func = function() ns.Session:CancelRequest() end }
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
