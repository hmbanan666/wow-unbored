-- Small building blocks for Bory's bubble and the list view. Everything the
-- player sees lives in the bubble (UI/Mascot.lua); there is no main window.

local _, ns = ...

ns.UI = ns.UI or {}

local GOLD = ns.PALETTE.highlight
local P = ns.PALETTE

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
  bg = bg or { P.bg[1], P.bg[2], P.bg[3], 0.94 }
  border = border or { P.gold[1], P.gold[2], P.gold[3], 0.9 }
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
    self.label:SetTextColor(P.cream[1], P.cream[2], P.cream[3])
  end)
  button:SetScript("OnLeave", function(self)
    self.label:SetTextColor(GOLD[1], GOLD[2], GOLD[3])
  end)
  button:SetLabel(text)
  return button
end

-- Width first, then the wrapped height, so the next row never overlaps.
-- The old height is cleared first (0 = fit the text): a height left from a
-- shorter text would otherwise clip the new one (docs/adr/0016).
function ns.UI.Measure(fs, width)
  fs:SetWidth(width)
  if fs.SetMaxLines then
    fs:SetMaxLines(0)
  end
  fs:SetHeight(0)
  local text = fs:GetText()
  if not text or text == "" then
    return 0
  end
  local height = ns.AsNumber(fs:GetStringHeight()) or 12
  height = math.ceil(height) + 1
  fs:SetHeight(height)
  return height
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

function ns.UI.HasCompanion()
  if type(UnboredExternalPlan) == "table" or ns.AddonLoaded("Unbored_Plan") then
    return true
  end
  return false
end

-- Old entry points (keybinds, slash commands, other addons) open the bubble.
-- Ask is gone (docs/adr/0046): "ask" and "nearby" open the choice.
function ns.UI.Open(_, mode)
  if mode == "item" then
    ns.Mascot:StartPick()
  else
    ns.Mascot:ShowChoice()
  end
end

function ns.UI.OpenItem(_, item)
  if item then
    ns.Mascot:ShowItem(item)
  else
    ns.Mascot:StartPick()
  end
end

function ns.UI.Toggle()
  ns.Mascot:ShowChoice()
end

function ns.UI.Refresh() end
