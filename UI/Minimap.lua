local _, ns = ...

local button

local function place(angle)
  if not button or not Minimap then
    return
  end
  local radius = 80
  local rad = math.rad(angle or 210)
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
    text = "Unbored",
    icon = "Interface\\AddOns\\Unbored\\Media\\Icon.tga",
    notCheckable = true,
    registerForAnyClick = true,
    func = function(_, _, mouseButton)
      if mouseButton == "RightButton" and ns.ShowImport then
        ns.ShowImport()
      else
        Unbored_Toggle()
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

  local icon = button:CreateTexture(nil, "BACKGROUND")
  icon:SetPoint("CENTER")
  icon:SetSize(20, 20)
  icon:SetTexture("Interface\\AddOns\\Unbored\\Media\\Icon.tga")

  local overlay = button:CreateTexture(nil, "OVERLAY")
  overlay:SetPoint("TOPLEFT")
  overlay:SetPoint("BOTTOMRIGHT")
  local atlasOK = pcall(overlay.SetAtlas, overlay, "UI-HUD-Minimap-Button")
  if not atlasOK then
    pcall(overlay.SetTexture, overlay, "Interface\\Minimap\\MiniMap-TrackingBorder")
  end

  button:SetScript("OnClick", function(_, mouseButton)
    if mouseButton == "RightButton" and ns.ShowImport then
      ns.ShowImport()
    else
      ns.UI:Toggle()
    end
  end)
  button:SetScript("OnDragStart", function(self)
    self:SetScript("OnUpdate", function()
      if not Minimap or not GetCursorPosition then
        return
      end
      local mx, my = Minimap:GetCenter()
      local cx, cy = GetCursorPosition()
      local scale = UIParent:GetEffectiveScale()
      if not mx or not scale or scale == 0 then
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
    GameTooltip:SetText("Unbored")
    GameTooltip:AddLine(ns.T("BINDING_TOGGLE"), 1, 1, 1)
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
