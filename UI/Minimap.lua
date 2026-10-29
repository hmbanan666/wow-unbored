-- LibDBIcon-style minimap button (docs/adr/0017): round, gold border, on the
-- rim outside the map, dragged around the edge; the angle is saved.

local _, ns = ...

local button
-- LibDBIcon puts the button centre this far outside the map's own radius.
local RIM_OFFSET = 10

function ns.MinimapRadius()
  local width = Minimap and ns.AsNumber(ns.Call(Minimap.GetWidth, Minimap))
  if not width or width <= 0 then
    return 80
  end
  return width / 2 + RIM_OFFSET
end

local function place(angle)
  if not button or not Minimap then
    return
  end
  local radius = ns.MinimapRadius()
  local rad = math.rad(angle or 210)
  button:ClearAllPoints()
  button:SetPoint("CENTER", Minimap, "CENTER", math.cos(rad) * radius, math.sin(rad) * radius)
end

local function savedAngle()
  local minimap = ns.DB and ns.DB.minimap
  if minimap and type(minimap.angle) == "number" then
    return minimap.angle
  end
  return 210
end

function ns.MinimapSetShown(show)
  if not button then
    return
  end
  if show then
    button:Show()
  else
    button:Hide()
  end
  if ns.DB and ns.DB.minimap then
    ns.DB.minimap.hide = not show
  end
end

function ns.RegisterCompartment()
  if ns.compartmentRegistered then
    return
  end
  if not AddonCompartmentFrame or not AddonCompartmentFrame.RegisterAddon then
    return
  end
  local ok = pcall(AddonCompartmentFrame.RegisterAddon, AddonCompartmentFrame, {
    text = "Unbored: " .. ns.MASCOT_NAME,
    icon = "Interface\\AddOns\\Unbored\\Media\\Icon.tga",
    notCheckable = true,
    registerForAnyClick = true,
    func = function(_, _, mouseButton)
      if mouseButton == "RightButton" then
        ns.Mascot:OpenMenu(AddonCompartmentFrame)
      else
        ns.Mascot:ToggleShown()
      end
    end,
  })
  ns.compartmentRegistered = ok and true or false
end

function ns.CreateMinimapButton()
  if button or not Minimap or not CreateFrame then
    return
  end
  button = CreateFrame("Button", "UnboredMinimapButton", Minimap)
  button:SetSize(31, 31)
  button:SetFrameStrata("MEDIUM")
  button:SetFrameLevel(8)
  button:RegisterForClicks("AnyUp")
  button:RegisterForDrag("LeftButton")
  button:SetHighlightTexture("Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight")

  local background = button:CreateTexture(nil, "BACKGROUND")
  background:SetSize(24, 24)
  background:SetPoint("CENTER")
  background:SetTexture("Interface\\Minimap\\UI-Minimap-Background")

  local icon = button:CreateTexture(nil, "ARTWORK")
  icon:SetSize(18, 18)
  icon:SetPoint("CENTER")
  icon:SetTexture("Interface\\AddOns\\Unbored\\Media\\Icon.tga")
  if icon.SetTexCoord then
    icon:SetTexCoord(0.05, 0.95, 0.05, 0.95)
  end
  button.icon = icon

  -- The gold ring every minimap button wears.
  local border = button:CreateTexture(nil, "OVERLAY")
  border:SetSize(50, 50)
  border:SetPoint("TOPLEFT")
  border:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")
  button.border = border

  button:SetScript("OnClick", function(self, mouseButton)
    if mouseButton == "RightButton" then
      ns.Mascot:OpenMenu(self)
    else
      ns.Mascot:ToggleShown()
    end
  end)
  button:SetScript("OnDragStart", function(self)
    self:SetScript("OnUpdate", function()
      if not Minimap or not GetCursorPosition then
        return
      end
      local mx, my = Minimap:GetCenter()
      local cx, cy = GetCursorPosition()
      local scale = UIParent and UIParent.GetEffectiveScale and UIParent:GetEffectiveScale()
      mx, my = ns.AsNumber(mx), ns.AsNumber(my)
      cx, cy = ns.AsNumber(cx), ns.AsNumber(cy)
      scale = ns.AsNumber(scale)
      if not mx or not my or not cx or not cy or not scale or scale == 0 then
        return
      end
      cx, cy = cx / scale, cy / scale
      local angle = math.deg(math.atan2(cy - my, cx - mx))
      if ns.DB then
        ns.DB.minimap = ns.DB.minimap or {}
        ns.DB.minimap.angle = angle
      end
      place(angle)
    end)
  end)
  button:SetScript("OnDragStop", function(self)
    self:SetScript("OnUpdate", nil)
  end)
  button:SetScript("OnEnter", function(self)
    if not GameTooltip then
      return
    end
    GameTooltip:SetOwner(self, "ANCHOR_LEFT")
    GameTooltip:SetText(ns.MASCOT_NAME)
    GameTooltip:AddLine(ns.T("TIP_MINIMAP"), 1, 1, 1, true)
    GameTooltip:Show()
  end)
  button:SetScript("OnLeave", function()
    if GameTooltip then
      GameTooltip:Hide()
    end
  end)

  place(savedAngle())
  if ns.DB and ns.DB.minimap and ns.DB.minimap.hide then
    button:Hide()
  end
end
