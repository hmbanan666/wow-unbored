local _, ns = ...

function ns.ImportUI()
  if ns.ImportFrame then
    return ns.ImportFrame
  end
  local okFrame, frame = pcall(CreateFrame, "Frame", "UnboredImportFrame", UIParent, "BackdropTemplate")
  if not okFrame or not frame then
    frame = CreateFrame("Frame", "UnboredImportFrame", UIParent)
  end
  frame:SetSize(460, 360)
  frame:SetFrameStrata("DIALOG")
  frame:SetClampedToScreen(true)
  frame:SetMovable(true)
  frame:EnableMouse(true)
  frame:SetPoint("CENTER", UIParent, "CENTER", 0, 40)
  frame:Hide()
  ns.UI.ApplyBackdrop(frame)

  local title = frame:CreateFontString(nil, "OVERLAY", "GameFontNormal")
  title:SetPoint("TOPLEFT", 14, -10)
  title:SetText(ns.T("IMPORT_TITLE"))

  local help = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  help:SetPoint("TOPLEFT", 14, -30)
  help:SetPoint("TOPRIGHT", -14, -30)
  help:SetJustifyH("LEFT")
  help:SetText(ns.T("IMPORT_HELP"))

  local edit
  local scrollOK, scroll = pcall(CreateFrame, "ScrollFrame", "UnboredImportScroll", frame, "UIPanelScrollFrameTemplate")
  if scrollOK and scroll then
    scroll:SetPoint("TOPLEFT", 14, -52)
    scroll:SetPoint("BOTTOMRIGHT", -32, 78)
    edit = CreateFrame("EditBox", nil, scroll)
    edit:SetMultiLine(true)
    edit:SetAutoFocus(false)
    edit:SetFontObject(ChatFontNormal or GameFontHighlightSmall)
    edit:SetWidth(400)
    edit:SetHeight(200)
    edit:SetMaxLetters(16000)
    scroll:SetScrollChild(edit)
  else
    edit = CreateFrame("EditBox", nil, frame)
    edit:SetPoint("TOPLEFT", 16, -56)
    edit:SetPoint("BOTTOMRIGHT", -16, 82)
    edit:SetMultiLine(true)
    edit:SetAutoFocus(false)
    edit:SetFontObject(ChatFontNormal or GameFontHighlightSmall)
    edit:SetMaxLetters(16000)
  end
  edit:SetScript("OnEscapePressed", function(self)
    self:ClearFocus()
  end)
  edit:SetScript("OnTextChanged", function()
    frame.status:SetText("")
  end)

  local status = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  status:SetPoint("BOTTOMLEFT", 14, 50)
  status:SetPoint("BOTTOMRIGHT", -14, 50)
  status:SetJustifyH("LEFT")
  status:SetHeight(28)
  frame.status = status

  local import = ns.UI.MakeButton(frame, ns.T("IMPORT_DO"), 120, 22)
  import:SetPoint("BOTTOMLEFT", 12, 14)
  import:SetScript("OnClick", function()
    local plan, err = ns.DecodeImport(edit:GetText() or "")
    if not plan then
      status:SetTextColor(1, 0.35, 0.35)
      status:SetText(err or ns.T("ERR_JSON"))
      return
    end
    ns.Session:ApplyPlan(plan, "import", true)
    status:SetTextColor(0.55, 0.9, 0.55)
    status:SetText(ns.T("IMPORT_OK", #plan.tasks))
  end)

  local export = ns.UI.MakeButton(frame, ns.T("EXPORT_DO"), 140, 22)
  export:SetPoint("LEFT", import, "RIGHT", 8, 0)
  export:SetScript("OnClick", function()
    if not ns.Session.state then
      ns.Session:Start()
    end
    local text = ns.EncodeProgress(ns.Session:ProgressTable())
    edit:SetText(text or "")
    edit:SetFocus()
    edit:HighlightText()
    status:SetTextColor(0.8, 0.8, 0.8)
    status:SetText(ns.T("EXPORT_READY"))
  end)

  local close = ns.UI.MakeButton(frame, ns.T("CLOSE"), 80, 22)
  close:SetPoint("BOTTOMRIGHT", -12, 14)
  close:SetScript("OnClick", function()
    frame:Hide()
  end)

  local drag = CreateFrame("Frame", nil, frame)
  drag:SetPoint("TOPLEFT", 0, 0)
  drag:SetPoint("TOPRIGHT", 0, 0)
  drag:SetHeight(24)
  drag:EnableMouse(true)
  drag:RegisterForDrag("LeftButton")
  drag:SetScript("OnDragStart", function()
    frame:StartMoving()
  end)
  drag:SetScript("OnDragStop", function()
    frame:StopMovingOrSizing()
  end)

  frame.edit = edit
  ns.ImportFrame = frame
  return frame
end

function ns.ShowImport(text)
  local frame = ns.ImportUI()
  frame:Show()
  if text and text ~= "" then
    frame.edit:SetText(text)
  end
  frame.edit:SetFocus()
end

function ns.ShowExport()
  local frame = ns.ImportUI()
  frame:Show()
  if not ns.Session.state then
    ns.Session:Start()
  end
  local text = ns.EncodeProgress(ns.Session:ProgressTable())
  frame.edit:SetText(text or "")
  frame.edit:SetFocus()
  frame.edit:HighlightText()
  frame.status:SetTextColor(0.8, 0.8, 0.8)
  frame.status:SetText(ns.T("EXPORT_READY"))
end
